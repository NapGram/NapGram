import { describe, expect, test } from 'bun:test'
import { BunGatewayServer } from '../server/BunGatewayServer.js'

describe('BunGatewayServer', () => {
  test('registers Bun.serve handlers and stops cleanly', async () => {
    let options: any
    let stopped = false
    const sent: string[] = []
    const ws: any = {
      readyState: 1,
      data: { sessionId: '' },
      send(value: string) { sent.push(value); return value.length },
      close() {},
    }
    const runtime = {
      serve(value: any) {
        options = value
        return { port: 9876, stop() { stopped = true }, upgrade() { return true } }
      },
    }

    const server = new BunGatewayServer(9876, { runtime })
    options.websocket.open(ws)
    options.websocket.message(ws, JSON.stringify({ op: 'ping', v: 1, t: Date.now(), data: {} }))
    await server.stop()

    expect(options.fetch(new Request('http://localhost/gateway'), { upgrade() { return true } })).toBeUndefined()
    expect(sent.some(value => JSON.parse(value).op === 'hello')).toBe(true)
    expect(sent.some(value => JSON.parse(value).op === 'pong')).toBe(true)
    expect(stopped).toBe(true)
  })
})
