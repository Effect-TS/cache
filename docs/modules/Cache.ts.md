---
title: Cache.ts
nav_order: 1
parent: Modules
---

## Cache overview

Added in v1.0.0

---

<h2 class="text-delta">Table of contents</h2>

- [combinators](#combinators)
  - [contains](#contains)
  - [entryStats](#entrystats)
  - [get](#get)
  - [invalidate](#invalidate)
  - [invalidateAll](#invalidateall)
  - [refresh](#refresh)
  - [set](#set)
- [constructors](#constructors)
  - [make](#make)
  - [makeWith](#makewith)
  - [makeWithKey](#makewithkey)
- [getters](#getters)
  - [cacheStats](#cachestats)
  - [size](#size)
  - [values](#values)
- [models](#models)
  - [Cache (interface)](#cache-interface)
- [symbols](#symbols)
  - [CacheTypeId](#cachetypeid)
  - [CacheTypeId (type alias)](#cachetypeid-type-alias)

---

# combinators

## contains

Returns whether a value associated with the specified key exists in the
cache.

**Signature**

```ts
export declare const contains: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key): Effect.Effect<never, never, boolean>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, never, boolean>
}
```

Added in v1.0.0

## entryStats

Returns statistics for the specified entry.

**Signature**

```ts
export declare const entryStats: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key): Effect.Effect<
    never,
    never,
    Option.Option<EntryStats.EntryStats>
  >
  <Key>(key: Key): <Error, Value>(
    self: Cache<Key, Error, Value>
  ) => Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>>
}
```

Added in v1.0.0

## get

Retrieves the value associated with the specified key if it exists.
Otherwise computes the value with the lookup function, puts it in the
cache, and returns it.

**Signature**

```ts
export declare const get: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key): Effect.Effect<never, Error, Value>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, Error, Value>
}
```

Added in v1.0.0

## invalidate

Invalidates the value associated with the specified key.

**Signature**

```ts
export declare const invalidate: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key): Effect.Effect<never, never, void>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, never, void>
}
```

Added in v1.0.0

## invalidateAll

Invalidates all values in the cache.

**Signature**

```ts
export declare const invalidateAll: <Key, Error, Value>(
  self: Cache<Key, Error, Value>
) => Effect.Effect<never, never, void>
```

Added in v1.0.0

## refresh

Computes the value associated with the specified key, with the lookup
function, and puts it in the cache. The difference between this and
`get` method is that `refresh` triggers (re)computation of the value
without invalidating it in the cache, so any request to the associated
key can still be served while the value is being re-computed/retrieved
by the lookup function. Additionally, `refresh` always triggers the
lookup function, disregarding the last `Error`.

**Signature**

```ts
export declare const refresh: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key): Effect.Effect<never, Error, void>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, Error, void>
}
```

Added in v1.0.0

## set

Associates the specified value with the specified key in the cache.

**Signature**

```ts
export declare const set: {
  <Key, Error, Value>(self: Cache<Key, Error, Value>, key: Key, value: Value): Effect.Effect<never, never, void>
  <Key>(key: Key): <Error, Value>(self: Cache<Key, Error, Value>, value: Value) => Effect.Effect<never, never, void>
}
```

Added in v1.0.0

# constructors

## make

Constructs a new cache with the specified capacity, time to live, and
lookup function.

**Signature**

```ts
export declare const make: <Key, Environment, Error, Value>(
  capacity: number,
  timeToLive: Duration.Duration,
  lookup: any
) => Effect.Effect<Environment, never, Cache<Key, Error, Value>>
```

Added in v1.0.0

## makeWith

Constructs a new cache with the specified capacity, time to live, and
lookup function, where the time to live can depend on the `Exit` value
returned by the lookup function.

**Signature**

```ts
export declare const makeWith: <Key, Environment, Error, Value>(
  capacity: number,
  lookup: any,
  timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration
) => Effect.Effect<Environment, never, Cache<Key, Error, Value>>
```

Added in v1.0.0

## makeWithKey

Constructs a new cache with the specified capacity, time to live, and
lookup function, where the time to live can depend on the `Exit` value
returned by the lookup function.

This variant also allows specifying a custom keying function that will be
used to to convert the input of the lookup function into the key in the
underlying cache. This can be useful when the input to the lookup function
is large and you do not want to store it in the cache.

**Signature**

```ts
export declare const makeWithKey: <Input, Key, Environment, Error, Value>(
  capacity: number,
  lookup: any,
  timeToLive: (exit: Exit.Exit<Error, Value>) => Duration.Duration,
  keyBy: (input: Input) => Key
) => Effect.Effect<Environment, never, Cache<Input, Error, Value>>
```

Added in v1.0.0

# getters

## cacheStats

Returns statistics for this cache.

**Signature**

```ts
export declare const cacheStats: <Key, Error, Value>(
  self: Cache<Key, Error, Value>
) => Effect.Effect<never, never, CacheStats.CacheStats>
```

Added in v1.0.0

## size

Returns the approximate number of values in the cache.

**Signature**

```ts
export declare const size: <Key, Error, Value>(self: Cache<Key, Error, Value>) => Effect.Effect<never, never, number>
```

Added in v1.0.0

## values

Returns an approximation of the values in the cache.

**Signature**

```ts
export declare const values: <Key, Error, Value>(
  self: Cache<Key, Error, Value>
) => Effect.Effect<never, never, Chunk.Chunk<Value>>
```

Added in v1.0.0

# models

## Cache (interface)

A `Cache` is defined in terms of a lookup function that, given a key of
type `Key`, can either fail with an error of type `Error` or succeed with a
value of type `Value`. Getting a value from the cache will either return
the previous result of the lookup function if it is available or else
compute a new result with the lookup function, put it in the cache, and
return it.

A cache also has a specified capacity and time to live. When the cache is
at capacity the least recently accessed values in the cache will be
removed to make room for new values. Getting a value with a life older than
the specified time to live will result in a new value being computed with
the lookup function and returned when available.

The cache is safe for concurrent access. If multiple fibers attempt to get
the same key the lookup function will only be computed once and the result
will be returned to all fibers.

**Signature**

```ts
export interface Cache<Key, Error, Value> extends Cache.Variance<Key, Error, Value> {
  /**
   * Returns statistics for this cache.
   */
  cacheStats(): Effect.Effect<never, never, CacheStats.CacheStats>

  /**
   * Returns whether a value associated with the specified key exists in the
   * cache.
   */
  contains(key: Key): Effect.Effect<never, never, boolean>

  /**
   * Returns statistics for the specified entry.
   */
  entryStats(key: Key): Effect.Effect<never, never, Option.Option<EntryStats.EntryStats>>

  /**
   * Retrieves the value associated with the specified key if it exists.
   * Otherwise computes the value with the lookup function, puts it in the
   * cache, and returns it.
   */
  get(key: Key): Effect.Effect<never, Error, Value>

  /**
   * Invalidates the value associated with the specified key.
   */
  invalidate(key: Key): Effect.Effect<never, never, void>

  /**
   * Invalidates all values in the cache.
   */
  invalidateAll(): Effect.Effect<never, never, void>

  /**
   * Computes the value associated with the specified key, with the lookup
   * function, and puts it in the cache. The difference between this and
   * `get` method is that `refresh` triggers (re)computation of the value
   * without invalidating it in the cache, so any request to the associated
   * key can still be served while the value is being re-computed/retrieved
   * by the lookup function. Additionally, `refresh` always triggers the
   * lookup function, disregarding the last `Error`.
   */
  refresh(key: Key): Effect.Effect<never, Error, void>

  /**
   * Associates the specified value with the specified key in the cache.
   */
  set(key: Key, value: Value): Effect.Effect<never, never, void>

  /**
   * Returns the approximate number of values in the cache.
   */
  size(): Effect.Effect<never, never, number>

  /**
   * Returns an approximation of the values in the cache.
   */
  values(): Effect.Effect<never, never, Chunk.Chunk<Value>>
}
```

Added in v1.0.0

# symbols

## CacheTypeId

**Signature**

```ts
export declare const CacheTypeId: typeof CacheTypeId
```

Added in v1.0.0

## CacheTypeId (type alias)

**Signature**

```ts
export type CacheTypeId = typeof CacheTypeId
```

Added in v1.0.0
