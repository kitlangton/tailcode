import { Duration, Effect, Layer, Option, PlatformError, Schedule, Schema, Scope, ServiceMap } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { BinaryNotFound, CommandFailed } from "./errors.js"
import { parseURL, renderQR, trim } from "../qr.js"
import { ignoreErrors, spawnExitCode, spawnString, spawnInScope, streamToAppender } from "./process.js"

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseConflictPort(value: string) {
  const match = value.match(/listener already exists for port\s+(\d+)/i)
  return match ? Number(match[1]) : undefined
}

type ServeMapping = {
  readonly url: string
  readonly proxy: string | undefined
}

const ServeHandlerSchema = Schema.Struct({
  Proxy: Schema.optional(Schema.String),
})

const ServeHandlersSchema = Schema.Record(Schema.String, ServeHandlerSchema)

const ServeEndpointSchema = Schema.Struct({
  Handlers: Schema.optional(ServeHandlersSchema),
})

const ServeWebSchema = Schema.Record(Schema.String, ServeEndpointSchema)

const ServeNodeSchema = Schema.Struct({
  Web: Schema.optional(ServeWebSchema),
})

const ServeNodesSchema = Schema.Record(Schema.String, ServeNodeSchema)

const ServeStatusSchema = Schema.Struct({
  Web: Schema.optional(ServeWebSchema),
  Foreground: Schema.optional(ServeNodesSchema),
  Background: Schema.optional(ServeNodesSchema),
})

type ServeWeb = Schema.Schema.Type<typeof ServeWebSchema>
type ServeStatus = Schema.Schema.Type<typeof ServeStatusSchema>

const decodeServeStatus = Schema.decodeUnknownSync(ServeStatusSchema)

function appendMappingsFromWeb(web: ServeWeb | undefined, mappings: Array<ServeMapping>) {
  if (!web) return

  for (const [host, endpoint] of Object.entries(web)) {
    const handlers = endpoint.Handlers
    if (!handlers || Object.keys(handlers).length === 0) {
      mappings.push({ url: `https://${host}`, proxy: undefined })
      continue
    }

    for (const [path, handler] of Object.entries(handlers)) {
      const normalizedPath = path === "/" ? "" : String(path)
      mappings.push({
        url: `https://${host}${normalizedPath}`,
        proxy: handler.Proxy,
      })
    }
  }
}

function parseServeMappings(raw: string): ReadonlyArray<ServeMapping> {
  const start = raw.indexOf("{")
  if (start === -1) return []

  const jsonText = raw.slice(start)

  let status: ServeStatus
  try {
    status = decodeServeStatus(JSON.parse(jsonText))
  } catch {
    return []
  }

  const mappings: Array<ServeMapping> = []

  appendMappingsFromWeb(status.Web, mappings)
  for (const node of Object.values(status.Foreground ?? {})) {
    appendMappingsFromWeb(node.Web, mappings)
  }
  for (const node of Object.values(status.Background ?? {})) {
    appendMappingsFromWeb(node.Web, mappings)
  }

  return mappings
}

