import type * as EntryStats from "@effect/cache/EntryStats"
import type * as MapKey from "@effect/cache/internal_effect_untraced/mapKey"
import type * as Deferred from "@effect/io/Deferred"
import type * as Exit from "@effect/io/Exit"
import * as Data from "@fp-ts/data/Data"

/**
 * A `MapValue` represents a value in the cache. A value may either be
 * `Pending` with a `Promise` that will contain the result of computing the
 * lookup function, when it is available, or `Complete` with an `Exit` value
 * that contains the result of computing the lookup function.
 *
 * @internal
 */
export type MapValue<Key, Error, Value> =
  | Complete<Key, Error, Value>
  | Pending<Key, Error, Value>
  | Refreshing<Key, Error, Value>

/** @internal */
export interface Complete<Key, Error, Value> {
  readonly _tag: "Complete"
  readonly key: MapKey.MapKey<Key>
  readonly exit: Exit.Exit<Error, Value>
  readonly entryStats: EntryStats.EntryStats
  readonly timeToLiveMillis: number
}

/** @internal */
export interface Pending<Key, Error, Value> {
  readonly _tag: "Pending"
  readonly key: MapKey.MapKey<Key>
  readonly deferred: Deferred.Deferred<Error, Value>
}

/** @internal */
export interface Refreshing<Key, Error, Value> {
  readonly _tag: "Refreshing"
  readonly deferred: Deferred.Deferred<Error, Value>
  readonly complete: Complete<Key, Error, Value>
}

/** @internal */
export const complete = <Key, Error, Value>(
  key: MapKey.MapKey<Key>,
  exit: Exit.Exit<Error, Value>,
  entryStats: EntryStats.EntryStats,
  timeToLiveMillis: number
): MapValue<Key, Error, Value> =>
  Data.struct({
    _tag: "Complete",
    key,
    exit,
    entryStats,
    timeToLiveMillis
  })

/** @internal */
export const pending = <Key, Error, Value>(
  key: MapKey.MapKey<Key>,
  deferred: Deferred.Deferred<Error, Value>
): MapValue<Key, Error, Value> =>
  Data.struct({
    _tag: "Pending",
    key,
    deferred
  })

/** @internal */
export const refreshing = <Key, Error, Value>(
  deferred: Deferred.Deferred<Error, Value>,
  complete: Complete<Key, Error, Value>
): MapValue<Key, Error, Value> =>
  Data.struct({
    _tag: "Refreshing",
    deferred,
    complete
  })
