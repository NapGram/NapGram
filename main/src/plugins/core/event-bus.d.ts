/**
 * NapGram 事件总线
 *
 * 提供高性能的事件发布订阅机制，支持：
 * - 类型安全的事件订阅
 * - 事件过滤
 * - 错误隔离
 * - 订阅管理
 */
import type { EventSubscription, FriendRequestEvent, GroupRequestEvent, InstanceStatusEvent, MessageEvent, NoticeEvent, PluginReloadEvent } from './interfaces';
/**
 * 事件类型映射
 */
interface EventMap {
    'message': MessageEvent;
    'friend-request': FriendRequestEvent;
    'group-request': GroupRequestEvent;
    'notice': NoticeEvent;
    'instance-status': InstanceStatusEvent;
    'plugin-reload': PluginReloadEvent;
}
/**
 * 事件处理器
 */
type EventHandler<T = any> = (event: T) => void | Promise<void>;
/**
 * 事件过滤器
 */
type EventFilter<T = any> = (event: T) => boolean;
/**
 * 事件总线
 */
export declare class EventBus {
    /** 订阅表：事件类型 -> 订阅列表 */
    private subscriptions;
    /** 订阅计数器（用于生成唯一 ID） */
    private subscriptionIdCounter;
    /** 事件统计 */
    private stats;
    /**
     * 订阅事件
     *
     * @param eventType 事件类型
     * @param handler 事件处理器
     * @param filter 事件过滤器（可选）
     * @param pluginId 插件 ID（用于日志）
     * @returns 事件订阅句柄
     */
    subscribe<K extends keyof EventMap>(eventType: K, handler: EventHandler<EventMap[K]>, filter?: EventFilter<EventMap[K]>, pluginId?: string): EventSubscription;
    /**
     * 订阅一次性事件
     *
     * @param eventType 事件类型
     * @param handler 事件处理器
     * @param filter 事件过滤器（可选）
     * @param pluginId 插件 ID
     * @returns 事件订阅句柄
     */
    once<K extends keyof EventMap>(eventType: K, handler: EventHandler<EventMap[K]>, filter?: EventFilter<EventMap[K]>, pluginId?: string): EventSubscription;
    /**
     * 取消订阅
     *
     * @param eventType 事件类型
     * @param subscriptionId 订阅 ID
     */
    private unsubscribe;
    /**
     * 发布事件
     *
     * @param eventType 事件类型
     * @param event 事件数据
     */
    publish<K extends keyof EventMap>(eventType: K, event: EventMap[K]): Promise<void>;
    /**
     * 同步发布事件（立即返回，不等待处理器完成）
     *
     * @param eventType 事件类型
     * @param event 事件数据
     */
    publishSync<K extends keyof EventMap>(eventType: K, event: EventMap[K]): void;
    /**
     * 执行事件处理器（带错误处理）
     *
     * @param handler 处理器函数
     * @param event 事件数据
     * @param eventType 事件类型
     * @param pluginId 插件 ID
     */
    private executeHandler;
    /**
     * 移除插件的所有订阅
     *
     * @param pluginId 插件 ID
     */
    removePluginSubscriptions(pluginId: string): void;
    /**
     * 获取事件订阅数
     *
     * @param eventType 事件类型（可选）
     * @returns 订阅数
     */
    getSubscriptionCount(eventType?: keyof EventMap): number;
    /**
     * 获取所有订阅的事件类型
     *
     * @returns 事件类型列表
     */
    getEventTypes(): string[];
    /**
     * 获取插件的订阅数
     *
     * @param pluginId 插件 ID
     * @returns 订阅数
     */
    getPluginSubscriptionCount(pluginId: string): number;
    /**
     * 获取统计信息
     *
     * @returns 统计数据
     */
    getStats(): {
        activeSubscriptions: number;
        eventTypes: number;
        published: number;
        handled: number;
        errors: number;
    };
    /**
     * 重置统计信息
     */
    resetStats(): void;
    /**
     * 清空所有订阅
     */
    clear(): void;
}
/**
 * 全局事件总线实例
 */
export declare const globalEventBus: EventBus;
export {};
