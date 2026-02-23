import { Config, Effect, Layer, Redacted, Schema, ServiceMap } from "effect"

const Port = Schema.Int.pipe(Schema.brand("Port"))
type Port = typeof Port.Type

const Password = Schema.Redacted(Schema.String).pipe(Schema.brand("Password"))
type Password = typeof Password.Type

export class AppConfig extends ServiceMap.Service<
  AppConfig,
  {
    readonly port: Port
    readonly password: Password
  }
>()("@tailcode/AppConfig") {
  static readonly layer = Layer.effect(AppConfig)(
    Effect.gen(function* () {
      const config = Config.all({
        port: Config.schema(Port, "TAILCODE_PORT").pipe(Config.withDefault(() => Port.makeUnsafe(4096))),
        password: Config.schema(Password, "TAILCODE_PASSWORD").pipe(
          Config.withDefault(() => Password.makeUnsafe(Redacted.make(""))),
        ),
      })

      return yield* config
    }),
  ).pipe(Layer.orDie)
}
