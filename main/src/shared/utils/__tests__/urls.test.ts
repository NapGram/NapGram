import { describe, it, expect, vi } from 'vitest'
import { fetchFile, getAvatar } from '../urls.js'

describe('urls', () => {
  it('fetchFile handles success and failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8)
    }).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })

    const buf = await fetchFile('http://example.com')
    expect(buf.length).toBe(8)

    await expect(fetchFile('http://example.com')).rejects.toThrow('Fetch failed: 404 Not Found')
  })
  
  it('getAvatar', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8)
    })
    const buf = await getAvatar({ uin: 12345 })
    expect(buf.length).toBe(8)
  })
})
