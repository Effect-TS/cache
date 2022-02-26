// ets_tracing: off

import * as C from "@effect-ts/core/Collections/Immutable/Chunk"
import * as HM from "@effect-ts/core/Collections/Immutable/HashMap"
import * as Tup from "@effect-ts/core/Collections/Immutable/Tuple"
import * as T from "@effect-ts/core/Effect"
import * as Ex from "@effect-ts/core/Effect/Exit"
import * as P from "@effect-ts/core/Effect/Promise"
import { pipe } from "@effect-ts/core/Function"
import * as O from "@effect-ts/core/Option"
import * as St from "@effect-ts/core/Structural"
import { matchTag_ } from "@effect-ts/core/Utils"

import { CacheStats } from "../CacheStats/index.js"
import { EntryStats } from "../EntryStats/index.js"
import * as CacheState from "../Internal/CacheState/index.js"
import { MapKey } from "../Internal/MapKey/index.js"
import * as MapValue from "../Internal/MapValue/index.js"
import type { Lookup } from "../Lookup/index.js"
import { CacheError, CacheKey, CacheValue } from "./primitives.js"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

export const CacheTypeId = Symbol()
export type CacheTypeId = typeof CacheTypeId

/**
 * A `Cache` is defined in terms of a lookup function that, given a key of
 * type `Key`, can either fail with an error of type `Error` or succeed with a
 * value of type `Value`. Getting a value from the cache will either return
 * the previous result of the lookup function if it is available or else
 * compute a new result with the lookup function, put it in the cache, and
 * return it.
 *
 * A cache also has a specified capacity and time to live. When the cache is
 * at capacity the least recently accessed values in the cache will be
 * removed to make room for new values. Getting a value with a life older than
 * the specified time to live will result in a new value being computed with
 * the lookup function and returned when available.
 *
 * The cache is safe for concurrent access. If multiple fibers attempt to get
 * the same key the lookup function will only be computed once and the result
 * will be returned to all fibers.
 */
export interface Cache<Key, Error, Value> {
  readonly typeId: typeof CacheTypeId

  readonly [CacheKey]: (_: Key) => void
  readonly [CacheError]: () => Error
  readonly [CacheValue]: () => Value
}

export abstract class CacheInternal<Key, Error, Value>
  implements Cache<Key, Error, Value>
{
  readonly typeId: CacheTypeId = CacheTypeId;

  readonly [CacheKey]!: (_: Key) => void;
  readonly [CacheError]!: () => Error;
  readonly [CacheValue]!: () => Value

  /**
   * Returns the approximate number of values in the cache.
   */
  abstract get size(): T.UIO<number>

  /**
   * Sets the value in the cache.
   */
  abstract setValue(k: Key, v: Value): T.UIO<void>

  /**
   * Returns the approximate values in the cache.
   */
  abstract get values(): T.UIO<C.Chunk<Value>>

  /**
   * Returns the approximate entries in the cache.
   */
  abstract get entries(): T.UIO<C.Chunk<Tup.Tuple<[Key, Value]>>>

  /**
   * Returns statistics for this cache.
   */
  abstract get cacheStats(): T.UIO<CacheStats>

  /**
   * Retrieves the value associated with the specified key if it exists.
   * Otherwise computes the value with the lookup function, puts it in the
   * cache, and returns it.
   */
  abstract get(key: Key): T.IO<Error, Value>

  /**
   * Returns whether a value associated with the specified key exists in the
   * cache.
   */
  abstract contains(key: Key): T.UIO<boolean>

  /**
   * Returns statistics for the specified entry.
   */
  abstract entryStats(key: Key): T.UIO<O.Option<EntryStats>>

  /**
   * Computes the value associated with the specified key, with the lookup
   * function, and puts it in the cache. The difference between this and
   * `get` method is that `refresh` triggers (re)computation of the value
   * without invalidating it in the cache, so any request to the associated
   * key can still be served while the value is being re-computed/retrieved
   * by the lookup function. Additionally, `refresh` always triggers the
   * lookup function, disregarding the last `Error`.
   */
  abstract refresh(key: Key): T.IO<Error, void>

  /**
   * Invalidates the value associated with the specified key.
   */
  abstract invalidate(key: Key): T.UIO<void>

  /**
   * Invalidates all values in the cache.
   */
  abstract invalidateAll(): T.UIO<void>
}

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

