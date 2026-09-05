import { bytesToUtf8 } from '../../../../shared/utils/binary.js'
import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

// Mock dependencies
const fileIOMocks = {
  access: mock(),
  stat: mock(),
  readBytes: mock(),
  write: mock(),
}
mock.module('@napgram/runtime-kit', () => ({ runtimeFileIO: fileIOMocks }))
const nativeImageMocks = {
  constructor: mock(),
  metadataSync: mock().mockReturnValue({ width: 100, height: 100 }),
  resize: mock(),
  jpeg: mock().mockResolvedValue(new Uint8Array(500)),
  png: mock().mockResolvedValue(new Uint8Array(500)),
}

class TransformerMock {
  constructor(input: Uint8Array) {
    nativeImageMocks.constructor(input)
  }

  metadataSync() {
    return nativeImageMocks.metadataSync()
  }

  resize(...args: unknown[]) {
    nativeImageMocks.resize(...args)
    return this
  }

  jpeg(quality: number) {
    return nativeImageMocks.jpeg(quality)
  }

  png() {
    return nativeImageMocks.png()
  }
}
mock.module('@napi-rs/image', () => ({
  Transformer: TransformerMock,
}))
mock.module('file-type', () => ({
  fileTypeFromBuffer: mock(),
}))
mock.module('../../capabilities/temp.js', () => ({
  temp: {
    TEMP_PATH: '/tmp',
    createTempFile: mock(() => ({ path: '/tmp/test', cleanup: mock() })),
  },
}))

mock.module('../../capabilities/logging.js', () => ({
  getLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
    trace: mock(),
  })),
}))

// Mock global fetch
globalThis.fetch = mock()

let MediaFeature: any
let fileTypeFromBuffer: any
beforeAll(async () => {
  ;({ fileTypeFromBuffer } = await import('file-type'))
  ;({ MediaFeature } = await import('../MediaFeature.js'))
})

