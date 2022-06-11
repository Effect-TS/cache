import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Associates the specified value to the specified key in the cache.
 *
 * @tsplus fluent effect/cache/Cache set
 */
export function set_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key,
  value: Value,
  __tsplusTrace?: string
): Effect.UIO<void> {
  concreteCache(self)
  return self._set(key, value)
}

/**
 * Associates the specified value to the specified key in the cache.
 *
 * @tsplus static effect/cache/Cache.Aspects set
 */
export const set = Pipeable(set_)
