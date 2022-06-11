import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Returns an approximation of the values in the cache.
 *
 * @tsplus fluent effect/cache/Cache values
 */
export function values<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  __tsplusTrace?: string
): Effect.UIO<Chunk<Value>> {
  concreteCache(self)
  return self._values()
}
