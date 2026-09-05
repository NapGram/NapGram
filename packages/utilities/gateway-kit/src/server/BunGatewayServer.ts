import type { CallFrame, Frame, IdentifyFrame, PingFrame } from '../protocol/frames.js'
import type { GatewayPairRecord } from '../types.js'
import { getLogger } from '../logger.js'
import {
  createErrorFrame,
  createHelloFrame,
  createPongFrame,
  createReadyFrame,
} from '../protocol/frames.js'
import { AuthManager } from './AuthManager.js'
import { SessionManager, type Session, type GatewaySocket } from './SessionManager.js'

interface BunServerWebSocket extends GatewaySocket {
  data: { sessionId: string }
}

interface BunServer {
  port: number
  url?: URL
  upgrade(request: Request, options?: { data?: { sessionId: string } }): boolean
  publish?(topic: string, data: string): number
  stop(closeActiveConnections?: boolean): void
}

interface BunRuntime {
  serve(options: {
    port: number
    fetch(request: Request, server: BunServer): Response | undefined
    websocket: {
      data: { sessionId: string }
      open(ws: BunServerWebSocket): void
      message(ws: BunServerWebSocket, message: string | Uint8Array): void | Promise<void>
      close(ws: BunServerWebSocket, code: number, reason: string): void
    }
  }): BunServer
}

export interface BunGatewayServerOptions {
  resolveExecutor?: (instanceId: number) => any
  resolvePairs?: (instanceId: number) => GatewayPairRecord[]
  runtime?: BunRuntime
  path?: string
}

const logger = getLogger('BunGatewayServer')

function detectRuntime(): BunRuntime | undefined {
  return (globalThis as typeof globalThis & { Bun?: BunRuntime }).Bun
}

function asText(message: string | Uint8Array): string {
  return typeof message === 'string' ? message : new TextDecoder().decode(message)
}

export class BunGatewayServer {
  private readonly server: BunServer
  private readonly sessions = new SessionManager()
  private readonly auth = new AuthManager()
  private readonly path: string
  private heartbeatInterval?: ReturnType<typeof setInterval>

  constructor(
    private readonly port = 8765,
    private readonly opts: BunGatewayServerOptions = {},
  ) {
    const runtime = opts.runtime ?? detectRuntime()
    if (!runtime) {
      throw new Error('Bun.serve is unavailable; run BunGatewayServer under Bun')
    }
    this.path = opts.path ?? '/gateway'
    this.server = runtime.serve({
      port,
      fetch: (request, server) => {
        if (new URL(request.url).pathname !== this.path) {
          return new Response('Not Found', { status: 404 })
        }
        return server.upgrade(request, { data: { sessionId: '' } })
          ? undefined
          : new Response('WebSocket upgrade failed', { status: 400 })
      },
      websocket: {
        data: {} as { sessionId: string },
        open: ws => {
          ws.data.sessionId = this.sessions.create(ws)
          this.send(ws, createHelloFrame(ws.data.sessionId))
          logger.info(`New Bun WebSocket connection: ${ws.data.sessionId}`)
        },
        message: (ws, message) => this.handleMessage(ws.data.sessionId, asText(message)),
        close: (ws, code, reason) => {
          logger.info(`Bun WebSocket closed: ${ws.data.sessionId}, code=${code}, reason=${reason}`)
          this.sessions.destroy(ws.data.sessionId)
        },
      },
    })
    this.heartbeatInterval = setInterval(() => this.sessions.cleanupStale(60000), 30000)
    logger.info(`Bun Gateway Server started on port ${this.server.port || port}`)
  }

