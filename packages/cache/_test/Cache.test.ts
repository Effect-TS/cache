import { RuntimeError } from "@effect/core/io/Cause"
import { DurationInternal } from "@tsplus/stdlib/data/Duration"

function hash(x: number) {
  return (y: number): Effect<never, never, number> => Effect.succeed(Hash.number(x ^ y))
}

describe.concurrent("Cache", () => {
  describe.concurrent("Cache Properties", () => {
    it("should return the size of the cache", () =>
      Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(10, new DurationInternal(Number.MAX_SAFE_INTEGER), hash(salt)))
        $(Effect.forEachDiscard(Chunk.range(1, 100), (n) => cache.get(n)))
        const result = $(cache.size)
        assert.strictEqual(result, 10)
      }).unsafeRunPromise())
  })

  describe.concurrent("Cache Statistics", () => {
    it("should track cache statistics", () =>
      Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new DurationInternal(Number.MAX_SAFE_INTEGER), hash(salt)))
        $(Effect.forEachParDiscard(Chunk.range(1, 100).map((n) => (n / 2) | 0), (n) => cache.get(n)))
        const stats = $(cache.cacheStats)
        const { hits, misses } = stats
        assert.strictEqual(hits, 49)
        assert.strictEqual(misses, 51)
      }).unsafeRunPromise())
  })

  describe.concurrent("Invalidation", () => {
    it("should invalidate a cache entry", () =>
      Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new DurationInternal(Number.MAX_SAFE_INTEGER), hash(salt)))
        $(Effect.forEachDiscard(Chunk.range(1, 100), (n) => cache.get(n)))
        $(cache.invalidate(42))
        const result = $(cache.contains(42))
        assert.isFalse(result)
      }).unsafeRunPromise())

    it("should invalidate all cache entries", () =>
      Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new DurationInternal(Number.MAX_SAFE_INTEGER), hash(salt)))
        $(Effect.forEachDiscard(Chunk.range(1, 100), (n) => cache.get(n)))
        $(cache.invalidateAll)
        const result = $(cache.size)
        assert.strictEqual(result, 0)
      }).unsafeRunPromise())
  })

  describe.concurrent("Entries", () => {
    it("should return an approximation of the current cache entries", () =>
      Do(($) => {
        function inc(n: number) {
          return n * 10
        }
        function retrieve(multiplier: Ref<number>) {
          return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
        }
        const seed = 1
        const key1 = 123
        const key2 = 321
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(5, new DurationInternal(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const value1 = $(cache.get(key1))
        const value2 = $(cache.get(key2))
        const entries = $(cache.entries)
        assert.strictEqual(value1, key1 * 10)
        assert.strictEqual(value2, key2 * 100)
        assert.isTrue(
          entries == Chunk(
            Tuple(key1, value1),
            Tuple(key2, value2)
          )
        )
      }).unsafeRunPromise())
  })

  describe.concurrent("Values", () => {
    it("should return the current values", () =>
      Do(($) => {
        function inc(n: number) {
          return n * 10
        }

        function retrieve(multiplier: Ref<number>) {
          return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
        }

        const seed = 1
        const key1 = 123
        const key2 = 321
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(5, new DurationInternal(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const value1 = $(cache.get(key1))
        const value2 = $(cache.get(key2))
        const values = $(cache.values)
        assert.strictEqual(value1, key1 * 10)
        assert.strictEqual(value2, key2 * 100)
        assert.isTrue(values == Chunk(value1, value2))
      }).unsafeRunPromise())
  })

  describe.concurrent("Lookups", () => {
    it("should lookup values in the cache sequentially", () =>
      Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new DurationInternal(Number.MAX_SAFE_INTEGER), hash(salt)))
        const actual = $(Effect.forEach(Chunk.range(1, 100), (n) => cache.get(n)))
        const expected = $(Effect.forEach(Chunk.range(1, 100), hash(salt)))
        assert.isTrue(actual == expected)
      }).unsafeRunPromise())

    it("should lookup values in the cache concurrently", () =>
      Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new DurationInternal(Number.MAX_SAFE_INTEGER), hash(salt)))
        const actual = $(Effect.forEachPar(Chunk.range(1, 100), (n) => cache.get(n)))
        const expected = $(Effect.forEachPar(Chunk.range(1, 100), hash(salt)))
        assert.isTrue(actual == expected)
      }).unsafeRunPromise())

    it("should lookup values in a cache with small capacity", () =>
      Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(10, new DurationInternal(Number.MAX_SAFE_INTEGER), hash(salt)))
        const actual = $(Effect.forEach(Chunk.range(1, 100), (n) => cache.get(n)))
        const expected = $(Effect.forEach(Chunk.range(1, 100), hash(salt)))
        assert.isTrue(actual == expected)
      }).unsafeRunPromise())

    it("should handle non-primitive cache entries", () =>
      Do(($) => {
        interface User extends Case {
          readonly name: string
          readonly age: number
        }
        const User = Case.of<User>()
        const user1 = User({ name: "Ann", age: 40 })
        const user2 = User({ name: "Jen", age: 20 })
        const user3 = User({ name: "Ann", age: 40 })
        const lookup = (seed: number) => {
          return (key: User) => {
            return Effect.succeed(
              Hash.combine(Hash.number(seed), Hash.unknown(key))
            )
          }
        }
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(10, new DurationInternal(Number.MAX_SAFE_INTEGER), lookup(salt)))
        $(cache.get(user1))
        $(cache.get(user2))
        $(cache.get(user3))

        const stats = $(cache.cacheStats)
        const { hits, misses, size } = stats
        assert.strictEqual(hits, 1)
        assert.strictEqual(misses, 2)
        assert.strictEqual(size, 2)
      }).unsafeRunPromise())
  })

  describe.concurrent("Refreshes", () => {
    it("should update the cache with a new value", () =>
      Do(($) => {
        function inc(n: number) {
          return n * 10
        }
        function retrieve(multiplier: Ref<number>) {
          return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
        }
        const seed = 1
        const key = 123
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(1, new DurationInternal(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const val1 = $(cache.get(key))
        $(cache.refresh(key))
        $(cache.get(key))
        const val2 = $(cache.get(key))
        assert.strictEqual(val1, inc(key))
        assert.strictEqual(val2, inc(val1))
      }).unsafeRunPromise())

    it("should update the cache with a new value even if the last `get` or `refresh` failed", () =>
      Do(($) => {
        const error = new RuntimeError("Must be a multiple of 3")
        function inc(n: number) {
          return n + 1
        }
        function retrieve(number: Ref<number>) {
          return (key: number) =>
            number.updateAndGet(inc).flatMap((n) => n % 3 === 0 ? Effect.fail(error) : Effect.succeed(key * n))
        }
        const seed = 2
        const key = 1
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(1, new DurationInternal(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const failure1 = $(cache.get(key).either)
        $(cache.refresh(key))
        const value1 = $(cache.get(key).either)
        $(cache.refresh(key))
        const failure2 = $(cache.refresh(key).either)
        $(cache.refresh(key))
        const value2 = $(cache.get(key).either)
        assert.isTrue(failure1 == Either.left(error))
        assert.isTrue(failure2 == Either.left(error))
        assert.isTrue(value1 == Either.right(4))
        assert.isTrue(value2 == Either.right(7))
      }).unsafeRunPromise())

    it("should get the value if the key doesn't exist in the cache", () =>
      Do(($) => {
        const cap = 100
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(cap, new DurationInternal(Number.MAX_SAFE_INTEGER), hash(salt)))
        const count1 = $(cache.size)
        $(Effect.forEachDiscard(Chunk.range(1, cap), (n) => cache.refresh(n)))
        const count2 = $(cache.size)
        assert.strictEqual(count1, 0)
        assert.strictEqual(count2, cap)
      }).unsafeRunPromise())
  })

  describe.concurrent("Setting Values", () => {
    it("should insert the value into the cache", () =>
      Do(($) => {
        function inc(n: number) {
          return n * 10
        }
        function retrieve(multiplier: Ref<number>) {
          return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
        }
        const seed = 1
        const key = 123
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(1, new DurationInternal(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        $(cache.set(key, 15))
        const result = $(cache.get(key))
        assert.strictEqual(result, 15)
      }).unsafeRunPromise())

    it("should update the cache with a new value", () =>
      Do(($) => {
        function inc(n: number) {
          return n * 10
        }
        function retrieve(multiplier: Ref<number>) {
          return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
        }
        const seed = 1
        const key = 123
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(1, new DurationInternal(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const value1 = $(cache.get(key))
        $(cache.set(key, 15))
        const value2 = $(cache.get(key))
        assert.strictEqual(value1, key * 10)
        assert.strictEqual(value2, 15)
      }).unsafeRunPromise())
  })
})