/**
 * @ets_optimize remove
 */
export function concrete<Key, Error, Value>(
  _: Cache<Key, Error, Value>
): asserts _ is CacheInternal<Key, Error, Value> {
  //
}

/**
 * Constructs a new cache with the specified capacity, time to live, and
 * lookup function.
 */
export function make<Key, Environment, Error, Value>(
  capacity: number,
  timeToLive: number,
  lookup: Lookup<Key, Environment, Error, Value>
): T.RIO<Environment, Cache<Key, Error, Value>> {
  return makeWith_(lookup, () => timeToLive, capacity)
}

/**
 * Constructs a new cache with the specified capacity, time to live, and
 * lookup function, where the time to live can depend on the `Exit` value
 * returned by the lookup function.
 */
export function makeWith_<Key, Environment, Error, Value>(
  lookup: Lookup<Key, Environment, Error, Value>,
  timeToLive: (exit: Ex.Exit<Error, Value>) => number,
  capacity: number
): T.RIO<Environment, Cache<Key, Error, Value>> {
  return pipe(
    T.do,
    T.bind("environment", () => T.environment<Environment>()),
    T.bind("fiberId", () => T.fiberId),
    T.let("cacheState", () => CacheState.initial<Key, Error, Value>()),
    T.map(({ cacheState, environment, fiberId }) => {
      function trackAccess(key: MapKey<Key>): void {
        cacheState.accesses.offer(key)
        if (cacheState.updating.compareAndSet(false, true)) {
          let loop = true
          while (loop) {
            const key = cacheState.accesses.poll(undefined)
            if (key) {
              cacheState.keys.add(key)
            } else {
              loop = false
            }
          }
          let size = cacheState.map.size
          loop = size > capacity
          while (loop) {
            const key = cacheState.keys.remove()
            if (key) {
              if (HM.has_(cacheState.map, key.value)) {
                cacheState.map = HM.remove_(cacheState.map, key.value)
                size = size - 1
                loop = size > capacity
              }
            } else {
              loop = false
            }
          }
          cacheState.updating.set(false)
        }
      }

      function trackHit(): void {
        cacheState.hits = cacheState.hits + 1
      }

      function trackMiss(): void {
        cacheState.misses = cacheState.misses + 1
      }

      function* genEntries() {
        for (const [k, v] of cacheState.map) {
          if (v._tag === "Complete" && v.exit._tag === "Success") {
            yield Tup.tuple(k, v.exit.value)
          }
        }
      }

      function* genValues() {
        for (const [, v] of cacheState.map) {
          if (v._tag === "Complete" && v.exit._tag === "Success") {
            yield v.exit.value
          }
        }
      }

      class _InternalCache extends CacheInternal<Key, Error, Value> {
        get size(): T.UIO<number> {
          return T.succeedWith(() => cacheState.map.size)
        }

        setValue(k: Key, v: Value): T.UIO<void> {
          return T.succeedWith(() => {
            const now = Date.now()
            const lookupResult = Ex.succeed(v) as Ex.Exit<Error, Value>

            cacheState.map = HM.set_(
              cacheState.map,
              k,
              MapValue.complete(
                new MapKey(k),
                lookupResult,
                new EntryStats(new Date(now)),
                new Date(now + timeToLive(lookupResult))
              )
            )
          })
        }

        get values(): T.UIO<C.Chunk<Value>> {
          return T.succeedWith(() => C.from(genValues()))
        }

        get entries(): T.UIO<C.Chunk<Tup.Tuple<[Key, Value]>>> {
          return T.succeedWith(() => C.from(genEntries()))
        }

        get cacheStats(): T.UIO<CacheStats> {
          return T.succeedWith(() => {
            return new CacheStats(
              cacheState.hits,
              cacheState.misses,
              cacheState.map.size
            )
          })
        }

        get(k: Key): T.IO<Error, Value> {
          return T.suspend(() => {
            let key: MapKey<Key>
            let promise: P.Promise<Error, Value>
            let value = O.toUndefined(HM.get_(cacheState.map, k))

            if (!value) {
              promise = P.unsafeMake(fiberId)
              key = new MapKey(k)
              if (HM.has_(cacheState.map, k)) {
                value = HM.unsafeGet_(cacheState.map, k)
              } else {
                cacheState.map = HM.set_(
                  cacheState.map,
                  k,
                  MapValue.pending(key, promise)
                )
              }

              trackAccess(key)
              trackMiss()
              return lookupValueOf(
                k,
                environment,
                promise,
                timeToLive,
                cacheState,
                lookup
              )
            } else {
              return pipe(
                value,
                T.matchTag({
                  Pending: (_) => {
                    trackAccess(_.key)
                    trackHit()
                    return P.await(_.promise)
                  },
                  Complete: (_) => {
                    trackAccess(_.key)
                    trackHit()
                    if (hasExpired(_.timeToLive)) {
                      const found = O.toUndefined(HM.get_(cacheState.map, k))
                      if (St.equals(found, value)) {
                        cacheState.map = HM.remove_(cacheState.map, k)
                      }
                      return this.get(k)
                    } else {
                      return T.done(_.exit)
                    }
                  },
                  Refreshing: (_) => {
                    trackAccess(_.complete.key)
                    trackHit()
                    if (hasExpired(_.complete.timeToLive)) {
                      return P.await(_.promise)
                    } else {
                      return T.done(_.complete.exit)
                    }
                  }
                })
              )
            }
          })
        }

        contains(key: Key): T.UIO<boolean> {
          return T.succeedWith(() => HM.has_(cacheState.map, key))
        }

        entryStats(key: Key): T.UIO<O.Option<EntryStats>> {
          return T.succeedWith(() => {
            const value = O.toUndefined(HM.get_(cacheState.map, key))
            if (value) {
              return matchTag_(value, {
                Pending: () => O.none,
                Complete: (_) => O.some(new EntryStats(_.entryStats.loaded)),
                Refreshing: (_) => O.some(new EntryStats(_.complete.entryStats.loaded))
              })
            } else {
              return O.none
            }
          })
        }

        refresh(key: Key): T.IO<Error, void> {
          return T.suspend(() => {
            const promise = P.unsafeMake<Error, Value>(fiberId)
            let value = O.toUndefined(HM.get_(cacheState.map, key))

            if (!value) {
              if (HM.has_(cacheState.map, key)) {
                value = HM.unsafeGet_(cacheState.map, key)
              } else {
                cacheState.map = HM.set_(
                  cacheState.map,
                  key,
                  MapValue.pending(new MapKey(key), promise)
                )
              }
            }
            if (!value) {
              return T.asUnit(
                lookupValueOf(key, environment, promise, timeToLive, cacheState, lookup)
              )
            }
            return matchTag_(value, {
              Pending: (_) => T.asUnit(P.await(_.promise)),
              Complete: (_) => {
                if (hasExpired(_.timeToLive)) {
                  const found = O.toUndefined(HM.get_(cacheState.map, key))
                  if (St.equals(found, value)) {
                    cacheState.map = HM.remove_(cacheState.map, key)
                  }
                  return T.asUnit(this.get(key))
                } else {
                  // Only trigger the lookup if we're still the current
                  // value, `completedResult`
                  return pipe(
                    lookupValueOf(
                      _.key.value,
                      environment,
                      promise,
                      timeToLive,
                      cacheState,
                      lookup
                    ),
                    T.whenM(
                      T.succeedWith(() => {
                        const current = O.toUndefined(HM.get_(cacheState.map, key))
                        if (St.equals(current, _)) {
                          cacheState.map = HM.set_(
                            cacheState.map,
                            key,
                            MapValue.refreshing(promise, _)
                          )
                          return true
                        } else {
                          return false
                        }
                      })
                    )
                  )
                }
              },
              Refreshing: (_) => T.asUnit(P.await(_.promise))
            })
          })
        }

        invalidate(key: Key): T.UIO<void> {
          return T.succeedWith(() => {
            cacheState.map = HM.remove_(cacheState.map, key)
          })
        }

        invalidateAll(): T.UIO<void> {
          return T.succeedWith(() => {
            cacheState.map = HM.make()
          })
        }
      }

      return new _InternalCache()
    })
  )
}

