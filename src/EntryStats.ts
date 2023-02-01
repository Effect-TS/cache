/**
 * @since 1.0.0
 */
import * as internal from "@effect/cache/internal_effect_untraced/entryStats"

/**
 * Represents a snapshot of statistics for an entry in the cache.
 *
 * @since 1.0.0
 * @category models
 */
export interface EntryStats {
  readonly loadedMillis: number
}

/**
 * Constructs a new `EntryStats` from the specified values.
 *
 * @since 1.0.0
 * @category constructors
 */
export const make: (loadedMillis: number) => EntryStats = internal.make
