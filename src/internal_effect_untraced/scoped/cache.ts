import type * as CacheStats from "@effect/cache/CacheStats"
import type * as EntryStats from "@effect/cache/EntryStats"
import * as _cacheStats from "@effect/cache/internal_effect_untraced/cacheStats"
import * as _entryStats from "@effect/cache/internal_effect_untraced/entryStats"
import * as MapKey from "@effect/cache/internal_effect_untraced/mapKey"
import * as CacheState from "@effect/cache/internal_effect_untraced/scoped/cacheState"
import * as MapValue from "@effect/cache/internal_effect_untraced/scoped/mapValue"
import type * as ScopedCache from "@effect/cache/ScopedCache"
import type * as ScopedLookup from "@effect/cache/ScopedLookup"
import * as Context from "@effect/data/Context"
import type * as Duration from "@effect/data/Duration"
import * as Equal from "@effect/data/Equal"
import * as HashSet from "@effect/data/HashSet"
import * as MutableHashMap from "@effect/data/MutableHashMap"
import * as MutableQueue from "@effect/data/MutableQueue"
import * as MutableRef from "@effect/data/MutableRef"
import type * as Clock from "@effect/io/Clock"
import * as Debug from "@effect/io/Debug"
import * as Effect from "@effect/io/Effect"
import * as Exit from "@effect/io/Exit"
import * as Scope from "@effect/io/Scope"
import { pipe } from "@fp-ts/core/Function"
import * as Option from "@fp-ts/core/Option"

/** @internal */
const ScopedCacheSymbolKey = "@effect/cache/ScopedCache"

/** @internal */
export const ScopedCacheTypeId: ScopedCache.ScopedCacheTypeId = Symbol.for(
  ScopedCacheSymbolKey
) as ScopedCache.ScopedCacheTypeId

const scopedCacheVariance = {
  _Key: (_: unknown) => _,
  _Error: (_: never) => _,
  _Value: (_: never) => _
}

class ScopedCacheImpl<Key, Environment, Error, Value> implements ScopedCache.ScopedCache<Key, Error, Value> {
  readonly [ScopedCacheTypeId] = scopedCacheVariance
  readonly cacheState: CacheState.CacheState<Key, Error, Value>
  constructor(
    readonly capacity: number,
    readonly scopedLookup: ScopedLookup.ScopedLookup<Key, Environment, Error, Value>,
    readonly clock: Clock.Clock,
    readonly timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration,
    readonly context: Context.Context<Environment>
  ) {
    this.cacheState = CacheState.initial()
  }

  cacheStats(): Effect.Effect<never, never, CacheStats.CacheStats> {
    return Debug.bodyWithTrace((trace) =>
      Effect.sync(() =>
        _cacheStats.make(
          this.cacheState.hits,
          this.cacheState.misses,
          MutableHashMap.size(this.cacheState.map)
        )
      ).traced(trace)
    )
  }

  contains(key: Key): Effect.Effect<never, never, boolean> {
    return Debug.bodyWithTrace((trace) => Effect.sync(() => MutableHashMap.has(this.cacheState.map, key)).traced(trace))
  }

