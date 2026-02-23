import { Effect, Scope, Stream } from "effect"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

type CommandOptions = Record<string, unknown> | undefined

/** Build a process command with consistent non-interactive IO defaults. */
export const command = (bin: string, args: string[], options?: CommandOptions) =>
  ChildProcess.make(bin, args, {
    ...options,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

/** Spawn a process in an existing scope so finalization is tied to that scope. */
export const spawnInScope = (
  spawner: ChildProcessSpawner,
  scope: Scope.Scope,
  bin: string,
  args: string[],
  options?: CommandOptions,
) => Scope.provide(spawner.spawn(command(bin, args, options)), scope)

/** Run a command to completion and return only its exit code. */
export const spawnExitCode = (spawner: ChildProcessSpawner, bin: string, args: string[], options?: CommandOptions) =>
  Effect.scoped(spawner.spawn(command(bin, args, options)).pipe(Effect.flatMap((handle) => handle.exitCode)))

/** Run a command to completion and collect combined stdout/stderr text. */
export const spawnString = (spawner: ChildProcessSpawner, bin: string, args: string[], options?: CommandOptions) =>
  Effect.scoped(
    spawner
      .spawn(command(bin, args, options))
      .pipe(Effect.flatMap((handle) => Stream.mkString(Stream.decodeText(handle.all)))),
  )

/** Forward decoded process output chunks into an append callback. */
export const streamToAppender = <E, R>(stream: Stream.Stream<Uint8Array, E, R>, append: (line: string) => void) =>
  Stream.runForEach(stream, (chunk) =>
    Effect.sync(() => {
      const text = new TextDecoder().decode(chunk)
      if (!text) return
      append(text)
    }),
  )

/** Swallow any failure and return void for best-effort cleanup paths. */
export const ignoreErrors = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.match(effect, {
    onFailure: () => undefined,
    onSuccess: () => undefined,
  })
