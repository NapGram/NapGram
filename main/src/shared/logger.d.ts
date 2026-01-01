type LogLevel = 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type EnvLogLevel = Exclude<LogLevel, 'silly'> | 'mark' | 'off';
export declare function rotateIfNeeded(): void;
export interface AppLogger {
    trace: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    fatal: (...args: unknown[]) => void;
}
export declare function setConsoleLogLevel(level: EnvLogLevel): void;
export declare function getLogger(name: string): AppLogger;
export default getLogger;
