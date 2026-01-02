export interface PerformanceMetrics {
    messageProcessed: number;
    messageLatency: number[];
    errorCount: number;
    cacheHits: number;
    cacheMisses: number;
    memoryUsage: NodeJS.MemoryUsage;
    startTime: number;
}
export interface PerformanceStats {
    uptime: number;
    totalMessages: number;
    messagesPerSecond: number;
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
    cacheHitRate: number;
    memoryUsageMB: number;
}
export declare class PerformanceMonitor {
    private metrics;
    private maxLatencyRecords;
    recordMessage(latency: number): void;
    recordError(): void;
    recordCacheHit(): void;
    recordCacheMiss(): void;
    updateMemoryUsage(): void;
    getStats(): PerformanceStats;
    printStats(): void;
    reset(): void;
    private average;
    private percentile;
}
export declare const performanceMonitor: PerformanceMonitor;
