/**
 * Gateway Bun test client.
 * Used to test Gateway Server connection, authentication, and event delivery.
 */

interface BunGatewayRuntime {
  env: Record<string, string | undefined>
  exit(code: number): never
}

const bunRuntime = (globalThis as typeof globalThis & { Bun: BunGatewayRuntime }).Bun
const GATEWAY_URL = 'ws://localhost:8765/gateway'
const AUTH_TOKEN = bunRuntime.env.ADMIN_TOKEN || 'your-admin-token'

interface Frame {
  op: string
  v: number
  t: number
  data?: any
}

function asText(data: unknown): Promise<string> {
  if (typeof data === 'string') return Promise.resolve(data)
  if (data instanceof ArrayBuffer) return Promise.resolve(new TextDecoder().decode(data))
  if (data instanceof Blob) return data.text()
  return Promise.resolve(new TextDecoder().decode(data as Uint8Array))
}

async function testGatewayClient() {
  console.log('🚀 Connecting to Gateway:', GATEWAY_URL)

  const ws = new WebSocket(GATEWAY_URL)

  ws.addEventListener('open', () => {
    console.log('✅ Connected to Gateway')
  })

  ws.addEventListener('message', async (event) => {
    const frame: Frame = JSON.parse(await asText(event.data))
    console.log(`📥 Received frame: ${frame.op}`, frame)

    switch (frame.op) {
      case 'hello': {
        console.log('👋 Received Hello, sending Identify...')
        ws.send(JSON.stringify({
          op: 'identify',
          v: 1,
          t: Date.now(),
          data: { token: AUTH_TOKEN, scope: { instances: [0] } },
        }))
        break
      }

      case 'ready':
        console.log('✅ Authenticated! Ready to receive events')
        console.log('User:', frame.data.user)
        console.log('Instances:', frame.data.instances)
        setInterval(() => {
          ws.send(JSON.stringify({ op: 'ping', v: 1, t: Date.now() }))
          console.log('💓 Sent ping')
        }, 25000)
        break

      case 'pong':
        console.log('💓 Received pong')
        break

      case 'event':
        console.log('🎉 Event received:', frame.data.type)
        console.log('Event data:', JSON.stringify(frame.data, null, 2))
        if (frame.data.type === 'message.created') {
          const channelId = frame.data.channelId
          const messageId = frame.data.message.messageId
          const instanceId = frame.data.instanceId ?? 0
          ws.send(JSON.stringify({
            op: 'call',
            v: 1,
            t: Date.now(),
            data: {
              id: `call-${Date.now()}`,
              instanceId,
              action: 'message.send',
              params: {
                channelId,
                segments: [{ type: 'text', data: { text: `Echo: 收到消息 ${messageId}` } }],
              },
            },
          }))
          console.log('🔄 Sent echo reply')
        }
        break

      case 'result':
        console.log('📤 Action result:', frame.data)
        break

      case 'error':
        console.error('❌ Error from server:', frame.data)
        if (frame.data.fatal) ws.close()
        break

      default:
        console.warn('Unknown op:', frame.op)
    }
  })

  ws.addEventListener('close', (event) => {
    console.log(`🔌 Connection closed: ${event.code} - ${event.reason}`)
    bunRuntime.exit(0)
  })

  ws.addEventListener('error', (event) => {
    console.error('❌ WebSocket error:', event)
    bunRuntime.exit(1)
  })
}

testGatewayClient().catch((error) => {
  console.error('Failed to start test client:', error)
  bunRuntime.exit(1)
})
