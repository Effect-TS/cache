import { RuntimeError } from "@effect/core/io/Cause"

function hash(x: number) {
  return (y: number): Effect.UIO<number> => Effect.succeed(Hash.number(x ^ y))
}

describe.concurrent("Cache", () => {
  describe.concurrent("Cache Properties", () => {
    it("should return the size of the cache", async () => {
      const program = Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(10, new Duration(Number.MAX_SAFE_INTEGER), hash(salt)))
        $(Effect.forEachDiscard(Chunk.range(1, 100), (n) => cache.get(n)))
        return $(cache.size)
      })

      const result = await program.unsafeRunPromise()

      assert.strictEqual(result, 10)
    })
  })

  describe.concurrent("Cache Statistics", () => {
    it("should track cache statistics", async () => {
      const program = Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new Duration(Number.MAX_SAFE_INTEGER), hash(salt)))
        $(Effect.forEachParDiscard(Chunk.range(1, 100).map((n) => (n / 2) | 0), (n) => cache.get(n)))
        return $(cache.cacheStats)
      })

      const { hits, misses } = await program.unsafeRunPromise()

      assert.strictEqual(hits, 49)
      assert.strictEqual(misses, 51)
    })
  })

  describe.concurrent("Invalidation", () => {
    it("should invalidate a cache entry", async () => {
      const program = Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new Duration(Number.MAX_SAFE_INTEGER), hash(salt)))
        $(Effect.forEachDiscard(Chunk.range(1, 100), (n) => cache.get(n)))
        $(cache.invalidate(42))
        return $(cache.contains(42))
      })

      const result = await program.unsafeRunPromise()

      assert.isFalse(result)
    })

    it("should invalidate all cache entries", async () => {
      const program = Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new Duration(Number.MAX_SAFE_INTEGER), hash(salt)))
        $(Effect.forEachDiscard(Chunk.range(1, 100), (n) => cache.get(n)))
        $(cache.invalidateAll)
        return $(cache.size)
      })

      const result = await program.unsafeRunPromise()

      assert.strictEqual(result, 0)
    })
  })

  describe.concurrent("Entries", () => {
    it("should return an approximation of the current cache entries", async () => {
      function inc(n: number) {
        return n * 10
      }

      function retrieve(multiplier: Ref<number>) {
        return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
      }

      const seed = 1
      const key1 = 123
      const key2 = 321
      const program = Do(($) => {
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(5, new Duration(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const value1 = $(cache.get(key1))
        const value2 = $(cache.get(key2))
        const entries = $(cache.entries())
        return { value1, value2, entries }
      })

      const { entries, value1, value2 } = await program.unsafeRunPromise()

      assert.strictEqual(value1, key1 * 10)
      assert.strictEqual(value2, key2 * 100)
      assert.isTrue(
        entries == Chunk(
          Tuple(key1, value1),
          Tuple(key2, value2)
        )
      )
    })
  })

  describe.concurrent("Values", () => {
    it("should return the current values", async () => {
      function inc(n: number) {
        return n * 10
      }

      function retrieve(multiplier: Ref<number>) {
        return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
      }

      const seed = 1
      const key1 = 123
      const key2 = 321
      const program = Do(($) => {
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(5, new Duration(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const value1 = $(cache.get(key1))
        const value2 = $(cache.get(key2))
        const values = $(cache.values())
        return { value1, value2, values }
      })

      const { value1, value2, values } = await program.unsafeRunPromise()

      assert.strictEqual(value1, key1 * 10)
      assert.strictEqual(value2, key2 * 100)
      assert.isTrue(values == Chunk(value1, value2))
    })
  })

  describe.concurrent("Lookups", () => {
    it("should lookup values in the cache sequentially", async () => {
      const program = Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new Duration(Number.MAX_SAFE_INTEGER), hash(salt)))
        const actual = $(Effect.forEach(Chunk.range(1, 100), (n) => cache.get(n)))
        const expected = $(Effect.forEach(Chunk.range(1, 100), hash(salt)))
        return { actual, expected }
      })

      const { actual, expected } = await program.unsafeRunPromise()

      assert.isTrue(actual == expected)
    })

    it("should lookup values in the cache concurrently", async () => {
      const program = Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(100, new Duration(Number.MAX_SAFE_INTEGER), hash(salt)))
        const actual = $(Effect.forEachPar(Chunk.range(1, 100), (n) => cache.get(n)))
        const expected = $(Effect.forEachPar(Chunk.range(1, 100), hash(salt)))
        return { actual, expected }
      })

      const { actual, expected } = await program.unsafeRunPromise()

      assert.isTrue(actual == expected)
    })

    it("should lookup values in a cache with small capacity", async () => {
      const program = Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(10, new Duration(Number.MAX_SAFE_INTEGER), hash(salt)))
        const actual = $(Effect.forEach(Chunk.range(1, 100), (n) => cache.get(n)))
        const expected = $(Effect.forEach(Chunk.range(1, 100), hash(salt)))
        return { actual, expected }
      })

      const { actual, expected } = await program.unsafeRunPromise()

      assert.isTrue(actual == expected)
    })

    it("should handle non-primitive cache entries", async () => {
      interface User extends Case {
        readonly name: string
        readonly age: number
      }
      const User = Case.of<User>()

      const user1 = User({ name: "Ann", age: 40 })
      const user2 = User({ name: "Jen", age: 20 })
      const user3 = User({ name: "Ann", age: 40 })

      const lookup = (seed: number) =>
        (key: User) =>
          Effect.succeed(
            Hash.combine(Hash.number(seed), Hash.unknown(key))
          )

      const program = Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(10, new Duration(Number.MAX_SAFE_INTEGER), lookup(salt)))
        $(cache.get(user1))
        $(cache.get(user2))
        $(cache.get(user3))
        return $(cache.cacheStats)
      })

      const { hits, misses, size } = await program.unsafeRunPromise()

      assert.strictEqual(hits, 1)
      assert.strictEqual(misses, 2)
      assert.strictEqual(size, 2)
    })
  })

  describe.concurrent("Refreshes", () => {
    it("should update the cache with a new value", async () => {
      function inc(n: number) {
        return n * 10
      }

      function retrieve(multiplier: Ref<number>) {
        return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
      }

      const seed = 1
      const key = 123
      const program = Do(($) => {
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(1, new Duration(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const val1 = $(cache.get(key))
        $(cache.refresh(key))
        $(cache.get(key))
        const val2 = $(cache.get(key))
        return { val1, val2 }
      })

      const { val1, val2 } = await program.unsafeRunPromise()

      assert.strictEqual(val1, inc(key))
      assert.strictEqual(val2, inc(val1))
    })

    it("should update the cache with a new value even if the last `get` or `refresh` failed", async () => {
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
      const program = Do(($) => {
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(1, new Duration(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const failure1 = $(cache.get(key).either())
        $(cache.refresh(key))
        const value1 = $(cache.get(key).either())
        $(cache.refresh(key))
        const failure2 = $(cache.refresh(key).either())
        $(cache.refresh(key))
        const value2 = $(cache.get(key).either())
        return { failure1, value1, failure2, value2 }
      })

      const { failure1, failure2, value1, value2 } = await program.unsafeRunPromise()

      assert.isTrue(failure1 == Either.left(error))
      assert.isTrue(failure2 == Either.left(error))
      assert.isTrue(value1 == Either.right(4))
      assert.isTrue(value2 == Either.right(7))
    })

    it("should get the value if the key doesn't exist in the cache", async () => {
      const cap = 100
      const program = Do(($) => {
        const salt = $(Random.nextInt)
        const cache = $(Cache.make(cap, new Duration(Number.MAX_SAFE_INTEGER), hash(salt)))
        const count1 = $(cache.size)
        $(Effect.forEachDiscard(Chunk.range(1, cap), (n) => cache.refresh(n)))
        const count2 = $(cache.size)
        return { count1, count2 }
      })

      const { count1, count2 } = await program.unsafeRunPromise()

      assert.strictEqual(count1, 0)
      assert.strictEqual(count2, cap)
    })
  })

  describe.concurrent("Setting Values", () => {
    it("should insert the value into the cache", async () => {
      function inc(n: number) {
        return n * 10
      }

      function retrieve(multiplier: Ref<number>) {
        return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
      }

      const seed = 1
      const key = 123
      const program = Do(($) => {
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(1, new Duration(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        $(cache.set(key, 15))
        return $(cache.get(key))
      })

      const result = await program.unsafeRunPromise()

      assert.strictEqual(result, 15)
    })

    it("should update the cache with a new value", async () => {
      function inc(n: number) {
        return n * 10
      }

      function retrieve(multiplier: Ref<number>) {
        return (key: number) => multiplier.updateAndGet(inc).map((n) => n * key)
      }

      const seed = 1
      const key = 123
      const program = Do(($) => {
        const ref = $(Ref.make(seed))
        const cache = $(Cache.make(1, new Duration(Number.MAX_SAFE_INTEGER), retrieve(ref)))
        const value1 = $(cache.get(key))
        $(cache.set(key, 15))
        const value2 = $(cache.get(key))
        return { value1, value2 }
      })

      const { value1, value2 } = await program.unsafeRunPromise()

      assert.strictEqual(value1, key * 10)
      assert.strictEqual(value2, 15)
    })
  })
})
