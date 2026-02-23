import * as Atom from "effect/unstable/reactivity/Atom"
import { Layer } from "effect"
import { AppConfig } from "./services/config.js"
import { BunServices } from "@effect/platform-bun"

export const appRuntime = Atom.runtime(Layer.mergeAll(AppConfig.layer, BunServices.layer))
