import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Invalidates all values in the cache.
 *
 * @tsplus fluent effect/cache/Cache invalidateAll
 */
export function invalidateAll_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  __tsplusTrace?: string
): Effect.UIO<void> {
  concreteCache(self)
  return self._invalidateAll
}

/**
 * Invalidates all values in the cache.
 *
 * @tsplus static effect/cache/Cache.Aspects invalidateAll
 */
export const invalidateAll = Pipeable(invalidateAll_)
