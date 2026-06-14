import type { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { env } from '@napgram/env-kit'
import { getLogger } from '@napgram/logger-kit'
import type { WebRuntimeBridge } from '@napgram/runtime-kit'
import {
  activatePluginWebRoutes,
  clearWebRuntimeBridge,
  hasPluginWebRoutes,
  isPluginWebRoutesActive,
  markPluginWebRoutes,
  resetPluginWebRoutesRegistry,
  setWebRuntimeBridge,
  tryGetWebRuntimeBridge,
} from '@napgram/runtime-kit'
import Fastify from 'fastify'
import fileManagerRoutes from './routes/fileManager.js'

const log = getLogger('Web Api')

let server: FastifyInstance | null = null

export type App = FastifyInstance

export function createServer() {
  if (server) {
    return server
  }

  const app = Fastify({
    logger: false,
  })

  registerBaseRoutes(app)
  server = app
  return app
}

export function registerBaseRoutes(app: App) {
  app.register(cookie)
  fileManagerRoutes(app)

  app.setErrorHandler((error, request, reply) => {
    const msg = (error as any).message || String(error)
    log.error(request.method, request.url, msg)
    log.debug(error)
    reply.status(500).send({ message: msg })
  })

  app.get('/', async () => {
    return { hello: 'NapGram (Fastify)' }
  })
}

export function configureRuntimeBridge(app: App, bridge: WebRuntimeBridge) {
  setWebRuntimeBridge(app, bridge)
}

export function getRuntimeBridge(app: App) {
  return tryGetWebRuntimeBridge(app)
}

export function registerWebRoutes(register: (app: App) => void, pluginId?: string) {
  const app = createServer()

  if (pluginId) {
    const id = String(pluginId).trim()
    if (id) {
      if (hasPluginWebRoutes(id)) {
        activatePluginWebRoutes(id)
        log.debug(`Web routes already registered for plugin: ${id}`)
        return
      }

      markPluginWebRoutes(id)
      app.register(async (scope) => {
        scope.addHook('onRequest', async (_request, reply) => {
          if (!isPluginWebRoutesActive(id)) {
            reply.code(404).send({ message: 'Not Found' })
            return reply
          }
        })

        register(scope as App)
      })
      return
    }
  }

  register(app)
}

export function getWebApi() {
  return {
    registerRoutes: registerWebRoutes,
  }
}

export async function startServer(app = createServer()) {
  try {
    await app.listen({
      port: Number(env.LISTEN_PORT),
      host: '0.0.0.0',
    })
    log.info('Listening on', env.LISTEN_PORT)
    return app
  }
  catch (err) {
    log.error('Failed to start web server:', err)
    throw err
  }
}

export async function stopServer() {
  if (!server) {
    resetPluginWebRoutesRegistry()
    return
  }

  const app = server
  server = null

  try {
    await app.close()
    log.info('Web server stopped')
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code !== 'FST_ERR_REOPENED_CLOSE_SERVER') {
      throw error
    }
  }
  finally {
    clearWebRuntimeBridge(app)
    resetPluginWebRoutesRegistry()
  }
}

export default {
  createServer,
  registerBaseRoutes,
  configureRuntimeBridge,
  getRuntimeBridge,
  registerWebRoutes,
  startServer,
  stopServer,
  getWebApi,
}
