/**
 * @since 1.0.0
 */
import type * as Effect from "@effect/io/Effect"

/**
 * A `Lookup` represents a lookup function that, given a key of type `Key`, can
 * return an effect that will either produce a value of type `Value` or fail
 * with an error of type `Error` using an environment of type `Environment`.
 *
 * @since 1.0.0
 * @category models
 */
export type Lookup<Key, Environment, Error, Value> = (key: Key) => Effect.Effect<Environment, Error, Value>
