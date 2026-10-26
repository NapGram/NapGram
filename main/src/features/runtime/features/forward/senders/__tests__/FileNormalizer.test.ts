import { bytesFromUtf8, bytesToUtf8 } from '../../../../../../shared/utils/binary.js'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { fileTypeFromBuffer } from 'file-type'
import { FileNormalizer } from '../FileNormalizer.js'

const fileIOMocks = {
  readBytes: mock(),
  readText: mock(),
  write: mock(),
  exists: mock(),
  access: mock(),
  mkdir: mock(),
  mkdtemp: mock(),
  stat: mock(),
  readdir: mock(),
  remove: mock(),
  unlink: mock(),
}

mock.module('file-type', () => ({
  fileTypeFromBuffer: mock(),
}))

describe('fileNormalizer', () => {
  let normalizer: FileNormalizer
  const mediaFeature = {
    downloadMedia: mock(),
    processImage: mock(),
    processVideo: mock(),
    processAudio: mock(),
    fetchFileById: mock(),
  }

  let readFileSpy: any
  let accessSpy: any
  let readdirSpy: any

  beforeEach(() => {
    normalizer = new FileNormalizer(mediaFeature as any, fileIOMocks as any)
    ;(fileTypeFromBuffer as any).mockResolvedValue({ ext: 'jpg', mime: 'image/jpeg' } as any)
    Object.values(fileIOMocks).forEach((fn: any) => fn.mockReset())
    readFileSpy = fileIOMocks.readBytes.mockResolvedValue(bytesFromUtf8('dummy'))
    accessSpy = fileIOMocks.access.mockResolvedValue(undefined)
    readdirSpy = fileIOMocks.readdir.mockResolvedValue([])
  })

  describe('normalizeInputFile', () => {
    it('should return undefined for empty src', async () => {
      expect(await normalizer.normalizeInputFile(null, 't.jpg')).toBeUndefined()
    })

    it('should handle Object with data and fileName', async () => {
      const buf = bytesFromUtf8('data')
      const src = { data: buf, fileName: 'test.png' }
      const result = await normalizer.normalizeInputFile(src, 'f.jpg')
      expect(result).toMatchObject({ fileName: 'test.jpg' })
    })

    it('should handle Stream in Object', async () => {
      const stream = (async function* () { yield bytesFromUtf8('chunk') })()
      const src = { data: stream, fileName: 's.bin' }
      const result = await normalizer.normalizeInputFile(src, 'f.jpg')
      expect(bytesToUtf8(result?.data as Uint8Array)).toBe('chunk')
    })

    it('should handle URL download failure', async () => {
      mediaFeature.downloadMedia.mockRejectedValue(new Error('fail'))
      const result = await normalizer.normalizeInputFile('http://e.com/1.jpg', 'f.jpg')
      expect(result).toBeUndefined()
    })

    it('should handle file type detection failure', async () => {
      (fileTypeFromBuffer as any).mockRejectedValue(new Error('type fail'))
      const buf = bytesFromUtf8('data')
      const result = await normalizer.normalizeInputFile(buf, 'test.txt')
      expect(result).toMatchObject({ fileName: 'test.txt', data: buf })
    })
  })

  describe('handleLocalOrMtcuteMedia', () => {
    it('should handle local read failure', async () => {
      readFileSpy.mockRejectedValue(new Error('no read'))
      const result = await normalizer.handleLocalOrMtcuteMedia('/local/missing.jpg', 'jpg')
      expect(result).toBe('/local/missing.jpg')
    })

    it('should handle mtcute downloader not provided', async () => {
      const mediaObj = { type: 'photo', id: '1' }
      const result = await normalizer.handleLocalOrMtcuteMedia(mediaObj, 'jpg')
      expect(result).toBeUndefined()
    })

    it('should handle mtcute empty buffer', async () => {
      const mediaObj = { type: 'photo', id: '1' }
      const downloader = mock().mockResolvedValue(new Uint8Array(0))
      const result = await normalizer.handleLocalOrMtcuteMedia(mediaObj, 'jpg', downloader)
      expect(result).toBeUndefined()
    })

    it('should handle mtcute download failure', async () => {
      const mediaObj = { type: 'photo', id: '1' }
      const downloader = mock().mockRejectedValue(new Error('crash'))
      const result = await normalizer.handleLocalOrMtcuteMedia(mediaObj, 'jpg', downloader)
      expect(result).toBeUndefined()
    })

    it('should handle image type detection during wrap', async () => {
      const buf = bytesFromUtf8('img')
      ;(fileTypeFromBuffer as any).mockResolvedValue({ ext: 'png', mime: 'image/png' } as any)
      const result = await normalizer.handleLocalOrMtcuteMedia(buf, 'jpg')
      expect(result).toEqual({ fileName: 'media.png', data: buf })
    })
  })

  describe('resolveMediaInput', () => {
    it('should handle video and audio', async () => {
      mediaFeature.processVideo.mockResolvedValue(bytesFromUtf8('vid'))
      const resVid = await normalizer.resolveMediaInput({ type: 'video', data: {} } as any)
      expect(resVid).toMatchObject({ fileName: 'media.mp4' })

      mediaFeature.processAudio.mockResolvedValue(bytesFromUtf8('aud'))
      const resAud = await normalizer.resolveMediaInput({ type: 'audio', data: {} } as any)
      expect(resAud).toMatchObject({ fileName: 'media.amr' })
    })

    it('should handle file resolution fallbacks', async () => {
      const content = { type: 'file', data: { file: '/p.zip', url: 'http://e.com/z.zip', fileId: 'fid' } } as any

      // Case 1: Local access fail, URL download success
      accessSpy.mockRejectedValue(new Error('no local'))
      mediaFeature.downloadMedia.mockResolvedValue(bytesFromUtf8('zip from url'))
      const res1 = await normalizer.resolveMediaInput(content)
      expect(bytesToUtf8(res1 as Uint8Array)).toBe('zip from url')

      // Case 2: URL download fail, fetchFileById success
      mediaFeature.downloadMedia.mockRejectedValue(new Error('no url'))
      mediaFeature.fetchFileById.mockResolvedValue({ buffer: bytesFromUtf8('zip from id') })
      const res2 = await normalizer.resolveMediaInput(content)
      expect(bytesToUtf8(res2 as Uint8Array)).toBe('zip from id')

      // Case 3: Both fail, return path
      mediaFeature.fetchFileById.mockResolvedValue(null)
      const res3 = await normalizer.resolveMediaInput(content)
      expect(res3).toBe('/p.zip')
    })

    it('should handle local file missing and fetchFileById retry', async () => {
      const content = { type: 'file', data: { file: '/missing.zip', fileId: 'fid' } } as any
      accessSpy.mockRejectedValue(new Error('no'))
      mediaFeature.fetchFileById.mockResolvedValue({ buffer: bytesFromUtf8('fetched') })
      const result = await normalizer.resolveMediaInput(content)
      expect(bytesToUtf8(result as Uint8Array)).toBe('fetched')
    })

    it('should work without media feature', async () => {
      const normNoMedia = new FileNormalizer(undefined, fileIOMocks as any)
      const content = { type: 'image', data: { url: 'http://e.com/i.jpg' } } as any
      expect(await normNoMedia.resolveMediaInput(content)).toBe('http://e.com/i.jpg')
    })
  })

  describe('isGifMedia', () => {
    it('should detect gif by mime or extension', () => {
      expect(normalizer.isGifMedia({ fileName: 'a.gif', data: new Uint8Array(0) })).toBe(true)
      expect(normalizer.isGifMedia({ fileName: 'a.jpg', data: new Uint8Array(0), fileMime: 'image/gif' })).toBe(true)
      expect(normalizer.isGifMedia({ fileName: 'a.jpg', data: new Uint8Array(0) })).toBe(false)
    })
  })

  describe('tryReadLocalWithFallback', () => {
    it('should try sequence including fuzzy matching', async () => {
      const primary = '/dir/original.jpg'

      // Fail direct read
      readFileSpy.mockRejectedValueOnce(new Error('fail 1'))

      // Mock readdir
      readdirSpy.mockResolvedValue(['original_matched.jpg'] as any)

      // Second read succeeds
      readFileSpy.mockImplementation(async (p: any) => {
        if (p === '/dir/original_matched.jpg')
          return bytesFromUtf8('found')
        throw new Error('fail')
      })

      const result = await normalizer.normalizeInputFile(primary, 'f.jpg')
      expect(bytesToUtf8(result?.data as Uint8Array)).toBe('found')
    })

    it('should return undefined if all attempts fail including fuzzy', async () => {
      const primary = '/dir/none.jpg'
      readFileSpy.mockRejectedValue(new Error('no'))
      readdirSpy.mockResolvedValue(['something_else.txt'] as any)

      const result = await normalizer.normalizeInputFile(primary, 'f.jpg')
      expect(result).toBeUndefined()
    })

    it('should handle readdir failure', async () => {
      const primary = '/dir/none.jpg'
      readFileSpy.mockRejectedValue(new Error('no'))
      readdirSpy.mockRejectedValue(new Error('readdir crash'))

      const result = await normalizer.normalizeInputFile(primary, 'f.jpg')
      expect(result).toBeUndefined()
    })
  })

  describe('ensureTelegramPhotoCompatible', () => {
    it('returns unmodified if not webp', async () => {
      const file = { fileName: 'a.jpg', data: new Uint8Array(0), fileMime: 'image/jpeg' }
      const res = await normalizer.ensureTelegramPhotoCompatible(file)
      expect(res).toBe(file)
    })

    it('falls back to ffmpeg and then preserves the original when native conversion fails', async () => {
      const file = { fileName: 'a.webp', data: new Uint8Array(0), fileMime: 'image/webp' }

      // Invalid input makes the native Transformer fail; ffmpeg is also unavailable in this unit test.
      const res = await normalizer.ensureTelegramPhotoCompatible(file)

      expect(res).toBe(file)
    }, 15_000)
  })

  describe('handleLocalOrMtcuteMedia variants', () => {
    it('wraps a bare async iterable with the default extension', async () => {
      const stream = (async function* () { yield bytesFromUtf8('chunk') })()
      const res = await normalizer.handleLocalOrMtcuteMedia(stream, 'amr')
      expect(res).toMatchObject({ fileName: 'media.amr' })
      const chunks: Uint8Array[] = []
      for await (const chunk of (res as any).data)
        chunks.push(chunk as Uint8Array)
      expect(bytesToUtf8(chunks[0])).toBe('chunk')
    })

    it('returns undefined when an mtcute Media object has no downloader', async () => {
      const media = { type: 'photo', id: 'x' }
      expect(await normalizer.handleLocalOrMtcuteMedia(media, 'jpg')).toBeUndefined()
    })

    it('downloads an mtcute Media object through the provided downloader', async () => {
      const media = { type: 'photo', id: 'x' }
      const downloader = mock().mockResolvedValue(bytesFromUtf8('photo-bytes'))
      const res = await normalizer.handleLocalOrMtcuteMedia(media, 'jpg', downloader)
      expect(downloader).toHaveBeenCalledWith(media)
      expect((res as any).data).toEqual(bytesFromUtf8('photo-bytes'))
    })

    it('reads a local path into bytes', async () => {
      const res = await normalizer.handleLocalOrMtcuteMedia('/tmp/local.jpg', 'jpg')
      expect((res as any).data).toEqual(bytesFromUtf8('dummy'))
      expect((res as any).fileName).toBe('media.jpg')
    })
  })

  describe('resolveMediaInput additional branches', () => {
    it('runs the image branch through processImage and local read', async () => {
      mediaFeature.processImage.mockResolvedValue('/tmp/pic.jpg')
      const res = await normalizer.resolveMediaInput({ type: 'image', data: {} } as any, undefined)
      expect(res).toMatchObject({ fileName: 'media.jpg' })
    })

    it('prefers a non-http url for file content', async () => {
      mediaFeature.processImage.mockReset()
      const res = await normalizer.resolveMediaInput({
        type: 'file',
        data: { url: '/tmp/napcat-file.doc' },
      } as any, undefined)
      expect(res).toBe('/tmp/napcat-file.doc')
    })

    it('falls back to the raw file field when url and fileId are absent', async () => {
      const res = await normalizer.resolveMediaInput({
        type: 'file',
        data: { file: '/tmp/fallback.doc' },
      } as any, undefined)
      expect(res).toBe('/tmp/fallback.doc')
    })

    it('uses fetchFileById after url download failure', async () => {
      mediaFeature.downloadMedia.mockRejectedValue(new Error('download boom'))
      mediaFeature.fetchFileById.mockResolvedValue({ path: '/tmp/by-id.doc' })
      const res = await normalizer.resolveMediaInput({
        type: 'file',
        data: { url: 'https://example.invalid/a.doc', fileId: 'F1' },
      } as any, undefined)
      expect(res).toBe('/tmp/by-id.doc')
    })

    it('wraps a stream file field', async () => {
      const stream = (async function* () { yield bytesFromUtf8('part') })()
      const res = await normalizer.resolveMediaInput({
        type: 'file',
        data: { file: stream, filename: 'notes.txt' },
      } as any, undefined)
      expect(res).toMatchObject({ fileName: 'notes.txt' })
    })

    it('returns data.file or data.url without a media feature', async () => {
      const bare = new FileNormalizer(undefined, fileIOMocks as any)
      expect(await bare.resolveMediaInput({ type: 'sticker', data: { file: 'f1' } } as any)).toBe('f1')
      expect(await bare.resolveMediaInput({ type: 'sticker', data: { url: 'u1' } } as any)).toBe('u1')
    })
  })

  describe('tryReadLocalWithFallback candidates', () => {
    it('reads the count-stripped candidate when the original is missing', async () => {
      fileIOMocks.readBytes.mockRejectedValueOnce(new Error('gone'))
      fileIOMocks.readBytes.mockResolvedValueOnce(bytesFromUtf8('candidate'))
      const res = await normalizer.normalizeInputFile('/tmp/photo (1).jpg', 'photo.jpg')
      expect(res).toMatchObject({ fileName: 'photo.jpg' })
    })

    it('reads the dot-stripped candidate', async () => {
      fileIOMocks.readBytes.mockRejectedValueOnce(new Error('gone'))
      fileIOMocks.readBytes.mockResolvedValueOnce(bytesFromUtf8('dot'))
      const res = await normalizer.normalizeInputFile('/tmp/clip.1.mp4', 'clip.mp4')
      expect(res).toMatchObject({ fileName: 'clip.jpg' })
      expect(bytesToUtf8((res as any).data)).toBe('dot')
    })

    it('fuzzy-matches by prefix inside the same directory', async () => {
      fileIOMocks.readBytes.mockRejectedValue(new Error('gone'))
      fileIOMocks.readdir.mockResolvedValue(['photo-final.jpg', 'other.txt'])
      fileIOMocks.readBytes.mockResolvedValueOnce(bytesFromUtf8('fuzzy'))
      const res = await normalizer.normalizeInputFile('/tmp/photo.jpg', 'photo.jpg')
      expect(res).toMatchObject({ fileName: 'photo.jpg' })
      expect(bytesToUtf8((res as any).data)).toBe('fuzzy')
    })
  })
})
