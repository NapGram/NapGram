import { getInfraLogger } from './deps';
import { performanceMonitor } from './PerformanceMonitor';
const logger = getInfraLogger('CacheManager');
export class CacheManager {
    cache = new Map();
    maxSize;
    defaultTTL;
    cleanupTimer;
    constructor(config = {}) {
        this.maxSize = config.maxSize || 1000;
        this.defaultTTL = config.defaultTTL || 300000;
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, config.cleanupInterval || 60000);
    }
    set(key, value, ttl) {
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }
        this.cache.set(key, {
            data: value,
            expires: Date.now() + (ttl || this.defaultTTL),
            hits: 0,
        });
        logger.trace(`Cache set: ${key}`);
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            performanceMonitor.recordCacheMiss();
            logger.trace(`Cache miss: ${key}`);
            return null;
        }
        if (item.expires < Date.now()) {
            this.cache.delete(key);
            performanceMonitor.recordCacheMiss();
            logger.trace(`Cache expired: ${key}`);
            return null;
        }
        item.hits++;
        performanceMonitor.recordCacheHit();
        logger.trace(`Cache hit: ${key}`);
        return item.data;
    }
    delete(key) {
        const result = this.cache.delete(key);
        if (result) {
            logger.trace(`Cache deleted: ${key}`);
        }
        return result;
    }
    clear() {
        this.cache.clear();
        logger.info('Cache cleared');
    }
    has(key) {
        const item = this.cache.get(key);
        if (!item)
            return false;
        if (item.expires < Date.now()) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
    size() {
        return this.cache.size;
    }
    getStats() {
        let totalHits = 0;
        let expiredCount = 0;
        const now = Date.now();
        for (const [, item] of this.cache) {
            totalHits += item.hits;
            if (item.expires < now) {
                expiredCount++;
            }
        }
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            totalHits,
            expiredCount,
            utilization: (this.cache.size / this.maxSize) * 100,
        };
    }
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, item] of this.cache) {
            if (item.expires < now) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            logger.debug(`Cleaned ${cleaned} expired cache items`);
        }
    }
    evictLRU() {
        let lruKey = null;
        let lruHits = Infinity;
        for (const [key, item] of this.cache) {
            if (item.hits < lruHits) {
                lruHits = item.hits;
                lruKey = key;
            }
        }
        if (lruKey) {
            this.cache.delete(lruKey);
            logger.debug(`Evicted LRU cache item: ${lruKey}`);
        }
    }
    destroy() {
        clearInterval(this.cleanupTimer);
        this.cache.clear();
        logger.info('CacheManager destroyed');
    }
}
export const groupInfoCache = new CacheManager({ defaultTTL: 300000 });
export const userInfoCache = new CacheManager({ defaultTTL: 600000 });
export const mediaCache = new CacheManager({ defaultTTL: 3600000 });
export const configCache = new CacheManager({ defaultTTL: Infinity });
