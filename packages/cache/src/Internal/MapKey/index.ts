// ets_tracing: off

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * A `MapKey` represents a key in the cache. It contains mutable references
 * to the previous key and next key in the `KeySet` to support an efficient
 * implementation of a sorted set of keys.
 */
export class MapKey<Key> {
  previous: MapKey<Key> | null = null
  next: MapKey<Key> | null = null

  constructor(readonly value: Key) {}
}
