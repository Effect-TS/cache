import type * as EntryStats from "@effect/cache/EntryStats"

/** @internal */
export const make = (loadedMillis: number): EntryStats.EntryStats => ({
  loadedMillis
})