  entryStats(key: Key): Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>> {
    return Debug.bodyWithTrace((trace) =>
      Effect.sync(() => {
        const value = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))
        if (value === undefined) {
          return Option.none()
        }
        switch (value._tag) {
          case "Complete": {
            return Option.some(_entryStats.make(value.entryStats.loadedMillis))
          }
          case "Pending": {
            return Option.none()
          }
          case "Refreshing": {
            return Option.some(_entryStats.make(value.complete.entryStats.loadedMillis))
          }
        }
      }).traced(trace)
    )
  }

  get(key: Key): Effect.Effect<Scope.Scope, Error, Value> {
    return Debug.bodyWithTrace((trace) =>
      pipe(
        this.lookupValueOf(key),
        Effect.memoize,
        Effect.flatMap((lookupValue) =>
          Effect.suspendSucceed(() => {
            let k: MapKey.MapKey<Key> | undefined = undefined
            let value = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))
            if (value === undefined) {
              k = MapKey.make(key)
              if (MutableHashMap.has(this.cacheState.map, key)) {
                value = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))
              } else {
                MutableHashMap.set(this.cacheState.map, key, MapValue.pending(k, lookupValue))
              }
            }
            if (value === undefined) {
              this.trackMiss()
              return Effect.zipRight(
                this.ensureMapSizeNotExceeded(k!),
                lookupValue
              )
            }
            switch (value._tag) {
              case "Complete": {
                this.trackHit()
                if (this.hasExpired(value.timeToLive)) {
                  const current = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))
                  if (Equal.equals(current, value)) {
                    MutableHashMap.remove(this.cacheState.map, key)
                  }
                  return pipe(
                    this.ensureMapSizeNotExceeded(value.key),
                    Effect.zipRight(MapValue.releaseOwner(value)),
                    Effect.zipRight(Effect.succeed(this.get(key)))
                  )
                }
                return Effect.as(
                  this.ensureMapSizeNotExceeded(value.key),
                  MapValue.toScoped(value)
                )
              }
              case "Pending": {
                this.trackHit()
                return Effect.zipRight(
                  this.ensureMapSizeNotExceeded(value.key),
                  value.scoped
                )
              }
              case "Refreshing": {
                this.trackHit()
                if (this.hasExpired(value.complete.timeToLive)) {
                  return Effect.zipRight(
                    this.ensureMapSizeNotExceeded(value.complete.key),
                    value.scoped
                  )
                }
                return Effect.as(
                  this.ensureMapSizeNotExceeded(value.complete.key),
                  MapValue.toScoped(value.complete)
                )
              }
            }
          })
        ),
        Effect.flatten
      ).traced(trace)
    )
  }

  invalidate(key: Key): Effect.Effect<never, never, void> {
    return Debug.bodyWithTrace((trace) =>
      Effect.suspendSucceed(() => {
        if (MutableHashMap.has(this.cacheState.map, key)) {
          const mapValue = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))!
          MutableHashMap.remove(this.cacheState.map, key)
          switch (mapValue._tag) {
            case "Complete": {
              return MapValue.releaseOwner(mapValue)
            }
            case "Pending": {
              return Effect.unit()
            }
            case "Refreshing": {
              return MapValue.releaseOwner(mapValue.complete)
            }
          }
        }
        return Effect.unit()
      }).traced(trace)
    )
  }

  invalidateAll(): Effect.Effect<never, never, void> {
    return Debug.bodyWithTrace((trace) =>
      Effect.forEachParDiscard(
        HashSet.fromIterable(Array.from(this.cacheState.map).map(([key]) => key)),
        (key) => this.invalidate(key)
      ).traced(trace)
    )
  }

  refresh(key: Key): Effect.Effect<never, Error, void> {
    return Debug.bodyWithTrace((trace) =>
      pipe(
        this.lookupValueOf(key),
        Effect.memoize,
        Effect.flatMap((scoped) => {
          let value = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))
          let newKey: MapKey.MapKey<Key> | undefined = undefined
          if (value === undefined) {
            newKey = MapKey.make(key)
            if (MutableHashMap.has(this.cacheState.map, key)) {
              value = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))
            } else {
              MutableHashMap.set(this.cacheState.map, key, MapValue.pending(newKey, scoped))
            }
          }
          let finalScoped: Effect.Effect<never, never, Effect.Effect<Scope.Scope, Error, Value>>
          if (value === undefined) {
            finalScoped = Effect.zipRight(
              this.ensureMapSizeNotExceeded(newKey!),
              scoped
            )
          } else {
            switch (value._tag) {
              case "Complete": {
                if (this.hasExpired(value.timeToLive)) {
                  finalScoped = Effect.succeed(this.get(key))
                } else {
                  const current = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))
                  if (Equal.equals(current, value)) {
                    const mapValue = MapValue.refreshing(scoped, value)
                    MutableHashMap.set(this.cacheState.map, key, mapValue)
                    finalScoped = scoped
                  } else {
                    finalScoped = Effect.succeed(this.get(key))
                  }
                }
                break
              }
              case "Pending": {
                finalScoped = value.scoped
                break
              }
              case "Refreshing": {
                finalScoped = value.scoped
                break
              }
            }
          }
          return Effect.flatMap(finalScoped, (s) => Effect.scoped(Effect.asUnit(s)))
        })
      ).traced(trace)
    )
  }

  size(): Effect.Effect<never, never, number> {
    return Debug.bodyWithTrace((trace) => Effect.sync(() => MutableHashMap.size(this.cacheState.map)).traced(trace))
  }

  lookupValueOf(key: Key): Effect.Effect<never, never, Effect.Effect<Scope.Scope, Error, Value>> {
    return pipe(
      Effect.onInterrupt(
        Effect.flatMap(Scope.make(), (scope) =>
          pipe(
            this.scopedLookup(key),
            Effect.provideContext(pipe(this.context, Context.add(Scope.Tag, scope))),
            Effect.exit,
            Effect.map((exit) => [exit, ((exit) => Scope.close(scope, exit)) as Scope.Scope.Finalizer] as const)
          )),
        () => Effect.sync(() => MutableHashMap.remove(this.cacheState.map, key))
      ),
      Effect.flatMap(([exit, release]) => {
        const now = this.clock.unsafeCurrentTimeMillis()
        const expiredAt = now + this.timeToLive(exit).millis
        switch (exit._tag) {
          case "Success": {
            const exitWithFinalizer: Exit.Exit<never, [Value, Scope.Scope.Finalizer]> = Exit.succeed([
              exit.value,
              release
            ])
            const completedResult = MapValue.complete<Key, Error, Value>(
              MapKey.make(key),
              exitWithFinalizer,
              MutableRef.make(1),
              _entryStats.make(now),
              expiredAt
            )
            let previousValue: MapValue.MapValue<Key, Error, Value> | undefined = undefined
            if (MutableHashMap.has(this.cacheState.map, key)) {
              previousValue = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))
            }
            MutableHashMap.set(this.cacheState.map, key, completedResult)
            return Effect.sync(() =>
              Effect.flatten(
                Effect.as(
                  this.cleanMapValue(previousValue),
                  MapValue.toScoped(completedResult)
                )
              )
            )
          }
          case "Failure": {
            const completedResult = MapValue.complete<Key, Error, Value>(
              MapKey.make(key),
              exit,
              MutableRef.make(0),
              _entryStats.make(now),
              expiredAt
            )
            let previousValue: MapValue.MapValue<Key, Error, Value> | undefined = undefined
            if (MutableHashMap.has(this.cacheState.map, key)) {
              previousValue = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key))
            }
            MutableHashMap.set(this.cacheState.map, key, completedResult)
            return Effect.zipRight(
              release(exit),
              Effect.sync(() =>
                Effect.flatten(
                  Effect.as(
                    this.cleanMapValue(previousValue),
                    MapValue.toScoped(completedResult)
                  )
                )
              )
            )
          }
        }
      }),
      Effect.memoize,
      Effect.flatten
    )
  }

  hasExpired(timeToLive: number): boolean {
    return this.clock.unsafeCurrentTimeMillis() > timeToLive
  }

  trackHit(): void {
    this.cacheState.hits = this.cacheState.hits + 1
  }

  trackMiss(): void {
    this.cacheState.misses = this.cacheState.misses + 1
  }

  trackAccess(key: MapKey.MapKey<Key>): Array<MapValue.MapValue<Key, Error, Value>> {
    const cleanedKeys: Array<MapValue.MapValue<Key, Error, Value>> = []
    MutableQueue.offer(this.cacheState.accesses, key)
    if (MutableRef.compareAndSet(this.cacheState.updating, false, true)) {
      let loop = true
      while (loop) {
        const key = MutableQueue.poll(this.cacheState.accesses, MutableQueue.EmptyMutableQueue)
        if (key === MutableQueue.EmptyMutableQueue) {
          loop = false
        } else {
          this.cacheState.keys.add(key)
        }
      }
      let size = MutableHashMap.size(this.cacheState.map)
      loop = size > this.capacity
      while (loop) {
        const key = this.cacheState.keys.remove()
        if (key === undefined) {
          loop = false
        } else {
          if (MutableHashMap.has(this.cacheState.map, key.current)) {
            const removed = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, key.current))!
            MutableHashMap.remove(this.cacheState.map, key.current)
            size = size - 1
            cleanedKeys.push(removed)
            loop = size > this.capacity
          }
        }
      }
      MutableRef.set(this.cacheState.updating, false)
    }
    return cleanedKeys
  }

  cleanMapValue(mapValue: MapValue.MapValue<Key, Error, Value> | undefined): Effect.Effect<never, never, void> {
    if (mapValue === undefined) return Effect.unit()
    switch (mapValue._tag) {
      case "Complete": {
        return MapValue.releaseOwner(mapValue)
      }
      case "Pending": {
        return Effect.unit()
      }
      case "Refreshing": {
        return MapValue.releaseOwner(mapValue.complete)
      }
    }
  }

  ensureMapSizeNotExceeded(key: MapKey.MapKey<Key>): Effect.Effect<never, never, void> {
    return Effect.forEachParDiscard(
      this.trackAccess(key),
      (cleanedMapValue) => this.cleanMapValue(cleanedMapValue)
    )
  }
}

