export declare function initSentry(): void;
export declare function captureException(error: unknown, extra?: Record<string, unknown>): void;
export declare function captureMessage(message: string, extra?: Record<string, unknown>): void;
export declare function flush(timeoutMs?: number): Promise<boolean>;
declare const _default: {
    init: typeof initSentry;
    captureException: typeof captureException;
    captureMessage: typeof captureMessage;
    flush: typeof flush;
};
export default _default;