/**
 * Constructs a new cache with the specified capacity, time to live, and
 * lookup function, where the time to live can depend on the `Exit` value
 * returned by the lookup function.
 *
 * @ets_data_first makeWith_
 */
export function makeWith<Error, Value>(
  timeToLive: (exit: Ex.Exit<Error, Value>) => number,
  capacity: number
) {
  return <Key, Environment>(
    lookup: Lookup<Key, Environment, Error, Value>
  ): T.RIO<Environment, Cache<Key, Error, Value>> =>
    makeWith_(lookup, timeToLive, capacity)
}

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

/**
 * Returns the approximate number of values in the cache.
 */
export function size<Key, Error, Value>(self: Cache<Key, Error, Value>): T.UIO<number> {
  concrete(self)
  return self.size
}

/**
 * Sets the value in the cache.
 */
export function setValue_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  k: Key,
  v: Value
): T.UIO<void> {
  concrete(self)
  return self.setValue(k, v)
}

/**
 * Sets the value in the cache.
 *
 * @ets_data_first setValue_
 */
export function setValue<Key, Value>(k: Key, v: Value) {
  return <Error>(self: Cache<Key, Error, Value>): T.UIO<void> => setValue_(self, k, v)
}

/**
 * Returns the approximate values in the cache.
 *
 * **Note**: the ordering of values returned from the `Cache` is not guaranteed.
 * If a specific ordering must be imposed, is should be applied after values
 * are retrieved from the `Cache`.
 */
