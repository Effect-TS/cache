import type * as Cache from "@effect/cache/Cache"
import type * as CacheStats from "@effect/cache/CacheStats"
import type * as EntryStats from "@effect/cache/EntryStats"
import * as CacheState from "@effect/cache/internal_effect_untraced/cacheState"
import * as _cacheStats from "@effect/cache/internal_effect_untraced/cacheStats"
import * as _entryStats from "@effect/cache/internal_effect_untraced/entryStats"
import * as MapKey from "@effect/cache/internal_effect_untraced/mapKey"
import * as MapValue from "@effect/cache/internal_effect_untraced/mapValue"
import type * as Lookup from "@effect/cache/Lookup"
import type * as Clock from "@effect/io/Clock"
import * as Debug from "@effect/io/Debug"
import * as Deferred from "@effect/io/Deferred"
import * as Effect from "@effect/io/Effect"
import * as Exit from "@effect/io/Exit"
import type * as FiberId from "@effect/io/Fiber/Id"
import { identity, pipe } from "@fp-ts/core/Function"
import * as Option from "@fp-ts/core/Option"
import * as Chunk from "@fp-ts/data/Chunk"
import type * as Context from "@fp-ts/data/Context"
import type * as Duration from "@fp-ts/data/Duration"
import * as Equal from "@fp-ts/data/Equal"
import * as MutableHashMap from "@fp-ts/data/MutableHashMap"
import * as MutableQueue from "@fp-ts/data/MutableQueue"
import * as MutableRef from "@fp-ts/data/MutableRef"

/** @internal */
const CacheSymbolKey = "@effect/cache/Cache"

/** @internal */
export const CacheTypeId: Cache.CacheTypeId = Symbol.for(
  CacheSymbolKey
) as Cache.CacheTypeId

const cacheVariance = {
  _Key: (_: unknown) => _,
  _Error: (_: never) => _,
  _Value: (_: never) => _
}

