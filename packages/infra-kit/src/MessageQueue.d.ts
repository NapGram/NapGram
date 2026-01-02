export type MessageHandler<T = unknown> = (msg: T) => Promise<void>;
export interface QueueConfig {
    batchSize?: number;
    processInterval?: number;
    maxQueueSize?: number;
    priority?: boolean;
}
export declare class MessageQueue<T = unknown> {
    private queue;
    private processing;
    private handler;
    private batchSize;
    private processInterval;
    private maxQueueSize;
    private enablePriority;
    private processTimer?;
    constructor(handler: MessageHandler<T>, config?: QueueConfig);
    enqueue(msg: T, priority?: number): Promise<void>;
    private startProcessing;
    private stopProcessing;
    private processBatch;
    getStatus(): {
        size: number;
        maxSize: number;
        processing: boolean;
        utilization: number;
    };
    clear(): void;
    destroy(): void;
}
