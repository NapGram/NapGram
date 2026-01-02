export type InfraLogger = {
    trace: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
};
export type LoggerFactory = (name: string) => InfraLogger;
export declare function configureInfraKit(options?: {
    loggerFactory?: LoggerFactory;
}): void;
export declare function getInfraLogger(name: string): InfraLogger;
