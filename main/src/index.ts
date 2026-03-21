import process from 'node:process'
import * as Sentry from '@sentry/node'
import { db } from '@napgram/db-kit'
import { env } from '@napgram/env-kit'
import { getLogger, sentry } from '@napgram/logger-kit'
import { PluginRuntime } from '@napgram/plugin-kit'
import { builtins } from './builtins'
import Instance from './domain/models/Instance'
import { instanceRegistry } from './features/runtime/instance-registry'
import { performanceMonitor } from './infrastructure/services/PerformanceMonitor'
import { createServer, registerWebRoutes, startServer, stopServer } from './interfaces'
import random from './shared/utils/random'

function maskProxyUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.username || parsed.password) {
      const username = decodeURIComponent(parsed.username || 'user')
      parsed.username = encodeURIComponent(username)
      parsed.password = '***'
    }
    return parsed.toString()
  }
  catch {
    return rawUrl.replace(/\/\/([^:/@]+)(?::[^@]*)?@/, '//$1:***@')
  }
}

function startWindowedPerformanceLog(log: ReturnType<typeof getLogger>) {
  let lastSampleAt = Date.now()
  let lastTotalMessages = 0
  let lastEstimatedErrors = 0

  setInterval(() => {
    try {
      const stats = performanceMonitor.getStats()
      const now = Date.now()
      const deltaSeconds = (now - lastSampleAt) / 1000
      const totalMessages = stats.totalMessages
      const estimatedErrors = Math.max(0, stats.totalMessages * stats.errorRate)

      const deltaMessages = Math.max(0, totalMessages - lastTotalMessages)
      const deltaErrors = Math.max(0, estimatedErrors - lastEstimatedErrors)
      const windowMps = deltaSeconds > 0 ? deltaMessages / deltaSeconds : 0
      const windowErrorRate = deltaMessages > 0 ? (deltaErrors / deltaMessages) * 100 : 0

      log.debug(
        `[PerformanceWindow] 1m messages=${deltaMessages}, mps=${windowMps.toFixed(2)}, errorRate=${windowErrorRate.toFixed(2)}%, total=${totalMessages}`,
      )

      lastSampleAt = now
      lastTotalMessages = totalMessages
      lastEstimatedErrors = estimatedErrors
    }
    catch (error) {
      log.warn('Failed to print windowed performance stats:', error)
    }
  }, 60_000)
}

function getSentryMessage(event: Sentry.Event): string {
  const parts: string[] = []
  if (event.message)
    parts.push(event.message)
  const values = event.exception?.values ?? []
  for (const value of values) {
    if (value?.type)
      parts.push(value.type)
    if (value?.value)
      parts.push(value.value)
  }
  return parts.join(' | ')
}

function isTransientConnectionError(message: string): boolean {
  return [
    /ConnectionError: WebSocket 错误/i,
    /ConnectionClosedError: .*connect\(\)/i,
    /ConnectionError: 连接超时/i,
    /WebSocket error/i,
  ].some(pattern => pattern.test(message))
}

