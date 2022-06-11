function hash(x: number) {
  return (y: number): Effect.UIO<number> => Effect.succeed(Hash.number(x ^ y))
}

describe.concurrent("Cache", () => {
  it("cacheStats", async () => {
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

  it("invalidate", async () => {
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

  it("invalidateAll", async () => {
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

  describe.concurrent("Lookup", () => {
    it("sequential", async () => {
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

    it("concurrent", async () => {
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

    it("capacity", async () => {
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
  })
})
