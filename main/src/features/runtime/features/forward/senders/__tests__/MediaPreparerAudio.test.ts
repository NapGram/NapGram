import { bytesFromUtf8 } from '../../../../../../shared/utils/binary.js'
import { joinPath } from '../../../../../../shared/utils/path.js'
import { env } from '@napgram/env-kit'
import { silk } from '@napgram/media-kit'
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { ForwardMediaPreparer } from '../MediaPreparer.js'

const spawnFileMock = mock()

const runtimeFileIO = {
  readBytes: async (filePath: string) => await Bun.file(filePath).bytes(),
  readText: async (filePath: string) => await Bun.file(filePath).text(),
  write: async (filePath: string, data: any) => await Bun.write(filePath, data),
  exists: async (filePath: string) => await Bun.file(filePath).exists(),
  access: async (filePath: string) => {
    if (!await Bun.file(filePath).exists())
      throw new Error(`Missing file: ${filePath}`)
  },
  mkdir: async (filePath: string) => {
    await Bun.$`mkdir -p ${filePath}`
  },
  mkdtemp: async (prefix: string) => (await Bun.$`mktemp -d ${prefix}XXXXXX`).text().then(value => value.trim()),
  stat: async (filePath: string) => ({ size: Bun.file(filePath).size }),
  readdir: async (filePath: string) => [...new Bun.Glob('*').scanSync({ cwd: filePath })],
  remove: async (filePath: string) => {
    await Bun.$`rm -rf ${filePath}`
  },
  unlink: async (filePath: string) => {
    await Bun.$`rm -f ${filePath}`
  },
}

mock.module('@napgram/runtime-kit', () => ({
  runtimeFileIO,
  spawnFileWithBun: spawnFileMock,
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

describe('forwardMediaPreparer audio', () => {
  const instance = {
    tgBot: {
      downloadMedia: mock(),
      downloadMediaToTempFile: mock(),
    },
  }
  const media = {
    downloadMedia: mock(),
  }

  const silkMock = silk as any

  beforeEach(() => {
    spawnFileMock.mockResolvedValue({ command: [], stdout: '', stderr: '', exitCode: 0 })
  })

  it('encodes audio to silk and updates content', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    const ensureBufferSpy = spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue(bytesFromUtf8('ogg'))
    const ensureFileSpy = spyOn(preparer, 'ensureFilePath')
      .mockResolvedValueOnce('/tmp/audio.ogg')
      .mockResolvedValueOnce('http://example.com/audio.silk')

    silkMock.encode.mockResolvedValueOnce(bytesFromUtf8('silk-data'))

    const msg: any = {
      id: '1',
      platform: 'telegram',
      sender: { id: 'u1', name: 'User' },
      chat: { id: 'c1', type: 'group' },
      content: [{ type: 'audio', data: { file: 'x' } }],
      timestamp: Date.now(),
    }

    await preparer.prepareMediaForQQ(msg)

    expect(ensureBufferSpy).toHaveBeenCalled()
    expect(ensureFileSpy).toHaveBeenCalledTimes(2)
    expect(silkMock.encode).toHaveBeenCalledWith('/tmp/audio.ogg')
    expect(msg.content[0].data.file).toBe('http://example.com/audio.silk')
  })

  it('falls back to file when silk encode fails', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue(bytesFromUtf8('ogg'))
    spyOn(preparer, 'ensureFilePath').mockResolvedValueOnce('/tmp/audio.ogg')

    silkMock.encode.mockRejectedValueOnce(new Error('encode failed'))

    const msg: any = {
      id: '2',
      platform: 'telegram',
      sender: { id: 'u1', name: 'User' },
      chat: { id: 'c1', type: 'group' },
      content: [{ type: 'audio', data: { file: 'x' } }],
      timestamp: Date.now(),
    }

    await preparer.prepareMediaForQQ(msg)

    expect(msg.content[0].type).toBe('file')
    expect(msg.content[0].data.file).toBe('/tmp/audio.ogg')
    expect(msg.content[0].data.filename).toBe('audio.ogg')
  })

  it('uses silk decode when buffer has SILK header', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    const buffer = bytesFromUtf8('#!SILK_V3xx')

    const result = await preparer.convertAudioToOgg(buffer)

    expect(silkMock.decode).toHaveBeenCalled()
    expect(spawnFileMock).not.toHaveBeenCalled()
    expect(result.voicePath).toContain('.ogg')
  })

  it('returns fallback path when ffmpeg and silk decode fail', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    spawnFileMock.mockRejectedValueOnce(new Error('ffmpeg failed'))
    silkMock.decode.mockRejectedValueOnce(new Error('silk failed'))

    const result = await preparer.convertAudioToOgg(bytesFromUtf8('no-silk-data'))

    expect(result.voicePath).toBeUndefined()
    expect(result.fallbackPath).toBeTruthy()

    if (result.fallbackPath) {
      const expectedDir = joinPath(env.DATA_DIR, 'temp')
      expect(result.fallbackPath.startsWith(expectedDir)).toBe(true)
      await runtimeFileIO.unlink(result.fallbackPath)
    }
  })
})
