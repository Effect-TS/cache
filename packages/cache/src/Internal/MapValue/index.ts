// ets_tracing: off

import { Tagged } from "@effect-ts/core/Case"
import type { Exit } from "@effect-ts/core/Effect/Exit"
import type { Promise } from "@effect-ts/core/Effect/Promise"

import type { EntryStats } from "../../EntryStats"
import type { MapKey } from "../MapKey"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * A `MapValue` represents a value in the cache. A value may either be
 * `Pending` with a `Promise` that will contain the result of computing the
 * lookup function, when it is available, or `Complete` with an `Exit` value
 * that contains the result of computing the lookup function.
 */
export type MapValue<Key, Error, Value> =
  | Pending<Key, Error, Value>
  | Complete<Key, Error, Value>
  | Refreshing<Key, Error, Value>

export class Pending<Key, Error, Value> extends Tagged("Pending")<{
  readonly key: MapKey<Key>
  readonly promise: Promise<Error, Value>
}> {}

export class Complete<Key, Error, Value> extends Tagged("Complete")<{
  readonly key: MapKey<Key>
  readonly exit: Exit<Error, Value>
  readonly entryStats: EntryStats
  readonly timeToLive: Date
}> {}

export class Refreshing<Key, Error, Value> extends Tagged("Refreshing")<{
  readonly promise: Promise<Error, Value>
  readonly complete: Complete<Key, Error, Value>
}> {}

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

export function pending<Key, Error, Value>(
  key: MapKey<Key>,
  promise: Promise<Error, Value>
): MapValue<Key, Error, Value> {
  return new Pending({ key, promise })
}

export function complete<Key, Error, Value>(
  key: MapKey<Key>,
  exit: Exit<Error, Value>,
  entryStats: EntryStats,
  timeToLive: Date
): MapValue<Key, Error, Value> {
  return new Complete({ key, exit, entryStats, timeToLive })
}

export function refreshing<Key, Error, Value>(
  promise: Promise<Error, Value>,
  complete: Complete<Key, Error, Value>
): MapValue<Key, Error, Value> {
  return new Refreshing({ promise, complete })
}
