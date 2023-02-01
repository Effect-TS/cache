import type * as MapKey from "@effect/cache/internal_effect_untraced/mapKey"

/**
 * A `KeySet` is a sorted set of keys in the cache ordered by last access.
 * For efficiency, the set is implemented in terms of a doubly linked list
 * and is not safe for concurrent access.
 *
 * @internal
 */
export interface KeySet<K> {
  head: MapKey.MapKey<K> | undefined
  tail: MapKey.MapKey<K> | undefined
  /**
   * Adds the specified key to the set.
   */
  add(key: MapKey.MapKey<K>): void
  /**
   * Removes the lowest priority key from the set.
   */
  remove(): MapKey.MapKey<K> | undefined
}

class KeySetImpl<K> implements KeySet<K> {
  head: MapKey.MapKey<K> | undefined = undefined
  tail: MapKey.MapKey<K> | undefined = undefined
  add(key: MapKey.MapKey<K>): void {
    if (key !== this.tail) {
      if (this.tail === undefined) {
        this.head = key
        this.tail = key
      } else {
        const previous = key.previous
        const next = key.next
        if (next !== undefined) {
          key.next = undefined
          if (previous !== undefined) {
            previous.next = next
            next.previous = previous
          } else {
            this.head = next
            this.head.previous = undefined
          }
        }
        this.tail.next = key
        key.previous = this.tail
        this.tail = key
      }
    }
  }
  remove(): MapKey.MapKey<K> | undefined {
    const key = this.head
    if (key !== undefined) {
      const next = key.next
      if (next !== undefined) {
        key.next = undefined
        this.head = next
        this.head.previous = undefined
      } else {
        this.head = undefined
        this.tail = undefined
      }
    }
    return key
  }
}

/** @internal */
export const make = <K>(): KeySet<K> => new KeySetImpl<K>()
