import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Returns the approximate number of values in the cache.
 *
 * @tsplus getter effect/cache/Cache size
 */
export function size<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  __tsplusTrace?: string
): Effect.UIO<number> {
  concreteCache(self)
  return self._size
}
