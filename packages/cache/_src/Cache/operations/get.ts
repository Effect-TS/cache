import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Retrieves the value associated with the specified key if it exists.
 * Otherwise computes the value with the lookup function, puts it in the
 * cache, and returns it.
 *
 * @tsplus fluent effect/cache/Cache get
 */
export function get_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key,
  __tsplusTrace?: string
): Effect.IO<Error, Value> {
  concreteCache(self)
  return self._get(key)
}

/**
 * Retrieves the value associated with the specified key if it exists.
 * Otherwise computes the value with the lookup function, puts it in the
 * cache, and returns it.
 *
 * @tsplus static effect/cache/Cache.Aspects get
 */
export const get = Pipeable(get_)
