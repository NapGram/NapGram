/**
 * Register the same handler for two routes (useful for legacy API compatibility)
 */
export function registerDualRoute(fastify, path1, path2, handler, opts) {
    const config = opts?.schema ? { schema: opts.schema } : {};
    fastify.get(path1, config, handler);
    fastify.get(path2, config, handler);
}
/**
 * Common error response helpers
 */
export const ErrorResponses = {
    notFound(reply, message = 'Not Found') {
        return reply.code(404).send({ error: message });
    },
    badRequest(reply, message = 'Bad Request') {
        return reply.code(400).send({ error: message });
    },
    unauthorized(reply, message = 'Unauthorized') {
        return reply.code(401).send({ error: message });
    },
    forbidden(reply, message = 'Forbidden') {
        return reply.code(403).send({ error: message });
    },
    internalError(reply, message = 'Internal Server Error') {
        return reply.code(500).send({ error: message });
    },
};
