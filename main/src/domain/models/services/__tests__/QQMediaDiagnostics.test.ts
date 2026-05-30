import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { enableQQMediaDownloadDiagnostics } from '../QQMediaDiagnostics'

function createMockLog() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
    silent: vi.fn(),
  } as any
}

function createMockQQClient(overrides: Record<string, any> = {}) {
  return {
    on: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  } as any
}

describe('enableQQMediaDownloadDiagnostics', () => {
  it('wraps downloadFile with error logging', async () => {
    const log = createMockLog()
    const rawDownloadFile = vi.fn().mockRejectedValue(new Error('file not found'))
    const qq = createMockQQClient({ downloadFile: rawDownloadFile })

    enableQQMediaDownloadDiagnostics(qq, log)

    await expect(qq.downloadFile('http://example.com/file')).rejects.toThrow('file not found')
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('download_file file not found'))
  })

  it('logs generic downloadFile errors', async () => {
    const log = createMockLog()
    const rawDownloadFile = vi.fn().mockRejectedValue(new Error('network timeout'))
    const qq = createMockQQClient({ downloadFile: rawDownloadFile })

    enableQQMediaDownloadDiagnostics(qq, log)

    await expect(qq.downloadFile('http://example.com/file')).rejects.toThrow('network timeout')
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('download_file failed'))
  })

  it('passes through successful downloadFile calls', async () => {
    const log = createMockLog()
    const rawDownloadFile = vi.fn().mockResolvedValue(Buffer.from('data'))
    const qq = createMockQQClient({ downloadFile: rawDownloadFile })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.downloadFile('http://example.com/file')
    expect(result).toEqual(Buffer.from('data'))
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('wraps downloadFileStreamToFile with error logging', async () => {
    const log = createMockLog()
    const rawStream = vi.fn().mockRejectedValue(new Error('stream failed'))
    const qq = createMockQQClient({ downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    await expect(qq.downloadFileStreamToFile('fileId123')).rejects.toThrow('stream failed')
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('downloadFileStreamToFile failed'))
  })

  it('warns when downloadFileStreamToFile returns no path', async () => {
    const log = createMockLog()
    const rawStream = vi.fn().mockResolvedValue({ info: {} })
    const qq = createMockQQClient({ downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.downloadFileStreamToFile('fileId123')
    expect(result).toEqual({ info: {} })
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('returned without local path'))
  })

  it('uses stream-first strategy in getFile', async () => {
    const log = createMockLog()
    const rawGetFile = vi.fn()
    const rawStream = vi.fn().mockResolvedValue({ path: '/tmp/file.jpg', info: { size: 100 } })
    const qq = createMockQQClient({ getFile: rawGetFile, downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.getFile('fileId456')
    expect(result).toEqual({ info: { size: 100 }, file: '/tmp/file.jpg', path: '/tmp/file.jpg' })
    expect(rawGetFile).not.toHaveBeenCalled()
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('stream-first getFile success'))
  })

  it('falls back to rawGetFile when stream returns no local path', async () => {
    const log = createMockLog()
    const rawGetFile = vi.fn().mockResolvedValue({ url: 'http://cdn/file' })
    const rawStream = vi.fn().mockResolvedValue({ path: null })
    const qq = createMockQQClient({ getFile: rawGetFile, downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.getFile('fileId789')
    expect(result).toEqual({ url: 'http://cdn/file' })
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('stream-first getFile no local path'))
  })

  it('falls back to rawGetFile when stream throws', async () => {
    const log = createMockLog()
    const rawGetFile = vi.fn().mockResolvedValue({ url: 'http://cdn/file' })
    const rawStream = vi.fn().mockRejectedValue(new Error('stream broken'))
    const qq = createMockQQClient({ getFile: rawGetFile, downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.getFile('fileId000')
    expect(result).toEqual({ url: 'http://cdn/file' })
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('stream-first getFile failed'))
  })

  it('warns when rawGetFile returns empty', async () => {
    const log = createMockLog()
    const rawGetFile = vi.fn().mockResolvedValue(null)
    const qq = createMockQQClient({ getFile: rawGetFile })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.getFile('emptyFile')
    expect(result).toBeNull()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('get_file returned empty'))
  })

  it('skips wrapping if already wrapped', () => {
    const log = createMockLog()
    const rawDownloadFile = vi.fn()
    const qq = createMockQQClient({ downloadFile: rawDownloadFile })

    enableQQMediaDownloadDiagnostics(qq, log)
    const wrappedFirst = qq.downloadFile

    enableQQMediaDownloadDiagnostics(qq, log)
    expect(qq.downloadFile).toBe(wrappedFirst)
  })

  it('strips leading slash from fileId', async () => {
    const log = createMockLog()
    const rawStream = vi.fn().mockResolvedValue({ path: '/tmp/file.jpg' })
    const qq = createMockQQClient({ downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    await qq.downloadFileStreamToFile('/leading-slash-id')
    expect(rawStream).toHaveBeenCalledWith('leading-slash-id', undefined)
  })
})
