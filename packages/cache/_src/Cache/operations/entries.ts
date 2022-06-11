import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Returns an approximation of the entries in the cache.
 *
 * @tsplus fluent effect/cache/Cache entries
 */
export function entries<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  __tsplusTrace?: string
): Effect.UIO<Chunk<Tuple<[Key, Value]>>> {
  concreteCache(self)
  return self._entries()
}
