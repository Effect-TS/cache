import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Computes the value associated with the specified key, with the lookup
 * function, and puts it in the cache. The difference between this and
 * `get` method is that `refresh` triggers (re)computation of the value
 * without invalidating it in the cache, so any request to the associated
 * key can still be served while the value is being re-computed/retrieved
 * by the lookup function. Additionally, `refresh` always triggers the
 * lookup function, disregarding the last `Error`.
 *
 * @tsplus fluent effect/cache/Cache refresh
 */
export function refresh_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key,
  __tsplusTrace?: string
): Effect.IO<Error, void> {
  concreteCache(self)
  return self._refresh(key)
}

/**
 * Computes the value associated with the specified key, with the lookup
 * function, and puts it in the cache. The difference between this and
 * `get` method is that `refresh` triggers (re)computation of the value
 * without invalidating it in the cache, so any request to the associated
 * key can still be served while the value is being re-computed/retrieved
 * by the lookup function. Additionally, `refresh` always triggers the
 * lookup function, disregarding the last `Error`.
 *
 * @tsplus static effect/cache/Cache.Aspects refresh
 */
export const refresh = Pipeable(refresh_)
