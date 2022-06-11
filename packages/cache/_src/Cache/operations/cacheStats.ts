import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Returns statistics for this cache.
 *
 * @tsplus getter effect/cache/Cache cacheStats
 */
export function cacheStats<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  __tsplusTrace?: string
): Effect.UIO<CacheStats> {
  concreteCache(self)
  return self._cacheStats
}
