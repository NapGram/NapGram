import type { UnifiedMessage } from './message';
export interface LoggerLike {
    debug(message: any, ...args: any[]): void;
    info(message: any, ...args: any[]): void;
    warn(message: any, ...args: any[]): void;
    error(message: any, ...args: any[]): void;
    trace?(message: any, ...args: any[]): void;
}
export type LoggerFactory = (name: string) => LoggerLike;
export interface QQMessageConverter {
    fromNapCat: (napCatMessage: any) => UnifiedMessage;
    toNapCat: (message: UnifiedMessage) => Promise<any> | any;
}
export interface QQClientDependencies {
    messageConverter: QQMessageConverter;
    loggerFactory?: LoggerFactory;
}
export declare function configureQQClient(deps: QQClientDependencies): void;
export declare function getQQClientDependencies(): QQClientDependencies;
export declare function resolveLoggerFactory(factory?: LoggerFactory): LoggerFactory;
