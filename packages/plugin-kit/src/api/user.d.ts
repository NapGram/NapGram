/**
 * NapGram 用户 API 实现
 *
 * 提供插件访问用户信息的能力
 */
import type { GetUserParams, UserAPI, UserInfo } from '../core/interfaces';
/**
 * 用户 API 实现
 */
export declare class UserAPIImpl implements UserAPI {
    /**
     * 实例访问器（Phase 4 注入）
     */
    private instanceResolver?;
    constructor(instanceResolver?: (instanceId: number) => any);
    /**
     * 获取用户信息
     */
    getInfo(params: GetUserParams): Promise<UserInfo | null>;
    /**
     * 检查是否为好友
     */
    isFriend(params: GetUserParams): Promise<boolean>;
    /**
     * 解析用户 ID
     */
    private parseUserId;
    /**
     * 获取 QQ 用户信息（Phase 4 实现）
     */
    private getQQUserInfo;
    /**
     * 获取 TG 用户信息（Phase 4 实现）
     */
    private getTGUserInfo;
    /**
     * 检查是否为 QQ 好友（Phase 4 实现）
     */
    private isQQFriend;
}
/**
 * 创建用户 API
 */
export declare function createUserAPI(instanceResolver?: (instanceId: number) => any): UserAPI;
