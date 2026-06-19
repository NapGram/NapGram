import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('frames', () => {
  describe('createHelloFrame', () => {
    it('should create a valid hello frame', async () => {
      const { createHelloFrame } = await import('../../protocol/frames.js')
      const frame = createHelloFrame('session-123')

      expect(frame.op).toBe('hello')
      expect(frame.v).toBe(1)
      expect(typeof frame.t).toBe('number')
      expect(frame.data.sessionId).toBe('session-123')
      expect(frame.data.heartbeatMs).toBe(30000)
      expect(frame.data.server.name).toBe('NapGram')
      expect(frame.data.capabilities).toContain('events')
    })
  })

  describe('createReadyFrame', () => {
    it('should create a valid ready frame', async () => {
      const { createReadyFrame } = await import('../../protocol/frames.js')
      const instances = [{ id: 1, name: 'Instance 1' }]
      const frame = createReadyFrame('user-1', 'TestUser', instances)

      expect(frame.op).toBe('ready')
      expect(frame.v).toBe(1)
      expect(frame.data.user.id).toBe('user-1')
      expect(frame.data.user.name).toBe('TestUser')
      expect(frame.data.instances).toEqual(instances)
    })
  })

  describe('createErrorFrame', () => {
    it('should create a non-fatal error frame by default', async () => {
      const { createErrorFrame } = await import('../../protocol/frames.js')
      const frame = createErrorFrame('AUTH_FAILED', 'Invalid token')

      expect(frame.op).toBe('error')
      expect(frame.data.code).toBe('AUTH_FAILED')
      expect(frame.data.message).toBe('Invalid token')
      expect(frame.data.fatal).toBe(false)
    })

    it('should create a fatal error frame when specified', async () => {
      const { createErrorFrame } = await import('../../protocol/frames.js')
      const frame = createErrorFrame('INTERNAL', 'Server error', true)

      expect(frame.data.fatal).toBe(true)
    })
  })

  describe('createPongFrame', () => {
    it('should create a valid pong frame', async () => {
      const { createPongFrame } = await import('../../protocol/frames.js')
      const frame = createPongFrame()

      expect(frame.op).toBe('pong')
      expect(frame.v).toBe(1)
      expect(typeof frame.t).toBe('number')
    })
  })

  describe('frame types', () => {
    it('should have correct op codes', async () => {
      const frames = await import('../../protocol/frames.js')

      // Verify all frame creation functions exist
      expect(typeof frames.createHelloFrame).toBe('function')
      expect(typeof frames.createReadyFrame).toBe('function')
      expect(typeof frames.createErrorFrame).toBe('function')
      expect(typeof frames.createPongFrame).toBe('function')
    })
  })
})
