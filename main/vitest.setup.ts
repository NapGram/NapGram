import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { beforeAll, vi } from 'vitest'

const mockedLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }

const envMock = vi.hoisted(() => ({
  DATA_DIR: '/tmp',
  CACHE_DIR: '/tmp/cache',
  TG_INITIAL_DCID: 2,
  TG_INITIAL_SERVER: '149.154.167.50',
  NAPCAT_WS_URL: 'ws://localhost:3000',
  TG_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
  LOG_LEVEL: 'info',
  ADMIN_QQ: undefined as number | string | null | undefined,
  ADMIN_TG: undefined as number | string | null | undefined,
}))

vi.mock('@napgram/env-kit', () => ({
  env: envMock,
  flags: {},
  getSystemOwners: () => ({
    qq: envMock.ADMIN_QQ,
    tg: envMock.ADMIN_TG,
  }),
  isConfiguredIdentity: (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '',
  matchesUserIdentity: (userId: string, identity: unknown) => {
    const normalize = (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, '')
    return String(userId ?? '') !== '' && normalize(userId) === normalize(identity)
  },
  matchesAnyIdentity: (userId: string, identities: unknown[]) => {
    const normalize = (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, '')
    return String(userId ?? '') !== '' && identities.some(identity => normalize(userId) === normalize(identity))
  },
  normalizeUserIdentity: (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, ''),
}))

vi.mock('@napgram/logger-kit', () => ({
  getLogger: vi.fn(() => mockedLogger),
  setConsoleLogLevel: vi.fn(),
  configureInfraKit: vi.fn(),
  sentry: { captureException: vi.fn() },
}))

vi.mock('@napgram/db-kit', () => ({
  db: {
    session: { create: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    instance: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    forwardPair: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    forwardMultiple: { findFirst: vi.fn(), create: vi.fn() },
    query: {
      adminUser: { findMany: vi.fn(), findFirst: vi.fn() },
      adminSession: { findFirst: vi.fn() },
    },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
  },
  drizzleDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
  schema: {},
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  gt: vi.fn(),
  gte: vi.fn(),
  like: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
  desc: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
  count: vi.fn(),
  ForwardMap: { load: vi.fn().mockResolvedValue({ map: true }) },
}))

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
