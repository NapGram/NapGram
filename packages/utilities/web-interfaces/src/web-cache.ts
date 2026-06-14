export class TTLCache<K, V> {
  private readonly cache = new Map<K, { value: V, expiresAt: number }>()

  constructor(private readonly defaultTtl = 60_000) {}

  set(key: K, value: V, ttl = this.defaultTtl) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttl })
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    if (!entry)
      return undefined
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key)
      return undefined
    }
    return entry.value
  }

  delete(key: K) {
    return this.cache.delete(key)
  }

  clear() {
    this.cache.clear()
  }

  size() {
    return this.cache.size
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.size,
      totalHits: 0,
      expiredCount: 0,
      utilization: 0,
    }
  }
}

export const groupInfoCache = new TTLCache<string, any>(300_000)
export const configCache = new TTLCache<string, any>(300_000)
export const mediaCache = new TTLCache<string, any>(300_000)
export const userInfoCache = new TTLCache<string, any>(300_000)
