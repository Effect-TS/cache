// ets_tracing: off

import * as HM from "@effect-ts/core/Collections/Immutable/HashMap"
import { AtomicBoolean } from "@effect-ts/core/Support/AtomicBoolean"
import * as MutableQueue from "@effect-ts/core/Support/MutableQueue"

import { KeySet } from "../KeySet"
import type { MapKey } from "../MapKey"
import type { MapValue } from "../MapValue"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * The `CacheState` represents the mutable state underlying the cache.
 */
export class CacheState<Key, Error, Value> {
  map: HM.HashMap<Key, MapValue<Key, Error, Value>>
  hits: number
  misses: number

  constructor(
    readonly keys: KeySet<Key>,
    readonly accesses: MutableQueue.MutableQueue<MapKey<Key>>,
    readonly updating: AtomicBoolean,
    map: HM.HashMap<Key, MapValue<Key, Error, Value>>,
    hits: number,
    misses: number
  ) {
    this.map = map
    this.hits = hits
    this.misses = misses
  }
}

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

export function make<Key, Error, Value>(
  map: HM.HashMap<Key, MapValue<Key, Error, Value>>,
  keys: KeySet<Key>,
  accesses: MutableQueue.MutableQueue<MapKey<Key>>,
  updating: AtomicBoolean,
  hits: number,
  misses: number
): CacheState<Key, Error, Value> {
  return new CacheState(keys, accesses, updating, map, hits, misses)
}

/**
 * Constructs an initial cache state.
 */
export function initial<Key, Error, Value>(): CacheState<Key, Error, Value> {
  return make(
    HM.make<Key, MapValue<Key, Error, Value>>(),
    new KeySet<Key>(),
    new MutableQueue.Unbounded<MapKey<Key>>(),
    new AtomicBoolean(false),
    0,
    0
  )
}
