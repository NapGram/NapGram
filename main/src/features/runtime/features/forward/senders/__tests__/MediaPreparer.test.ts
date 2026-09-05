import { bytesFromUtf8 } from '../../../../../../shared/utils/binary.js'
import { basename, joinPath } from '../../../../../../shared/utils/path.js'
import { env } from '@napgram/env-kit'
import { silk } from '@napgram/media-kit'
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { ForwardMediaPreparer } from '../MediaPreparer.js'

const fileIOMocks = {
  readBytes: mock().mockResolvedValue(bytesFromUtf8('dummy')),
  readText: mock(),
  write: mock().mockResolvedValue(0),
  exists: mock().mockResolvedValue(true),
  access: mock().mockResolvedValue(undefined),
  mkdir: mock().mockResolvedValue(undefined),
  mkdtemp: mock(),
  stat: mock().mockResolvedValue({ size: 100 }),
  readdir: mock().mockResolvedValue([]),
  remove: mock().mockResolvedValue(undefined),
  unlink: mock().mockResolvedValue(undefined),
}

mock.module('@napgram/runtime-kit', () => ({
  runtimeFileIO: fileIOMocks,
  spawnFileWithBun: mock().mockResolvedValue({ command: [], stdout: '', stderr: '', exitCode: 0 }),
}))

mock.module('@napgram/media-kit', () => ({
  silk: {
    encode: mock(),
    decode: mock(),
  },
}))

mock.module('@napgram/env-kit', () => ({
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080',
  },
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
    trace: mock(),
  })),
}))

describe('forwardMediaPreparer', () => {
  const mockInstance = {
    tgBot: {
      downloadMedia: mock(),
      downloadMediaToTempFile: mock(),
    },
  } as any
  const mockMediaFeature = {
    downloadMedia: mock(),
  } as any

  beforeEach(() => {
    fileIOMocks.access.mockResolvedValue(undefined)
    fileIOMocks.readBytes.mockResolvedValue(bytesFromUtf8('dummy'))
    fileIOMocks.write.mockResolvedValue(0)
    fileIOMocks.mkdir.mockResolvedValue(undefined)
    fileIOMocks.stat.mockResolvedValue({ size: 100 } as any)
  })

  it('prepareMediaForQQ skip sticker', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [{ type: 'image', data: { isSticker: true, file: 'sticker' } }],
    }
    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].data.file).toBe('sticker')
  })

  it('prepareMediaForQQ handles image/video', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [
        { type: 'image', data: { file: 'img.jpg' } },
        { type: 'video', data: { file: 'vid.mp4' } },
      ],
    }
    spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue('path/to/file')
    spyOn(preparer, 'ensureFilePath').mockResolvedValue('http://example.com/file')

    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].data.file).toBe('http://example.com/file')
  })

  it('prepareMediaForQQ handles audio with silk encoding', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [{ type: 'audio', data: { file: 'aud.ogg' } }],
    }
    spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue('path/to/aud.ogg')
    spyOn(preparer, 'ensureFilePath')
      .mockResolvedValueOnce('path/to/aud.ogg') // first call inside audio block
      .mockResolvedValueOnce('http://example.com/aud.silk') // second call after encode

    ;(silk as any).encode.mockResolvedValueOnce(bytesFromUtf8('silk-data'))

    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].data.file).toBe('http://example.com/aud.silk')
  })

  it('prepareMediaForQQ falls back to file when silk encode fails', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [{ type: 'audio', data: { file: 'aud.ogg' } }],
    }
    spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue('path/to/aud.ogg')
    spyOn(preparer, 'ensureFilePath').mockResolvedValue('path/to/aud.ogg')
    ;(silk as any).encode.mockRejectedValueOnce(new Error('fail'))

    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].type).toBe('file')
    expect(msg.content[0].data.file).toBe('path/to/aud.ogg')
    expect(msg.content[0].data.filename).toBe(basename('path/to/aud.ogg'))
  })

  it('ensureBufferOrPath handles different cases', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)

    // Case 1: Already buffer
    const buf = bytesFromUtf8('data')
    expect(await preparer.ensureBufferOrPath({ data: { file: buf } } as any)).toBe(buf)

    // Case 2: Local file
    expect(await preparer.ensureBufferOrPath({ data: { file: '/local/path' } } as any)).toBe('/local/path')

    // Case 3: URL
    mockMediaFeature.downloadMedia.mockResolvedValueOnce(bytesFromUtf8('downloaded'))
    expect(await preparer.ensureBufferOrPath({ data: { file: 'http://example.com/img' } } as any)).toEqual(bytesFromUtf8('downloaded'))

    // Case 4: TG object
    mockInstance.tgBot.downloadMedia.mockResolvedValueOnce(bytesFromUtf8('tg-data'))
    expect(await preparer.ensureBufferOrPath({ data: { file: { fileId: '123' } } } as any)).toEqual(bytesFromUtf8('tg-data'))
  })

  it('prepareMediaForQQ converts failing media to text', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [{ type: 'image', data: { file: 'img.jpg' } }],
    }
    spyOn(preparer, 'ensureBufferOrPath').mockRejectedValueOnce(new Error('boom'))

    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].type).toBe('text')
    expect(msg.content[0].data.text).toBe('')
  })

  it('ensureBufferOrPath downloads when local file missing', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    fileIOMocks.access.mockRejectedValueOnce(new Error('missing'))
    mockMediaFeature.downloadMedia.mockResolvedValueOnce(bytesFromUtf8('fallback'))

    const result = await preparer.ensureBufferOrPath({ data: { file: '/missing/path' } } as any)
    expect(mockMediaFeature.downloadMedia).toHaveBeenCalledWith('/missing/path')
    expect(result).toEqual(bytesFromUtf8('fallback'))
  })

  it('waitFileStable should check file size stability', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    fileIOMocks.stat
      .mockResolvedValueOnce({ size: 10 } as any)
      .mockResolvedValueOnce({ size: 10 } as any)

    const result = await (preparer as any).waitFileStable('/some/file', 2, 1)
    expect(result).toBe(true)
  })

  it('prepareAudioSource uses wav sibling when stable', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    spyOn(preparer as any, 'waitFileStable').mockResolvedValue(true)
    const audioContent: any = { type: 'audio', data: { file: '/tmp/voice.amr' } }

    const result = await preparer.prepareAudioSource(audioContent)
    expect(result).toBe('/tmp/voice.amr.wav')
  })

  it('convertAudioToOgg detects SILK header in buffer', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const silkBuf = bytesFromUtf8('#!SILK_V3x')

    await preparer.convertAudioToOgg(silkBuf)
    expect(silk.decode).toHaveBeenCalled()
  })

  it('ensureFilePath returns web endpoint url or local path', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const buf = bytesFromUtf8('data')

    const url = await preparer.ensureFilePath(buf, '.txt')
    expect(url).toContain(env.WEB_ENDPOINT)

    const local = await preparer.ensureFilePath(buf, '.txt', true)
    expect(String(local)).toContain(joinPath(env.DATA_DIR, 'temp'))
  })

  it('ensureBufferOrPath supports TG download to temp file when prefer path', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    mockInstance.tgBot.downloadMediaToTempFile.mockResolvedValueOnce('/tmp/file.png')

    const result = await preparer.ensureBufferOrPath(
      { data: { file: { fileId: '123' } } } as any,
      { prefer: 'path', prefix: 'tg-image', ext: '.png' },
    )

    expect(result).toBe('/tmp/file.png')
    expect(mockInstance.tgBot.downloadMediaToTempFile).toHaveBeenCalled()
  })
})
