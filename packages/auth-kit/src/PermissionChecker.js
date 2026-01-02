/**
 * 权限检查工具类
 */
export class PermissionChecker {
    /**
     * 检查用户是否为群管理员或群主
     * @param qqClient QQ客户端
     * @param groupId 群号
     * @param userId 用户QQ号
     * @returns 是否为管理员或群主
     */
    static async isGroupAdmin(qqClient, groupId, userId) {
        try {
            const memberInfo = await qqClient.getGroupMemberInfo(groupId, userId);
            if (!memberInfo)
                return false;
            const role = memberInfo.role;
            return role === 'admin' || role === 'owner';
        }
        catch {
            return false;
        }
    }
    /**
     * 检查用户是否为群主
     * @param qqClient QQ客户端
     * @param groupId 群号
     * @param userId 用户QQ号
     * @returns 是否为群主
     */
    static async isGroupOwner(qqClient, groupId, userId) {
        try {
            const memberInfo = await qqClient.getGroupMemberInfo(groupId, userId);
            if (!memberInfo)
                return false;
            return memberInfo.role === 'owner';
        }
        catch {
            return false;
        }
    }
    /**
     * 检查操作者是否有权限操作目标用户
     * @param qqClient QQ客户端
     * @param groupId 群号
     * @param operatorId 操作者QQ号
     * @param targetId 目标用户QQ号
     * @returns 是否有权限
     */
    static async canManageUser(qqClient, groupId, operatorId, targetId) {
        const operatorInfo = await qqClient.getGroupMemberInfo(groupId, operatorId);
        const targetInfo = await qqClient.getGroupMemberInfo(groupId, targetId);
        if (!operatorInfo) {
            return { canManage: false, reason: '无法获取操作者信息' };
        }
        if (!targetInfo) {
            return { canManage: false, reason: '目标用户不在群内' };
        }
        const operatorRole = operatorInfo.role;
        const targetRole = targetInfo.role;
        // 群主可以操作所有人
        if (operatorRole === 'owner') {
            return { canManage: true };
        }
        // 管理员
        if (operatorRole === 'admin') {
            if (targetRole === 'member') {
                return { canManage: true };
            }
            return { canManage: false, reason: '权限不足：无法管理群主或其他管理员' };
        }
        return { canManage: false, reason: '权限不足：需要管理员或群主权限' };
    }
}
