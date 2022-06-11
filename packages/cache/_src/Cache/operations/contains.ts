import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Returns whether a value associated with the specified key exists in the
 * cache.
 *
 * @tsplus fluent effect/cache/Cache contains
 */
export function contains_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key,
  __tsplusTrace?: string
): Effect.UIO<boolean> {
  concreteCache(self)
  return self._contains(key)
}

/**
 * Returns whether a value associated with the specified key exists in the
 * cache.
 *
 * @tsplus static effect/cache/Cache.Aspects contains
 */
export const contains = Pipeable(contains_)
