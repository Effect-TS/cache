import * as KeySet from "@effect/cache/internal_effect_untraced/keySet"
import type * as MapKey from "@effect/cache/internal_effect_untraced/mapKey"
import type * as MapValue from "@effect/cache/internal_effect_untraced/scoped/mapValue"
import * as MutableHashMap from "@fp-ts/data/MutableHashMap"
import * as MutableQueue from "@fp-ts/data/MutableQueue"
import * as MutableRef from "@fp-ts/data/MutableRef"

/**
 * The `CacheState` represents the mutable state underlying the cache.
 *
 * @internal
 */
export interface CacheState<Key, Error, Value> {
  map: MutableHashMap.MutableHashMap<Key, MapValue.MapValue<Key, Error, Value>>
  keys: KeySet.KeySet<Key>
  accesses: MutableQueue.MutableQueue<MapKey.MapKey<Key>>
  updating: MutableRef.MutableRef<boolean>
  hits: number
  misses: number
}

/** @internal */
export const make = <Key, Error, Value>(
  map: MutableHashMap.MutableHashMap<Key, MapValue.MapValue<Key, Error, Value>>,
  keys: KeySet.KeySet<Key>,
  accesses: MutableQueue.MutableQueue<MapKey.MapKey<Key>>,
  updating: MutableRef.MutableRef<boolean>,
  hits: number,
  misses: number
): CacheState<Key, Error, Value> => ({
  map,
  keys,
  accesses,
  updating,
  hits,
  misses
})

/**
 * Constructs an initial cache state.
 *
 * @internal
 */
export const initial = <Key, Error, Value>(): CacheState<Key, Error, Value> =>
  make(
    MutableHashMap.empty(),
    KeySet.make(),
    MutableQueue.unbounded(),
    MutableRef.make(false),
    0,
    0
  )