class CacheImpl<Input, Environment, Key, Error, Value> implements Cache.Cache<Input, Error, Value> {
  readonly [CacheTypeId] = cacheVariance
  readonly cacheState: CacheState.CacheState<Key, Error, Value>
  constructor(
    readonly capacity: number,
    readonly clock: Clock.Clock,
    readonly context: Context.Context<Environment>,
    readonly fiberId: FiberId.FiberId,
    readonly keyBy: (input: Input) => Key,
    readonly lookup: Lookup.Lookup<Input, Environment, Error, Value>,
    readonly timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration
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

  contains(key: Input): Effect.Effect<never, never, boolean> {
    return Debug.bodyWithTrace((trace) =>
      Effect.sync(() =>
        MutableHashMap.has(
          this.cacheState.map,
          this.keyBy(key)
        )
      ).traced(trace)
    )
  }

  entryStats(key: Input): Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>> {
    return Debug.bodyWithTrace((trace) =>
      Effect.sync(() => {
        const option = MutableHashMap.get(this.cacheState.map, this.keyBy(key))
        if (Option.isSome(option)) {
          switch (option.value._tag) {
            case "Complete": {
              const loaded = option.value.entryStats.loadedMillis
              return Option.some(_entryStats.make(loaded))
            }
            case "Pending": {
              return Option.none()
            }
            case "Refreshing": {
              const loaded = option.value.complete.entryStats.loadedMillis
              return Option.some(_entryStats.make(loaded))
            }
          }
        }
        return Option.none()
      }).traced(trace)
    )
  }

  get(key: Input): Effect.Effect<never, Error, Value> {
    return Debug.bodyWithTrace((trace) =>
      Effect.suspendSucceed(() => {
        const k = this.keyBy(key)
        let mapKey: MapKey.MapKey<Key> | undefined = undefined
        let deferred: Deferred.Deferred<Error, Value> | undefined = undefined
        let value = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, k))
        if (value === undefined) {
          deferred = Deferred.unsafeMake<Error, Value>(this.fiberId)
          mapKey = MapKey.make(k)
          if (MutableHashMap.has(this.cacheState.map, k)) {
            value = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, k))
          } else {
            MutableHashMap.set(this.cacheState.map, k, MapValue.pending(mapKey, deferred))
          }
        }
        if (value === undefined) {
          this.trackAccess(mapKey!)
          this.trackMiss()
          return this.lookupValueOf(key, deferred!)
        } else {
          switch (value._tag) {
            case "Complete": {
              this.trackAccess(value.key)
              this.trackHit()
              if (this.hasExpired(value.timeToLiveMillis)) {
                MutableHashMap.remove(this.cacheState.map, k)
                return this.get(key)
              }
              return Effect.done(value.exit)
            }
            case "Pending": {
              this.trackAccess(value.key)
              this.trackHit()
              return Deferred.await(value.deferred)
            }
            case "Refreshing": {
              this.trackAccess(value.complete.key)
              this.trackHit()
              if (this.hasExpired(value.complete.timeToLiveMillis)) {
                return Deferred.await(value.deferred)
              }
              return Effect.done(value.complete.exit)
            }
          }
        }
      }).traced(trace)
    )
  }

  invalidate(key: Input): Effect.Effect<never, never, void> {
    return Debug.bodyWithTrace((trace) =>
      Effect.sync(() => {
        MutableHashMap.remove(this.cacheState.map, this.keyBy(key))
      }).traced(trace)
    )
  }

  invalidateAll(): Effect.Effect<never, never, void> {
    return Debug.bodyWithTrace((trace) =>
      Effect.sync(() => {
        this.cacheState.map = MutableHashMap.empty()
      }).traced(trace)
    )
  }

  refresh(key: Input): Effect.Effect<never, Error, void> {
    return Debug.bodyWithTrace((trace) =>
      Effect.suspendSucceed(() => {
        const k = this.keyBy(key)
        const deferred: Deferred.Deferred<Error, Value> = Deferred.unsafeMake(this.fiberId)
        let value = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, k))
        if (value === undefined) {
          if (MutableHashMap.has(this.cacheState.map, k)) {
            value = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, k))
          } else {
            MutableHashMap.set(this.cacheState.map, k, MapValue.pending(MapKey.make(k), deferred))
          }
        }
        if (value === undefined) {
          return Effect.asUnit(this.lookupValueOf(key, deferred))
        } else {
          switch (value._tag) {
            case "Complete": {
              if (this.hasExpired(value.timeToLiveMillis)) {
                const found = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, k))
                if (Equal.equals(found, value)) {
                  MutableHashMap.remove(this.cacheState.map, k)
                }
                return Effect.asUnit(this.get(key))
              }
              // Only trigger the lookup if we're still the current value, `completedResult`
              return pipe(
                this.lookupValueOf(key, deferred),
                Effect.when(() => {
                  const current = Option.getOrUndefined(MutableHashMap.get(this.cacheState.map, k))
                  if (Equal.equals(current, value)) {
                    const mapValue = MapValue.refreshing(deferred, value as MapValue.Complete<Key, Error, Value>)
                    MutableHashMap.set(this.cacheState.map, k, mapValue)
                    return true
                  }
                  return false
                }),
                Effect.asUnit
              )
            }
            case "Pending": {
              return Deferred.await(value.deferred)
            }
            case "Refreshing": {
              return Deferred.await(value.deferred)
            }
          }
        }
      }).traced(trace)
    )
  }

  set(key: Input, value: Value): Effect.Effect<never, never, void> {
    return Debug.bodyWithTrace((trace) =>
      Effect.sync(() => {
        const now = this.clock.unsafeCurrentTimeMillis()
        const k = this.keyBy(key)
        const lookupResult = Exit.succeed(value)
        const mapValue = MapValue.complete(
          MapKey.make(k),
          lookupResult,
          _entryStats.make(now),
          now + this.timeToLive(lookupResult).millis
        )
        MutableHashMap.set(
          this.cacheState.map,
          k,
          mapValue as MapValue.Complete<Key, Error, Value>
        )
      }).traced(trace)
    )
  }

  size(): Effect.Effect<never, never, number> {
    return Debug.bodyWithTrace((trace) =>
      Effect.sync(() => {
        return MutableHashMap.size(this.cacheState.map)
      }).traced(trace)
    )
  }

  values(): Effect.Effect<never, never, Chunk.Chunk<Value>> {
    return Debug.bodyWithTrace((trace) =>
      Effect.sync(() => {
        const values: Array<Value> = []
        for (const entry of this.cacheState.map) {
          if (entry[1]._tag === "Complete" && entry[1].exit._tag === "Success") {
            values.push(entry[1].exit.value)
          }
        }
        return Chunk.unsafeFromArray(values)
      }).traced(trace)
    )
  }

  trackHit(): void {
    this.cacheState.hits = this.cacheState.hits + 1
  }

  trackMiss(): void {
    this.cacheState.misses = this.cacheState.misses + 1
  }

  trackAccess(key: MapKey.MapKey<Key>): void {
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
        if (key !== undefined) {
          if (MutableHashMap.has(this.cacheState.map, key.current)) {
            MutableHashMap.remove(this.cacheState.map, key.current)
            size = size - 1
            loop = size > this.capacity
          }
        } else {
          loop = false
        }
      }
      MutableRef.set(this.cacheState.updating, false)
    }
  }

  hasExpired(timeToLiveMillis: number): boolean {
    return this.clock.unsafeCurrentTimeMillis() > timeToLiveMillis
  }

  lookupValueOf(
    input: Input,
    deferred: Deferred.Deferred<Error, Value>
  ): Effect.Effect<never, Error, Value> {
    return Effect.suspendSucceed(() => {
      const key = this.keyBy(input)
      return pipe(
        this.lookup(input),
        Effect.provideContext(this.context),
        Effect.exit,
        Effect.flatMap((exit) => {
          const now = this.clock.unsafeCurrentTimeMillis()
          const stats = _entryStats.make(now)
          const value = MapValue.complete(
            MapKey.make(key),
            exit,
            stats,
            now + this.timeToLive(exit).millis
          )
          MutableHashMap.set(this.cacheState.map, key, value)
          return Effect.zipRight(
            Deferred.done(deferred, exit),
            Effect.done(exit)
          )
        }),
        Effect.onInterrupt(() =>
          Effect.zipRight(
            Deferred.interrupt(deferred),
            Effect.sync(() => {
              MutableHashMap.remove(this.cacheState.map, key)
            })
          )
        )
      )
    })
  }
}