describe('mediaFeature', () => {
  let mediaFeature: MediaFeature
  let mockInstance: any
  let mockTgBot: any
  let mockQqClient: any

  beforeEach(() => {
    mock.clearAllMocks()
    mockInstance = { id: 1 }
    mockTgBot = {}
    mockQqClient = {
      getFile: mock(),
      callApi: mock(),
      downloadFile: mock(),
      downloadFileStreamToFile: mock(),
    }
    mediaFeature = new MediaFeature(mockInstance, mockTgBot, mockQqClient)
  })

  describe('downloadMedia', () => {
    it('downloads media from a URL', async () => {
      const mockBuffer = new TextEncoder().encode('test data')
        ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(mockBuffer.buffer),
      })

      const result = await mediaFeature.downloadMedia('http://example.com/test.jpg')
      expect(bytesToUtf8(result)).toBe('test data')
      expect(globalThis.fetch).toHaveBeenCalledWith('http://example.com/test.jpg', expect.any(Object))
    })

    it('reads from a local file path', async () => {
      const mockBuffer = new TextEncoder().encode('local data')
      fileIOMocks.stat.mockResolvedValue({ size: 100 } as any)
      fileIOMocks.readBytes.mockResolvedValue(mockBuffer)

      const result = await mediaFeature.downloadMedia('/path/to/local.jpg')
      expect(result).toEqual(mockBuffer)
      expect(fileIOMocks.readBytes).toHaveBeenCalledWith('/path/to/local.jpg')
    })

    it('handles .amr fallback to .amr.wav', async () => {
      const mockBuffer = new TextEncoder().encode('wav data')
      fileIOMocks.stat
        .mockResolvedValueOnce({ size: 0 } as any) // .amr is 0 bytes
        .mockResolvedValueOnce({ size: 100 } as any) // .amr.wav is 100 bytes
      fileIOMocks.readBytes.mockResolvedValue(mockBuffer)

      const result = await mediaFeature.downloadMedia('/path/to/audio.amr')
      expect(result).toEqual(mockBuffer)
      expect(fileIOMocks.readBytes).toHaveBeenCalledWith('/path/to/audio.amr.wav')
    })

    it('throws error when download fails', async () => {
      ; (globalThis.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      await expect(mediaFeature.downloadMedia('http://example.com/fail.jpg')).rejects.toThrow('Download failed: 404 Not Found')
    })
  })

  describe('fetchFileById', () => {
    it('fetches file using getFile (direct link)', async () => {
      const mockBuffer = new TextEncoder().encode('file data')
      mockQqClient.getFile.mockResolvedValue({ url: 'http://example.com/file' })
      ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(mockBuffer.buffer),
      })

      const result = await mediaFeature.fetchFileById('file123')
      expect(bytesToUtf8(result.buffer!)).toBe('file data')
      expect(result.url).toBe('http://example.com/file')
    })

    it('fetches file using callApi(get_file)', async () => {
      const mockBuffer = new TextEncoder().encode('file data')
      mockQqClient.getFile = undefined // Simulation: not a function
      mockQqClient.callApi.mockResolvedValue({ url: 'http://example.com/file' })
      ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(mockBuffer.buffer),
      })

      const result = await mediaFeature.fetchFileById('file123')
      expect(bytesToUtf8(result.buffer!)).toBe('file data')
      expect(mockQqClient.callApi).toHaveBeenCalledWith('get_file', { file: 'file123' })
    })

    it('handles direct buffer data in response', async () => {
      const mockBuffer = new TextEncoder().encode('buffer data')
      mockQqClient.getFile.mockResolvedValue({ data: mockBuffer })

      const result = await mediaFeature.fetchFileById('file123')
      expect(result.buffer).toEqual(mockBuffer)
    })

    it('falls back to downloadFile if direct download fails', async () => {
      const mockBuffer = new TextEncoder().encode('local file data')
      mockQqClient.getFile.mockResolvedValue({ url: 'http://example.com/file' })
      ; (globalThis.fetch as any).mockRejectedValue(new Error('Network error'))
      mockQqClient.downloadFile.mockResolvedValue({ file: '/tmp/local' })
      fileIOMocks.readBytes.mockResolvedValue(mockBuffer)

      const result = await mediaFeature.fetchFileById('file123')
      expect(result.buffer).toEqual(mockBuffer)
      expect(result.path).toBe('/tmp/local')
    })

    it('falls back to downloadFileStreamToFile', async () => {
      const mockBuffer = new TextEncoder().encode('streamed data')
      mockQqClient.getFile.mockResolvedValue(null)
      mockQqClient.downloadFileStreamToFile.mockResolvedValue({ path: '/tmp/streamed' })
      fileIOMocks.readBytes.mockResolvedValue(mockBuffer)

      const result = await mediaFeature.fetchFileById('file123')
      expect(result.buffer).toEqual(mockBuffer)
      expect(result.path).toBe('/tmp/streamed')
    })

    it('handles error in fetchFileById', async () => {
      mockQqClient.getFile.mockRejectedValue(new Error('Fatal error'))
      // Mock downloadFileStreamToFile to also fail or not be present
      mockQqClient.downloadFileStreamToFile = undefined

      const result = await mediaFeature.fetchFileById('file123')
      expect(result).toEqual({})
    })
  })

  describe('process media types', () => {
    it('processes image content with direct buffer', async () => {
      const buf = new TextEncoder().encode('img')
      const result = await mediaFeature.processImage({ data: { file: buf } } as any)
      expect(result).toEqual(buf)
    })

    it('throws error if no image source available', async () => {
      await expect(mediaFeature.processImage({ data: {} } as any)).rejects.toThrow('No image source available')
    })

    it('processes image content with string URL', async () => {
      const buf = new TextEncoder().encode('img data')
        ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(buf.buffer),
      })
      const result = await mediaFeature.processImage({ data: { file: 'http://img.v' } } as any)
      expect(bytesToUtf8(result as Uint8Array)).toBe(bytesToUtf8(buf))
    })

    it('processes image content with local path failing access', async () => {
      fileIOMocks.access.mockRejectedValue(new Error('No access'))
      const buf = new TextEncoder().encode('remote data')
        ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(buf.buffer),
      })
      const result = await mediaFeature.processImage({ data: { file: '/path/no-access.jpg', url: 'http://rem' } } as any)
      expect(bytesToUtf8(result as Uint8Array)).toBe(bytesToUtf8(buf))
    })

    it('processes image content with URL', async () => {
      const buf = new TextEncoder().encode('img data')
        ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(buf.buffer),
      })
      const result = await mediaFeature.processImage({ data: { url: 'http://img.v' } } as any)
      expect(bytesToUtf8(result as Uint8Array)).toBe(bytesToUtf8(buf))
    })

    it('processes video content with direct buffer', async () => {
      const buf = new TextEncoder().encode('video')
      const result = await mediaFeature.processVideo({ data: { file: buf } } as any)
      expect(result).toEqual(buf)
    })

    it('processes video content with URL', async () => {
      const buf = new TextEncoder().encode('video data')
        ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(buf.buffer),
      })
      const result = await mediaFeature.processVideo({ data: { url: 'http://video.mp4' } } as any)
      expect(bytesToUtf8(result as Uint8Array)).toBe(bytesToUtf8(buf))
    })

    it('throws error if no video source available', async () => {
      await expect(mediaFeature.processVideo({ data: {} } as any)).rejects.toThrow('No video source available')
    })

    it('processes video content with string URL', async () => {
      const buf = new TextEncoder().encode('video data')
        ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(buf.buffer),
      })
      const result = await mediaFeature.processVideo({ data: { file: 'http://video.v' } } as any)
      expect(bytesToUtf8(result as Uint8Array)).toBe(bytesToUtf8(buf))
    })

    it('processes video content with local path', async () => {
      fileIOMocks.access.mockResolvedValue(undefined)
      const result = await mediaFeature.processVideo({ data: { file: '/path/video.mp4' } } as any)
      expect(result).toBe('/path/video.mp4')
    })

    it('processes audio content with direct buffer', async () => {
      const buf = new TextEncoder().encode('audio')
      const result = await mediaFeature.processAudio({ data: { file: buf } } as any)
      expect(result).toEqual(buf)
    })

    it('processes audio content with URL', async () => {
      const buf = new TextEncoder().encode('audio data')
        ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(buf.buffer),
      })
      const result = await mediaFeature.processAudio({ data: { url: 'http://audio.mp3' } } as any)
      expect(bytesToUtf8(result as Uint8Array)).toBe(bytesToUtf8(buf))
    })

    it('throws error if no audio source available', async () => {
      await expect(mediaFeature.processAudio({ data: {} } as any)).rejects.toThrow('No audio source available')
    })

    it('processes audio content with string URL', async () => {
      const buf = new TextEncoder().encode('audio data')
        ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: mock().mockResolvedValue(buf.buffer),
      })
      const result = await mediaFeature.processAudio({ data: { file: 'http://audio.v' } } as any)
      expect(bytesToUtf8(result as Uint8Array)).toBe(bytesToUtf8(buf))
    })

    it('processes audio content with local path', async () => {
      fileIOMocks.access.mockResolvedValue(undefined)
      const result = await mediaFeature.processAudio({ data: { file: '/path/audio.mp3' } } as any)
      expect(result).toBe('/path/audio.mp3')
    })

    it('processes audio content prioritizing .amr.wav', async () => {
    })

    describe('compressImage', () => {
      it('skips compression if file is small enough', async () => {
        const buf = new Uint8Array(100)
        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result).toEqual(buf)
      })

      it('compresses an image with the native Transformer', async () => {
        const buf = new Uint8Array(2000)
        fileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg' } as any)

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result.length).toBe(500)
        expect(nativeImageMocks.constructor).toHaveBeenCalledWith(buf)
        expect(nativeImageMocks.jpeg).toHaveBeenCalledWith(80)
      })

      it('resizes image if dimensions are too large', async () => {
        const buf = new Uint8Array(2000)
        fileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg' } as any)
        nativeImageMocks.metadataSync.mockReturnValue({ width: 3000, height: 1500 })

        await mediaFeature.compressImage(buf, 1000)
        expect(nativeImageMocks.resize).toHaveBeenCalledWith(1920, 960)
      })

      it('resizes image if dimensions are too large (height > width)', async () => {
        const buf = new Uint8Array(2000)
        fileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg' } as any)
        nativeImageMocks.metadataSync.mockReturnValue({ width: 1500, height: 3000 })

        await mediaFeature.compressImage(buf, 1000)
        expect(nativeImageMocks.resize).toHaveBeenCalledWith(960, 1920)
      })

      it('compresses WebP input as JPEG for the photo size target', async () => {
        const buf = new Uint8Array(2000)
        fileTypeFromBuffer.mockResolvedValue({ mime: 'image/webp' } as any)

        await mediaFeature.compressImage(buf, 1000)
        expect(nativeImageMocks.jpeg).toHaveBeenCalledWith(80)
      })

      it('reduces JPEG quality in a loop if still too large', async () => {
        const buf = new Uint8Array(2000)
        fileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg' } as any)
        nativeImageMocks.jpeg
          .mockResolvedValueOnce(new Uint8Array(1500))
          .mockResolvedValueOnce(new Uint8Array(1100))
          .mockResolvedValueOnce(new Uint8Array(800))

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result.length).toBe(800)
        expect(nativeImageMocks.jpeg).toHaveBeenCalledTimes(3)
        expect(nativeImageMocks.jpeg).toHaveBeenLastCalledWith(40)
      })

      it('logs warning if failed to compress below maxSize', async () => {
        const buf = new Uint8Array(2000)
        fileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg' } as any)
        nativeImageMocks.jpeg.mockResolvedValue(new Uint8Array(1500))

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result.length).toBe(1500)
        expect(nativeImageMocks.jpeg).toHaveBeenLastCalledWith(20)
      })

      it('returns original buffer for unsupported formats', async () => {
        const buf = new Uint8Array(2000)
        fileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' } as any)

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result).toEqual(buf)
      })

      it('does not run a lossy quality loop for PNG', async () => {
        const buf = new Uint8Array(2000)
        fileTypeFromBuffer.mockResolvedValue({ mime: 'image/png' } as any)
        nativeImageMocks.png.mockResolvedValue(new Uint8Array(1500))

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result.length).toBe(1500)
        expect(nativeImageMocks.png).toHaveBeenCalledTimes(1)
      })

      it('handles compression failure by returning original buffer', async () => {
        const buf = new Uint8Array(2000)
        fileTypeFromBuffer.mockRejectedValue(new Error('Crash'))

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result).toEqual(buf)
      })
    })

    describe('utility methods', () => {
      it('returns media size', () => {
        expect(mediaFeature.getMediaSize(new Uint8Array(5))).toBe(5)
      })

      it('checks if media is too large', () => {
        expect(mediaFeature.isMediaTooLarge(new Uint8Array(10), 5)).toBe(true)
        expect(mediaFeature.isMediaTooLarge(new Uint8Array(10), 100)).toBe(false)
      })

      it('creates temp file from buffer', async () => {
        const buf = new TextEncoder().encode('temp')
        const result = await mediaFeature.createTempFileFromUint8Array(buf, '.jpg')

        // temp.createTempFile mock returns { path: '/tmp/test', cleanup: fn }
        expect(result.path).toBe('/tmp/test')
      })

      it('destroys correctly', () => {
        mediaFeature.destroy()
        // No errors expected
      })
    })
  })
})
