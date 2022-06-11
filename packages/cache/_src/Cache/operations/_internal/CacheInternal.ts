import { CacheErrorSym, CacheKeySym, CacheValueSym } from "@effect/cache/Cache/definition"
import { CacheState } from "@effect/cache/Cache/operations/_internal/CacheState"
import { MapKey } from "@effect/cache/Cache/operations/_internal/MapKey"
import type { MapValue } from "@effect/cache/Cache/operations/_internal/MapValue"
import { Complete, Pending, Refreshing } from "@effect/cache/Cache/operations/_internal/MapValue"
import { EmptyMutableQueue } from "@tsplus/stdlib/collections/mutable/MutableQueue"

export class CacheInternal<Key, Environment, Error, Value> implements Cache<Key, Error, Value> {
  readonly [CacheKeySym]!: (_: Key) => void
  readonly [CacheErrorSym]!: () => Error
  readonly [CacheValueSym]!: () => Value

  private cacheState: CacheState<Key, Error, Value>

  constructor(
    readonly capacity: number,
    readonly lookup: Lookup<Key, Environment, Error, Value>,
    readonly timeToLive: (exit: Exit<Error, Value>) => Duration,
    readonly clock: Clock,
    readonly environment: Service.Env<Environment>,
    readonly fiberId: FiberId
  ) {
    this.cacheState = CacheState.initial<Key, Error, Value>()
  }

  get _size(): Effect.UIO<number> {
    return Effect.succeed(() => this.cacheState.map.size)
  }

  get _cacheStats(): Effect.UIO<CacheStats> {
    return Effect.succeed(CacheStats(
      this.cacheState.hits,
      this.cacheState.misses,
      this.cacheState.map.size
    ))
  }

  _entryStats(k: Key): Effect.UIO<Option<EntryStats>> {
    return Effect.succeed(() => {
      const value = this.cacheState.map.get(k).value
      if (value == null) {
        return Option.none
      }
      switch (value._tag) {
        case "Pending": {
          return Option.none
        }
        case "Complete": {
          return Option.some(EntryStats(value.entryStats.loadedMillis))
        }
        case "Refreshing": {
          return Option.some(EntryStats(value.complete.entryStats.loadedMillis))
        }
      }
    })
  }

  _contains(key: Key): Effect.UIO<boolean> {
    return Effect.succeed(() => this.cacheState.map.has(key))
  }

  _get(k: Key): Effect.IO<Error, Value> {
    return Effect.suspendSucceed(() => {
      let key: MapKey<Key> | undefined = undefined
      let deferred: Deferred<Error, Value> | undefined = undefined
      let value = this.cacheState.map.get(k).value
      if (value == null) {
        deferred = Deferred.unsafeMake<Error, Value>(this.fiberId)
        key = new MapKey(k)
        if (this.cacheState.map.has(k)) {
          value = this.cacheState.map.get(k).value!
        } else {
          this.cacheState.map.set(k, new Pending(key, deferred))
        }
      }
      if (value == null) {
        this._trackAccess(key!)
        this._trackMiss()
        return this._lookupValueOf(k, deferred!)
      }
      switch (value._tag) {
        case "Pending": {
          this._trackAccess(value.key)
          this._trackHit()
          return value.deferred.await()
        }
        case "Complete": {
          this._trackAccess(value.key)
          this._trackHit()
          if (this._hasExpired(value.timeToLiveMillis)) {
            const found = this.cacheState.map.get(k).value
            if (Equals.equals(found, value)) {
              this.cacheState.map.remove(k)
            }
            return this._get(k)
          }
          return Effect.done(value.exit)
        }
        case "Refreshing": {
          this._trackAccess(value.complete.key)
          this._trackHit()
          if (this._hasExpired(value.complete.timeToLiveMillis)) {
            return value.deferred.await()
          }
          return Effect.done(value.complete.exit)
        }
      }
    })
  }

  _set(key: Key, value: Value): Effect.UIO<void> {
    return Effect.succeed(() => {
      const now = this.clock.unsafeCurrentTime
      const lookupResult = Exit.succeed(value)
      this.cacheState.map.set(
        key,
        new Complete(
          new MapKey(key),
          lookupResult,
          EntryStats(now),
          now + this.timeToLive(lookupResult).millis
        )
      )
    })
  }