/** @internal */
export const make = Debug.methodWithTrace((trace, restore) =>
  <Key, Environment, Error, Value>(
    capacity: number,
    timeToLive: Duration.Duration,
    lookup: ScopedLookup.ScopedLookup<Key, Environment, Error, Value>
  ): Effect.Effect<Environment | Scope.Scope, never, ScopedCache.ScopedCache<Key, Error, Value>> =>
    makeWith(capacity, restore(lookup), () => timeToLive).traced(trace)
)

/** @internal */
export const makeWith = Debug.methodWithTrace((trace, restore) =>
  <Key, Environment, Error, Value>(
    capacity: number,
    lookup: ScopedLookup.ScopedLookup<Key, Environment, Error, Value>,
    timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration
  ): Effect.Effect<Environment | Scope.Scope, never, ScopedCache.ScopedCache<Key, Error, Value>> =>
    Effect.flatMap(
      Effect.clock(),
      (clock) => buildWith(capacity, restore(lookup), clock, restore(timeToLive))
    ).traced(trace)
)

/** @internal */
export const cacheStats = Debug.methodWithTrace((trace) =>
  <Key, Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>
  ): Effect.Effect<never, never, CacheStats.CacheStats> => self.cacheStats().traced(trace)
)

/** @internal */
export const contains = Debug.dualWithTrace<
  <Key, Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>,
    key: Key
  ) => Effect.Effect<never, never, boolean>,
  <Key>(
    key: Key
  ) => <Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>
  ) => Effect.Effect<never, never, boolean>
