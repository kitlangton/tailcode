import { render } from "@opentui/solid"
import { RegistryContext } from "@effect/atom-solid/RegistryContext"
import { App } from "./app.js"
import { registry } from "./state.js"

// -- Render --

render(
  () => (
    <RegistryContext.Provider value={registry}>
      <App />
    </RegistryContext.Provider>
  ),
  {
    targetFps: 60,
    exitOnCtrlC: false,
  },
)
