export interface CacheConfig {
    maxSize?: number;
    defaultTTL?: number;
    cleanupInterval?: number;
}
export declare class CacheManager<T = any> {
    private cache;
    private maxSize;
    private defaultTTL;
    private cleanupTimer;
    constructor(config?: CacheConfig);
    set(key: string, value: T, ttl?: number): void;
    get(key: string): T | null;
    delete(key: string): boolean;
    clear(): void;
    has(key: string): boolean;
    size(): number;
    getStats(): {
        size: number;
        maxSize: number;
        totalHits: number;
        expiredCount: number;
        utilization: number;
    };
    private cleanup;
    private evictLRU;
    destroy(): void;
}
export declare const groupInfoCache: CacheManager<any>;
export declare const userInfoCache: CacheManager<any>;
export declare const mediaCache: CacheManager<any>;
export declare const configCache: CacheManager<any>;
