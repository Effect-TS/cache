// ets_tracing: off

import * as St from "@effect-ts/core/Structural"
import { LazyGetter } from "@effect-ts/core/Utils"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * A `MapKey` represents a key in the cache. It contains mutable references
 * to the previous key and next key in the `KeySet` to support an efficient
 * implementation of a sorted set of keys.
 */
export class MapKey<Key> implements St.HasHash, St.HasEquals {
  previous: MapKey<Key> | null = null
  next: MapKey<Key> | null = null

  constructor(readonly value: Key) {}

  @LazyGetter()
  get [St.hashSym](): number {
    return St.combineHash(
      St.hash(this.value),
      St.combineHash(St.hash(this.previous), St.hash(this.next))
    )
  }

  [St.equalsSym](that: unknown): boolean {
    if (this === that) return true
    return that instanceof MapKey && this[St.hashSym] === that[St.hashSym]
  }
}
