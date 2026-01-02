/**
 * NapGram 群组 API 实现
 *
 * 提供插件操作群组的能力
 */
import type { GetGroupParams, GroupAPI, GroupInfo, GroupMember, KickUserParams, MuteUserParams, SetAdminParams } from '../core/interfaces';
/**
 * 群组 API 实现
 */
export declare class GroupAPIImpl implements GroupAPI {
    /**
     * 实例访问器（Phase 4 注入）
     */
    private instanceResolver?;
    constructor(instanceResolver?: (instanceId: number) => any);
    /**
     * 获取群组信息
     */
    getInfo(params: GetGroupParams): Promise<GroupInfo | null>;
    /**
     * 获取群成员列表
     */
    getMembers(params: GetGroupParams): Promise<GroupMember[]>;
    /**
     * 设置管理员
     */
    setAdmin(params: SetAdminParams): Promise<void>;
    /**
     * 禁言用户
     */
    muteUser(params: MuteUserParams): Promise<void>;
    /**
     * 踢出用户
     */
    kickUser(params: KickUserParams): Promise<void>;
    /**
     * 解析群组 ID
     */
    private parseGroupId;
    /**
     * 解析用户 ID
     */
    private parseUserId;
    private getQQGroupInfo;
    private getQQGroupMembers;
    private setQQAdmin;
    private muteQQUser;
    private kickQQUser;
    private getTGGroupInfo;
    private getTGGroupMembers;
    private setTGAdmin;
    private muteTGUser;
    private kickTGUser;
}
/**
 * 创建群组 API
 */
export declare function createGroupAPI(instanceResolver?: (instanceId: number) => any): GroupAPI;