export function values<Key, Error, Value>(
  self: Cache<Key, Error, Value>
): T.UIO<C.Chunk<Value>> {
  concrete(self)
  return self.values
}

/**
 * Returns the approximate entries in the cache.
 *
 * **Note**: the ordering of entries returned from the `Cache` is not
 * guaranteed. If a specific ordering must be imposed, is should be applied
 * after entries are retrieved from the `Cache`.
 */
export function entries<Key, Error, Value>(
  self: Cache<Key, Error, Value>
): T.UIO<C.Chunk<Tup.Tuple<[Key, Value]>>> {
  concrete(self)
  return self.entries
}

/**
 * Returns statistics for this cache.
 */
export function cacheStats<Key, Error, Value>(
  self: Cache<Key, Error, Value>
): T.UIO<CacheStats> {
  concrete(self)
  return self.cacheStats
}

/**
 * Retrieves the value associated with the specified key if it exists.
 * Otherwise computes the value with the lookup function, puts it in the
 * cache, and returns it.
 */
export function get_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key
): T.IO<Error, Value> {
  concrete(self)
  return self.get(key)
}

/**
 * Retrieves the value associated with the specified key if it exists.
 * Otherwise computes the value with the lookup function, puts it in the
 * cache, and returns it.
 *
 * @ets_data_first get_
 */
export function get<Key>(key: Key) {
  return <Error, Value>(self: Cache<Key, Error, Value>): T.IO<Error, Value> =>
    get_(self, key)
}

/**
 * Returns whether a value associated with the specified key exists in the
 * cache.
 */
export function contains_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key
): T.UIO<boolean> {
  concrete(self)
  return self.contains(key)
}

