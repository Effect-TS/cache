/**
 * @since 1.0.0
 */
import type * as CacheStats from "@effect/cache/CacheStats"
import type * as EntryStats from "@effect/cache/EntryStats"
import * as internal from "@effect/cache/internal_effect_untraced/cache"
import type * as Lookup from "@effect/cache/Lookup"
import type * as Chunk from "@effect/data/Chunk"
import type * as Duration from "@effect/data/Duration"
import type * as Effect from "@effect/io/Effect"
import type * as Exit from "@effect/io/Exit"
import type * as Option from "@fp-ts/core/Option"

/**
 * @since 1.0.0
 * @category symbols
 */
export const CacheTypeId: unique symbol = internal.CacheTypeId

/**
 * @since 1.0.0
 * @category symbols
 */
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
 *
 * @since 1.0.0
 * @category models
 */
export interface Cache<Key, Error, Value> extends Cache.Variance<Key, Error, Value> {
  /**
   * Returns statistics for this cache.
   */
  cacheStats(): Effect.Effect<never, never, CacheStats.CacheStats>

  /**
   * Returns whether a value associated with the specified key exists in the
   * cache.
   */
  contains(key: Key): Effect.Effect<never, never, boolean>

  /**
   * Returns statistics for the specified entry.
   */
  entryStats(key: Key): Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>>

  /**
   * Retrieves the value associated with the specified key if it exists.
   * Otherwise computes the value with the lookup function, puts it in the
   * cache, and returns it.
   */
  get(key: Key): Effect.Effect<never, Error, Value>

  /**
   * Invalidates the value associated with the specified key.
   */
  invalidate(key: Key): Effect.Effect<never, never, void>

  /**
   * Invalidates all values in the cache.
   */
  invalidateAll(): Effect.Effect<never, never, void>

  /**
   * Computes the value associated with the specified key, with the lookup
   * function, and puts it in the cache. The difference between this and
   * `get` method is that `refresh` triggers (re)computation of the value
   * without invalidating it in the cache, so any request to the associated
   * key can still be served while the value is being re-computed/retrieved
   * by the lookup function. Additionally, `refresh` always triggers the
   * lookup function, disregarding the last `Error`.
   */
  refresh(key: Key): Effect.Effect<never, Error, void>

  /**
   * Associates the specified value with the specified key in the cache.
   */
  set(key: Key, value: Value): Effect.Effect<never, never, void>

  /**
   * Returns the approximate number of values in the cache.
   */
  size(): Effect.Effect<never, never, number>

  /**
   * Returns an approximation of the values in the cache.
   */
  values(): Effect.Effect<never, never, Chunk.Chunk<Value>>
}

/**
 * @since 1.0.0
 */
export declare namespace Cache {
  /**
   * @since 1.0.0
   * @category models
   */
  export interface Variance<Key, Error, Value> {
    readonly [CacheTypeId]: {
      readonly _Key: (_: Key) => void
      readonly _Error: (_: never) => Error
      readonly _Value: (_: never) => Value
    }
  }
}

/**
 * Constructs a new cache with the specified capacity, time to live, and
 * lookup function.
 *
 * @since 1.0.0
 * @category constructors
 */
export const make: <Key, Environment, Error, Value>(
  capacity: number,
  timeToLive: Duration.Duration,
  lookup: Lookup.Lookup<Key, Environment, Error, Value>
) => Effect.Effect<Environment, never, Cache<Key, Error, Value>> = internal.make

/**
 * Constructs a new cache with the specified capacity, time to live, and
 * lookup function, where the time to live can depend on the `Exit` value
 * returned by the lookup function.
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeWith: <Key, Environment, Error, Value>(
  capacity: number,
  lookup: Lookup.Lookup<Key, Environment, Error, Value>,
  timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration
) => Effect.Effect<Environment, never, Cache<Key, Error, Value>> = internal.makeWith

/**
 * Constructs a new cache with the specified capacity, time to live, and
 * lookup function, where the time to live can depend on the `Exit` value
 * returned by the lookup function.
 *
 * This variant also allows specifying a custom keying function that will be
 * used to to convert the input of the lookup function into the key in the
 * underlying cache. This can be useful when the input to the lookup function
 * is large and you do not want to store it in the cache.
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeWithKey: <Input, Key, Environment, Error, Value>(
  capacity: number,
  lookup: Lookup.Lookup<Input, Environment, Error, Value>,
  timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration,
  keyBy: (input: Input) => Key
) => Effect.Effect<Environment, never, Cache<Input, Error, Value>> = internal.makeWithKey

/**
 * Returns statistics for this cache.
 *
 * @since 1.0.0
 * @category getters
 */
export const cacheStats: <Key, Error, Value>(
  self: Cache<Key, Error, Value>
) => Effect.Effect<never, never, CacheStats.CacheStats> = internal.cacheStats

/**
 * Returns whether a value associated with the specified key exists in the
 * cache.
 *
 * @since 1.0.0
 * @category combinators
 */
export const contains: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key): Effect.Effect<never, never, boolean>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, never, boolean>
} = internal.contains

/**
 * Returns statistics for the specified entry.
 *
 * @since 1.0.0
 * @category combinators
 */
export const entryStats: {
  <Key, Error, Value>(
    self: Cache<Key, Error, Value>,
    key: Key
  ): Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>>
  <Key>(
    key: Key
  ): <Error, Value>(
    self: Cache<Key, Error, Value>
  ) => Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>>
} = internal.entryStats

/**
 * Retrieves the value associated with the specified key if it exists.
 * Otherwise computes the value with the lookup function, puts it in the
 * cache, and returns it.
 *
 * @since 1.0.0
 * @category combinators
 */
export const get: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key): Effect.Effect<never, Error, Value>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, Error, Value>
} = internal.get

/**
 * Invalidates the value associated with the specified key.
 *
 * @since 1.0.0
 * @category combinators
 */
export const invalidate: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key): Effect.Effect<never, never, void>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, never, void>
} = internal.invalidate

/**
 * Invalidates all values in the cache.
 *
 * @since 1.0.0
 * @category combinators
 */
export const invalidateAll: <Key, Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, never, void> =
  internal.invalidateAll

/**
 * Computes the value associated with the specified key, with the lookup
 * function, and puts it in the cache. The difference between this and
 * `get` method is that `refresh` triggers (re)computation of the value
 * without invalidating it in the cache, so any request to the associated
 * key can still be served while the value is being re-computed/retrieved
 * by the lookup function. Additionally, `refresh` always triggers the
 * lookup function, disregarding the last `Error`.
 *
 * @since 1.0.0
 * @category combinators
 */
export const refresh: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key): Effect.Effect<never, Error, void>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, Error, void>
} = internal.refresh

/**
 * Associates the specified value with the specified key in the cache.
 *
 * @since 1.0.0
 * @category combinators
 */
export const set: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key, value: Value): Effect.Effect<never, never, void>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>, value: Value) => Effect.Effect<never, never, void>
} = internal.set

/**
 * Returns the approximate number of values in the cache.
 *
 * @since 1.0.0
 * @category getters
 */
export const size: <Key, Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, never, number> =
  internal.size

/**
 * Returns an approximation of the values in the cache.
 *
 * @since 1.0.0
 * @category getters
 */
export const values: <Key, Error, Value>(
  self: Cache<Key, Error, Value>
) => Effect.Effect<never, never, Chunk.Chunk<Value>> = internal.values
