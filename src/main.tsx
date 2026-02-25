/** @jsxImportSource @opentui/solid */

// Explicitly load the OpenTUI Solid preload (normally done via bunfig.toml in dev)
import "@opentui/solid/preload";

import { createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import { RegistryContext } from "@effect/atom-solid/RegistryContext";
import { App } from "./app.js";
import { registry } from "./state.js";
import { storeRenderer } from "./renderer.js";

// -- Render --

const renderer = await createCliRenderer({
  targetFps: 60,
  exitOnCtrlC: false,
});

storeRenderer(renderer);

render(
  () => (
    <RegistryContext.Provider value={registry}>
      <App />
    </RegistryContext.Provider>
  ),
  renderer,
);
