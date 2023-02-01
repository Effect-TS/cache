import { pipe } from "@fp-ts/core/Function"
import * as Equal from "@fp-ts/data/Equal"
import * as Hash from "@fp-ts/data/Hash"

/** @internal */
export const MapKeyTypeId = Symbol.for("@effect/cache/Cache/MapKey")

/** @internal */
export type MapKeyTypeId = typeof MapKeyTypeId

/**
 * A `MapKey` represents a key in the cache. It contains mutable references
 * to the previous key and next key in the `KeySet` to support an efficient
 * implementation of a sorted set of keys.
 *
 * @internal
 */
export interface MapKey<K> extends Equal.Equal {
  readonly [MapKeyTypeId]: MapKeyTypeId
  current: K
  previous: MapKey<K> | undefined
  next: MapKey<K> | undefined
}

class MapKeyImpl<K> implements MapKey<K> {
  readonly [MapKeyTypeId]: MapKeyTypeId = MapKeyTypeId
  previous: MapKey<K> | undefined = undefined
  next: MapKey<K> | undefined = undefined
  constructor(readonly current: K) {}
  [Hash.symbol](): number {
    return pipe(
      Hash.hash(this.current),
      Hash.combine(Hash.hash(this.previous)),
      Hash.combine(Hash.hash(this.next))
    )
  }
  [Equal.symbol](that: unknown): boolean {
    if (this === that) {
      return true
    }
    return isMapKey(that) &&
      Equal.equals(this.current, that.current) &&
      Equal.equals(this.previous, that.previous) &&
      Equal.equals(this.next, that.next)
  }
}

/** @internal */
export const make = <K>(current: K): MapKey<K> => new MapKeyImpl(current)

/** @internal */
export const isMapKey = (u: unknown): u is MapKey<unknown> => typeof u === "object" && u != null && MapKeyTypeId in u
