import { describe, expect, test } from 'bun:test'
import { SessionManager, type GatewaySocket } from '../SessionManager.js'

const socket: GatewaySocket = {
  readyState: 1,
  send() {},
  close() {},
}

describe('SessionManager', () => {
  test('creates and stores a UUID session ID', () => {
    const manager = new SessionManager()
    const sessionId = manager.create(socket)

    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(manager.get(sessionId)?.id).toBe(sessionId)

    const runtime = (globalThis as typeof globalThis & { Bun?: { randomUUIDv7?: () => string } }).Bun
    if (typeof runtime?.randomUUIDv7 !== 'function')
      return

    expect(sessionId[14]).toBe('7')
  })
})
