/**
 * A simple TTL (Time To Live) cache implementation
 */
export declare class TTLCache<K, V> {
    private cache;
    private defaultTTL;
    /**
     * @param defaultTTL Default TTL in milliseconds (default: 60000ms = 1 minute)
     */
    constructor(defaultTTL?: number);
    /**
     * Set a value in the cache with optional custom TTL
     */
    set(key: K, value: V, ttl?: number): void;
    /**
     * Get a value from the cache, returns undefined if expired or not found
     */
    get(key: K): V | undefined;
    /**
     * Check if a key exists and is not expired
     */
    has(key: K): boolean;
    /**
     * Delete a key from the cache
     */
    delete(key: K): boolean;
    /**
     * Clear all entries from the cache
     */
    clear(): void;
    /**
     * Get the number of entries (including expired ones)
     */
    get size(): number;
    /**
     * Clean up expired entries
     */
    cleanup(): void;
}
