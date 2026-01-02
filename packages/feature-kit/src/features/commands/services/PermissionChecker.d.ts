import type { Instance } from '../../../shared-types';
/**
 * 权限检查服务
 */
export declare class PermissionChecker {
    private readonly instance;
    constructor(instance: Instance);
    /**
     * 检查是否是管理员
     */
    isAdmin(userId: string): boolean;
}
