/**
 * NapGram 插件上下文实现
 *
 * 为每个插件创建独立的运行上下文
 */
import type { EventBus } from './event-bus';
import type { CommandConfig, EventSubscription, FriendRequestEventHandler, GroupAPI, GroupRequestEventHandler, InstanceAPI, InstanceStatusEventHandler, MessageAPI, MessageEventHandler, NoticeEventHandler, PluginContext, PluginLogger, PluginReloadEventHandler, PluginStorage, UserAPI, WebAPI } from './interfaces';
/**
 * 插件上下文实现
 */
export declare class PluginContextImpl implements PluginContext {
    private readonly eventBus;
    readonly pluginId: string;
    readonly logger: PluginLogger;
    readonly config: any;
    readonly storage: PluginStorage;
    readonly message: MessageAPI;
    readonly instance: InstanceAPI;
    readonly user: UserAPI;
    readonly group: GroupAPI;
    readonly web: WebAPI;
    /** 命令注册表 */
    private commands;
    /** 生命周期钩子 */
    private reloadCallbacks;
    private unloadCallbacks;
    constructor(pluginId: string, config: any, eventBus: EventBus, apis?: {
        message?: MessageAPI;
        instance?: InstanceAPI;
        user?: UserAPI;
        group?: GroupAPI;
        web?: WebAPI;
    });
    private createMockMessageAPI;
    private createMockInstanceAPI;
    private createMockUserAPI;
    private createMockGroupAPI;
    private createMockWebAPI;
    on(event: 'message', handler: MessageEventHandler): EventSubscription;
    on(event: 'friend-request', handler: FriendRequestEventHandler): EventSubscription;
    on(event: 'group-request', handler: GroupRequestEventHandler): EventSubscription;
    on(event: 'notice', handler: NoticeEventHandler): EventSubscription;
    on(event: 'instance-status', handler: InstanceStatusEventHandler): EventSubscription;
    on(event: 'plugin-reload', handler: PluginReloadEventHandler): EventSubscription;
    /**
     * 注册命令
     */
    command(config: CommandConfig): this;
    /**
     * 获取已注册的命令
     * @internal
     */
    getCommands(): Map<string, CommandConfig>;
    onReload(callback: () => void | Promise<void>): void;
    onUnload(callback: () => void | Promise<void>): void;
    /**
     * 触发重载钩子
     * @internal
     */
    triggerReload(): Promise<void>;
    /**
     * 触发卸载钩子
     * @internal
     */
    triggerUnload(): Promise<void>;
    /**
     * 清理上下文（移除所有事件订阅和命令）
     * @internal
     */
    cleanup(): void;
}
