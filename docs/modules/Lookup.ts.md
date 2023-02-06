---
title: Lookup.ts
nav_order: 4
parent: Modules
---

## Lookup overview

Added in v1.0.0

---

<h2 class="text-delta">Table of contents</h2>

- [models](#models)
  - [Lookup (type alias)](#lookup-type-alias)

---

# models

## Lookup (type alias)

A `Lookup` represents a lookup function that, given a key of type `Key`, can
return an effect that will either produce a value of type `Value` or fail
with an error of type `Error` using an environment of type `Environment`.

**Signature**

```ts
export type Lookup<Key, Environment, Error, Value> = (key: Key) => Effect.Effect<Environment, Error, Value>
```

Added in v1.0.0
