// ets_tracing: off

import * as T from "@effect-ts/core/Effect"
import type * as Ex from "@effect-ts/core/Effect/Exit"
import * as P from "@effect-ts/core/Effect/Promise"
import { pipe } from "@effect-ts/core/Function"
import * as O from "@effect-ts/core/Option"
import * as St from "@effect-ts/core/Structural"
import { matchTag_ } from "@effect-ts/core/Utils"

import { CacheStats } from "../CacheStats"
import { EntryStats } from "../EntryStats"
import * as CacheState from "../Internal/CacheState"
import { MapKey } from "../Internal/MapKey"
import * as MapValue from "../Internal/MapValue"
import type { Lookup } from "../Lookup"
import { CacheError, CacheKey, CacheValue } from "./primitives"

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
export abstract class CAache<Key, Error, Value> {
  /**
   * Returns the approximate number of values in the cache.
   */
  abstract get size(): T.UIO<number>

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
              if (cacheState.map.delete(key.value)) {
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

      class _InternalCache extends CacheInternal<Key, Error, Value> {
        get size(): T.UIO<number> {
          return T.succeedWith(() => cacheState.map.size)
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
          return pipe(
            T.succeedWith(() => {
              let key: MapKey<Key>
              let promise: P.Promise<Error, Value>
              let value = cacheState.map.get(k)

              if (!value) {
                promise = P.unsafeMake(fiberId)
                key = new MapKey(k)
                if (cacheState.map.has(k)) {
                  value = cacheState.map.get(k)
                } else {
                  cacheState.map.set(k, MapValue.pending(key, promise))
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
                      if (St.equals(cacheState.map.get(k), value)) {
            }),
            T.flatten
          )
        }

        contains(key: Key): T.UIO<boolean> {
          return T.succeedWith(() => cacheState.map.has(key))
        }

        entryStats(key: Key): T.UIO<O.Option<EntryStats>> {
          return T.succeedWith(() => {
            const value = cacheState.map.get(key)
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
          return pipe(
            T.succeedWith(() => {
              const promise = P.unsafeMake<Error, Value>(fiberId)
              let value = cacheState.map.get(key)

              if (!value) {
                if (cacheState.map.has(key)) {
                  value = cacheState.map.get(key)
                } else {
                  cacheState.map.set(key, MapValue.pending(new MapKey(key), promise))
                }
              }
              if (!value) {
                return T.asUnit(
                  lookupValueOf(
                    key,
                    environment,
                    promise,
                    timeToLive,
                    cacheState,
                    lookup
                  )
                )
              }
              return matchTag_(value, {
                Pending: (_) => T.asUnit(P.await(_.promise)),
                Complete: (_) => {
                  if (hasExpired(_.timeToLive)) {
                  if (St.equals(cacheState.map.get(key), value)) {
                        if (St.equals(current, _)) {
            }),
            T.flatten
          )
        }

        invalidate(key: Key): T.UIO<void> {
          return T.succeedWith(() => {
            cacheState.map.delete(key)
          })
        }

        invalidateAll(): T.UIO<void> {
          return T.succeedWith(() => {
            cacheState.map.clear()
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

      cacheState.map.set(key, completedResult)

      return pipe(
        promise,
        P.done(lookupResult),
        T.chain(() => T.done(lookupResult))
      )
    }),
    T.onInterrupt(() => {
      const value = cacheState.map.get(key)
      cacheState.map.delete(key)
      return T.as_(P.interrupt(promise), value)
    })
  )
}
