import { render, useKeyboard } from "@opentui/solid"
import { RegistryContext } from "@effect/atom-solid/RegistryContext"
import { createSignal, onMount } from "solid-js"
import { App } from "./app.js"
import { error, log, missingBinary, phase, registry, step, url } from "./state.js"

type Scene =
  | "welcome"
  | "running-tailscale"
  | "running-opencode"
  | "running-publish"
  | "install-tailscale"
  | "install-opencode"
  | "error"
  | "done"

const sceneOrder: ReadonlyArray<Scene> = [
  "welcome",
  "running-tailscale",
  "running-opencode",
  "running-publish",
  "install-tailscale",
  "install-opencode",
  "error",
  "done",
]

function sceneHelp(scene: Scene) {
  if (scene === "welcome") return "Welcome screen"
  if (scene === "running-tailscale") return "Running screen - tailscale step"
  if (scene === "running-opencode") return "Running screen - opencode step"
  if (scene === "running-publish") return "Running screen - publish step"
  if (scene === "install-tailscale") return "Install guidance screen (tailscale)"
  if (scene === "install-opencode") return "Install guidance screen (opencode)"
  if (scene === "error") return "Error screen"
  return "Done screen"
}

function applyScene(scene: Scene) {
  registry.set(url, "")
  registry.set(error, "")
  registry.set(missingBinary, "")

  if (scene === "welcome") {
    registry.set(phase, "welcome")
    registry.set(step, "idle")
    registry.set(log, "")
    return
  }

  if (scene === "running-tailscale") {
    registry.set(phase, "running")
    registry.set(step, "tailscale")
    registry.set(log, "Checking Tailscale connection...\n")
    return
  }

  if (scene === "running-opencode") {
    registry.set(phase, "running")
    registry.set(step, "opencode")
    registry.set(
      log,
      "Checking Tailscale connection...\nTailscale connected.\nStarting OpenCode on 127.0.0.1:4096...\n",
    )
    return
  }

  if (scene === "running-publish") {
    registry.set(phase, "running")
    registry.set(step, "publish")
    registry.set(
      log,
      "Checking Tailscale connection...\nTailscale connected.\nStarting OpenCode on 127.0.0.1:4096...\nOpenCode healthy.\nPublishing with tailscale serve...\n",
    )
    return
  }

  if (scene === "install-tailscale") {
    registry.set(phase, "install")
    registry.set(step, "tailscale")
    registry.set(missingBinary, "tailscale")
    registry.set(error, "tailscale is not installed")
    registry.set(log, "")
    return
  }

  if (scene === "install-opencode") {
    registry.set(phase, "install")
    registry.set(step, "opencode")
    registry.set(missingBinary, "opencode")
    registry.set(error, "opencode is not installed")
    registry.set(log, "Checking Tailscale connection...\nTailscale connected.\n")
    return
  }

  if (scene === "error") {
    registry.set(phase, "error")
    registry.set(step, "publish")
    registry.set(error, "Timed out waiting for tailscale serve to register proxy")
    registry.set(log, "Publishing with tailscale serve...\n")
    return
  }

  registry.set(phase, "done")
  registry.set(step, "idle")
  registry.set(url, "https://kit-demo.tail1234.ts.net")
  registry.set(log, "")
}

function parseSceneArg(raw: string | undefined): Scene {
  if (!raw) return "welcome"

  const value = raw.trim().toLowerCase()

  if (value === "welcome") return "welcome"
  if (value === "tailscale") return "running-tailscale"
  if (value === "opencode") return "running-opencode"
  if (value === "publish" || value === "running") return "running-publish"
  if (value === "install" || value === "install-tailscale") return "install-tailscale"
  if (value === "install-opencode") return "install-opencode"
  if (value === "error") return "error"
  if (value === "done") return "done"

  return "welcome"
}

function tabLabel(scene: Scene) {
  if (scene === "running-tailscale") return "tailscale"
  if (scene === "running-opencode") return "opencode"
  if (scene === "running-publish") return "publish"
  if (scene === "install-tailscale") return "install-ts"
  if (scene === "install-opencode") return "install-oc"
  return scene
}

function Showcase() {
  const [currentScene, setCurrentScene] = createSignal<Scene>(parseSceneArg(process.argv[2]))

  const setScene = (scene: Scene) => {
    setCurrentScene(scene)
    applyScene(scene)
  }

  const cycle = (delta: number) => {
    const index = sceneOrder.indexOf(currentScene())
    const safeIndex = index === -1 ? 0 : index
    const nextIndex = (safeIndex + delta + sceneOrder.length) % sceneOrder.length
    const next = sceneOrder[nextIndex] ?? "welcome"
    setScene(next)
  }

  useKeyboard((evt) => {
    if (evt.name === "left") {
      evt.preventDefault()
      cycle(-1)
      return
    }

    if (evt.name === "right") {
      evt.preventDefault()
      cycle(1)
      return
    }
  })

  onMount(() => {
    setScene(currentScene())
  })

  return (
    <box flexDirection="column" flexGrow={1}>
      <box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1} backgroundColor="#0f131a">
        <text fg="#8a93a5">Screenbook (left/right to cycle)</text>
        <box flexDirection="row" gap={1}>
          {sceneOrder.map((scene) => (
            <text fg={currentScene() === scene ? "#5fa8ff" : "#666f82"}>
              {currentScene() === scene ? `[${tabLabel(scene)}]` : tabLabel(scene)}
            </text>
          ))}
        </box>
      </box>

      <box flexGrow={1}>
        <App
          onStart={() => setScene("running-tailscale")}
          onQuit={() => process.exit(0)}
          resetToWelcomeOnMount={false}
        />
      </box>
    </box>
  )
}

const initial = parseSceneArg(process.argv[2])
console.log(`TailCode screenbook: ${sceneHelp(initial)}`)
console.log("Keys: [left/right] cycle screens [q] quit")

render(
  () => (
    <RegistryContext.Provider value={registry}>
      <Showcase />
    </RegistryContext.Provider>
  ),
  {
    targetFps: 60,
    exitOnCtrlC: false,
  },
)
