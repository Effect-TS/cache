import { concreteCache } from "@effect/cache/Cache/operations/_internal/CacheInternal"

/**
 * Returns statistics for the specified entry, if it exists.
 *
 * @tsplus fluent effect/cache/Cache entryStats
 */
export function entryStats_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key,
  __tsplusTrace?: string
): Effect.UIO<Option<EntryStats>> {
  concreteCache(self)
  return self._entryStats(key)
}

/**
 * Returns statistics for the specified entry, if it exists.
 *
 * @tsplus static effect/cache/Cache.Aspects entryStats
 */
export const entryStats = Pipeable(entryStats_)
