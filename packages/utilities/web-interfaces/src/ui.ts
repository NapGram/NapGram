import { runtimeFileIO } from '@napgram/runtime-kit'
import type { FastifyInstance } from 'fastify'
import { basename, joinPath, resolvePath } from './path-utils.js'
const bunRuntime = (globalThis as typeof globalThis & { Bun: { file(path: string): { stream(): ReadableStream<Uint8Array> } } }).Bun

import { env } from './web-deps.js'
import { ErrorResponses, getMimeType } from './web-http.js'

export default async function (fastify: FastifyInstance) {
  if (env.UI_PROXY) {
    fastify.all('/*', async (request: any, reply: any) => {
      const targetUrl = new URL(env.UI_PROXY!)
      const reqUrl = new URL(request.url, targetUrl)
      reqUrl.protocol = targetUrl.protocol
      reqUrl.hostname = targetUrl.hostname
      reqUrl.port = targetUrl.port

      try {
        const fetchOptions: RequestInit = {
          method: request.method,
          headers: request.headers as any,
          body: request.body ? JSON.stringify(request.body) : undefined,
        }

        // 去掉主机头，避免冲突
        if (fetchOptions.headers) {
          delete (fetchOptions.headers as any).host
        }

        const response = await fetch(reqUrl.toString(), fetchOptions)

        reply.code(response.status)

        // 复制响应头
        response.headers.forEach((value, key) => {
          reply.header(key, value)
        })

        // 直接返回响应体
        return new Uint8Array(await response.arrayBuffer())
      }
      catch (err) {
        request.log.error('Proxy error', err)
        return reply.code(502).send({ error: 'Bad Gateway' })
      }
    })
  }
  else if (env.UI_PATH) {
    // 提供静态资源
    const assetsPath = joinPath(env.UI_PATH, 'assets')
    fastify.get('/assets/*', async (req: any, reply: any) => {
      const name = String((req.params as any)['*'] || '')
      const safeName = basename(name)

      if (!safeName || safeName !== name) {
        return ErrorResponses.forbidden(reply)
      }

      const filePath = joinPath(assetsPath, safeName)
      if (!resolvePath(filePath).startsWith(resolvePath(assetsPath))) {
        return ErrorResponses.forbidden(reply)
      }

      if (!await runtimeFileIO.exists(filePath)) {
        return ErrorResponses.notFound(reply)
      }

      reply.header('cache-control', 'public, max-age=31536000, immutable')
      reply.header('content-type', getMimeType(safeName))
      return bunRuntime.file(filePath).stream()
    })

    // 提供站点图标
    fastify.get('/vite.svg', async (req: any, reply: any) => {
      const possiblePaths = [
        joinPath(env.UI_PATH!, 'vite.svg'),
        joinPath(env.UI_PATH!, 'public', 'vite.svg'),
        joinPath(env.UI_PATH!, 'assets', 'vite.svg'),
      ]
      for (const p of possiblePaths) {
        if (await runtimeFileIO.exists(p)) {
          reply.header('cache-control', 'no-store')
          reply.header('content-type', 'image/svg+xml')
          return bunRuntime.file(p).stream()
        }
      }
      return ErrorResponses.notFound(reply)
    })

    // 单页应用回退
    fastify.get('/*', async (req: any, reply: any) => {
      reply.header('cache-control', 'no-store')
      reply.header('content-type', 'text/html')
      return bunRuntime.file(joinPath(env.UI_PATH!, 'index.html')).stream()
    })
  }
}
