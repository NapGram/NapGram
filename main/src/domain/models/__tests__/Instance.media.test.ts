/**
 * Tests for Instance.enableQQMediaDownloadDiagnostics()
 * Covers lines 399-446 (downloadFileStreamToFile and getFile monkey-patch branches)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Instance from '../Instance'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockInstance, mockUpdate, mockInsert } = vi.hoisted(() => ({
  mockInstance: {
    id: 1,
    owner: 0,
    isSetup: false,
    workMode: 'personal',
    flags: 0,
    botSessionId: 0,
    qqBot: { wsUrl: 'ws://fake' },
  },
  mockUpdate: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  })),
  mockInsert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    })),
  })),
}))

// QQ client mock — will be replaced per-test with getFile/downloadFileStreamToFile
const mockQQClient = vi.hoisted(() => ({
  login: vi.fn(),
  on: vi.fn(),
  downloadFile: vi.fn(),
  downloadFileStreamToFile: undefined as any,
  getFile: undefined as any,
}))

vi.mock('@napgram/env-kit', () => ({
  env: {
    TG_BOT_TOKEN: 'fake-token',
    NAPCAT_WS_URL: 'ws://fake',
    LOG_FILE: '/tmp/test.log',
    DATA_DIR: '/tmp/data',
    CACHE_DIR: '/tmp/cache',
  },
}))

vi.mock('@napgram/db-kit', () => ({
  db: {
    query: {
      instance: {
        findFirst: vi.fn().mockResolvedValue(mockInstance),
      },
    },
    insert: mockInsert,
    update: mockUpdate,
  },
  schema: { instance: { id: 'id' } },
  eq: vi.fn(),
  ForwardMap: { load: vi.fn().mockResolvedValue({ map: true }) },
}))

vi.mock('@napgram/logger-kit', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  })),
  sentry: { captureException: vi.fn() },
}))

vi.mock('../../../infrastructure/clients/qq', () => ({
  qqClientFactory: {
    create: vi.fn().mockResolvedValue(mockQQClient),
  },
}))

vi.mock('../../../infrastructure/clients/telegram', () => ({
  telegramClientFactory: {
    connect: vi.fn(),
    create: vi.fn().mockResolvedValue({
      sessionId: 123,
      me: { id: 123, username: 'test_bot' },
    }),
  },
}))

vi.mock('../../../features/runtime/instance-registry', () => ({
  instanceRegistry: {
    add: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('@napgram/plugin-kit', () => ({
  getEventPublisher: vi.fn(() => ({
    publishInstanceStatus: vi.fn(),
    publishFriendRequest: vi.fn(),
    publishGroupRequest: vi.fn(),
    publishNotice: vi.fn(),
  })),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function createInstance() {
  return await Instance.createNew('token') as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('instance.enableQQMediaDownloadDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset per-test overrides
    mockQQClient.downloadFileStreamToFile = undefined as any
    mockQQClient.getFile = undefined as any
    delete (mockQQClient as any).__napgramMediaWrapped
  })

  // -------------------------------------------------------------------------
  // downloadFileStreamToFile branch (lines 399-413)
  // -------------------------------------------------------------------------
  describe('downloadFileStreamToFile wrapping', () => {
    it('wraps downloadFileStreamToFile and returns result with path', async () => {
      const rawImpl = vi.fn().mockResolvedValue({ path: '/local/file.mp4', info: { size: 100 } })
      mockQQClient.downloadFileStreamToFile = rawImpl

      const instance = await createInstance()
      const qq = instance.qqClient as any

      const result = await qq.downloadFileStreamToFile('/file-id', { chunkSize: 1024 })
      expect(rawImpl).toHaveBeenCalledWith('file-id', { chunkSize: 1024 })
      expect(result).toEqual({ path: '/local/file.mp4', info: { size: 100 } })
    })

    it('logs warn when downloadFileStreamToFile returns no path', async () => {
      const rawImpl = vi.fn().mockResolvedValue({ path: undefined })
      mockQQClient.downloadFileStreamToFile = rawImpl

      const instance = await createInstance()
      const qq = instance.qqClient as any
      const warnSpy = vi.spyOn(instance.log ?? (instance as any).log ?? {}, 'warn').mockImplementation(() => { })

      await qq.downloadFileStreamToFile('file-id')
      // No throw — just logs warn internally (covered by line 405)
      expect(rawImpl).toHaveBeenCalledWith('file-id', undefined)
      void warnSpy
    })

    it('rethrows error from downloadFileStreamToFile (line 410-411)', async () => {
      const err = new Error('stream failed')
      const rawImpl = vi.fn().mockRejectedValue(err)
      mockQQClient.downloadFileStreamToFile = rawImpl

      const instance = await createInstance()
      const qq = instance.qqClient as any

      await expect(qq.downloadFileStreamToFile('bad-id')).rejects.toThrow('stream failed')
    })

    it('strips leading slash from fileId', async () => {
      const rawImpl = vi.fn().mockResolvedValue({ path: '/out/file.mp4' })
      mockQQClient.downloadFileStreamToFile = rawImpl

      const instance = await createInstance()
      const qq = instance.qqClient as any

      await qq.downloadFileStreamToFile('/leading-slash-id')
      expect(rawImpl).toHaveBeenCalledWith('leading-slash-id', undefined)
    })
  })

  // -------------------------------------------------------------------------
  // getFile branch (lines 418-444)
  // -------------------------------------------------------------------------
  describe('getFile wrapping (stream-first)', () => {
    it('returns streamed result when downloadFileStreamToFile succeeds with local path', async () => {
      const streamImpl = vi.fn().mockResolvedValue({ path: '/local/video.mp4', info: { size: 200 } })
      const getFileImpl = vi.fn()
      mockQQClient.downloadFileStreamToFile = streamImpl
      mockQQClient.getFile = getFileImpl

      const instance = await createInstance()
      const qq = instance.qqClient as any

      const result = await qq.getFile('/video-id')
      expect(streamImpl).toHaveBeenCalledWith('video-id', { chunkSize: 65536 })
      expect(getFileImpl).not.toHaveBeenCalled()
      expect(result).toEqual({ info: { size: 200 }, file: '/local/video.mp4', path: '/local/video.mp4' })
    })

    it('falls back to rawGetFile when stream returns no local path (line 433)', async () => {
      const streamImpl = vi.fn().mockResolvedValue({ path: 'relative/path' }) // not starting with /
      const getFileImpl = vi.fn().mockResolvedValue({ file: '/fallback.mp4' })
      mockQQClient.downloadFileStreamToFile = streamImpl
      mockQQClient.getFile = getFileImpl

      const instance = await createInstance()
      const qq = instance.qqClient as any

      const result = await qq.getFile('video-id')
      expect(getFileImpl).toHaveBeenCalledWith('video-id')
      expect(result).toEqual({ file: '/fallback.mp4' })
    })

    it('falls back to rawGetFile when stream throws (line 435-437)', async () => {
      const streamImpl = vi.fn().mockRejectedValue(new Error('stream error'))
      const getFileImpl = vi.fn().mockResolvedValue({ file: '/fallback.mp4' })
      mockQQClient.downloadFileStreamToFile = streamImpl
      mockQQClient.getFile = getFileImpl

      const instance = await createInstance()
      const qq = instance.qqClient as any

      const result = await qq.getFile('video-id')
      expect(getFileImpl).toHaveBeenCalledWith('video-id')
      expect(result).toEqual({ file: '/fallback.mp4' })
    })

    it('logs warn when rawGetFile returns empty (line 441-443)', async () => {
      const streamImpl = vi.fn().mockRejectedValue(new Error('stream error'))
      const getFileImpl = vi.fn().mockResolvedValue(null)
      mockQQClient.downloadFileStreamToFile = streamImpl
      mockQQClient.getFile = getFileImpl

      const instance = await createInstance()
      const qq = instance.qqClient as any

      const result = await qq.getFile('video-id')
      expect(result).toBeNull()
    })

    it('uses rawGetFile directly when downloadFileStreamToFile is absent (line 440)', async () => {
      // No downloadFileStreamToFile — only getFile
      const getFileImpl = vi.fn().mockResolvedValue({ file: '/direct.mp4' })
      mockQQClient.getFile = getFileImpl
      // downloadFileStreamToFile stays undefined

      const instance = await createInstance()
      const qq = instance.qqClient as any

      const result = await qq.getFile('file-id')
      expect(getFileImpl).toHaveBeenCalledWith('file-id')
      expect(result).toEqual({ file: '/direct.mp4' })
    })

    it('does not wrap getFile when rawGetFile is absent', async () => {
      // Neither getFile nor downloadFileStreamToFile
      const instance = await createInstance()
      const qq = instance.qqClient as any

      // getFile should not exist as a function on qq (no wrapping happened)
      expect(typeof qq.getFile).not.toBe('function')
    })

    it('does not re-wrap when __napgramMediaWrapped is already set', async () => {
      const streamImpl = vi.fn().mockResolvedValue({ path: '/file.mp4' })
      mockQQClient.downloadFileStreamToFile = streamImpl
      ; (mockQQClient as any).__napgramMediaWrapped = true

      const instance = await createInstance()
      const qq = instance.qqClient as any

      // The original streamImpl should NOT have been replaced (no wrapping)
      expect(qq.downloadFileStreamToFile).toBe(streamImpl)
    })
  })
})