export async function main() {
  const log = getLogger('Main')
  const app = createServer()
  const activeInstances = new Map<number, Instance>()
  let shuttingDown = false

  const shutdown = async (reason: string, exitCode = 0) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true

    log.info({ reason }, 'Shutting down NapGram')

    try {
      await stopServer()
    }
    catch (error) {
      log.error({ error }, 'Failed to stop web server')
    }

    try {
      await PluginRuntime.stop()
    }
    catch (error) {
      log.error({ error }, 'Failed to stop plugin runtime')
    }

    for (const instance of activeInstances.values()) {
      try {
        await instance.stop()
      }
      catch (error) {
        log.error({ error, instanceId: instance.id }, 'Failed to stop instance')
      }
    }

    try {
      await Sentry.flush(3_000)
    }
    catch (error) {
      log.error({ error }, 'Failed to flush Sentry')
    }

    process.exit(exitCode)
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT', 0)
  })
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM', 0)
  })

  log.info('=== Environment Configuration ===')
  log.info(`FORWARD_MODE: ${env.FORWARD_MODE} (QQ→TG: ${env.FORWARD_MODE[0]}, TG→QQ: ${env.FORWARD_MODE[1]})`)
  log.info(`SHOW_NICKNAME_MODE: ${env.SHOW_NICKNAME_MODE} (QQ→TG: ${env.SHOW_NICKNAME_MODE[0]}, TG→QQ: ${env.SHOW_NICKNAME_MODE[1]})`)
  log.info(`TG_CONNECTION: ${env.TG_CONNECTION}`)
  log.info(`TG_INITIAL_DCID: ${env.TG_INITIAL_DCID || 'auto'}`)
  log.info(`TG_INITIAL_SERVER: ${env.TG_INITIAL_SERVER || 'auto'}`)
  log.info(`NAPCAT_WS_URL: ${env.NAPCAT_WS_URL || 'not set'}`)
  log.info(`WEB_ENDPOINT: ${env.WEB_ENDPOINT || 'not set'}`)
  log.info(`LOG_LEVEL: ${env.LOG_LEVEL}`)
  log.info(`TG_LOG_LEVEL: ${env.TG_LOG_LEVEL}`)

  const proxyUrl = process.env.PROXY_URL || process.env.PROXY
  if (proxyUrl) {
    log.info(`PROXY: ${maskProxyUrl(proxyUrl)}`)
  }
  else if (env.PROXY_IP && env.PROXY_PORT) {
    const proxyType = (process.env.PROXY_TYPE || 'socks5').toLowerCase()
    log.info(`PROXY: ${proxyType}://${env.PROXY_IP}:${env.PROXY_PORT}`)
  }

  if (process.env.ADMIN_TOKEN) {
    if (process.env.SHOW_FULL_TOKEN === 'true' || process.env.NODE_ENV === 'development') {
      log.info(`ADMIN_TOKEN (FULL): ${env.ADMIN_TOKEN}`)
      log.info(`Login URL: ${env.WEB_ENDPOINT || 'http://localhost:8080'}/login`)
    }
    else {
      const tokenValue = env.ADMIN_TOKEN ?? ''
      const maskedToken = tokenValue.length > 12
        ? `${'*'.repeat(tokenValue.length - 8)}${tokenValue.slice(-8)}`
        : tokenValue
      log.info(`ADMIN_TOKEN: ${maskedToken} (use this to login to /login)`)
    }
  }
  else {
    const randomToken = random.hex(32)
    process.env.ADMIN_TOKEN = randomToken
    ;(env as any).ADMIN_TOKEN = randomToken

    log.info('━'.repeat(80))
    log.info('⚠️  ADMIN_TOKEN auto-generated for this session:')
    log.info('')
    log.info(`    ${randomToken}`)
    log.info('')
    log.info('    Copy this token to access the admin panel at /login')
    log.info('    This token is temporary and will change on restart.')
    log.info('    To use a permanent token, set ADMIN_TOKEN in your .env file.')
    log.info('━'.repeat(80))
  }
  log.info('=================================')

  sentry.init()
  Sentry.addEventProcessor((event: Sentry.Event) => {
    const message = getSentryMessage(event)
    if (isTransientConnectionError(message))
      return null
    return event
  })
  startWindowedPerformanceLog(log)

  process.on('unhandledRejection', (error) => {
    log.error(error, 'UnhandledRejection: ')
    sentry.captureException(error, { type: 'unhandledRejection' })
  })

  process.on('uncaughtException', (error) => {
    log.error(error, 'UncaughtException: ')
    sentry.captureException(error, { type: 'uncaughtException' })
  })

  const instanceEntries = await db.query.instance.findMany()
  const targets = instanceEntries.length ? instanceEntries.map(entry => entry.id) : [0]

  PluginRuntime.setInstanceResolvers(
    id => instanceRegistry.getById(id) as any,
    () => instanceRegistry.getAll() as any,
  )

  await PluginRuntime.start({ defaultInstances: targets, webRoutes: registerWebRoutes, builtins })
  await startServer(app)

  const startupResults = await Promise.allSettled(targets.map(async (id) => {
    const instance = await Instance.start(id)
    activeInstances.set(instance.id, instance)
    return instance
  }))

  const succeeded = startupResults
    .filter((result): result is PromiseFulfilledResult<Instance> => result.status === 'fulfilled')
    .map(result => result.value)
  const failed = startupResults
    .map((result, index) => result.status === 'rejected'
      ? { instanceId: targets[index], error: result.reason }
      : null)
    .filter(Boolean) as Array<{ instanceId: number, error: unknown }>

  log.info({ instances: succeeded.map(instance => instance.id) }, 'Started instances')
  if (failed.length > 0) {
    log.error({
      instances: failed.map(entry => ({
        instanceId: entry.instanceId,
        error: String((entry.error as any)?.message || entry.error),
      })),
    }, 'Failed instances')
  }

  for (const instance of succeeded) {
    try {
      await instance.commandsFeature?.reloadCommands?.()
    }
    catch (error) {
      log.warn({ error, instanceId: instance.id }, 'Failed to reload commands after startup')
    }
  }

  if (succeeded.length === 0) {
    await shutdown('all-instances-failed', 1)
    return
  }

  log.info(`启动完成 (instances=${targets.length}, succeeded=${succeeded.length}, failed=${failed.length})`)
}

export async function handleFatalStartupError(error: unknown) {
  const log = getLogger('Main')
  log.error({ error }, 'Fatal startup error')
  sentry.captureException(error, { stage: 'main-startup' })
  try {
    await stopServer()
  }
  catch {}
  try {
    await PluginRuntime.stop()
  }
  catch {}
  try {
    await Sentry.flush(3_000)
  }
  catch {}
  process.exit(1)
}

if (process.env.NAPGRAM_DISABLE_AUTO_MAIN !== '1' && !(import.meta as any).vitest) {
  void main().catch(handleFatalStartupError)
}
