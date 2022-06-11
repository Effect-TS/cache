export const CacheKeySym = Symbol.for("@effect/cache/Cache.Key")
export type CacheKeySym = typeof CacheKeySym

export const CacheErrorSym = Symbol.for("@effect/cache/Cache.Error")
export type CacheErrorSym = typeof CacheErrorSym

export const CacheValueSym = Symbol.for("@effect/cache/Cache.Value")
export type CacheValueSym = typeof CacheValueSym

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
 * @tsplus type effect/cache/Cache
 */
export interface Cache<Key, Error, Value> {
  readonly [CacheKeySym]: (_: Key) => void
  readonly [CacheErrorSym]: () => Error
  readonly [CacheValueSym]: () => Value
  /**
   * Returns statistics for this cache.
   */
  readonly cacheStats: Effect.UIO<CacheStats>
  /**
   * Returns whether a value associated with the specified key exists in the
   * cache.
   */
  readonly contains: (key: Key) => Effect.UIO<boolean>
  /**
   * Returns statistics for the specified entry.
   */
  readonly entryStats: (key: Key) => Effect.UIO<Option<EntryStats>>
  /**
   * Retrieves the value associated with the specified key if it exists.
   * Otherwise computes the value with the lookup function, puts it in the
   * cache, and returns it.
   */
  readonly get: (key: Key) => Effect.IO<Error, Value>
  /**
   * Associates the specified value to the specified key in the cache.
   */
  readonly set: (key: Key, value: Value) => Effect.UIO<void>
  /**
   * Returns an approximation of values in the cache.
   */
  readonly values: () => Effect.UIO<Chunk<Value>>
  /**
   * Returns an approximation of the entries in the cache.
   */
  readonly entries: () => Effect.UIO<Chunk<Tuple<[Key, Value]>>>
  /**
   * Computes the value associated with the specified key, with the lookup
   * function, and puts it in the cache. The difference between this and
   * `get` method is that `refresh` triggers (re)computation of the value
   * without invalidating it in the cache, so any request to the associated
   * key can still be served while the value is being re-computed/retrieved
   * by the lookup function. Additionally, `refresh` always triggers the
   * lookup function, disregarding the last `Error`.
   */
  readonly refresh: (key: Key) => Effect.IO<Error, void>
  /**
   * Invalidates the value associated with the specified key.
   */
  readonly invalidate: (key: Key) => Effect.UIO<void>
  /**
   * Invalidates all values in the cache.
   */
  readonly invalidateAll: Effect.UIO<void>
  /**
   * Returns the approximate number of values in the cache.
   */
  readonly size: Effect.UIO<number>
}

/**
 * @tsplus type effect/cache/Cache.Ops
 */
export interface CacheOps {}
export const Cache: CacheOps = {}