/** @internal */
export const make = Debug.methodWithTrace((trace, restore) =>
  <Key, Environment, Error, Value>(
    capacity: number,
    timeToLive: Duration.Duration,
    lookup: Lookup.Lookup<Key, Environment, Error, Value>
  ): Effect.Effect<Environment, never, Cache.Cache<Key, Error, Value>> =>
    makeWith(
      capacity,
      restore(lookup),
      () => timeToLive
    ).traced(trace).traced(trace)
)

/** @internal */
export const makeWith = Debug.methodWithTrace((trace, restore) =>
  <Key, Environment, Error, Value>(
    capacity: number,
    lookup: Lookup.Lookup<Key, Environment, Error, Value>,
    timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration
  ): Effect.Effect<Environment, never, Cache.Cache<Key, Error, Value>> =>
    makeWithKey(
      capacity,
      restore(lookup),
      restore(timeToLive),
      identity
    ).traced(trace)
)

/** @internal */
export const makeWithKey = Debug.methodWithTrace((trace, restore) =>
  <Input, Key, Environment, Error, Value>(
    capacity: number,
    lookup: Lookup.Lookup<Input, Environment, Error, Value>,
    timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration,
    keyBy: (input: Input) => Key
  ): Effect.Effect<Environment, never, Cache.Cache<Input, Error, Value>> =>
    Effect.map(
      Effect.tuple(
        Effect.clock(),
        Effect.context<Environment>(),
        Effect.fiberId()
      ),
      ([clock, context, fiberId]) =>
        new CacheImpl(
          capacity,
          clock,
          context,
          fiberId,
          restore(keyBy),
          restore(lookup),
          restore(timeToLive)
        )
    ).traced(trace)
)

