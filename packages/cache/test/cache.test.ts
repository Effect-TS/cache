import * as C from "@effect-ts/core/Collections/Immutable/Chunk"
import * as T from "@effect-ts/core/Effect"
import * as R from "@effect-ts/core/Effect/Random"
import * as Ref from "@effect-ts/core/Effect/Ref"
import * as E from "@effect-ts/core/Either"
import { pipe } from "@effect-ts/core/Function"
import * as TE from "@effect-ts/jest/Test"

import * as Cache from "../src/Cache"
import * as TestUtils from "./test-utils"

describe("Cache", () => {
  const { it } = TE.runtime()

  it("should return the size of the cache", () =>
    T.gen(function* (_) {
      const { size } = yield* _(
        pipe(
          T.do,
          T.bind("salt", () => R.nextInt),
          T.bind("cache", ({ salt }) =>
            Cache.make(10, Number.MAX_SAFE_INTEGER, TestUtils.hash(salt))
          ),
          T.tap(({ cache }) =>
            pipe(
              C.range(1, 100),
              T.forEach((n) => Cache.get_(cache, n))
            )
          ),
          T.bind("size", ({ cache }) => Cache.size(cache))
        )
      )

      expect(size).toBe(10)
    }))

  it("should track cache statistics", () =>
    T.gen(function* (_) {
      const cacheStats = yield* _(
        pipe(
          R.nextInt,
          T.chain((n) => Cache.make(100, Number.MAX_SAFE_INTEGER, TestUtils.hash(n))),
          T.tap((cache) =>
            pipe(
              C.range(1, 100),
              C.map((n) => Math.floor(n / 2)),
              T.forEachPar((n) => Cache.get_(cache, n))
            )
          ),
          T.chain(Cache.cacheStats)
        )
      )

      expect(cacheStats.hits).toBe(49)
      expect(cacheStats.misses).toBe(51)
    }))

  it("should invalidate a cache entry", () =>
    T.gen(function* (_) {
      const result = yield* _(
        pipe(
          R.nextInt,
          T.chain((n) => Cache.make(100, Number.MAX_SAFE_INTEGER, TestUtils.hash(n))),
          T.tap((cache) =>
            pipe(
              C.range(1, 100),
              C.map((n) => Math.floor(n / 2)),
              T.forEachPar((n) => Cache.get_(cache, n))
            )
          ),
          T.tap(Cache.invalidate(42)),
          T.chain(Cache.contains(42))
        )
      )

      expect(result).toBeFalsy()
    }))

  it("should invalidate all cache entries", () =>
    T.gen(function* (_) {
      const result = yield* _(
        pipe(
          R.nextInt,
          T.chain((n) => Cache.make(100, Number.MAX_SAFE_INTEGER, TestUtils.hash(n))),
          T.tap((cache) =>
            pipe(
              C.range(1, 100),
              C.map((n) => Math.floor(n / 2)),
              T.forEachPar((n) => Cache.get_(cache, n))
            )
          ),
          T.tap(Cache.invalidateAll),
          T.chain(Cache.size)
        )
      )

      expect(result).toBe(0)
    }))

  describe("Lookups", () => {
    it("should lookup values in the cache sequentially", () =>
      T.gen(function* (_) {
        const { actual, expected } = yield* _(
          pipe(
            T.do,
            T.bind("salt", () => R.nextInt),
            T.bind("cache", ({ salt }) =>
              Cache.make(100, Number.MAX_SAFE_INTEGER, TestUtils.hash(salt))
            ),
            T.bind("actual", ({ cache }) =>
              pipe(
                C.range(1, 100),
                T.forEach((n) => Cache.get_(cache, n))
              )
            ),
            T.bind("expected", ({ salt }) =>
              pipe(C.range(1, 100), T.forEach(TestUtils.hash(salt)))
            )
          )
        )

        expect(actual).toEqual(expected)
      }))

    it("should lookup values in the cache concurrently", () =>
      T.gen(function* (_) {
        const { actual, expected } = yield* _(
          pipe(
            T.do,
            T.bind("salt", () => R.nextInt),
            T.bind("cache", ({ salt }) =>
              Cache.make(100, Number.MAX_SAFE_INTEGER, TestUtils.hash(salt))
            ),
            T.bind("actual", ({ cache }) =>
              pipe(
                C.range(1, 100),
                T.forEachPar((n) => Cache.get_(cache, n))
              )
            ),
            T.bind("expected", ({ salt }) =>
              pipe(C.range(1, 100), T.forEachPar(TestUtils.hash(salt)))
            )
          )
        )

        expect(actual).toEqual(expected)
      }))

    it("should lookup values in a cache with capacity", () =>
      T.gen(function* (_) {
        const { actual, expected } = yield* _(
          pipe(
            T.do,
            T.bind("salt", () => R.nextInt),
            T.bind("cache", ({ salt }) =>
              Cache.make(20, Number.MAX_SAFE_INTEGER, TestUtils.hash(salt))
            ),
            T.bind("actual", ({ cache }) =>
              pipe(
                C.range(1, 100),
                T.forEachPar((n) => Cache.get_(cache, n))
              )
            ),
            T.bind("expected", ({ salt }) =>
              pipe(C.range(1, 100), T.forEachPar(TestUtils.hash(salt)))
            )
          )
        )

        expect(actual).toEqual(expected)
      }))
  })

  describe("Refreshes", () => {
    it("should update the cache with a new value", () =>
      T.gen(function* (_) {
        function inc(n: number): number {
          return n * 10
        }

        function retrieve(multiplier: Ref.Ref<number>) {
          return (key: number) =>
            pipe(
              multiplier,
              Ref.updateAndGet(inc),
              T.map((_) => key * _)
            )
        }

        const seed = 1
        const key = 123

        const { value1, value2 } = yield* _(
          pipe(
            T.do,
            T.bind("ref", () => Ref.makeRef(seed)),
            T.bind("cache", ({ ref }) =>
              Cache.make(1, Number.MAX_SAFE_INTEGER, retrieve(ref))
            ),
            T.bind("value1", ({ cache }) => Cache.get_(cache, key)),
            T.tap(({ cache }) => Cache.refresh_(cache, key)),
            T.tap(({ cache }) => Cache.get_(cache, key)),
            T.bind("value2", ({ cache }) => Cache.get_(cache, key))
          )
        )

        expect(value1).toBe(key * 10)
        expect(value2).toBe(value1 * 10)
      }))

    it("should update the cache with a new value even if the last `get` or `refresh` failed", () =>
      T.gen(function* (_) {
        const error = "Must be a multiple of 3"

        function inc(n: number): number {
          return n + 1
        }

        function retrieve(ref: Ref.Ref<number>) {
          return (key: number) =>
            pipe(
              ref,
              Ref.updateAndGet(inc),
              T.chain((n) => (n % 3 === 0 ? T.fail(error) : T.succeed(key * n)))
            )
        }

        const seed = 2
        const key = 1

        const { failure1, failure2, value1, value2 } = yield* _(
          pipe(
            T.do,
            T.bind("ref", () => Ref.makeRef(seed)),
            T.bind("cache", ({ ref }) =>
              Cache.make(1, Number.MAX_SAFE_INTEGER, retrieve(ref))
            ),
            T.bind("failure1", ({ cache }) => T.either(Cache.get_(cache, key))),
            T.tap(({ cache }) => Cache.refresh_(cache, key)),
            T.bind("value1", ({ cache }) => T.either(Cache.get_(cache, key))),
            T.tap(({ cache }) => Cache.refresh_(cache, key)),
            T.bind("failure2", ({ cache }) => T.either(Cache.refresh_(cache, key))),
            T.tap(({ cache }) => Cache.refresh_(cache, key)),
            T.bind("value2", ({ cache }) => T.either(Cache.get_(cache, key)))
          )
        )

        expect(failure1).toEqual(E.left(error))
        expect(failure2).toEqual(E.left(error))
        expect(value1).toEqual(E.right(4))
        expect(value2).toEqual(E.right(7))
      }))

    it("should get the value if the key does not exist in the cache", () =>
      T.gen(function* (_) {
        const cap = 100

        const { count0, count1 } = yield* _(
          pipe(
            T.do,
            T.bind("salt", () => R.nextInt),
            T.bind("cache", ({ salt }) =>
              Cache.make(cap, Number.MAX_SAFE_INTEGER, TestUtils.hash(salt))
            ),
            T.bind("count0", ({ cache }) => Cache.size(cache)),
            T.tap(({ cache }) =>
              pipe(
                C.range(1, cap),
                T.forEach((n) => Cache.refresh_(cache, n))
              )
            ),
            T.bind("count1", ({ cache }) => Cache.size(cache))
          )
        )

        expect(count0).toBe(0)
        expect(count1).toBe(cap)
      }))
  })
})
