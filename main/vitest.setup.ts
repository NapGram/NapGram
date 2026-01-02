import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { beforeAll, vi } from 'vitest'

vi.mock('@napgram/infra-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@napgram/infra-kit')>()
  return {
    ...actual,
    env: {
      DATA_DIR: '/tmp',
      CACHE_DIR: '/tmp/cache',
      TG_INITIAL_DCID: 2,
      TG_INITIAL_SERVER: '149.154.167.50',
      NAPCAT_WS_URL: 'ws://localhost:3000',
      TG_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      LOG_LEVEL: 'info'
    },
    getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() })),
    db: {
      session: { create: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
      instance: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), upsert: vi.fn() },
      forwardPair: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
      forwardMultiple: { findFirst: vi.fn(), create: vi.fn() }
    },
    // We don't partial mock temp/hashing/qface if actual has them, but actual might rely on db/env.
    // If we want to force our mocks for these:
    temp: { TEMP_PATH: '/tmp/napgram', file: vi.fn(), createTempFile: vi.fn() },
    // hashing: actual.hashing, // Use real hashing if possible, or mock it. Real is safer if no dependencies.
    hashing: { md5Hex: vi.fn((s: string) => 'hashed-' + s), md5: vi.fn((s: string) => 'hashed-' + s) },
    sentry: { captureException: vi.fn() },
    ForwardMap: { load: vi.fn().mockResolvedValue({ map: true }) },
    // qface: actual.qface, // Use real qface
    qface: {
      1: '/撇嘴',
      14: '/微笑',
      179: '/doge',
      100: 'mock'
    },
    DurationParser: class {
      static parse(s: string) { return 1000 }
    }
  }
})

// 在测试开始前确保所有需要的目录存在
beforeAll(() => {
  const dataDir = process.env.DATA_DIR || path.resolve('./data')
  const dirs = [
    path.join(dataDir, 'temp'),
    path.join(dataDir, 'cache'),
    path.join(dataDir, 'logs'),
  ]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
})
