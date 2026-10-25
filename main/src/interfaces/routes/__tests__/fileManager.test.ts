import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import * as pathUtils from '../../../shared/utils/path.js'
import Fastify from 'fastify'
import { registerFileManagerRoutes } from '../fileManager.js'

mock.module('@napgram/auth-kit', () => ({
  authMiddleware: mock(async (req, _reply) => {
    (req as any).auth = { type: 'token', role: 'admin' }
  }),
  requirePermission: mock(() => async (req: any) => {
    req.auth = { type: 'access', role: 'super_admin' }
  }),
}))

const ioMocks = {
  readdir: mock(),
  stat: mock(),
  readText: mock(),
  write: mock(),
  mkdir: mock(),
  remove: mock(),
  unlink: mock(),
  rename: mock(),
  readBytes: mock(),
}

mock.module('@napgram/runtime-kit', () => ({
  runtimeFileIO: ioMocks,
}))

function fakeStats(overrides: Record<string, any> = {}) {
  const isDirectory = overrides.isDirectory ?? false
  return {
    isDirectory: () => isDirectory,
    size: overrides.size ?? 10,
    mtime: overrides.mtime ?? new Date('2026-01-02T03:04:05Z'),
    mode: overrides.mode ?? 0o644,
  }
}

describe('fileManager Routes', () => {
  let app: any

  beforeEach(async () => {
    // mockReset clears both call history and leaked implementations from
    // earlier rejection tests; clearAllMocks alone would not.
    for (const ioMock of Object.values(ioMocks))
      ioMock.mockReset()
    app = Fastify()
    registerFileManagerRoutes(app)
    await app.ready()
  })

  it('rejects path outside allowed root for list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=../../etc/passwd',
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toContain('Access denied')
  })

  it('rejects a sibling path that only shares the data root prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=../data-evil',
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toContain('Access denied')
  })

  it('handles sanitizePath throwing error', async () => {
    const spy = spyOn(pathUtils, 'normalizePath').mockImplementation(() => {
      throw new Error('Invalid path')
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=test',
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toBe('Invalid path')

    spy.mockRestore()
  })

  it('lists entries with stat metadata and skips unstatable ones', async () => {
    ioMocks.readdir.mockResolvedValue(['a.txt', 'sub', 'broken'])
    ioMocks.stat.mockImplementation(async (p: string) => {
      if (p.endsWith('sub'))
        return fakeStats({ isDirectory: true, mode: 0o755 })
      if (p.endsWith('broken'))
        throw new Error('stat boom')
      return fakeStats({ size: 3 })
    })

    const response = await app.inject({ method: 'GET', url: '/api/files/list?path=/' })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body.success).toBe(true)
    expect(body.files).toHaveLength(2)
    expect(body.files[0]).toMatchObject({ name: 'a.txt', type: 'file', size: 3, permissions: '0644' })
    expect(body.files[1]).toMatchObject({ name: 'sub', type: 'directory', permissions: '0755' })
  })

  it('requires a path for list', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/files/list' })
    expect(response.statusCode).toBe(400)
  })

  it('returns 500 when readdir fails', async () => {
    ioMocks.readdir.mockRejectedValue(new Error('nope'))
    const response = await app.inject({ method: 'GET', url: '/api/files/list?path=/' })
    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.payload).error).toBe('nope')
  })

  it('reads a text file with size metadata', async () => {
    ioMocks.stat.mockResolvedValue(fakeStats({ size: 5 }))
    ioMocks.readText.mockResolvedValue('hello')

    const response = await app.inject({ method: 'GET', url: '/api/files/read?path=notes.txt' })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body).toMatchObject({ success: true, content: 'hello', encoding: 'utf-8', size: 5 })
  })

  it('requires a path for read', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/files/read' })
    expect(response.statusCode).toBe(400)
  })

  it('refuses to read directories', async () => {
    ioMocks.stat.mockResolvedValue(fakeStats({ isDirectory: true }))
    const response = await app.inject({ method: 'GET', url: '/api/files/read?path=dir' })
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).error).toBe('Cannot read directory')
  })

  it('rejects oversized reads', async () => {
    ioMocks.stat.mockResolvedValue(fakeStats({ size: 11 * 1024 * 1024 }))
    const response = await app.inject({ method: 'GET', url: '/api/files/read?path=big.bin' })
    expect(response.statusCode).toBe(413)
  })

  it('returns 500 when read fails', async () => {
    ioMocks.stat.mockRejectedValue(new Error('missing'))
    const response = await app.inject({ method: 'GET', url: '/api/files/read?path=x' })
    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.payload).error).toBe('missing')
  })

  it('writes file content', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/files/write',
      payload: { path: 'a.txt', content: 'data' },
    })
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload).success).toBe(true)
    expect(ioMocks.write).toHaveBeenCalledWith(expect.stringContaining('a.txt'), 'data')
  })

  it('requires path and content for write', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/files/write',
      payload: { path: 'a.txt' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects oversized write content', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/files/write',
      payload: { path: 'a.txt', content: 'x'.repeat(6 * 1024 * 1024) },
    })
    expect(response.statusCode).toBe(413)
    expect(ioMocks.write).not.toHaveBeenCalled()
  })

  it('returns 500 when write fails', async () => {
    ioMocks.write.mockRejectedValue(new Error('disk full'))
    const response = await app.inject({
      method: 'POST',
      url: '/api/files/write',
      payload: { path: 'a.txt', content: 'd' },
    })
    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.payload).error).toBe('disk full')
  })

  it('creates directories and files', async () => {
    let response = await app.inject({
      method: 'POST',
      url: '/api/files/create',
      payload: { path: 'newdir', type: 'directory' },
    })
    expect(response.statusCode).toBe(200)
    expect(ioMocks.mkdir).toHaveBeenCalledWith(expect.stringContaining('newdir'), { recursive: true })

    response = await app.inject({
      method: 'POST',
      url: '/api/files/create',
      payload: { path: 'sub/file.txt', type: 'file', content: 'x' },
    })
    expect(response.statusCode).toBe(200)
    expect(ioMocks.write).toHaveBeenCalledWith(expect.stringContaining('file.txt'), 'x')
  })

  it('requires path and type for create', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/files/create',
      payload: { path: 'a' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 500 when create fails', async () => {
    ioMocks.mkdir.mockRejectedValue(new Error('perm'))
    const response = await app.inject({
      method: 'POST',
      url: '/api/files/create',
      payload: { path: 'd', type: 'directory' },
    })
    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.payload).error).toBe('perm')
  })

  it('deletes directories recursively and files via unlink', async () => {
    ioMocks.stat.mockResolvedValueOnce(fakeStats({ isDirectory: true }))
    let response = await app.inject({
      method: 'DELETE',
      url: '/api/files/delete',
      payload: { path: 'dir', recursive: true },
    })
    expect(response.statusCode).toBe(200)
    expect(ioMocks.remove).toHaveBeenCalledWith(expect.stringContaining('dir'), { recursive: true, force: true })

    ioMocks.stat.mockResolvedValueOnce(fakeStats())
    response = await app.inject({
      method: 'DELETE',
      url: '/api/files/delete',
      payload: { path: 'file.txt' },
    })
    expect(response.statusCode).toBe(200)
    expect(ioMocks.unlink).toHaveBeenCalledWith(expect.stringContaining('file.txt'))
  })

  it('requires a path for delete', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/files/delete', payload: {} })
    expect(response.statusCode).toBe(400)
  })

  it('returns 500 when delete fails', async () => {
    ioMocks.stat.mockRejectedValue(new Error('gone'))
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/files/delete',
      payload: { path: 'x' },
    })
    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.payload).error).toBe('gone')
  })

  it('moves files between sanitized paths', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      payload: { from: 'a.txt', to: 'b.txt' },
    })
    expect(response.statusCode).toBe(200)
    expect(ioMocks.rename).toHaveBeenCalledWith(
      expect.stringContaining('a.txt'),
      expect.stringContaining('b.txt'),
    )
  })

  it('validates both move endpoints', async () => {
    let response = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      payload: { from: '../../etc/passwd', to: 'b.txt' },
    })
    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toContain('Source:')

    response = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      payload: { from: 'a.txt', to: '../escape' },
    })
    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toContain('Destination:')

    response = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      payload: { from: 'a.txt' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 500 when move fails', async () => {
    ioMocks.rename.mockRejectedValue(new Error('cross-device'))
    const response = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      payload: { from: 'a', to: 'b' },
    })
    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.payload).error).toBe('cross-device')
  })

  it('downloads a file with attachment headers', async () => {
    ioMocks.stat.mockResolvedValue(fakeStats({ size: 4 }))
    ioMocks.readBytes.mockResolvedValue(new Uint8Array([1, 2, 3, 4]))

    const response = await app.inject({ method: 'GET', url: '/api/files/download?path=report.bin' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-disposition']).toContain('attachment; filename="report.bin"')
    expect(response.headers['content-type']).toContain('application/octet-stream')
    expect(new Uint8Array(response.rawPayload)).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('refuses to download directories', async () => {
    ioMocks.stat.mockResolvedValue(fakeStats({ isDirectory: true }))
    const response = await app.inject({ method: 'GET', url: '/api/files/download?path=dir' })
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).error).toContain('ZIP not implemented')
  })

  it('requires a path for download and surfaces failures', async () => {
    let response = await app.inject({ method: 'GET', url: '/api/files/download' })
    expect(response.statusCode).toBe(400)

    ioMocks.stat.mockRejectedValue(new Error('not found'))
    response = await app.inject({ method: 'GET', url: '/api/files/download?path=x' })
    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.payload).error).toBe('not found')
  })

  it('uploads a multipart file into the target directory', async () => {
    const boundary = '----napgramtest'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="hello.txt"',
      'Content-Type: text/plain',
      '',
      'hello world',
      `--${boundary}--`,
      '',
    ].join('\r\n')

    const response = await app.inject({
      method: 'POST',
      url: '/api/files/upload?path=/uploads',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(response.statusCode).toBe(200)
    const parsed = JSON.parse(response.payload)
    expect(parsed.success).toBe(true)
    expect(parsed.path).toContain('hello.txt')
    expect(parsed.size).toBe(11)
    expect(ioMocks.write).toHaveBeenCalledTimes(1)
    expect(ioMocks.mkdir).toHaveBeenCalledWith(expect.stringContaining('uploads'), { recursive: true })
  })

  it('rejects uploads with unsafe file names', async () => {
    const boundary = '----napgramtest'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename=".."',
      'Content-Type: text/plain',
      '',
      'x',
      `--${boundary}--`,
      '',
    ].join('\r\n')

    const response = await app.inject({
      method: 'POST',
      url: '/api/files/upload?path=/uploads',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).error).toBe('Invalid file name')
  })

  it('rejects uploads without a file part or with an unsafe target', async () => {
    const boundary = '----napgramtest'

    let response = await app.inject({
      method: 'POST',
      url: '/api/files/upload?path=/uploads',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: `--${boundary}--\r\n`,
    })
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).error).toBe('No file provided')

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="ok.txt"',
      'Content-Type: text/plain',
      '',
      'x',
      `--${boundary}--`,
      '',
    ].join('\r\n')

    response = await app.inject({
      method: 'POST',
      url: '/api/files/upload?path=../../etc',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
    expect(response.statusCode).toBe(403)
  })

  it('returns 500 when an upload write fails', async () => {
    ioMocks.write.mockRejectedValue(new Error('quota'))
    const boundary = '----napgramtest'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="hello.txt"',
      'Content-Type: text/plain',
      '',
      'hello world',
      `--${boundary}--`,
      '',
    ].join('\r\n')

    const response = await app.inject({
      method: 'POST',
      url: '/api/files/upload?path=/uploads',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.payload).error).toBe('quota')
  })
})
