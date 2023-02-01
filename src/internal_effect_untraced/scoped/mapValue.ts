import type * as EntryStats from "@effect/cache/EntryStats"
import type * as MapKey from "@effect/cache/internal_effect_untraced/mapKey"
import * as Effect from "@effect/io/Effect"
import * as Exit from "@effect/io/Exit"
import type * as Scope from "@effect/io/Scope"
import * as Data from "@fp-ts/data/Data"
import * as MutableRef from "@fp-ts/data/MutableRef"

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
  readonly exit: Exit.Exit<Error, readonly [Value, Scope.Scope.Finalizer]>
  readonly ownerCount: MutableRef.MutableRef<number>
  readonly entryStats: EntryStats.EntryStats
  readonly timeToLive: number
}

/** @internal */
export interface Pending<Key, Error, Value> {
  readonly _tag: "Pending"
  readonly key: MapKey.MapKey<Key>
  readonly scoped: Effect.Effect<never, never, Effect.Effect<Scope.Scope, Error, Value>>
}

/** @internal */
export interface Refreshing<Key, Error, Value> {
  readonly _tag: "Refreshing"
  readonly scoped: Effect.Effect<never, never, Effect.Effect<Scope.Scope, Error, Value>>
  readonly complete: Complete<Key, Error, Value>
}

/** @internal */
export const complete = <Key, Error, Value>(
  key: MapKey.MapKey<Key>,
  exit: Exit.Exit<Error, readonly [Value, Scope.Scope.Finalizer]>,
  ownerCount: MutableRef.MutableRef<number>,
  entryStats: EntryStats.EntryStats,
  timeToLive: number
): Complete<Key, Error, Value> =>
  Data.struct({
    _tag: "Complete",
    key,
    exit,
    ownerCount,
    entryStats,
    timeToLive
  })

/** @internal */
export const pending = <Key, Error, Value>(
  key: MapKey.MapKey<Key>,
  scoped: Effect.Effect<never, never, Effect.Effect<Scope.Scope, Error, Value>>
): Pending<Key, Error, Value> =>
  Data.struct({
    _tag: "Pending",
    key,
    scoped
  })

/** @internal */
export const refreshing = <Key, Error, Value>(
  scoped: Effect.Effect<never, never, Effect.Effect<Scope.Scope, Error, Value>>,
  complete: Complete<Key, Error, Value>
): Refreshing<Key, Error, Value> =>
  Data.struct({
    _tag: "Refreshing",
    scoped,
    complete
  })

/** @internal */
export const toScoped = <Key, Error, Value>(
  self: Complete<Key, Error, Value>
): Effect.Effect<Scope.Scope, Error, Value> =>
  Exit.matchEffect(
    self.exit,
    (cause) => Effect.done(Exit.failCause(cause)),
    ([value]) =>
      Effect.acquireRelease(
        Effect.as(Effect.sync(() => MutableRef.incrementAndGet(self.ownerCount)), value),
        () => releaseOwner(self)
      )
  )

/** @internal */
export const releaseOwner = <Key, Error, Value>(
  self: Complete<Key, Error, Value>
): Effect.Effect<never, never, void> =>
  Exit.matchEffect(
    self.exit,
    () => Effect.unit(),
    ([, finalizer]) =>
      Effect.flatMap(
        Effect.sync(() => MutableRef.decrementAndGet(self.ownerCount)),
        (numOwner) => Effect.when(finalizer(Exit.unit()), () => numOwner === 0)
      )
  )
