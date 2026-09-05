import { bytesFromUtf8 } from '../../../../shared/utils/binary.js'
import { describe, expect, it, mock } from 'bun:test'
import { enableQQMediaDownloadDiagnostics } from '../QQMediaDiagnostics'

function createMockLog() {
  return {
    warn: mock(),
    info: mock(),
    error: mock(),
    debug: mock(),
    fatal: mock(),
    trace: mock(),
    child: mock(),
    level: 'info',
    silent: mock(),
  } as any
}

function createMockQQClient(overrides: Record<string, any> = {}) {
  return {
    on: mock(),
    login: mock(),
    logout: mock(),
    ...overrides,
  } as any
}

describe('enableQQMediaDownloadDiagnostics', () => {
  it('wraps downloadFile with error logging', async () => {
    const log = createMockLog()
    const rawDownloadFile = mock().mockRejectedValue(new Error('file not found'))
    const qq = createMockQQClient({ downloadFile: rawDownloadFile })

    enableQQMediaDownloadDiagnostics(qq, log)

    await expect(qq.downloadFile('http://example.com/file')).rejects.toThrow('file not found')
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('download_file file not found'))
  })

  it('logs generic downloadFile errors', async () => {
    const log = createMockLog()
    const rawDownloadFile = mock().mockRejectedValue(new Error('network timeout'))
    const qq = createMockQQClient({ downloadFile: rawDownloadFile })

    enableQQMediaDownloadDiagnostics(qq, log)

    await expect(qq.downloadFile('http://example.com/file')).rejects.toThrow('network timeout')
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('download_file failed'))
  })

  it('passes through successful downloadFile calls', async () => {
    const log = createMockLog()
    const rawDownloadFile = mock().mockResolvedValue(bytesFromUtf8('data'))
    const qq = createMockQQClient({ downloadFile: rawDownloadFile })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.downloadFile('http://example.com/file')
    expect(result).toEqual(bytesFromUtf8('data'))
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('wraps downloadFileStreamToFile with error logging', async () => {
    const log = createMockLog()
    const rawStream = mock().mockRejectedValue(new Error('stream failed'))
    const qq = createMockQQClient({ downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    await expect(qq.downloadFileStreamToFile('fileId123')).rejects.toThrow('stream failed')
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('downloadFileStreamToFile failed'))
  })

  it('warns when downloadFileStreamToFile returns no path', async () => {
    const log = createMockLog()
    const rawStream = mock().mockResolvedValue({ info: {} })
    const qq = createMockQQClient({ downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.downloadFileStreamToFile('fileId123')
    expect(result).toEqual({ info: {} })
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('returned without local path'))
  })

  it('uses stream-first strategy in getFile', async () => {
    const log = createMockLog()
    const rawGetFile = mock()
    const rawStream = mock().mockResolvedValue({ path: '/tmp/file.jpg', info: { size: 100 } })
    const qq = createMockQQClient({ getFile: rawGetFile, downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.getFile('fileId456')
    expect(result).toEqual({ info: { size: 100 }, file: '/tmp/file.jpg', path: '/tmp/file.jpg' })
    expect(rawGetFile).not.toHaveBeenCalled()
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('stream-first getFile success'))
  })

  it('falls back to rawGetFile when stream returns no local path', async () => {
    const log = createMockLog()
    const rawGetFile = mock().mockResolvedValue({ url: 'http://cdn/file' })
    const rawStream = mock().mockResolvedValue({ path: null })
    const qq = createMockQQClient({ getFile: rawGetFile, downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.getFile('fileId789')
    expect(result).toEqual({ url: 'http://cdn/file' })
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('stream-first getFile no local path'))
  })

  it('falls back to rawGetFile when stream throws', async () => {
    const log = createMockLog()
    const rawGetFile = mock().mockResolvedValue({ url: 'http://cdn/file' })
    const rawStream = mock().mockRejectedValue(new Error('stream broken'))
    const qq = createMockQQClient({ getFile: rawGetFile, downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.getFile('fileId000')
    expect(result).toEqual({ url: 'http://cdn/file' })
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('stream-first getFile failed'))
  })

  it('warns when rawGetFile returns empty', async () => {
    const log = createMockLog()
    const rawGetFile = mock().mockResolvedValue(null)
    const qq = createMockQQClient({ getFile: rawGetFile })

    enableQQMediaDownloadDiagnostics(qq, log)

    const result = await qq.getFile('emptyFile')
    expect(result).toBeNull()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('get_file returned empty'))
  })

  it('skips wrapping if already wrapped', () => {
    const log = createMockLog()
    const rawDownloadFile = mock()
    const qq = createMockQQClient({ downloadFile: rawDownloadFile })

    enableQQMediaDownloadDiagnostics(qq, log)
    const wrappedFirst = qq.downloadFile

    enableQQMediaDownloadDiagnostics(qq, log)
    expect(qq.downloadFile).toBe(wrappedFirst)
  })

  it('strips leading slash from fileId', async () => {
    const log = createMockLog()
    const rawStream = mock().mockResolvedValue({ path: '/tmp/file.jpg' })
    const qq = createMockQQClient({ downloadFileStreamToFile: rawStream })

    enableQQMediaDownloadDiagnostics(qq, log)

    await qq.downloadFileStreamToFile('/leading-slash-id')
    expect(rawStream).toHaveBeenCalledWith('leading-slash-id', undefined)
  })
})
