import { afterEach, describe, expect, it, jest, mock } from 'bun:test'
import pastebin from '../pastebin'

// Mock global fetch
const fetchMock = mock()
globalThis.fetch = fetchMock

describe('pastebin utility', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should upload data', async () => {
    fetchMock.mockResolvedValue({
      headers: {
        get: (header: string) => header === 'Location' ? 'http://fars.ee/abc' : null,
      },
    })

    const url = await pastebin.upload('some text')

    expect(fetchMock).toHaveBeenCalledWith('https://fars.ee', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: expect.any(URLSearchParams),
    }))

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams
    expect(body.get('c')).toBe('some text')
    expect(body.get('p')).toBe('1')

    expect(url).toBe('http://fars.ee/abc')
  })
})
