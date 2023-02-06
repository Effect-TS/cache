---
title: ScopedLookup.ts
nav_order: 6
parent: Modules
---

## ScopedLookup overview

Added in v1.0.0

---

<h2 class="text-delta">Table of contents</h2>

- [models](#models)
  - [ScopedLookup (type alias)](#scopedlookup-type-alias)

---

# models

## ScopedLookup (type alias)

Similar to `Lookup`, but executes the lookup function within a `Scope`.

**Signature**

```ts
export type ScopedLookup<Key, Environment, Error, Value> = (
  key: Key
) => Effect.Effect<Environment | Scope.Scope, Error, Value>
```

Added in v1.0.0
