import { CacheInternal } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Constructs a new cache with the specified capacity, time to live, and
 * lookup function, where the time to live can depend on the `Exit` value
 * returned by the lookup function.
 *
 * @tsplus static effect/cache/Cache.Ops makeWith
 */
export function makeWith<Key, Environment, Error, Value>(
  capacity: number,
  lookup: Lookup<Key, Environment, Error, Value>,
  timeToLive: (exit: Exit<Error, Value>) => Duration,
  __tsplusTrace?: string
): Effect.RIO<Environment, Cache<Key, Error, Value>> {
  return Effect.clock.flatMap((clock) =>
    Effect.environment<Environment>().flatMap((environment) =>
      Effect.fiberId.map((fiberId) =>
        new CacheInternal(
          capacity,
          lookup,
          timeToLive,
          clock,
          environment,
          fiberId
        )
      )
    )
  )
}
