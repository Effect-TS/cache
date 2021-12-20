// ets_tracing: off

import type { MapKey } from "../MapKey"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * A `KeySet` is a sorted set of keys in the cache ordered by last access.
 *
 * For efficiency, the set is implemented in terms of a doubly linked list
 * and is not safe for concurrent access.
 */
export class KeySet<Key> {
  head: MapKey<Key> | null = null
  tail: MapKey<Key> | null = null

  /**
   * Adds the specified key to the set.
   */
  add(key: MapKey<Key>): void {
    if (key !== this.tail) {
      if (this.tail) {
        const previous = key.previous
        const next = key.next
        if (next) {
          key.next = null
          if (previous) {
            previous.next = next
            next.previous = previous
          } else {
            this.head = next
            this.head.previous = null
          }
        }
        this.tail.next = key
        key.previous = this.tail
        this.tail = key
      } else {
        this.head = key
        this.tail = key
      }
    }
  }

  /**
   * Removes the lowest priority key from the set.
   */
  remove(): MapKey<Key> | null {
    const key = this.head
    if (key) {
      const next = key.next
      if (next) {
        key.next = null
        this.head = next
        this.head.previous = null
      } else {
        this.head = null
        this.tail = null
      }
    }
    return key
  }
}
