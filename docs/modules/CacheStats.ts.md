---
title: CacheStats.ts
nav_order: 2
parent: Modules
---

## CacheStats overview

Added in v1.0.0

---

<h2 class="text-delta">Table of contents</h2>

- [constructors](#constructors)
  - [make](#make)
- [models](#models)
  - [CacheStats (interface)](#cachestats-interface)

---

# constructors

## make

Constructs a new `CacheStats` from the specified values.

**Signature**

```ts
export declare const make: (hits: number, misses: number, size: number) => CacheStats
```

Added in v1.0.0

# models

## CacheStats (interface)

`CacheStats` represents a snapshot of statistics for the cache as of a
point in time.

**Signature**

```ts
export interface CacheStats {
  readonly hits: number
  readonly misses: number
  readonly size: number
}
```

Added in v1.0.0