/** @internal */
export const cacheStats = Debug.methodWithTrace((trace) =>
  <Key, Error, Value>(
    self: Cache.Cache<Key, Error, Value>
  ): Effect.Effect<never, never, CacheStats.CacheStats> => self.cacheStats().traced(trace)
)

/** @internal */
export const contains = Debug.dualWithTrace<
  <Key, Error, Value>(self: Cache.Cache<Key, Error, Value>, key: Key) => Effect.Effect<never, never, boolean>,
  <Key>(key: Key) => <Error, Value>(self: Cache.Cache<Key, Error, Value>) => Effect.Effect<never, never, boolean>
>(2, (trace) => (self, key) => self.contains(key).traced(trace))

/** @internal */
export const entryStats = Debug.dualWithTrace<
  <Key, Error, Value>(
    self: Cache.Cache<Key, Error, Value>,
    key: Key
  ) => Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>>,
  <Key>(
    key: Key
  ) => <Error, Value>(
    self: Cache.Cache<Key, Error, Value>
  ) => Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>>
>(2, (trace) => (self, key) => self.entryStats(key).traced(trace))

/** @internal */
export const get = Debug.dualWithTrace<
  <Key, Error, Value>(self: Cache.Cache<Key, Error, Value>, key: Key) => Effect.Effect<never, Error, Value>,
  <Key>(key: Key) => <Error, Value>(self: Cache.Cache<Key, Error, Value>) => Effect.Effect<never, Error, Value>
>(2, (trace) => (self, key) => self.get(key).traced(trace))

/** @internal */
export const invalidate = Debug.dualWithTrace<
  <Key, Error, Value>(self: Cache.Cache<Key, Error, Value>, key: Key) => Effect.Effect<never, never, void>,
  <Key>(key: Key) => <Error, Value>(self: Cache.Cache<Key, Error, Value>) => Effect.Effect<never, never, void>
>(2, (trace) => (self, key) => self.invalidate(key).traced(trace))

/** @internal */
export const invalidateAll = Debug.methodWithTrace((trace) =>
  <Key, Error, Value>(self: Cache.Cache<Key, Error, Value>): Effect.Effect<never, never, void> =>
    self.invalidateAll().traced(trace)
)

/** @internal */
export const refresh = Debug.dualWithTrace<
  <Key, Error, Value>(self: Cache.Cache<Key, Error, Value>, key: Key) => Effect.Effect<never, Error, void>,
  <Key>(key: Key) => <Error, Value>(self: Cache.Cache<Key, Error, Value>) => Effect.Effect<never, Error, void>
>(2, (trace) => (self, key) => self.refresh(key).traced(trace))

export const set = Debug.dualWithTrace<
  <Key, Error, Value>(
    self: Cache.Cache<Key, Error, Value>,
    key: Key,
    value: Value
  ) => Effect.Effect<never, never, void>,
  <Key>(
    key: Key
  ) => <Error, Value>(
    self: Cache.Cache<Key, Error, Value>,
    value: Value
  ) => Effect.Effect<never, never, void>
>(3, (trace) => (self, key, value) => self.set(key, value).traced(trace))

/** @internal */
export const size = Debug.methodWithTrace((trace) =>
  <Key, Error, Value>(self: Cache.Cache<Key, Error, Value>): Effect.Effect<never, never, number> =>
    self.size().traced(trace)
)

/** @internal */
export const values = Debug.methodWithTrace((trace) =>
  <Key, Error, Value>(self: Cache.Cache<Key, Error, Value>): Effect.Effect<never, never, Chunk.Chunk<Value>> =>
    self.values().traced(trace)
)