function pickRemoteUrl(statusOutput: string, target: string) {
  const statusMappings = parseServeMappings(statusOutput)
  const exact = statusMappings.find((item) => item.proxy === target)
  if (exact) return exact.url
  if (statusMappings.length > 0) return statusMappings[0]!.url
  return undefined
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class Tailscale extends ServiceMap.Service<
  Tailscale,
  {
    /** Ensure Tailscale is connected; prompts login when disconnected. */
    readonly ensure: (
      append: (line: string) => void,
    ) => Effect.Effect<string, BinaryNotFound | CommandFailed | PlatformError.PlatformError>
    /** Publish local OpenCode port via tailscale serve and return remote URL. */
    readonly publish: (
      bin: string,
      port: number,
      append: (line: string) => void,
    ) => Effect.Effect<string, CommandFailed | PlatformError.PlatformError>
  }
>()("@tailcode/Tailscale") {
  static readonly layer = Layer.effect(Tailscale)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner
      const scope = yield* Effect.scope

      const run = (bin: string, args: string[]) => spawnExitCode(spawner, bin, args)

      const runString = (bin: string, args: string[]) => spawnString(spawner, bin, args)

      const readServeStatus = (bin: string) =>
        runString(bin, ["serve", "status", "--json"]).pipe(Effect.catch(() => Effect.succeed("")))

      const waitForTailnetConnection = (bin: string) =>
        run(bin, ["ip"]).pipe(
          Effect.timeoutOrElse({
            duration: Duration.seconds(2),
            onTimeout: () => Effect.fail(new CommandFailed({ command: "tailscale ip", message: "timeout" })),
          }),
          Effect.flatMap((code) =>
            code === 0
              ? Effect.void
              : Effect.fail(new CommandFailed({ command: "tailscale ip", message: "not connected yet" })),
          ),
        )

      const retryConnectionPolicy = Schedule.spaced(Duration.millis(250)).pipe(Schedule.both(Schedule.recurs(80)))

      const retryPublishPolicy = Schedule.spaced(Duration.millis(500)).pipe(Schedule.both(Schedule.recurs(28)))

      /** Ensure daemon availability and interactive login if needed. */
      const ensure = Effect.fn("Tailscale.ensure")(function* (append: (line: string) => void) {
        const bin = Bun.which("tailscale")
        if (!bin) return yield* new BinaryNotFound({ binary: "tailscale" })

        append("Checking Tailscale connection...\n")
        const checkCode = yield* run(bin, ["ip"]).pipe(
          Effect.timeoutOrElse({
            duration: Duration.seconds(3),
            onTimeout: () => Effect.succeed(1),
          }),
        )
        if (checkCode === 0) return bin

        append("Tailscale is not connected. Starting login flow...\n")
        const login = yield* runString(bin, ["up", "--qr"]).pipe(
          Effect.timeoutOrElse({
            duration: Duration.seconds(60),
            onTimeout: () => Effect.succeed(""),
          }),
          Effect.orElseSucceed(() => ""),
        )

        const loginURL = parseURL(login)
        if (loginURL) {
          append(`Open this URL (or scan QR): ${loginURL}\n`)
          append(renderQR(loginURL) + "\n")
        } else if (login) {
          append("Follow the Tailscale login prompts in your terminal.\n")
          append(trim(login, 4000) + "\n")
        }

        yield* Effect.retryOrElse(waitForTailnetConnection(bin), retryConnectionPolicy, () =>
          Effect.fail(
            new CommandFailed({
              command: "tailscale ip",
              message: "Timed out waiting for Tailscale to connect",
            }),
          ),
        )

        return bin
      })

      /** Publish localhost port into tailnet and register scope cleanup. */
      const publish = Effect.fn("Tailscale.publish")(function* (
        bin: string,
        port: number,
        append: (line: string) => void,
      ) {
        const target = `http://127.0.0.1:${port}`

        const spawnServe = () =>
          spawnInScope(spawner, scope, bin, ["serve", "--bg", "--yes", "--https", String(port), target])

        const waitForProxy = () => {
          const pollForProxy = readServeStatus(bin).pipe(
            Effect.flatMap((status) => {
              const found = pickRemoteUrl(status, target)
              if (found) return Effect.succeed(found)
              return Effect.fail(
                new CommandFailed({
                  command: "tailscale serve",
                  message: "waiting for tailscale serve to register proxy...",
                }),
              )
            }),
          )

          return Effect.retryOrElse(pollForProxy, retryPublishPolicy, () =>
            Effect.fail(
              new CommandFailed({
                command: "tailscale serve",
                message: "Timed out waiting for tailscale serve to register proxy",
              }),
            ),
          )
        }

        const existingStatus = yield* readServeStatus(bin)
        if (parseServeMappings(existingStatus).some((item) => item.proxy === target)) {
          const existingUrl = pickRemoteUrl(existingStatus, target)
          if (existingUrl) {
            append("Reusing existing tailscale serve listener.\n")
            return existingUrl
          }
        }

        append("Publishing with tailscale serve...\n")

        const handle = yield* spawnServe()

        // Register cleanup as an acquired resource so release is tied atomically
        // to the current scope even across interruption boundaries.
        yield* Effect.acquireRelease(Effect.void, () =>
          ignoreErrors(run(bin, ["serve", "--https", String(port), "off"])),
        ).pipe(Scope.provide(scope))

        let serveOutput = ""
        yield* Effect.forkScoped(
          streamToAppender(handle.all, (text) => {
            append(text)
            serveOutput = trim(serveOutput + text, 8000)
          }),
        )

        const firstAttempt = yield* waitForProxy().pipe(Effect.option)
        if (Option.isSome(firstAttempt)) return firstAttempt.value

        const conflictPort = parseConflictPort(serveOutput)
        if (conflictPort === undefined) {
          return yield* new CommandFailed({
            command: "tailscale serve",
            message: "Timed out waiting for tailscale serve to register proxy",
          })
        }

        append(
          `Port ${conflictPort} is already in use. Turning off existing HTTPS listener on that port and retrying once...\n`,
        )
        yield* run(bin, ["serve", "--https", String(port), "off"]).pipe(Effect.ignore)

        serveOutput = ""
        const retryHandle = yield* spawnServe()
        yield* Effect.forkScoped(
          streamToAppender(retryHandle.all, (text) => {
            append(text)
            serveOutput = trim(serveOutput + text, 8000)
          }),
        )

        const secondAttempt = yield* waitForProxy().pipe(Effect.option)
        if (Option.isSome(secondAttempt)) return secondAttempt.value

        const retryConflictPort = parseConflictPort(serveOutput)
        if (retryConflictPort !== undefined) {
          return yield* new CommandFailed({
            command: "tailscale serve",
            message:
              `Listener already exists for port ${retryConflictPort} and could not be claimed automatically. ` +
              `Please run 'tailscale serve --https ${port} off' manually and retry.`,
          })
        }

        return yield* new CommandFailed({
          command: "tailscale serve",
          message: "Timed out waiting for tailscale serve to register proxy",
        })
      })

      return {
        ensure,
        publish,
      }
    }),
  )
}
