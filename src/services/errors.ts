import { Schema } from "effect"

export class BinaryNotFound extends Schema.TaggedErrorClass<BinaryNotFound>()("BinaryNotFound", {
  binary: Schema.String,
}) {}

export class CommandFailed extends Schema.TaggedErrorClass<CommandFailed>()("CommandFailed", {
  command: Schema.String,
  message: Schema.String,
}) {}

export class HealthCheckFailed extends Schema.TaggedErrorClass<HealthCheckFailed>()("HealthCheckFailed", {
  message: Schema.String,
}) {}
