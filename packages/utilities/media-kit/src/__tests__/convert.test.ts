import { beforeAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

const bytes = (value: string) => new TextEncoder().encode(value)

let convert: typeof import('../convert.js').default

const fileIOMocks = {
  readBytes: mock().mockResolvedValue(bytes('cached')),
  readText: mock(),
  write: mock().mockResolvedValue(0),
  exists: mock().mockResolvedValue(false),
  access: mock(),
  mkdir: mock().mockResolvedValue(undefined),
  mkdtemp: mock(),
  stat: mock().mockResolvedValue({ size: 10 }),
  readdir: mock(),
  remove: mock().mockResolvedValue(undefined),
  unlink: mock().mockResolvedValue(undefined),
}

const envMock = (() => ({
  env: {
    CACHE_DIR: '/cache',
    DATA_DIR: '/data',
  }
}))()

const loggerMocks = (() => ({
  debug: mock(),
  info: mock(),
  warn: mock(),
  error: mock(),
}))()

const fileTypeMocks = (() => ({
  fileTypeFromBuffer: mock(),
}))()

const nativeImageMocks = {
  constructor: mock(),
  metadataSync: mock().mockReturnValue({ width: 100, height: 100 }),
  resize: mock(),
  png: mock().mockResolvedValue(bytes('png')),
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

  png() {
    return nativeImageMocks.png()
  }
}

const ffmpegMocks = (() => ({
  convertWithFfmpeg: mock().mockResolvedValue(undefined),
}))()

const tgsMocks = (() => ({
  tgsToGif: mock().mockResolvedValue(undefined),
}))()

const tempMocks = (() => ({
  file: mock(),
}))()

mock.module('../bun-file-io.js', () => ({
  runtimeFileIO: fileIOMocks,
}))

mock.module('file-type', () => ({
  fileTypeFromBuffer: fileTypeMocks.fileTypeFromBuffer,
}))

mock.module('@napi-rs/image', () => ({
  Transformer: TransformerMock,
  ResizeFit: { Fill: 1 },
}))

mock.module('../shared-runtime.js', () => ({
  env: envMock.env,
  getLogger: mock(() => loggerMocks),
  temp: {
    file: tempMocks.file,
    createTempFile: tempMocks.file,
  },
}))

mock.module('@napgram/infra-kit', () => ({
  env: envMock.env,
  getLogger: mock(() => loggerMocks),
  temp: {
    file: tempMocks.file,
    createTempFile: tempMocks.file
  }
}))

mock.module('@napgram/env-kit', () => ({
  env: envMock.env,
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => loggerMocks),
}))

mock.module('../encoding/convertWithFfmpeg', () => ({
  default: ffmpegMocks.convertWithFfmpeg,
}))

mock.module('../encoding/tgsToGif', () => ({
  default: tgsMocks.tgsToGif,
}))



beforeAll(async () => {
  ({ default: convert } = await import('../convert.js'))
})

