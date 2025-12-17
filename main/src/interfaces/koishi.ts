import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiResponse } from '../shared/utils/api-response';
import { KoishiHost } from '../koishi/KoishiHost';

/**
 * KoishiHost Admin API
 */
export default async function (fastify: FastifyInstance) {
  const reloadSchema = z.object({
    instances: z.array(z.number().int()).optional(),
  });

  /**
   * POST /api/admin/koishi/reload
   * Reload KoishiHost plugins/runtime (in-process)
   */
  fastify.post('/api/admin/koishi/reload', {
    preHandler: async (request, reply) => {
      const { authMiddleware } = await import('../infrastructure/auth/authMiddleware');
      await authMiddleware(request, reply);
    }
  }, async (request, reply) => {
    try {
      const body = reloadSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request',
          details: body.error.issues,
        });
      }

      const result = await KoishiHost.reload({
        defaultInstances: body.data.instances,
      });

      return ApiResponse.success(result);
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });

  /**
   * GET /api/admin/koishi/status
   * Show last reload report/status
   */
  fastify.get('/api/admin/koishi/status', {
    preHandler: async (request, reply) => {
      const { authMiddleware } = await import('../infrastructure/auth/authMiddleware');
      await authMiddleware(request, reply);
    }
  }, async () => {
    return ApiResponse.success(KoishiHost.getLastReport());
  });
}

