import cookie from '@fastify/cookie'
import Fastify, { type FastifyInstance } from 'fastify'
import { env, getLogger } from '@napgram/infra-kit'
import { fileManagerRoutes } from '@napgram/web-interfaces'

const log = getLogger('Web Api')
const registeredWebPlugins = new Set<string>()

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

export function registerWebRoutes(register: (app: App) => void, pluginId?: string) {
  const app = createServer()

  if (pluginId) {
    if (registeredWebPlugins.has(pluginId)) {
      log.warn(`Web routes already registered for plugin: ${pluginId}`)
      return
    }
    registeredWebPlugins.add(pluginId)
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
    registeredWebPlugins.clear()
  }
}

export default {
  createServer,
  registerBaseRoutes,
  registerWebRoutes,
  startServer,
  stopServer,
  getWebApi,
}
