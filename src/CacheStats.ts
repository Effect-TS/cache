/**
 * @since 1.0.0
 */
import * as internal from "@effect/cache/internal_effect_untraced/cacheStats"

/**
 * `CacheStats` represents a snapshot of statistics for the cache as of a
 * point in time.
 *
 * @since 1.0.0
 * @category models
 */
export interface CacheStats {
  readonly hits: number
  readonly misses: number
  readonly size: number
}

/**
 * Constructs a new `CacheStats` from the specified values.
 *
 * @since 1.0.0
 * @category constructors
 */
export const make: (hits: number, misses: number, size: number) => CacheStats = internal.make
