import process from 'node:process';
import { getInfraLogger } from './deps';
const logger = getInfraLogger('PerformanceMonitor');
export class PerformanceMonitor {
    metrics = {
        messageProcessed: 0,
        messageLatency: [],
        errorCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        memoryUsage: process.memoryUsage(),
        startTime: Date.now(),
    };
    maxLatencyRecords = 1000;
    recordMessage(latency) {
        this.metrics.messageProcessed++;
        this.metrics.messageLatency.push(latency);
        if (this.metrics.messageLatency.length > this.maxLatencyRecords) {
            this.metrics.messageLatency.shift();
        }
    }
    recordError() {
        this.metrics.errorCount++;
    }
    recordCacheHit() {
        this.metrics.cacheHits++;
    }
    recordCacheMiss() {
        this.metrics.cacheMisses++;
    }
    updateMemoryUsage() {
        this.metrics.memoryUsage = process.memoryUsage();
    }
    getStats() {
        const uptime = Date.now() - this.metrics.startTime;
        const uptimeSeconds = uptime / 1000;
        return {
            uptime,
            totalMessages: this.metrics.messageProcessed,
            messagesPerSecond: this.metrics.messageProcessed / uptimeSeconds,
            avgLatency: this.average(this.metrics.messageLatency),
            p50Latency: this.percentile(this.metrics.messageLatency, 50),
            p95Latency: this.percentile(this.metrics.messageLatency, 95),
            p99Latency: this.percentile(this.metrics.messageLatency, 99),
            errorRate: this.metrics.messageProcessed > 0
                ? this.metrics.errorCount / this.metrics.messageProcessed
                : 0,
            cacheHitRate: (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
                ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
                : 0,
            memoryUsageMB: this.metrics.memoryUsage.heapUsed / 1024 / 1024,
        };
    }
    printStats() {
        const stats = this.getStats();
        logger.debug('=== Performance Statistics ===');
        logger.debug(`Uptime: ${(stats.uptime / 1000 / 60).toFixed(2)} minutes`);
        logger.debug(`Total Messages: ${stats.totalMessages}`);
        logger.debug(`Messages/sec: ${stats.messagesPerSecond.toFixed(2)}`);
        logger.debug(`Avg Latency: ${stats.avgLatency.toFixed(2)}ms`);
        logger.debug(`P95 Latency: ${stats.p95Latency.toFixed(2)}ms`);
        logger.debug(`P99 Latency: ${stats.p99Latency.toFixed(2)}ms`);
        logger.debug(`Error Rate: ${(stats.errorRate * 100).toFixed(2)}%`);
        logger.debug(`Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(2)}%`);
        logger.debug(`Memory Usage: ${stats.memoryUsageMB.toFixed(2)}MB`);
        logger.debug('==============================');
    }
    reset() {
        this.metrics = {
            messageProcessed: 0,
            messageLatency: [],
            errorCount: 0,
            cacheHits: 0,
            cacheMisses: 0,
            memoryUsage: process.memoryUsage(),
            startTime: Date.now(),
        };
        logger.info('Performance metrics reset');
    }
    average(arr) {
        if (arr.length === 0)
            return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    percentile(arr, p) {
        if (arr.length === 0)
            return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }
}
export const performanceMonitor = new PerformanceMonitor();
setInterval(() => {
    performanceMonitor.updateMemoryUsage();
    performanceMonitor.printStats();
}, 300000);