  private send(ws: GatewaySocket, frame: unknown): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(frame))
    }
  }

  private async handleMessage(sessionId: string, raw: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      const frame = JSON.parse(raw) as Frame
      switch (frame.op) {
        case 'identify':
          await this.handleIdentify(session, frame as IdentifyFrame)
          break
        case 'call':
          await this.handleCall(session, frame as CallFrame)
          break
        case 'ping':
          this.sessions.updateHeartbeat(session.id)
          this.send(session.ws, createPongFrame())
          break
        default:
          this.send(session.ws, createErrorFrame('UNKNOWN_OP', `Unknown operation: ${frame.op}`, false))
      }
    }
    catch (error) {
      logger.error(error, `Failed to handle Bun gateway frame for ${sessionId}`)
      this.send(session.ws, createErrorFrame('INVALID_FRAME', 'Invalid JSON frame', false))
    }
  }

  private async handleIdentify(session: Session, frame: IdentifyFrame): Promise<void> {
    const authResult = await this.auth.authenticate(frame.data.token)
    if (!authResult.success) {
      this.send(session.ws, createErrorFrame('AUTH_FAILED', authResult.error || 'Authentication failed', true))
      session.ws.close(4001, 'Authentication failed')
      return
    }

    const requested = Array.isArray(frame.data.scope?.instances) ? frame.data.scope.instances : []
    const allowed = Array.isArray(authResult.instances) ? authResult.instances : []
    const instances = requested.filter(id => allowed.includes(id))
    if (!instances.length) {
      this.send(session.ws, createErrorFrame('FORBIDDEN', 'No allowed instances in scope', true))
      session.ws.close(4003, 'Forbidden')
      return
    }

    this.sessions.authenticate(session.id, authResult.userId!, authResult.userName!, instances)
    this.send(session.ws, createReadyFrame(
      authResult.userId!,
      authResult.userName!,
      instances.map(id => ({ id, name: `Instance ${id}`, pairs: this.buildPairsMeta(id) })),
    ))
  }

  private async handleCall(session: Session, frame: CallFrame): Promise<void> {
    if (!session.authenticated) {
      this.send(session.ws, createErrorFrame('NOT_AUTHENTICATED', 'Must identify before calling actions', false))
      return
    }

    const params = frame.data.params as Record<string, unknown> | undefined
    const instanceId = Number((frame.data as any).instanceId ?? params?.instanceId ?? 0)
    const resultFrame = (data: Record<string, unknown>) => this.send(session.ws, {
      op: 'result', v: 1, t: Date.now(), data: { id: frame.data.id, ...data },
    })

    if (!session.instances.includes(instanceId)) {
      resultFrame({ success: false, error: { code: 'FORBIDDEN', message: `Not allowed to access instance ${instanceId}` } })
      return
    }

    const executor = this.opts.resolveExecutor?.(instanceId)
    if (!executor) {
      resultFrame({ success: false, error: { code: 'NOT_READY', message: `Instance ${instanceId} is not ready` } })
      return
    }

    try {
      const result = await executor.execute(frame.data.action, frame.data.params)
      resultFrame({ success: true, result })
    }
    catch (error: any) {
      logger.error(error, `Bun gateway action failed: ${frame.data.action}`)
      resultFrame({ success: false, error: { code: 'EXECUTION_ERROR', message: error?.message || String(error) } })
    }
  }

  private buildPairsMeta(instanceId: number) {
    return (this.opts.resolvePairs?.(instanceId) || []).map(pair => ({
      pairId: pair.id,
      qq: { channelId: `qq:g:${pair.qqRoomId}`, roomId: String(pair.qqRoomId), name: null },
      tg: {
        channelId: pair.tgThreadId ? `tg:c:${pair.tgChatId}:t:${pair.tgThreadId}` : `tg:c:${pair.tgChatId}`,
        chatId: String(pair.tgChatId), threadId: pair.tgThreadId ?? null, name: null,
      },
    }))
  }

  async publishEvent(instanceId: number, event: unknown): Promise<void> {
    const frame = { op: 'event', v: 1, t: Date.now(), data: event }
    for (const session of this.sessions.getByScope(instanceId)) {
      this.send(session.ws, frame)
    }
  }

  getStats() {
    return { port: this.server.port || this.port, sessions: this.sessions.getStats() }
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    this.server.stop(true)
  }
}
