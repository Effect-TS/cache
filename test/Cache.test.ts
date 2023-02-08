import * as Cache from "@effect/cache/Cache"
import * as it from "@effect/cache/test/utils/extend"
import * as Chunk from "@effect/data/Chunk"
import * as Data from "@effect/data/Data"
import * as Duration from "@effect/data/Duration"
import * as Hash from "@effect/data/Hash"
import * as Cause from "@effect/io/Cause"
import * as Effect from "@effect/io/Effect"
import * as Ref from "@effect/io/Ref"
import * as Either from "@fp-ts/core/Either"
import { dual, pipe } from "@fp-ts/core/Function"
import * as fc from "fast-check"
import { describe, expect } from "vitest"

const hash = dual<
  (y: number) => (x: number) => Effect.Effect<never, never, number>,
  (x: number, y: number) => Effect.Effect<never, never, number>
>(2, (x, y) => Effect.sync(() => Hash.number(x ^ y)))

describe("Cache", () => {
  it.it("cacheStats", () =>
    fc.assert(fc.asyncProperty(fc.integer(), (salt) => {
      const program = Effect.gen(function*($) {
        const cache = yield* $(Cache.make(100, Duration.infinity, hash(salt)))
        yield* $(Effect.forEachParDiscard(
          Chunk.map(Chunk.range(1, 100), (n) => (n / 2) | 0),
          (n) => Cache.get(cache, n)
        ))
        const cacheStats = yield* $(Cache.cacheStats(cache))
        const hits = cacheStats.hits
        const misses = cacheStats.misses
        expect(hits).toBe(49)
        expect(misses).toBe(51)
      })
      return Effect.runPromise(program)
    })))

  it.it("invalidate", () =>
    fc.assert(fc.asyncProperty(fc.integer(), (salt) => {
      const program = Effect.gen(function*($) {
        const cache = yield* $(Cache.make(100, Duration.infinity, hash(salt)))
        yield* $(Effect.forEachParDiscard(Chunk.range(1, 100), (n) => Cache.get(cache, n)))
        yield* $(Cache.invalidate(cache, 42))
        const contains = yield* $(Cache.contains(cache, 42))
        expect(contains).toBe(false)
      })
      return Effect.runPromise(program)
    })))

  it.it("invalidateAll", () =>
    fc.assert(fc.asyncProperty(fc.integer(), (salt) => {
      const program = Effect.gen(function*($) {
        const cache = yield* $(Cache.make(100, Duration.infinity, hash(salt)))
        yield* $(Effect.forEachParDiscard(Chunk.range(1, 100), (n) => Cache.get(cache, n)))
        yield* $(Cache.invalidateAll(cache))
        const size = yield* $(Cache.size(cache))
        expect(size).toBe(0)
      })
      return Effect.runPromise(program)
    })))

  it.it("lookup", () =>
    fc.assert(fc.asyncProperty(fc.integer(), (salt) => {
      const program = Effect.gen(function*($) {
        interface User extends Data.Case {
          readonly name: string
          readonly age: number
        }
        const User = Data.case<User>()
        const user1 = User({ name: "Ann", age: 40 })
        const user2 = User({ name: "Jen", age: 20 })
        const user3 = User({ name: "Ann", age: 40 })
        const lookup = (seed: number) =>
          (key: User) =>
            Effect.succeed(
              pipe(
                Hash.number(seed),
                Hash.combine(Hash.hash(key))
              )
            )
        const cache = yield* $(Cache.make(10, Duration.infinity, lookup(salt)))
        yield* $(Cache.get(cache, user1))
        yield* $(Cache.get(cache, user2))
        yield* $(Cache.get(cache, user3))
        const { hits, misses, size } = yield* $(Cache.cacheStats(cache))
        expect(hits).toBe(1)
        expect(misses).toBe(2)
        expect(size).toBe(2)
      })
      return Effect.runPromise(program)
    })))

  it.it("lookup - sequential", () =>
    fc.assert(fc.asyncProperty(fc.integer(), (salt) => {
      const program = Effect.gen(function*($) {
        const cache = yield* $(Cache.make(100, Duration.infinity, hash(salt)))
        const actual = yield* $(Effect.forEach(Chunk.range(1, 100), (n) => Cache.get(cache, n)))
        const expected = yield* $(Effect.forEach(Chunk.range(1, 100), (n) => hash(salt)(n)))
        expect(Array.from(actual)).toEqual(Array.from(expected))
      })
      return Effect.runPromise(program)
    })))

  it.it("lookup - concurrent", () =>
    fc.assert(fc.asyncProperty(fc.integer(), (salt) => {
      const program = Effect.gen(function*($) {
        const cache = yield* $(Cache.make(100, Duration.infinity, hash(salt)))
        const actual = yield* $(Effect.forEachPar(Chunk.range(1, 100), (n) => Cache.get(cache, n)))
        const expected = yield* $(Effect.forEachPar(Chunk.range(1, 100), (n) => hash(salt)(n)))
        expect(Array.from(actual)).toEqual(Array.from(expected))
      })
      return Effect.runPromise(program)
    })))

  it.it("lookup - concurrent - capacity", () =>
    fc.assert(fc.asyncProperty(fc.integer(), (salt) => {
      const program = Effect.gen(function*($) {
        const cache = yield* $(Cache.make(10, Duration.infinity, hash(salt)))
        const actual = yield* $(Effect.forEachPar(Chunk.range(1, 100), (n) => Cache.get(cache, n)))
        const expected = yield* $(Effect.forEachPar(Chunk.range(1, 100), (n) => hash(salt)(n)))
        expect(Array.from(actual)).toEqual(Array.from(expected))
      })
      return Effect.runPromise(program)
    })))

  it.effect("refresh - should update the cache with a new value", () =>
    Effect.gen(function*($) {
      const inc = (n: number) => n * 10
      const retrieve = (multiplier: Ref.Ref<number>) =>
        (key: number) =>
          pipe(
            multiplier,
            Ref.updateAndGet(inc),
            Effect.map((n) => key * n)
          )
      const seed = 1
      const key = 123
      const ref = yield* $(Ref.make(seed))
      const cache = yield* $(Cache.make(1, Duration.infinity, retrieve(ref)))
      const val1 = yield* $(Cache.get(cache, key))
      yield* $(Cache.refresh(cache, key))
      yield* $(Cache.get(cache, key))
      const val2 = yield* $(Cache.get(cache, key))
      expect(val1).toBe(inc(key))
      expect(val2).toBe(inc(val1))
    }))

  it.effect("refresh - should update the cache with a new value even if the last `get` or `refresh` failed", () =>
    Effect.gen(function*($) {
      const error = Cause.RuntimeException("Must be a multiple of 3")
      const inc = (n: number) => n + 1
      const retrieve = (multiplier: Ref.Ref<number>) =>
        (key: number) =>
          pipe(
            multiplier,
            Ref.updateAndGet(inc),
            Effect.flatMap((n) =>
              n % 3 === 0
                ? Effect.fail(error)
                : Effect.succeed(key * n)
            )
          )
      const seed = 2
      const key = 1
      const ref = yield* $(Ref.make(seed))
      const cache = yield* $(Cache.make(1, Duration.infinity, retrieve(ref)))
      const failure1 = yield* $(Effect.either(Cache.get(cache, key)))
      yield* $(Cache.refresh(cache, key))
      const val1 = yield* $(Effect.either(Cache.get(cache, key)))
      yield* $(Cache.refresh(cache, key))
      const failure2 = yield* $(Effect.either(Cache.refresh(cache, key)))
      yield* $(Cache.refresh(cache, key))
      const val2 = yield* $(Effect.either(Cache.get(cache, key)))
      expect(failure1).toEqual(Either.left(error))
      expect(failure2).toEqual(Either.left(error))
      expect(val1).toEqual(Either.right(4))
      expect(val2).toEqual(Either.right(7))
    }))

  it.it("refresh - should get the value if the key doesn't exist in the cache", () =>
    fc.assert(fc.asyncProperty(fc.integer(), (salt) => {
      const program = Effect.gen(function*($) {
        const cap = 100
        const cache = yield* $(Cache.make(cap, Duration.infinity, hash(salt)))
        const count0 = yield* $(Cache.size(cache))
        yield* $(Effect.forEachParDiscard(Chunk.range(1, cap), (n) => Cache.refresh(cache, n)))
        const count1 = yield* $(Cache.size(cache))
        expect(count0).toBe(0)
        expect(count1).toBe(cap)
      })
      return Effect.runPromise(program)
    })))

  it.effect("set - should insert the value into the cache", () =>
    Effect.gen(function*($) {
      const inc = (n: number) => n * 10
      const retrieve = (multiplier: Ref.Ref<number>) =>
        (key: number) =>
          pipe(
            multiplier,
            Ref.updateAndGet(inc),
            Effect.map((n) => key * n)
          )
      const seed = 1
      const key = 123
      const ref = yield* $(Ref.make(seed))
      const cache = yield* $(Cache.make(1, Duration.infinity, retrieve(ref)))
      yield* $(Cache.set(cache, key, 15))
      const result = yield* $(Cache.get(cache, key))
      expect(result).toBe(15)
    }))

  it.effect("set - should update the cache with a new value", () =>
    Effect.gen(function*($) {
      const inc = (n: number) => n * 10
      const retrieve = (multiplier: Ref.Ref<number>) =>
        (key: number) =>
          pipe(
            multiplier,
            Ref.updateAndGet(inc),
            Effect.map((n) => key * n)
          )
      const seed = 1
      const key = 123
      const ref = yield* $(Ref.make(seed))
      const cache = yield* $(Cache.make(1, Duration.infinity, retrieve(ref)))
      const val1 = yield* $(Cache.get(cache, key))
      yield* $(Cache.set(cache, key, 15))
      const val2 = yield* $(Cache.get(cache, key))
      expect(val1).toBe(key * 10)
      expect(val2).toBe(15)
    }))

  it.it("size", () =>
    fc.assert(fc.asyncProperty(fc.integer(), (salt) => {
      const program = Effect.gen(function*($) {
        const cache = yield* $(Cache.make(10, Duration.infinity, hash(salt)))
        yield* $(Effect.forEachDiscard(Chunk.range(1, 100), (n) => Cache.get(cache, n)))
        const size = yield* $(Cache.size(cache))
        expect(size).toBe(10)
      })
      return Effect.runPromise(program)
    })))

  it.effect("values - should return an approximation of current values", () =>
    Effect.gen(function*($) {
      const inc = (n: number) => n * 10
      const retrieve = (multiplier: Ref.Ref<number>) =>
        (key: number) =>
          pipe(
            multiplier,
            Ref.updateAndGet(inc),
            Effect.map((n) => n * key)
          )
      const seed = 1
      const key1 = 123
      const key2 = 321
      const ref = yield* $(Ref.make(seed))
      const cache = yield* $(Cache.make(5, Duration.infinity, retrieve(ref)))
      const value1 = yield* $(Cache.get(cache, key1))
      const value2 = yield* $(Cache.get(cache, key2))
      const values = yield* $(Cache.values(cache))
      expect(value1).toBe(key1 * 10)
      expect(value2).toBe(key2 * 100)
      expect(Array.from(values)).toEqual([value1, value2])
    }))
})
