import { Duration, Effect, Layer, PlatformError, Redacted, Schedule, ServiceMap } from "effect"
import type { ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { BinaryNotFound, HealthCheckFailed } from "./errors.js"
import { trim } from "../qr.js"
import { spawnInScope, streamToAppender } from "./process.js"

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OpenCode extends ServiceMap.Service<
  OpenCode,
  {
    /** Start local OpenCode server and wait until health endpoint responds. */
    readonly start: (
      port: number,
      password: string | Redacted.Redacted<string>,
      append: (line: string) => void,
    ) => Effect.Effect<ChildProcessHandle | undefined, BinaryNotFound | HealthCheckFailed | PlatformError.PlatformError>
  }
>()("@tailcode/OpenCode") {
  static readonly layer = Layer.effect(OpenCode)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner
      const scope = yield* Effect.scope

      /** Start opencode bound to localhost and tie lifecycle to service scope. */
      const start = Effect.fn("OpenCode.start")(function* (
        port: number,
        password: string | Redacted.Redacted<string>,
        append: (line: string) => void,
      ) {
        const alreadyHealthy = yield* Effect.tryPromise({
          try: () => fetch(`http://127.0.0.1:${port}/global/health`).then((r) => r.ok),
          catch: () => false as const,
        }).pipe(Effect.catch(() => Effect.succeed(false)))

        if (alreadyHealthy) {
          append(`OpenCode server already running on 127.0.0.1:${port}\n`)
          return undefined
        }

        const bin = Bun.which("opencode")
        if (!bin) return yield* new BinaryNotFound({ binary: "opencode" })

        append(`Starting OpenCode server on 127.0.0.1:${port}...\n`)

        const env: Record<string, string> = {}
        for (const [k, v] of Object.entries(process.env)) {
          if (v !== undefined) env[k] = v
        }
        const passwordValue = Redacted.isRedacted(password) ? Redacted.value(password) : password
        if (passwordValue) env.OPENCODE_SERVER_PASSWORD = passwordValue

        const handle = yield* spawnInScope(
          spawner,
          scope,
          bin,
          ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
          {
            env,
            extendEnv: false,
          },
        )

        let buffer = ""
        yield* Effect.forkIn(
          streamToAppender(handle.all, (text) => {
            buffer = trim(buffer + text, 8000)
            append(text)
          }),
          scope,
        )

        const checkHealth = Effect.tryPromise({
          try: () =>
            fetch(`http://127.0.0.1:${port}/global/health`).then((r) => {
              if (!r.ok) throw new Error("not healthy")
            }),
          catch: () => new HealthCheckFailed({ message: "not healthy yet" }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: Duration.seconds(2),
            onTimeout: () => Effect.fail(new HealthCheckFailed({ message: "health check timeout" })),
          }),
        )

        const healthCheckPolicy = Schedule.spaced(Duration.millis(250)).pipe(Schedule.both(Schedule.recurs(40)))

        yield* Effect.retryOrElse(checkHealth, healthCheckPolicy, () =>
          Effect.gen(function* () {
            yield* handle.kill().pipe(Effect.ignore)
            return yield* new HealthCheckFailed({
              message: `OpenCode server did not become healthy\n${buffer}`,
            })
          }),
        )

        return handle
      })

      return {
        start,
      }
    }),
  )
}
