import { randomBytes, scryptSync } from 'node:crypto';
import process from 'node:process';
import { db } from '@napgram/infra-kit';
/**
 * Token 管理器
 * 支持两种认证方式：
 * 1. Access Token - 独立于用户存在，用于 API 访问
 * 2. Session Token - 关联用户，用于会话管理
 */
export class TokenManager {
    /**
     * 生成随机 token
     */
    static generateToken() {
        return randomBytes(32).toString('hex');
    }
    /**
     * 验证 Access Token
     */
    static async verifyAccessToken(token) {
        const accessToken = await db.accessToken.findFirst({
            where: {
                token,
                isActive: true,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } },
                ],
            },
        });
        if (accessToken) {
            // 更新最后使用时间
            await db.accessToken.update({
                where: { id: accessToken.id },
                data: { lastUsedAt: new Date() },
            }).catch(() => { });
            return true;
        }
        return false;
    }
    /**
     * 验证 Session Token
     */
    static async verifySessionToken(token) {
        const session = await db.adminSession.findFirst({
            where: {
                token,
                expiresAt: { gt: new Date() },
            },
            include: {
                user: true,
            },
        });
        if (session && session.user.isActive) {
            return { userId: session.user.id };
        }
        return null;
    }
    /**
     * 创建 Access Token
     */
    static async createAccessToken(description, createdBy, expiresAt) {
        const token = this.generateToken();
        await db.accessToken.create({
            data: {
                token,
                description,
                createdBy,
                expiresAt,
                isActive: true,
            },
        });
        return token;
    }
    /**
     * 创建 Session Token（用户登录后）
     */
    static async createSessionToken(userId, ipAddress, userAgent, expiresIn = 7 * 24 * 60 * 60 * 1000) {
        const token = this.generateToken();
        const expiresAt = new Date(Date.now() + expiresIn);
        await db.adminSession.create({
            data: {
                token,
                userId,
                expiresAt,
                ipAddress,
                userAgent,
            },
        });
        return token;
    }
    /**
     * 撤销 Access Token
     */
    static async revokeAccessToken(token) {
        const result = await db.accessToken.updateMany({
            where: { token },
            data: { isActive: false },
        });
        return result.count > 0;
    }
    /**
     * 撤销 Session Token（登出）
     */
    static async revokeSessionToken(token) {
        const result = await db.adminSession.deleteMany({
            where: { token },
        });
        return result.count > 0;
    }
    /**
     * 清理过期的 tokens
     */
    static async cleanupExpiredTokens() {
        await db.adminSession.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });
    }
    /**
     * 从环境变量获取初始 Admin Token
     */
    static getEnvAdminToken() {
        return process.env.ADMIN_TOKEN;
    }
    /**
     * 验证 token（统一入口，支持 Access Token、Session Token、Env Token）
     */
    static async verifyToken(token) {
        // 1. 检查环境变量 token
        const envToken = this.getEnvAdminToken();
        if (envToken && token === envToken) {
            return { type: 'env' };
        }
        // 2. 检查 Access Token
        if (await this.verifyAccessToken(token)) {
            return { type: 'access' };
        }
        // 3. 检查 Session Token
        const sessionData = await this.verifySessionToken(token);
        if (sessionData) {
            return { type: 'session', userId: sessionData.userId };
        }
        return null;
    }
}
/**
 * 密码工具
 */
export class PasswordUtil {
    /**
     * Hash 密码
     */
    static hashPassword(password) {
        const salt = randomBytes(16).toString('hex');
        const hash = scryptSync(password, salt, 64).toString('hex');
        return `${salt}:${hash}`;
    }
    /**
     * 验证密码
     */
    static verifyPassword(password, storedHash) {
        const [salt, hash] = storedHash.split(':');
        const hashToCompare = scryptSync(password, salt, 64).toString('hex');
        return hash === hashToCompare;
    }
}
