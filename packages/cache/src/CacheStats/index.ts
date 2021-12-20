// ets_tracing: off

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * Represents a snapshot of statistics for the cache as of a  point in time.
 */
export class CacheStats {
  constructor(readonly hits: number, readonly misses: number, readonly size: number) {}
}
