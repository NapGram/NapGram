import type { IQQClient } from '@napgram/qq-client';
/**
 * 权限检查工具类
 */
export declare class PermissionChecker {
    /**
     * 检查用户是否为群管理员或群主
     * @param qqClient QQ客户端
     * @param groupId 群号
     * @param userId 用户QQ号
     * @returns 是否为管理员或群主
     */
    static isGroupAdmin(qqClient: IQQClient, groupId: string, userId: string): Promise<boolean>;
    /**
     * 检查用户是否为群主
     * @param qqClient QQ客户端
     * @param groupId 群号
     * @param userId 用户QQ号
     * @returns 是否为群主
     */
    static isGroupOwner(qqClient: IQQClient, groupId: string, userId: string): Promise<boolean>;
    /**
     * 检查操作者是否有权限操作目标用户
     * @param qqClient QQ客户端
     * @param groupId 群号
     * @param operatorId 操作者QQ号
     * @param targetId 目标用户QQ号
     * @returns 是否有权限
     */
    static canManageUser(qqClient: IQQClient, groupId: string, operatorId: string, targetId: string): Promise<{
        canManage: boolean;
        reason?: string;
    }>;
}