describe('convert', () => {
  beforeEach(() => {
    mock.clearAllMocks()
    mock.restore()
    fileIOMocks.exists.mockReturnValue(false)
    fileIOMocks.readBytes.mockResolvedValue(bytes('cached'))
  })

  it('caches conversion when missing', async () => {
    const handler = mock().mockResolvedValue(undefined)
    const result = await convert.cached('item', handler)

    expect(handler).toHaveBeenCalledWith('/cache/item')
    expect(result).toBe('/cache/item')
  })

  it('returns cached path when already exists', async () => {
    fileIOMocks.exists.mockReturnValue(true)
    const handler = mock()

    const result = await convert.cached('item', handler)

    expect(handler).not.toHaveBeenCalled()
    expect(result).toBe('/cache/item')
  })

  it('writes cached buffer to disk', async () => {
    await convert.cachedBuffer('buffer', async () => bytes('data'))

    expect(fileIOMocks.write).toHaveBeenCalledWith('/cache/buffer', expect.any(Uint8Array))
  })

  it('converts webp to png with the native image transformer', async () => {
    const result = await convert.png('image', async () => bytes('webp'))

    expect(result).toBe('/cache/image.png')
    expect(nativeImageMocks.constructor).toHaveBeenCalledWith(expect.any(Uint8Array))
    expect(nativeImageMocks.png).toHaveBeenCalled()
  })

  it('converts video to gif using temp file and ffmpeg', async () => {
    const cleanup = mock().mockResolvedValue(undefined)
    tempMocks.file.mockResolvedValue({ path: '/tmp/video', cleanup })

    const result = await convert.video2gif('video', async () => bytes('webm'), true)

    expect(result).toBe('/cache/video.gif')
    expect(fileIOMocks.write).toHaveBeenCalledWith('/tmp/video', expect.any(Uint8Array))
    expect(ffmpegMocks.convertWithFfmpeg).toHaveBeenCalledWith('/tmp/video', '/cache/video.gif', 'gif', 'libvpx-vp9')
    expect(cleanup).toHaveBeenCalled()
  })

  it('converts video to gif with default codec', async () => {
    const cleanup = mock().mockResolvedValue(undefined)
    tempMocks.file.mockResolvedValue({ path: '/tmp/video-default', cleanup })

    const result = await convert.video2gif('video-default', async () => bytes('webm'), false)

    expect(result).toBe('/cache/video-default.gif')
    expect(ffmpegMocks.convertWithFfmpeg).toHaveBeenCalledWith('/tmp/video-default', '/cache/video-default.gif', 'gif', undefined)
    expect(cleanup).toHaveBeenCalled()
  })
  it('converts TGS buffer to gif and cleans up temp file', async () => {
    spyOn(Date, 'now').mockReturnValue(1700000000000)
    spyOn(Math, 'random').mockReturnValue(0.123456)

    const result = await convert.tgs2gif('sticker', async () => new Uint8Array([1, 2, 3]))

    expect(result).toBe('/cache/sticker.gif')
    expect(fileIOMocks.mkdir).toHaveBeenCalledWith('/data/temp', { recursive: true })
    expect(fileIOMocks.write).toHaveBeenCalledWith(expect.stringContaining('/data/temp/sticker-'), expect.any(Uint8Array))
    expect(tgsMocks.tgsToGif).toHaveBeenCalled()
    expect(fileIOMocks.unlink).toHaveBeenCalled()
  })

  it('converts TGS file path directly', async () => {
    const result = await convert.tgs2gif('sticker', async () => '/tmp/file.tgs')

    expect(result).toBe('/cache/sticker.gif')
    expect(tgsMocks.tgsToGif).toHaveBeenCalledWith('/tmp/file.tgs', '/cache/sticker.gif')
  })

  it('chooses webm conversion for gif input', async () => {
    const cachedSpy = spyOn(convert, 'cachedBuffer').mockResolvedValue('/cache/key')
    const webmSpy = spyOn(convert, 'webm').mockResolvedValue('/cache/key.webm')
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'image/gif' })

    const result = await convert.webpOrWebm('key', async () => bytes('gif'))

    expect(cachedSpy).toHaveBeenCalled()
    expect(webmSpy).toHaveBeenCalledWith('key', '/cache/key')
    expect(result).toBe('/cache/key.webm')
  })

  it('chooses png conversion for non-gif input', async () => {
    const cachedSpy = spyOn(convert, 'cachedBuffer').mockResolvedValue('/cache/key')
    const webpSpy = spyOn(convert, 'webp').mockImplementation(async (_key, imageData) => {
      await imageData()
      return '/cache/key.png'
    })
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'image/png' })

    const result = await convert.webpOrWebm('key', async () => bytes('png'))

    expect(cachedSpy).toHaveBeenCalled()
    expect(webpSpy).toHaveBeenCalled()
    expect(result).toBe('/cache/key.png')
  })

  it('returns cached custom emoji when small size already exists', async () => {
    fileIOMocks.exists.mockImplementation(path => path === '/cache/emoji@50.png')

    const result = await convert.customEmoji('emoji', async () => bytes('data'), true)

    expect(result).toBe('/cache/emoji@50.png')
  })

  it('tgs2gif handles conversion failure', async () => {
    tgsMocks.tgsToGif.mockRejectedValueOnce(new Error('Conversion failed'))
    // Spy on logger
    const loggerSpy = loggerMocks.error

    await expect(convert.tgs2gif('fail', async () => bytes('tgs'))).rejects.toThrow('Conversion failed')
    expect(loggerSpy).toHaveBeenCalled()
  })

  it('tgs2gif logs non-error failures', async () => {
    tgsMocks.tgsToGif.mockRejectedValueOnce('bad')

    await expect(convert.tgs2gif('fail-str', async () => bytes('tgs'))).rejects.toBe('bad')

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.stringContaining('[tgs2gif] Error details:'),
    )
  })

  it('tgs2gif throws if output file missing', async () => {
    // fs stat fails (default mock return value is {size: 10}, need to override)
    fileIOMocks.stat.mockRejectedValueOnce(new Error('no ent'))

    await expect(convert.tgs2gif('missing', async () => bytes('tgs'))).rejects.toThrow('TGS to GIF conversion produced no output file')
  })

  it('tgs2gif handles unsupported source', async () => {
    await expect(convert.tgs2gif('bad', async () => 123 as any)).rejects.toThrow('Unsupported sticker source type')
  })

  it('customEmoji generates small size from png', async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'image/png' })

    const res = await convert.customEmoji('e1', async () => bytes('png'), true)
    expect(res).toBe('/cache/e1@50.png')
    expect(nativeImageMocks.resize).toHaveBeenCalledWith(50, 50, undefined, 1)
    expect(nativeImageMocks.png).toHaveBeenCalled()
  })

  it('customEmoji returns original size when not using small size', async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'image/png' })

    const res = await convert.customEmoji('e_full', async () => bytes('png'), false)

    expect(res).toBe('/cache/e_full.png')
    expect(nativeImageMocks.constructor).toHaveBeenCalled()
    expect(nativeImageMocks.png).toHaveBeenCalled()
  })

  it('customEmoji falls back to default image type when fileType is missing', async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue(undefined)

    const res = await convert.customEmoji('e_fallback', async () => bytes('png'), false)

    expect(res).toBe('/cache/e_fallback.png')
    expect(nativeImageMocks.png).toHaveBeenCalled()
  })

  it('customEmoji returns gif when non-image and not using small size', async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'application/octet-stream' })

    const res = await convert.customEmoji('e_full_gif', async () => bytes('tgs'), false)

    expect(res).toBe('/cache/e_full_gif.gif')
  })

  it('customEmoji generates small size from gif (tgs fallback)', async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'application/octet-stream' })
    tgsMocks.tgsToGif.mockResolvedValue('/cache/e2.gif')

    const res = await convert.customEmoji('e2', async () => bytes('tgs'), true)

    expect(res).toBe('/cache/e2@50.gif')
    expect(ffmpegMocks.convertWithFfmpeg).toHaveBeenCalledWith('/cache/e2.gif', '/cache/e2@50.gif', 'gif', undefined, 'scale=50:-1')
  })

  it('normalizes webp input to PNG for Telegram photo compatibility', async () => {
    const res = await convert.webp('w1', async () => bytes('webp'))

    expect(res).toBe('/cache/w1.png')
    expect(nativeImageMocks.constructor).toHaveBeenCalledWith(expect.any(Uint8Array))
    expect(nativeImageMocks.png).toHaveBeenCalled()
  })

  it('converts webm', async () => {
    // ffmpeg call
    const res = await convert.webm('wb1', '/tmp/in.webm')
    expect(res).toBe('/cache/wb1.webm')
    expect(ffmpegMocks.convertWithFfmpeg).toHaveBeenCalledWith('/tmp/in.webm', '/cache/wb1.webm', 'webm')
  })

  it('customEmoji returns existing normal size', async () => {
    fileIOMocks.exists.mockImplementation((p: string) => p === '/cache/e_exist.png')
    const res = await convert.customEmoji('e_exist', async () => bytes(''), false)
    expect(res).toBe('/cache/e_exist.png')
  })

  it('customEmoji returns existing normal size GIF', async () => {
    fileIOMocks.exists.mockImplementation((p: string) => p === '/cache/e_exist_gif.gif')
    const res = await convert.customEmoji('e_exist_gif', async () => bytes(''), false)
    expect(res).toBe('/cache/e_exist_gif.gif')
  })

  it('customEmoji returns existing small size GIF', async () => {
    fileIOMocks.exists.mockImplementation((p: string) => p === '/cache/e_small_gif@50.gif')
    const res = await convert.customEmoji('e_small_gif', async () => bytes(''), true)
    expect(res).toBe('/cache/e_small_gif@50.gif')
  })

  it('tgs2gif throws on direct file conversion failure', async () => {
    tgsMocks.tgsToGif.mockRejectedValueOnce(new Error('Direct fail'))
    // Input is string path ending in .tgs
    await expect(convert.tgs2gif('key', async () => '/path/to.tgs')).rejects.toThrow('Direct fail')
  })

  it('tgs2gif warns on cleanup failure', async () => {
    // fs unlink fails
    fileIOMocks.unlink.mockRejectedValueOnce(new Error('unlink failed'))

    await convert.tgs2gif('cleanup_fail', async () => bytes('tgs'))

    expect(loggerMocks.warn).toHaveBeenCalledWith(expect.any(Error), '[tgs2gif] Failed to cleanup temp TGS file')
  })
})
