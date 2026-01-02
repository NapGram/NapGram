import type { FastifyReply, FastifyRequest } from 'fastify';
/**
 * 认证中间件 - 验证请求是否携带有效 token
 */
export declare function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<undefined>;
/**
 * 可选认证中间件 - token 有效时附加认证信息，无效时继续
 */
export declare function optionalAuthMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void>;
/**
 * TypeScript 类型扩展
 */
declare module 'fastify' {
    interface FastifyRequest {
        auth?: {
            type: 'access' | 'session' | 'env';
            userId?: number;
            token: string;
        };
        cookies: {
            admin_token?: string;
            [key: string]: string | undefined;
        };
    }
}
