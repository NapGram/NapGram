import process from 'node:process'
import * as Sentry from '@sentry/node'
import { db, env, getLogger, performanceMonitor, random, sentry } from '@napgram/infra-kit'
import { PluginRuntime } from '@napgram/plugin-kit'
import { InstanceRegistry } from '@napgram/runtime-kit'
import { builtins } from './builtins'
import Instance from './domain/models/Instance'
import api, { registerWebRoutes } from './interfaces'

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

(async () => {
  const log = getLogger('Main')

  // 打印环境变量配置（仅在启动时打印一次）
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
  // 打印 Admin Token（如果已配置）
  if (process.env.ADMIN_TOKEN) {
    // 在开发环境或设置了 SHOW_FULL_TOKEN 时显示完整 token
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
    // Generate random 32-character token
    const randomToken = random.hex(32)

    // Set to both process.env and env object
    process.env.ADMIN_TOKEN = randomToken;
    (env as any).ADMIN_TOKEN = randomToken

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
  Sentry.addGlobalEventProcessor((event) => {
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

  // Configure PluginRuntime (Phase 2 Modularization)
  PluginRuntime.setInstanceResolvers(
    id => InstanceRegistry.getById(id) as any,
    () => InstanceRegistry.getAll() as any,
  )

  // 先启动插件运行时（在 Instance 之前，确保插件命令可被 CommandsFeature 发现）
  await PluginRuntime.start({ defaultInstances: targets, webRoutes: registerWebRoutes, builtins })

  api.startListening()

  // 再启动实例（包括 FeatureManager 中的 CommandsFeature）
  const instances = await Promise.all(targets.map(id => Instance.start(id)))

  // 确保插件命令在运行时完全启动后再加载一次
  for (const instance of instances) {
    try {
      await instance.commandsFeature?.reloadCommands?.()
    }
    catch (error) {
      log.warn({ error, instanceId: instance.id }, 'Failed to reload commands after startup')
    }
  }

  log.info(`启动完成 (instances=${targets.length})`)
})()
