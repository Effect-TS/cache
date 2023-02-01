/**
 * @since 1.0.0
 */
import type * as Effect from "@effect/io/Effect"
import type * as Scope from "@effect/io/Scope"

/**
 * Similar to `Lookup`, but executes the lookup function within a `Scope`.
 *
 * @since 1.0.0
 * @category models
 */
export type ScopedLookup<Key, Environment, Error, Value> = (
  key: Key
) => Effect.Effect<Environment | Scope.Scope, Error, Value>
