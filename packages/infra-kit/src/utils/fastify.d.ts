import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
/**
 * Register the same handler for two routes (useful for legacy API compatibility)
 */
export declare function registerDualRoute(fastify: FastifyInstance, path1: string, path2: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<any> | any, opts?: {
    schema?: any;
}): void;
/**
 * Common error response helpers
 */
export declare const ErrorResponses: {
    notFound(reply: FastifyReply, message?: string): FastifyReply<import("fastify").RouteGenericInterface, import("fastify").RawServerDefault, import("node:http").IncomingMessage, import("node:http").ServerResponse<import("node:http").IncomingMessage>, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>;
    badRequest(reply: FastifyReply, message?: string): FastifyReply<import("fastify").RouteGenericInterface, import("fastify").RawServerDefault, import("node:http").IncomingMessage, import("node:http").ServerResponse<import("node:http").IncomingMessage>, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>;
    unauthorized(reply: FastifyReply, message?: string): FastifyReply<import("fastify").RouteGenericInterface, import("fastify").RawServerDefault, import("node:http").IncomingMessage, import("node:http").ServerResponse<import("node:http").IncomingMessage>, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>;
    forbidden(reply: FastifyReply, message?: string): FastifyReply<import("fastify").RouteGenericInterface, import("fastify").RawServerDefault, import("node:http").IncomingMessage, import("node:http").ServerResponse<import("node:http").IncomingMessage>, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>;
    internalError(reply: FastifyReply, message?: string): FastifyReply<import("fastify").RouteGenericInterface, import("fastify").RawServerDefault, import("node:http").IncomingMessage, import("node:http").ServerResponse<import("node:http").IncomingMessage>, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>;
};
