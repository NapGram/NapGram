import { getInfraLogger } from './deps';
import { performanceMonitor } from './PerformanceMonitor';
const logger = getInfraLogger('MessageQueue');
export class MessageQueue {
    queue = [];
    processing = false;
    handler;
    batchSize;
    processInterval;
    maxQueueSize;
    enablePriority;
    processTimer;
    constructor(handler, config = {}) {
        this.handler = handler;
        this.batchSize = config.batchSize || 10;
        this.processInterval = config.processInterval || 100;
        this.maxQueueSize = config.maxQueueSize || 1000;
        this.enablePriority = config.priority || false;
        logger.info(`MessageQueue ✓ 初始化完成（批量大小: ${this.batchSize}, 间隔: ${this.processInterval}ms）`);
    }
    async enqueue(msg, priority = 0) {
        if (this.queue.length >= this.maxQueueSize) {
            logger.warn(`Queue is full (${this.maxQueueSize}), dropping message`);
            performanceMonitor.recordError();
            return;
        }
        this.queue.push({
            message: msg,
            priority,
            timestamp: Date.now(),
        });
        logger.trace(`Message enqueued (queue size: ${this.queue.length})`);
        if (!this.processing) {
            this.startProcessing();
        }
    }
    startProcessing() {
        if (this.processing)
            return;
        this.processing = true;
        logger.debug('Started processing queue');
        this.processTimer = setInterval(async () => {
            await this.processBatch();
        }, this.processInterval);
    }
    stopProcessing() {
        if (!this.processing)
            return;
        this.processing = false;
        if (this.processTimer) {
            clearInterval(this.processTimer);
            this.processTimer = undefined;
        }
        logger.debug('Stopped processing queue');
    }
    async processBatch() {
        if (this.queue.length === 0) {
            this.stopProcessing();
            return;
        }
        if (this.enablePriority) {
            this.queue.sort((a, b) => b.priority - a.priority);
        }
        const batch = this.queue.splice(0, this.batchSize);
        logger.debug(`Processing batch of ${batch.length} messages`);
        const startTime = Date.now();
        await Promise.allSettled(batch.map(async (item) => {
            try {
                await this.handler(item.message);
                const latency = Date.now() - item.timestamp;
                performanceMonitor.recordMessage(latency);
            }
            catch (error) {
                logger.error(error, 'Failed to process message:');
                performanceMonitor.recordError();
            }
        }));
        const batchTime = Date.now() - startTime;
        logger.trace(`Batch processed in ${batchTime}ms`);
    }
    getStatus() {
        return {
            size: this.queue.length,
            maxSize: this.maxQueueSize,
            processing: this.processing,
            utilization: (this.queue.length / this.maxQueueSize) * 100,
        };
    }
    clear() {
        this.queue = [];
        logger.info('Queue cleared');
    }
    destroy() {
        this.stopProcessing();
        this.clear();
        logger.info('MessageQueue destroyed');
    }
}
