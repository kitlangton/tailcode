import QRCode from "qrcode"

const ANSI_ESCAPE_RE = new RegExp(
  `[${String.fromCharCode(27)}${String.fromCharCode(155)}][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]`,
  "g",
)

export function trim(value: string, max: number) {
  if (value.length <= max) return value
  return value.slice(value.length - max)
}

export function parseURL(value: string) {
  const stripped = stripTerminalControl(value)
  return stripped.match(/https?:\/\/[^\s)]+/)?.[0]
}

export function stripTerminalControl(value: string) {
  return value.replace(ANSI_ESCAPE_RE, "").replace(/\r/g, "")
}

export function qrCell(data: ReadonlyArray<number | boolean> | Uint8Array, size: number, x: number, y: number) {
  if (x < 0 || y < 0 || x >= size || y >= size) return false
  return Boolean((data as any)[y * size + x])
}

export function renderQR(value: string) {
  const result = QRCode.create(value, { errorCorrectionLevel: "L" })
  const size = result.modules.size
  const data = result.modules.data as unknown as ReadonlyArray<number | boolean> | Uint8Array

  const border = 2
  const lines: string[] = []

  for (let y = -border; y < size + border; y += 2) {
    let line = ""
    for (let x = -border; x < size + border; x++) {
      const top = qrCell(data, size, x, y)
      const bot = qrCell(data, size, x, y + 1)
      if (top && bot) line += "█"
      else if (top) line += "▀"
      else if (bot) line += "▄"
      else line += " "
    }
    lines.push(line)
  }

  return lines.join("\n")
}

export async function copyToClipboard(text: string) {
  const runWithStdin = async (cmd: string, args: string[] = []) => {
    try {
      const proc = Bun.spawn([cmd, ...args], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
      })
      proc.stdin.write(text)
      proc.stdin.end()
      return (await proc.exited) === 0
    } catch {
      return false
    }
  }

  if (process.platform === "darwin") {
    if (!(await runWithStdin("pbcopy"))) throw new Error("Failed to copy to clipboard")
    return
  }

  if (process.platform === "win32") {
    if (!(await runWithStdin("clip"))) throw new Error("Failed to copy to clipboard")
    return
  }

  const linuxTools: ReadonlyArray<{ cmd: string; args: string[] }> = [
    { cmd: "wl-copy", args: [] },
    { cmd: "xclip", args: ["-selection", "clipboard"] },
    { cmd: "xsel", args: ["--clipboard", "--input"] },
  ]

  for (const tool of linuxTools) {
    if (!Bun.which(tool.cmd)) continue
    if (await runWithStdin(tool.cmd, tool.args)) return
  }

  throw new Error("No supported clipboard tool found")
}

export async function openInBrowser(url: string) {
  const run = async (cmd: string, args: string[]) => {
    try {
      const proc = Bun.spawn([cmd, ...args], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      })
      return (await proc.exited) === 0
    } catch {
      return false
    }
  }

  if (process.platform === "darwin") {
    if (!(await run("open", [url]))) throw new Error("Failed to open browser")
    return
  }

  if (process.platform === "win32") {
    if (!(await run("cmd", ["/c", "start", "", url]))) {
      throw new Error("Failed to open browser")
    }
    return
  }

  if (!(await run("xdg-open", [url]))) throw new Error("Failed to open browser")
}
