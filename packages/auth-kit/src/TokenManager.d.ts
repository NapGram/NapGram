/**
 * Token 管理器
 * 支持两种认证方式：
 * 1. Access Token - 独立于用户存在，用于 API 访问
 * 2. Session Token - 关联用户，用于会话管理
 */
export declare class TokenManager {
    /**
     * 生成随机 token
     */
    static generateToken(): string;
    /**
     * 验证 Access Token
     */
    static verifyAccessToken(token: string): Promise<boolean>;
    /**
     * 验证 Session Token
     */
    static verifySessionToken(token: string): Promise<{
        userId: number;
    } | null>;
    /**
     * 创建 Access Token
     */
    static createAccessToken(description?: string, createdBy?: number, expiresAt?: Date): Promise<string>;
    /**
     * 创建 Session Token（用户登录后）
     */
    static createSessionToken(userId: number, ipAddress?: string, userAgent?: string, expiresIn?: number): Promise<string>;
    /**
     * 撤销 Access Token
     */
    static revokeAccessToken(token: string): Promise<boolean>;
    /**
     * 撤销 Session Token（登出）
     */
    static revokeSessionToken(token: string): Promise<boolean>;
    /**
     * 清理过期的 tokens
     */
    static cleanupExpiredTokens(): Promise<void>;
    /**
     * 从环境变量获取初始 Admin Token
     */
    static getEnvAdminToken(): string | undefined;
    /**
     * 验证 token（统一入口，支持 Access Token、Session Token、Env Token）
     */
    static verifyToken(token: string): Promise<{
        type: 'access' | 'session' | 'env';
        userId?: number;
    } | null>;
}
/**
 * 密码工具
 */
export declare class PasswordUtil {
    /**
     * Hash 密码
     */
    static hashPassword(password: string): string;
    /**
     * 验证密码
     */
    static verifyPassword(password: string, storedHash: string): boolean;
}
