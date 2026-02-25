import { Deferred, Effect, Layer } from "effect";
import { cleanupRenderer } from "./renderer.js";
import { appRuntime } from "./runtime.js";
import {
  registry,
  phase,
  step,
  log,
  url,
  error,
  missingBinary,
} from "./state.js";
import { Tailscale } from "./services/tailscale.js";
import { OpenCode } from "./services/opencode.js";
import { AppConfig } from "./services/config.js";
import { stripTerminalControl, trim } from "./qr.js";
import { BinaryNotFound } from "./services/errors.js";

function append(line: string) {
  const clean = stripTerminalControl(line);
  if (!clean) return;
  registry.update(log, (prev) => trim(prev + clean, 16_000));
}

// Resolved when the user requests a clean exit so the scope finalizer runs
const exitSignal = Deferred.makeUnsafe<void>();
let exitSignaled = false;
let flowRunning = false;
const shutdownWaiters = new Set<() => void>();

function resolveShutdownWaiters() {
  for (const resolve of shutdownWaiters) resolve();
  shutdownWaiters.clear();
}

export function signalExit() {
  if (exitSignaled) return;
  exitSignaled = true;
  Deferred.doneUnsafe(exitSignal, Effect.succeed(undefined));
}

export function waitForFlowStop() {
  if (!flowRunning) return Promise.resolve();
  return new Promise<void>((resolve) => {
    shutdownWaiters.add(resolve);
  });
}

export const flowFn = appRuntime.fn<void>()(() =>
  Effect.gen(function* () {
    flowRunning = true;
    registry.set(missingBinary, "");

    const config = yield* AppConfig;
    const tailscale = yield* Tailscale;
    const opencode = yield* OpenCode;

    // Step 1: Tailscale — ensure connected
    registry.set(step, "tailscale");
    const bin = yield* tailscale.ensure(append);

    // Step 2: OpenCode — start server (handle lives in scope via ChildProcess.spawn)
    registry.set(step, "opencode");
    yield* opencode.start(config.port, config.password, append);

    // Step 3: Publish via tailscale serve
    registry.set(step, "publish");
    const remote = yield* tailscale.publish(bin, config.port, append);

    registry.set(url, remote);
    registry.set(log, "");
    registry.set(step, "idle");
    registry.set(missingBinary, "");
    registry.set(phase, "done");

    // Hold scope open (keeping finalizer alive) until quit is signalled.
    // Re-triggering flowFn interrupts this fiber instead.
    yield* Deferred.await(exitSignal);
  }).pipe(
    Effect.catch((err) =>
      Effect.sync(() => {
        if ((err as any)?._tag === "BinaryNotFound") {
          const missing = err as BinaryNotFound;
          registry.set(error, `${missing.binary} is not installed`);
          if (missing.binary === "tailscale" || missing.binary === "opencode") {
            registry.set(missingBinary, missing.binary);
          } else {
            registry.set(missingBinary, "");
          }
          registry.set(phase, "install");
          return;
        }

        registry.set(missingBinary, "");
        registry.set(
          error,
          "message" in err ? (err as any).message : String(err),
        );
        registry.set(phase, "error");
      }),
    ),
    Effect.provide(Layer.mergeAll(Tailscale.layer, OpenCode.layer)),
    Effect.ensuring(
      Effect.sync(() => {
        flowRunning = false;
        resolveShutdownWaiters();
      }),
    ),
  ),
);

export function cleanExit() {
  // Restore terminal state via the native OpenTUI library before exiting.
  // process.exit() bypasses the renderer's beforeExit/destroy cleanup path,
  // leaving mouse tracking enabled and the terminal in raw mode.
  // renderer.suspend() synchronously calls:
  //   - lib.disableMouse(rendererPtr)    → native disable-mouse escape codes
  //   - lib.suspendRenderer(rendererPtr) → native restoreTerminalModes
  //   - stdin.setRawMode(false)          → restore cooked mode
  cleanupRenderer();
  process.exit(0);
}

function gracefulProcessExit() {
  signalExit();
  const fallback = setTimeout(() => cleanExit(), 5000);
  void waitForFlowStop().finally(() => {
    clearTimeout(fallback);
    cleanExit();
  });
}

// Signal handlers
process.on("SIGINT", () => {
  gracefulProcessExit();
});
process.on("SIGTERM", () => {
  gracefulProcessExit();
});
