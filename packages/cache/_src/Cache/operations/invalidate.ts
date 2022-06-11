import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Invalidates the value associated with the specified key.
 *
 * @tsplus fluent effect/cache/Cache invalidate
 */
export function invalidate_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key,
  __tsplusTrace?: string
): Effect.UIO<void> {
  concreteCache(self)
  return self._invalidate(key)
}

/**
 * Invalidates the value associated with the specified key.
 *
 * @tsplus static effect/cache/Cache.Aspects invalidate
 */
export const invalidate = Pipeable(invalidate_)
