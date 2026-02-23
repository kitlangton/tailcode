import { launchTerminal } from "tuistory"
import { test, expect } from "bun:test"

const CWD = process.cwd()
const ARGS = ["run", "--conditions=browser", "--preserve-symlinks"]

function launch() {
  return launchTerminal({
    command: "bun",
    args: [...ARGS, "src/main.tsx"],
    cols: 80,
    rows: 40,
    cwd: CWD,
    env: {
      ...process.env,
      // Real mode — no DRY_RUN
    },
  })
}

async function tailscaleServeStatus(): Promise<string> {
  const proc = Bun.spawn(["tailscale", "serve", "status"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout!).text(),
    new Response(proc.stderr!).text(),
    proc.exited,
  ])
  return `${stdout}\n${stderr}`
}

async function opencodeProcesses(): Promise<string[]> {
  const proc = Bun.spawn(["pgrep", "-f", "opencode.*serve.*--port 4096"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  })
  const stdout = await new Response(proc.stdout!).text()
  await proc.exited
  return stdout.trim().split("\n").filter(Boolean)
}

// Ensure clean state before each test
async function cleanSlate() {
  // Kill any leftover opencode processes
  const pids = await opencodeProcesses()
  for (const pid of pids) {
    try {
      process.kill(Number(pid))
    } catch {}
  }
  // Reset tailscale serve
  Bun.spawnSync(["tailscale", "serve", "reset"], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
}

test("cleanup on Esc: kills opencode + removes tailscale serve", async () => {
  await cleanSlate()

  // Verify clean starting state
  const statusBefore = await tailscaleServeStatus()
  expect(statusBefore).toContain("No serve config")
  const pidsBefore = await opencodeProcesses()
  expect(pidsBefore).toHaveLength(0)

  // Launch, start the flow, wait for done screen
  const session = await launch()
  await session.waitForText("Expose", { timeout: 10000 })
  await session.press("return")
  await session.waitForText("Published to your", { timeout: 30000 })

  const text = await session.text()
  console.log("DONE SCREEN:\n" + text.trim())

  // Verify resources ARE running
  const statusDuring = await tailscaleServeStatus()
  console.log("SERVE STATUS DURING:", statusDuring.trim())
  expect(statusDuring).toContain("proxy")

  const pidsDuring = await opencodeProcesses()
  console.log("OPENCODE PIDS DURING:", pidsDuring)
  expect(pidsDuring.length).toBeGreaterThan(0)

  // Press Escape to trigger cleanup + exit
  await session.press("escape")

  // Wait for process to exit and cleanup to complete
  await Bun.sleep(3000)

  // Verify resources are cleaned up
  const statusAfter = await tailscaleServeStatus()
  console.log("SERVE STATUS AFTER:", statusAfter.trim())
  expect(statusAfter).toContain("No serve config")

  const pidsAfter = await opencodeProcesses()
  console.log("OPENCODE PIDS AFTER:", pidsAfter)
  expect(pidsAfter).toHaveLength(0)

  session.close()
}, 60000)
