import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../../shared-types.js'
import { ForwardMapper } from '../MessageMapper.js'

// Mock the database
vi.mock('../../../../shared-types.js', async importOriginal => ({
  ...(await importOriginal() as any),
  db: {
    query: {
      message: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      })),
    })),
  },
  schema: {
    message: { id: 'id' },
  },
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080',
  },
  temp: { TEMP_PATH: '/tmp', createTempFile: vi.fn(() => ({ path: '/tmp/test', cleanup: vi.fn() })) },
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  })),
  configureInfraKit: vi.fn(),
  performanceMonitor: { recordCall: vi.fn(), recordError: vi.fn() },
}))

describe('forwardMapper', () => {
  let mapper: ForwardMapper

  beforeEach(() => {
    mapper = new ForwardMapper()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('saveTgToQqMapping', () => {
    it('skips persistence by default in tests', async () => {
      const unified: any = { content: [] }
      const tgMsg: any = { id: 100 }
      const receipt: any = { messageId: 200 }
      const pair: any = { qqRoomId: BigInt(1000), tgChatId: BigInt(2000), instanceId: 1 }

      await mapper.saveTgToQqMapping(unified, tgMsg, receipt, pair)

      expect(vi.mocked(db.insert)).not.toHaveBeenCalled()
    })

    it('handles database error in saveTgToQqMapping', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn(() => ({
          returning: vi.fn().mockRejectedValue(new Error('DB Error')),
        })),
      } as any)

      const unified: any = { content: [] }
      const tgMsg: any = { id: 100 }
      const receipt: any = { messageId: 200 }
      const pair: any = { qqRoomId: BigInt(1000), tgChatId: 2000, instanceId: 1 }

      await mapper.saveTgToQqMapping(unified, tgMsg, receipt, pair)
      // Should not throw
    })
  })
})
