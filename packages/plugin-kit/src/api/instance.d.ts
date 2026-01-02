/**
 * NapGram 实例 API 实现
 *
 * 提供插件访问实例信息的能力
 */
import type { InstanceAPI, InstanceInfo, InstanceStatus } from '../core/interfaces';
/**
 * 实例 API 实现
 */
export declare class InstanceAPIImpl implements InstanceAPI {
    /**
     * 实例列表访问器（Phase 4 注入）
     */
    private instancesResolver?;
    constructor(instancesResolver?: () => any[]);
    /**
     * 获取所有实例
     */
    list(): Promise<InstanceInfo[]>;
    /**
     * 获取单个实例
     */
    get(instanceId: number): Promise<InstanceInfo | null>;
    /**
     * 获取实例状态
     */
    getStatus(instanceId: number): Promise<InstanceStatus>;
    /**
     * 转换为 InstanceInfo 格式
     */
    private toInstanceInfo;
    /**
     * 提取实例状态
     */
    private extractStatus;
}
/**
 * 创建实例 API
 */
export declare function createInstanceAPI(instancesResolver?: () => any[]): InstanceAPI;
