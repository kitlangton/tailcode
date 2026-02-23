import * as ChildProcess from "effect/unstable/process/ChildProcess"
import { BunServices } from "@effect/platform-bun"
import { expect, test } from "bun:test"
import { Effect, Exit, Scope } from "effect"

// Start `sh -c "sleep 60"` which creates sh (parent) -> sleep (child).
// Close the scope. Both should be killed via process group signal.
test("ChildProcess.spawn scope cleanup kills child processes when scope closes", async () => {
  const program = Effect.gen(function* () {
    const scope = yield* Scope.make()

    const proc = yield* ChildProcess.spawn(ChildProcess.make("sh", ["-c", "sleep 60"])).pipe(Scope.provide(scope))

    const pid = Number(proc.pid)

    // Process should be alive
    expect(yield* proc.isRunning).toBe(true)

    // Close the scope — triggers acquireRelease finalizer which
    // kills the process group and awaits exit
    yield* Scope.close(scope, Exit.void)

    // Process should be gone
    const alive = yield* Effect.sync(() => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    })
    expect(alive).toBe(false)

    // No lingering `sleep 60` children either
    const exitCode = yield* ChildProcess.exitCode(ChildProcess.make("pgrep", ["-f", "sleep 60"])).pipe(
      Effect.orElseSucceed(() => 1),
    )
    // pgrep returns 1 when no processes match
    expect(Number(exitCode)).toBe(1)
  }).pipe(Effect.provide(BunServices.layer))

  await Effect.runPromise(program)
})
