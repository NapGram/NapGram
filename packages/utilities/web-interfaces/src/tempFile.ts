import { runtimeFileIO } from '@napgram/runtime-kit'
import type { FastifyInstance } from 'fastify'
import { basename, joinPath, resolvePath } from './path-utils.js'
const bunRuntime = (globalThis as typeof globalThis & { Bun: { file(path: string): { stream(): ReadableStream<Uint8Array> } } }).Bun
import { ErrorResponses, getMimeType, TEMP_PATH } from './web-http.js'

export default async function (fastify: FastifyInstance) {
  fastify.get('/temp/:filename', async (request: any, reply: any) => {
    const { filename } = request.params
    const filePath = joinPath(TEMP_PATH, filename)

    // 防止目录穿越
    if (!resolvePath(filePath).startsWith(resolvePath(TEMP_PATH))) {
      return ErrorResponses.forbidden(reply)
    }

    if (await runtimeFileIO.exists(filePath)) {
      reply.header('Content-Type', getMimeType(filename))
      return bunRuntime.file(filePath).stream()
    }

    return ErrorResponses.notFound(reply)
  })
}
