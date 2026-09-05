import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { bunRuntime } from '../../internal/path.js'

const fileIOMocks = (() => ({
  mkdir: mock(),
  exists: mock(async () => true),
  readText: mock(),
  write: mock(),
  unlink: mock(),
  readdir: mock(),
}))()

const loggerMocks = (() => ({
  error: mock(),
}))()

const getLoggerMock = (() => mock(() => loggerMocks))()

mock.module('@napgram/runtime-kit', () => ({
  runtimeFileIO: fileIOMocks,
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: getLoggerMock,
}))

let createPluginStorage: typeof import('../storage.js').createPluginStorage
beforeAll(async () => {
  ({ createPluginStorage } = await import('../storage.js'))
})

describe('plugin storage', () => {
  const originalDataDir = bunRuntime.env.DATA_DIR

  beforeEach(() => {
    mock.clearAllMocks()
    bunRuntime.env.DATA_DIR = '/data'
  })

  afterEach(() => {
    if (originalDataDir === undefined)
      delete bunRuntime.env.DATA_DIR
    else
      bunRuntime.env.DATA_DIR = originalDataDir
  })

  it('sets and gets data with sanitized paths', async () => {
    const storage = createPluginStorage('plugin#1')
    fileIOMocks.mkdir.mockResolvedValueOnce(undefined)
    fileIOMocks.write.mockResolvedValueOnce(0)

    await storage.set('key@1', { ok: true })

    expect(fileIOMocks.mkdir).toHaveBeenCalledWith('/data/plugins-data/plugin-1', { recursive: true })
    expect(fileIOMocks.write).toHaveBeenCalledWith(
      '/data/plugins-data/plugin-1/key-1.json',
      JSON.stringify({ ok: true }, null, 2),
    )

    fileIOMocks.readText.mockResolvedValueOnce('{"ok":true}')
    const value = await storage.get('key@1')

    expect(value).toEqual({ ok: true })
    expect(fileIOMocks.readText).toHaveBeenCalledWith('/data/plugins-data/plugin-1/key-1.json')
  })

  it('returns null for missing keys', async () => {
    const storage = createPluginStorage('plugin#1')
    fileIOMocks.exists.mockResolvedValueOnce(false)

    await expect(storage.get('missing')).resolves.toBeNull()
  })

  it('logs and throws when create directory fails', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('mkdir fail')
    fileIOMocks.mkdir.mockRejectedValueOnce(error)

    await expect(storage.set('bad', { ok: true })).rejects.toThrow('mkdir fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('logs and throws on read errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('fail')
    fileIOMocks.readText.mockRejectedValueOnce(error)

    await expect(storage.get('bad')).rejects.toThrow('fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('logs and throws on write errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('write fail')
    fileIOMocks.mkdir.mockResolvedValueOnce(undefined)
    fileIOMocks.write.mockRejectedValueOnce(error)

    await expect(storage.set('bad', { ok: true })).rejects.toThrow('write fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('lists keys and deletes files', async () => {
    const storage = createPluginStorage('plugin#1')
    fileIOMocks.mkdir.mockResolvedValueOnce(undefined)
    fileIOMocks.readdir.mockResolvedValueOnce(['a.json', 'b.txt', 'c.json'])

    await expect(storage.keys()).resolves.toEqual(['a', 'c'])

    fileIOMocks.unlink.mockResolvedValueOnce(undefined)
    await storage.delete('a')
    expect(fileIOMocks.unlink).toHaveBeenCalledWith('/data/plugins-data/plugin-1/a.json')
  })

  it('logs and throws on delete errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('unlink fail')
    fileIOMocks.exists.mockResolvedValueOnce(true)
    fileIOMocks.unlink.mockRejectedValueOnce(error)

    await expect(storage.delete('bad')).rejects.toThrow('unlink fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('ignores delete when file is missing', async () => {
    const storage = createPluginStorage('plugin#1')
    fileIOMocks.exists.mockResolvedValueOnce(false)

    await expect(storage.delete('missing')).resolves.toBeUndefined()
  })

  it('logs and throws on keys errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('readdir fail')
    fileIOMocks.mkdir.mockResolvedValueOnce(undefined)
    fileIOMocks.readdir.mockRejectedValueOnce(error)

    await expect(storage.keys()).rejects.toThrow('readdir fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('clears all keys', async () => {
    const storage = createPluginStorage('plugin#1')
    fileIOMocks.mkdir.mockResolvedValueOnce(undefined)
    fileIOMocks.readdir.mockResolvedValueOnce(['a.json', 'c.json'])
    fileIOMocks.unlink.mockResolvedValue(undefined)

    await storage.clear()

    expect(fileIOMocks.unlink).toHaveBeenCalledTimes(2)
  })

  it('logs and throws on clear errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('unlink fail')
    fileIOMocks.mkdir.mockResolvedValueOnce(undefined)
    fileIOMocks.readdir.mockResolvedValueOnce(['a.json'])
    fileIOMocks.unlink.mockRejectedValueOnce(error)

    await expect(storage.clear()).rejects.toThrow('unlink fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })
})