/**
 * Returns whether a value associated with the specified key exists in the
 * cache.
 * @ets_data_first contains_
 */
export function contains<Key>(key: Key) {
  return <Error, Value>(self: Cache<Key, Error, Value>): T.UIO<boolean> =>
    contains_(self, key)
}

/**
 * Returns statistics for the specified entry.
 */
export function entryStats_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key
): T.UIO<O.Option<EntryStats>> {
  concrete(self)
  return self.entryStats(key)
}

/**
 * Returns statistics for the specified entry.
 *
 * @ets_data_first entryStats_
 */
export function entryStats<Key>(key: Key) {
  return <Error, Value>(self: Cache<Key, Error, Value>): T.UIO<O.Option<EntryStats>> =>
    entryStats_(self, key)
}

/**
 * Computes the value associated with the specified key, with the lookup
 * function, and puts it in the cache. The difference between this and
 * `get` method is that `refresh` triggers (re)computation of the value
 * without invalidating it in the cache, so any request to the associated
 * key can still be served while the value is being re-computed/retrieved
 * by the lookup function. Additionally, `refresh` always triggers the
 * lookup function, disregarding the last `Error`.
 */
export function refresh_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key
): T.IO<Error, void> {
  concrete(self)
  return self.refresh(key)
}

/**
 * Computes the value associated with the specified key, with the lookup
 * function, and puts it in the cache. The difference between this and
 * `get` method is that `refresh` triggers (re)computation of the value
 * without invalidating it in the cache, so any request to the associated
 * key can still be served while the value is being re-computed/retrieved
 * by the lookup function. Additionally, `refresh` always triggers the
 * lookup function, disregarding the last `Error`.
 *
 * @ets_data_first refresh_
 */
export function refresh<Key>(key: Key) {
  return <Error, Value>(self: Cache<Key, Error, Value>): T.IO<Error, void> =>
    refresh_(self, key)
}

/**
 * Invalidates the value associated with the specified key.
 */
export function invalidate_<Key, Error, Value>(
  self: Cache<Key, Error, Value>,
  key: Key
): T.UIO<void> {
  concrete(self)
  return self.invalidate(key)
}

/**
 * Invalidates the value associated with the specified key.
 *
 * @ets_data_first invalidate_
 */
export function invalidate<Key>(key: Key) {
  return <Error, Value>(self: Cache<Key, Error, Value>): T.UIO<void> =>
    invalidate_(self, key)
}

/**
 * Invalidates all values in the cache.
 */
export function invalidateAll<Key, Error, Value>(
  self: Cache<Key, Error, Value>
): T.UIO<void> {
  concrete(self)
  return self.invalidateAll()
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function hasExpired(timeToLive: Date): boolean {
  return Date.now() > timeToLive.getTime()
}

function lookupValueOf<Key, Environment, Error, Value>(
  key: Key,
  environment: Environment,
  promise: P.Promise<Error, Value>,
  timeToLive: (exit: Ex.Exit<Error, Value>) => number,
  cacheState: CacheState.CacheState<Key, Error, Value>,
  lookup: Lookup<Key, Environment, Error, Value>
): T.IO<Error, Value> {
  return pipe(
    lookup(key),
    T.provide(environment),
    T.result,
    T.chain((lookupResult) => {
      const now = Date.now()
      const completedResult = MapValue.complete(
        new MapKey(key),
        lookupResult,
        new EntryStats(new Date(now)),
        new Date(now + timeToLive(lookupResult))
      )

      cacheState.map = HM.set_(cacheState.map, key, completedResult)

      return pipe(
        promise,
        P.done(lookupResult),
        T.chain(() => T.done(lookupResult))
      )
    }),
    T.onInterrupt(() => {
      const value = O.toUndefined(HM.get_(cacheState.map, key))
      cacheState.map = HM.remove_(cacheState.map, key)
      return T.as_(P.interrupt(promise), value)
    })
  )
}