>(2, (trace) => (self, key) => self.contains(key).traced(trace))

/** @internal */
export const entryStats = Debug.dualWithTrace<
  <Key, Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>,
    key: Key
  ) => Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>>,
  <Key>(
    key: Key
  ) => <Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>
  ) => Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>>
>(2, (trace) => (self, key) => self.entryStats(key).traced(trace))

/** @internal */
export const get = Debug.dualWithTrace<
  <Key, Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>,
    key: Key
  ) => Effect.Effect<Scope.Scope, Error, Value>,
  <Key>(
    key: Key
  ) => <Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>
  ) => Effect.Effect<Scope.Scope, Error, Value>
>(2, (trace) => (self, key) => self.get(key).traced(trace))

export const invalidate = Debug.dualWithTrace<
  <Key, Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>,
    key: Key
  ) => Effect.Effect<never, never, void>,
  <Key>(
    key: Key
  ) => <Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>
  ) => Effect.Effect<never, never, void>
>(2, (trace) => (self, key) => self.invalidate(key).traced(trace))

/** @internal */
export const invalidateAll = Debug.methodWithTrace((trace) =>
  <Key, Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>
  ): Effect.Effect<never, never, void> => self.invalidateAll().traced(trace)
)

/** @internal */
export const refresh = Debug.dualWithTrace<
  <Key, Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>,
    key: Key
  ) => Effect.Effect<never, Error, void>,
  <Key>(
    key: Key
  ) => <Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>
  ) => Effect.Effect<never, Error, void>
>(2, (trace) => (self, key) => self.refresh(key).traced(trace))

/** @internal */
export const size = Debug.methodWithTrace((trace) =>
  <Key, Error, Value>(
    self: ScopedCache.ScopedCache<Key, Error, Value>
  ): Effect.Effect<never, never, number> => self.size().traced(trace)
)

const buildWith = <Key, Environment, Error, Value>(
  capacity: number,
  scopedLookup: ScopedLookup.ScopedLookup<Key, Environment, Error, Value>,
  clock: Clock.Clock,
  timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration
): Effect.Effect<Environment | Scope.Scope, never, ScopedCache.ScopedCache<Key, Error, Value>> =>
  Effect.acquireRelease(
    Effect.flatMap(
      Effect.context<Environment>(),
      (context) =>
        Effect.sync(() =>
          new ScopedCacheImpl(
            capacity,
            scopedLookup,
            clock,
            timeToLive,
            context
          )
        )
    ),
    invalidateAll
  )
