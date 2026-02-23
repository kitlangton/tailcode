/** @jsxImportSource @opentui/solid */

import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useAtomSet, useAtomValue } from "@effect/atom-solid/Hooks"
import type { MissingBinary, Step } from "./state.js"
import { phase, step, log, url, error, missingBinary } from "./state.js"
import { renderQR, copyToClipboard, openInBrowser } from "./qr.js"
import { flowFn, signalExit, waitForFlowStop } from "./flow.js"

// -- Palette --
export const color = {
  bg: "#05070b",
  panel: "#141820",
  panelSoft: "#191e28",
  tail: "#8e96a3",
  code: "#dde1e8",
  codeShadow: "#444c5c",
  accent: "#5fa8ff",
  success: "#7ad8ae",
  error: "#ff7f7f",
  notice: "#f2b85d",
  text: "#d2d7e2",
  muted: "#8a93a5",
  dim: "#666f82",
}

// -- Wordmark (same pixel font as opencode's logo.ts) --
const LOGO = {
  left: ["                   ", "▀▀█▀  ▄▀█ ▀▀█▀  ▄▀ ", " ▄▀  ▄▀▀█  ▄▀  ▄▀  ", " ▀   ▀  ▀ ▀▀▀▀ ▀▀▀▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

type InstallGuide = {
  readonly title: string
  readonly docsUrl: string
  readonly installCommand: string
  readonly installHint: string
}

type StageState = "pending" | "active" | "done" | "error"
const STAGE_ORDER: ReadonlyArray<Step> = ["tailscale", "opencode", "publish"]

function getInstallGuide(binary: MissingBinary, platform: NodeJS.Platform): InstallGuide {
  if (binary === "opencode") {
    if (platform === "darwin") {
      return {
        title: "Install OpenCode for macOS",
        docsUrl: "https://opencode.ai/docs/#install",
        installCommand: "brew install anomalyco/tap/opencode",
        installHint: "Alternative: bun install -g opencode-ai",
      }
    }

    if (platform === "win32") {
      return {
        title: "Install OpenCode for Windows",
        docsUrl: "https://opencode.ai/docs/windows-wsl",
        installCommand: "choco install opencode",
        installHint: "Recommended path is WSL2. Open the docs for setup details.",
      }
    }

    return {
      title: "Install OpenCode for Linux",
      docsUrl: "https://opencode.ai/docs/#install",
      installCommand: "curl -fsSL https://opencode.ai/install | bash",
      installHint: "Alternative: bun install -g opencode-ai",
    }
  }

  if (platform === "darwin") {
    return {
      title: "Install Tailscale for macOS",
      docsUrl: "https://tailscale.com/docs/install/mac",
      installCommand: "brew install --cask tailscale-app",
      installHint: "If Homebrew is unavailable, open the docs link for installer options.",
    }
  }

  if (platform === "win32") {
    return {
      title: "Install Tailscale for Windows",
      docsUrl: "https://tailscale.com/docs/install/windows",
      installCommand: "winget install --id tailscale.tailscale --exact",
      installHint: "If winget is unavailable, use the installer from the docs link.",
    }
  }

  return {
    title: "Install Tailscale for Linux",
    docsUrl: "https://tailscale.com/docs/install/linux",
    installCommand: "curl -fsSL https://tailscale.com/install.sh | sh",
    installHint: "Install may require sudo depending on your distro.",
  }
}

export function logoLine(line: string, fg: string, shadow: string, bold: boolean) {
  const attrs = bold ? TextAttributes.BOLD : undefined
  const els: any[] = []
  let i = 0
  while (i < line.length) {
    const rest = line.slice(i)
    const m = rest.search(/[_^~]/)
    if (m === -1) {
      els.push(
        <text fg={fg} attributes={attrs}>
          {rest}
        </text>,
      )
      break
    }
    if (m > 0)
      els.push(
        <text fg={fg} attributes={attrs}>
          {rest.slice(0, m)}
        </text>,
      )
    const c = rest[m]
    if (c === "_")
      els.push(
        <text fg={fg} bg={shadow} attributes={attrs}>
          {" "}
        </text>,
      )
    else if (c === "^")
      els.push(
        <text fg={fg} bg={shadow} attributes={attrs}>
          ▀
        </text>,
      )
    else if (c === "~")
      els.push(
        <text fg={shadow} attributes={attrs}>
          ▀
        </text>,
      )
    i += m + 1
  }
  return els
}

type AppProps = {
  readonly onStart?: () => void
  readonly onQuit?: () => void
  readonly resetToWelcomeOnMount?: boolean
}

type PanelTone = "primary" | "soft"
type PanelProps = {
  readonly tone?: PanelTone
  readonly gap?: number
  readonly paddingTop?: number
  readonly paddingBottom?: number
  readonly children: any
}

function Panel(props: PanelProps) {
  return (
    <box
      flexDirection="column"
      backgroundColor={props.tone === "soft" ? color.panelSoft : color.panel}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={props.paddingTop ?? 1}
      paddingBottom={props.paddingBottom ?? 1}
      gap={props.gap ?? 0}
    >
      {props.children}
    </box>
  )
}

type ActionItem = {
  readonly key: string
  readonly label: string
  readonly keyFg?: string
  readonly labelFg?: string
}

function ActionRow(props: { readonly items: ReadonlyArray<ActionItem> }) {
  return (
    <box flexDirection="row" gap={1}>
      {props.items.map((item, index) => (
        <>
          <Show when={index > 0}>
            <text fg={color.dim}>·</text>
          </Show>
          <text fg={item.keyFg ?? color.muted}>{item.key}</text>
          <text fg={item.labelFg ?? color.dim}>{item.label}</text>
        </>
      ))}
    </box>
  )
}

export function App(props: AppProps = {}) {
  const dims = useTerminalDimensions()
  const currentPhase = useAtomValue(phase)
  const logText = useAtomValue(log)
  const remoteUrl = useAtomValue(url)
  const errorMessage = useAtomValue(error)
  const currentStep = useAtomValue(step)
  const currentMissingBinary = useAtomValue(missingBinary)
  const installGuide = createMemo(() => getInstallGuide(currentMissingBinary() || "tailscale", process.platform))

  const setPhase = useAtomSet(phase)
  const setError = useAtomSet(error)
  const setUrl = useAtomSet(url)
  const setLog = useAtomSet(log)
  const setMissingBinary = useAtomSet(missingBinary)
  const triggerFlow = useAtomSet(flowFn)

  const [flashedKey, setFlashedKey] = createSignal("")
  const [spinnerFrame, setSpinnerFrame] = createSignal(0)
  const [showTailscaleQR, setShowTailscaleQR] = createSignal(false)

  const TAILSCALE_DOWNLOAD_URL = "https://tailscale.com/download"

  const qrCode = createMemo(() => {
    const targetUrl = showTailscaleQR() ? TAILSCALE_DOWNLOAD_URL : remoteUrl()
    if (!targetUrl) return ""
    try {
      return renderQR(targetUrl)
    } catch {
      return ""
    }
  })

  const localCmd = () => `opencode attach http://127.0.0.1:4096`

  const terminalWidth = createMemo(() => {
    const width = Number(dims().width ?? 80)
    return Number.isFinite(width) && width > 0 ? width : 80
  })

  const panelWidth = createMemo(() => {
    const available = Math.max(26, terminalWidth() - 4)
    return Math.min(104, available)
  })

  const compact = createMemo(() => panelWidth() < 74)
  const spinnerGlyph = createMemo(() => {
    const frames = ["|", "/", "-", "\\"]
    return frames[spinnerFrame() % frames.length] ?? "|"
  })
  const recentLog = createMemo(() => {
    const lines = logText()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    return lines.slice(-4).join("\n")
  })

  const flash = (key: string) => {
    setFlashedKey(key)
    setTimeout(() => setFlashedKey(""), 1500)
  }

  const quit = () => {
    if (props.onQuit) {
      props.onQuit()
      return
    }

    signalExit()
    const fallback = setTimeout(() => process.exit(0), 5000)
    void waitForFlowStop().finally(() => {
      clearTimeout(fallback)
      process.exit(0)
    })
  }

  const keyColor = (key: string) => (flashedKey() === key ? color.notice : color.muted)
  const labelColor = (key: string) => (flashedKey() === key ? color.notice : color.dim)

  const start = () => {
    if (props.onStart) {
      props.onStart()
      return
    }

    setError("")
    setMissingBinary("")
    setUrl("")
    setLog("")
    setPhase("running")
    triggerFlow(undefined)
  }

  useKeyboard((evt) => {
    if (evt.name === "q" || evt.name === "escape" || (evt.ctrl && evt.name === "c")) {
      quit()
      return
    }
    if (currentPhase() === "welcome" && evt.name === "return") {
      evt.preventDefault()
      start()
      return
    }
    if (currentPhase() === "install" && evt.name === "return") {
      evt.preventDefault()
      start()
      return
    }
    if (currentPhase() === "error" && evt.name === "return") {
      evt.preventDefault()
      start()
      return
    }
    if (currentPhase() === "install" && (evt.name === "1" || evt.name === "2")) {
      evt.preventDefault()
      if (evt.name === "1") {
        void copyToClipboard(installGuide().installCommand)
          .then(() => flash("1"))
          .catch(() => {})
      } else if (evt.name === "2") {
        void openInBrowser(installGuide().docsUrl)
          .then(() => flash("2"))
          .catch(() => {})
      }
      return
    }
    if (currentPhase() === "done" && (evt.name === "1" || evt.name === "2" || evt.name === "3" || evt.name === "4")) {
      evt.preventDefault()
      if (evt.name === "1") {
        void copyToClipboard(remoteUrl())
          .then(() => flash("1"))
          .catch(() => {})
      } else if (evt.name === "2") {
        void openInBrowser(remoteUrl())
          .then(() => flash("2"))
          .catch(() => {})
      } else if (evt.name === "3") {
        void copyToClipboard(localCmd())
          .then(() => flash("3"))
          .catch(() => {})
      } else {
        setShowTailscaleQR((v) => !v)
        flash("4")
      }
      return
    }
  })

  onMount(() => {
    const timer = setInterval(() => {
      setSpinnerFrame((value) => value + 1)
    }, 120)

    onCleanup(() => {
      clearInterval(timer)
    })

    if (props.resetToWelcomeOnMount === false) return
    setPhase("welcome")
  })

  const stageState = (id: Step): StageState => {
    const active = currentStep()

    if (currentPhase() === "done") return "done"
    if (currentPhase() === "install") {
      const failedStep: Step = currentMissingBinary() === "opencode" ? "opencode" : "tailscale"
      return id === failedStep ? "error" : "pending"
    }

    const activeIndex = STAGE_ORDER.indexOf(active)
    const currentIndex = STAGE_ORDER.indexOf(id)

    if (currentPhase() === "error") {
      if (active === id) return "error"
      if (activeIndex > currentIndex) return "done"
      return "pending"
    }

    if (active === id && currentPhase() === "running") return "active"
    if (activeIndex > currentIndex) return "done"
    return "pending"
  }

  const stageColor = (id: Step) => {
    const state = stageState(id)
    if (state === "done") return color.success
    if (state === "active") return color.accent
    if (state === "error") return color.error
    return color.muted
  }

  const stageBg = (id: Step) => {
    const state = stageState(id)
    if (state === "done") return "#1d2d27"
    if (state === "active") return "#1f3046"
    if (state === "error") return "#382429"
    return color.panelSoft
  }

  const stageBadge = (id: Step, label: string) => {
    const state = stageState(id)
    const glyph = state === "done" ? "✓" : state === "active" ? spinnerGlyph() : state === "error" ? "✕" : "·"

    const glyphColor = state === "pending" ? color.dim : stageColor(id)

    return (
      <box backgroundColor={stageBg(id)} paddingLeft={1} paddingRight={1} flexDirection="row">
        <text fg={glyphColor}>{glyph}</text>
        <text fg={stageColor(id)}>{` ${label}`}</text>
      </box>
    )
  }

  const stageRow = () => (
    <box flexDirection="row" gap={0}>
      {stageBadge("tailscale", "Tailscale")}
      {stageBadge("opencode", "OpenCode")}
      {stageBadge("publish", "Publish")}
    </box>
  )

  return (
    <box flexDirection="column" flexGrow={1} backgroundColor={color.bg}>
      <box
        flexDirection="column"
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        paddingLeft={2}
        paddingRight={2}
      >
        <box flexDirection="column" width={panelWidth()}>
          <box flexDirection="column" alignItems="center">
            {LOGO.left.map((line, i) => (
              <box flexDirection="row" gap={1}>
                <box flexDirection="row">{logoLine(line, color.tail, color.dim, false)}</box>
                <box flexDirection="row">{logoLine(LOGO.right[i]!, color.code, color.codeShadow, true)}</box>
              </box>
            ))}
          </box>
          <text>{""}</text>
          <box flexDirection="column" alignItems="flex-start">
            {stageRow()}
          </box>
          <Show when={currentPhase() === "welcome"}>
            <Panel>
              <text fg={color.dim}>Guided setup for OpenCode over Tailscale</text>
              <text>{""}</text>
              <text fg={color.text}>This wizard will:</text>
              <text fg={color.muted}>· Connect to Tailscale</text>
              <text fg={color.muted}>· Start OpenCode server on localhost</text>
              <text fg={color.muted}>· Publish with tailscale serve</text>
              <text>{""}</text>
              <ActionRow
                items={[
                  { key: "enter", label: "start", keyFg: color.accent, labelFg: color.dim },
                  { key: "q", label: "quit", keyFg: color.muted, labelFg: color.dim },
                ]}
              />
            </Panel>
          </Show>

          <Show when={currentPhase() === "running"}>
            <Panel>
              <text fg={color.dim}>Usually finishes in a few seconds.</text>
              <text>{""}</text>
              <ActionRow items={[{ key: "q", label: "quit", keyFg: color.muted, labelFg: color.dim }]} />
            </Panel>
          </Show>

          <Show when={currentPhase() === "install"}>
            <Panel>
              <text fg={color.error}>{() => errorMessage()}</text>
            </Panel>

            <Panel tone="soft">
              <text fg={color.dim}>{() => installGuide().title}</text>
              <text fg={color.accent}>{() => installGuide().installCommand}</text>
              <ActionRow
                items={[
                  { key: "1", label: "copy install command", keyFg: keyColor("1"), labelFg: labelColor("1") },
                  { key: "2", label: "open install guide", keyFg: keyColor("2"), labelFg: labelColor("2") },
                ]}
              />
              <text>{""}</text>
              <text fg={color.dim}>{() => installGuide().installHint}</text>
              <text fg={color.muted}>{() => installGuide().docsUrl}</text>
              <text>{""}</text>
              <ActionRow
                items={[
                  { key: "enter", label: "check again", keyFg: color.accent, labelFg: color.dim },
                  { key: "q", label: "quit", keyFg: color.muted, labelFg: color.dim },
                ]}
              />
            </Panel>
          </Show>

          <Show when={currentPhase() === "error"}>
            <Panel>
              <text fg={color.error}>Setup Failed</text>
            </Panel>

            <Panel tone="soft">
              <text fg={color.error}>{() => `Error: ${errorMessage()}`}</text>
              <Show when={recentLog()}>
                <text>{""}</text>
                <text fg={color.muted}>Recent output</text>
                <text fg={color.dim}>{() => recentLog()}</text>
              </Show>
              <text>{""}</text>
              <ActionRow
                items={[
                  { key: "enter", label: "retry", keyFg: color.accent, labelFg: color.dim },
                  { key: "q", label: "quit", keyFg: color.muted, labelFg: color.dim },
                ]}
              />
            </Panel>
          </Show>

          <Show when={currentPhase() === "done"}>
            <Panel gap={0}>
              <text fg={color.dim}>Connect from any device on your tailnet</text>
              <text fg={color.accent}>{() => `${remoteUrl()}`}</text>
              <ActionRow
                items={[
                  { key: "1", label: "copy URL", keyFg: keyColor("1"), labelFg: labelColor("1") },
                  { key: "2", label: "open browser", keyFg: keyColor("2"), labelFg: labelColor("2") },
                ]}
              />
              <text>{""}</text>
              <text fg={color.dim}>Attach from this machine</text>
              <text fg={color.text}>{() => `${localCmd()}`}</text>
              <ActionRow
                items={[
                  { key: "3", label: "copy command", keyFg: keyColor("3"), labelFg: labelColor("3") },
                  { key: "q", label: "quit", keyFg: color.muted, labelFg: color.dim },
                ]}
              />
            </Panel>
          </Show>

          <Show when={currentPhase() === "done" && qrCode() && !compact()}>
            <Panel tone="soft" paddingBottom={0}>
              <Show when={showTailscaleQR()}>
                <text fg={color.accent}>Scan to install Tailscale on your phone</text>
                <text fg={color.dim}>{TAILSCALE_DOWNLOAD_URL}</text>
              </Show>
              <Show when={!showTailscaleQR()}>
                <text fg={color.muted}>Scan to connect from mobile</text>
                <text fg={color.dim}>Phone must be on your tailnet</text>
                <ActionRow
                  items={[{ key: "4", label: "download Tailscale mobile app", keyFg: color.muted, labelFg: color.dim }]}
                />
              </Show>
              <text>{() => qrCode()}</text>
            </Panel>
          </Show>

          <Show when={currentPhase() === "done" && qrCode() && compact()}>
            <Panel tone="soft">
              <text fg={color.dim}>Terminal is narrow, use [1] to copy the URL.</text>
            </Panel>
          </Show>
        </box>
      </box>
    </box>
  )
}