  _entries(): Effect.UIO<Chunk<Tuple<[Key, Value]>>> {
    return Effect.succeed(() => {
      const entries: Array<Tuple<[Key, Value]>> = []
      for (const { tuple: [key, value] } of this.cacheState.map) {
        if (value._tag === "Complete" && value.exit._tag === "Success") {
          entries.push(Tuple(key, value.exit.value))
        }
      }
      return Chunk.from(entries)
    })
  }

  _values(): Effect.UIO<Chunk<Value>> {
    return Effect.succeed(() => {
      const values: Array<Value> = []
      for (const { tuple: [_, value] } of this.cacheState.map) {
        if (value._tag === "Complete" && value.exit._tag === "Success") {
          values.push(value.exit.value)
        }
      }
      return Chunk.from(values)
    })
  }

  _refresh(k: Key): Effect.IO<Error, void> {
    return Effect.suspendSucceed(() => {
      const deferred = Deferred.unsafeMake<Error, Value>(this.fiberId)
      let value = this.cacheState.map.get(k).value
      if (value == null) {
        if (this.cacheState.map.has(k)) {
          value = this.cacheState.map.get(k).value!
        } else {
          this.cacheState.map.set(k, new Pending(new MapKey(k), deferred))
        }
      }
      if (value == null) {
        return this._lookupValueOf(k, deferred).asUnit()
      }
      switch (value._tag) {
        case "Pending": {
          return value.deferred.await().asUnit()
        }
        case "Complete": {
          if (this._hasExpired(value.timeToLiveMillis)) {
            const found = this.cacheState.map.get(k).value!
            if (Equals.equals(found, value)) {
              this.cacheState.map.remove(k)
            }
            return this._get(k).asUnit()
          }
          // Only trigger the lookup if we're still the current value
          return Effect.when(
            () => {
              const current = this.cacheState.map.get(k).value
              if (Equals.equals(current, value)) {
                this.cacheState.map.set(
                  k,
                  new Refreshing(deferred, value as Complete<Key, Error, Value>)
                )
                return true
              }
              return false
            },
            this._lookupValueOf(value.key.value, deferred)
          ).asUnit()
        }
        case "Refreshing": {
          return value.deferred.await().asUnit()
        }
      }
    })
  }

  _invalidate(key: Key): Effect.UIO<void> {
    return Effect.succeed(() => {
      this.cacheState.map.remove(key)
    })
  }

  _invalidateAll: Effect.UIO<void> = Effect.succeed(() => {
    this.cacheState.map = MutableHashMap.empty<Key, MapValue<Key, Error, Value>>()
  })

  private _trackHit(): void {
    this.cacheState.hits = this.cacheState.hits + 1
  }

  private _trackMiss(): void {
    this.cacheState.misses = this.cacheState.misses + 1
  }

  private _trackAccess(key: MapKey<Key>): void {
    this.cacheState.accesses.offer(key)
    if (this.cacheState.updating.compareAndSet(false, true)) {
      let loop = true
      while (loop) {
        const key = this.cacheState.accesses.poll(EmptyMutableQueue)
        if (key === EmptyMutableQueue) {
          loop = false
        } else {
          this.cacheState.keys.add(key)
        }
      }
      let size = this.cacheState.map.size
      loop = size > this.capacity
      while (loop) {
        const key = this.cacheState.keys.remove()
        if (key != null) {
          if (this.cacheState.map.remove(key.value) != null) {
            size = size - 1
            loop = size > this.capacity
          }
        } else {
          loop = false
        }
      }
      this.cacheState.updating.set(false)
    }
  }

  private _lookupValueOf(key: Key, deferred: Deferred<Error, Value>): Effect.IO<Error, Value> {
    return this.lookup(key)
      .provideEnvironment(this.environment)
      .exit()
      .flatMap((exit) => {
        const now = this.clock.unsafeCurrentTime
        const entryStats = EntryStats(now)
        this.cacheState.map.set(
          key,
          new Complete(
            new MapKey(key),
            exit,
            entryStats,
            now + this.timeToLive(exit).millis
          )
        )
        return deferred.done(exit).zipRight(Effect.done(exit))
      })
      .onInterrupt(() =>
        deferred.interrupt().zipRight(Effect.succeed(() => {
          this.cacheState.map.remove(key)
        }))
      )
  }

  private _hasExpired(timeToLiveMillis: number): boolean {
    return this.clock.unsafeCurrentTime > timeToLiveMillis
  }
}

/**
 * @tsplus macro remove
 */
export function concreteCache<Key, Error, Value>(
  _: Cache<Key, Error, Value>
): asserts _ is CacheInternal<Key, unknown, Error, Value> {
  //
}
