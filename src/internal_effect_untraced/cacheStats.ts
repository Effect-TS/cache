import type * as CacheStats from "@effect/cache/CacheStats"

/** @internal */
export const make = (
  hits: number,
  misses: number,
  size: number
): CacheStats.CacheStats => ({
  hits,
  misses,
  size
})
