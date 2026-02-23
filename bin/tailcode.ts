#!/usr/bin/env bun

export {}

const DEFAULT_PORT = 4096

function printHelp() {
  process.stdout.write(
    `tailcode\n\nUsage:\n  tailcode [--wizard] [--attach] [--help]\n\nOptions:\n  --wizard  Always open the TailCode setup wizard\n  --attach  Attach to an already-running local OpenCode server\n  --help    Show this help\n`,
  )
}

function resolvePort() {
  const raw = process.env.TAILCODE_PORT
  if (!raw) return DEFAULT_PORT
  const parsed = Number.parseInt(raw, 10)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_PORT
}

async function isHealthy(port: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 600)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/global/health`, {
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function runAttach(port: number) {
  const bin = Bun.which("opencode")
  if (!bin) {
    process.stderr.write("tailcode: 'opencode' is not installed (launching wizard instead)\n")
    return false
  }

  const target = `http://127.0.0.1:${port}`
  process.stdout.write(`tailcode: attaching to ${target}\n`)

  const child = Bun.spawn([bin, "attach", target], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  process.exit(await child.exited)
}

const args = process.argv.slice(2)
const forceWizard = args.includes("--wizard")
const forceAttach = args.includes("--attach")

if (args.includes("--help") || args.includes("-h")) {
  printHelp()
  process.exit(0)
}

if (forceWizard && forceAttach) {
  process.stderr.write("tailcode: use either --wizard or --attach, not both\n")
  process.exit(1)
}

const port = resolvePort()

if (!forceWizard) {
  const healthy = await isHealthy(port)
  if (healthy) {
    await runAttach(port)
  }

  if (forceAttach) {
    process.stderr.write(`tailcode: OpenCode is not running on http://127.0.0.1:${port}\n`)
    process.stderr.write("tailcode: run without --attach to start the setup wizard\n")
    process.exit(1)
  }
}

// When run via bunx or global install, Bun doesn't get the flags it needs.
// Re-launch ourselves with the right settings so the wizard actually loads.
const MARKER = "__TAILCODE_REEXEC"
if (!process.env[MARKER]) {
  const pkgRoot = import.meta.dirname + "/.."
  const child = Bun.spawn(
    [process.execPath, "run", "--conditions=browser", "--preserve-symlinks", import.meta.filename, ...args],
    {
      cwd: pkgRoot, // so Bun picks up our tsconfig.json for JSX
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, [MARKER]: "1" },
    },
  )
  process.exit(await child.exited)
}

await import("../src/main.tsx")
