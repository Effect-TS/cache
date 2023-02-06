---
title: EntryStats.ts
nav_order: 3
parent: Modules
---

## EntryStats overview

Added in v1.0.0

---

<h2 class="text-delta">Table of contents</h2>

- [constructors](#constructors)
  - [make](#make)
- [models](#models)
  - [EntryStats (interface)](#entrystats-interface)

---

# constructors

## make

Constructs a new `EntryStats` from the specified values.

**Signature**

```ts
export declare const make: (loadedMillis: number) => EntryStats
```

Added in v1.0.0

# models

## EntryStats (interface)

Represents a snapshot of statistics for an entry in the cache.

**Signature**

```ts
export interface EntryStats {
  readonly loadedMillis: number
}
```

Added in v1.0.0
