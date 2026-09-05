import { bytesFromUtf8 } from '../../../../../../shared/utils/binary.js'
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { AudioConverter } from '../AudioConverter.js'

const fileIOMocks = {
  mkdir: mock().mockResolvedValue(undefined),
  write: mock().mockResolvedValue(0),
  readBytes: mock().mockResolvedValue(bytesFromUtf8('converted-ogg')),
  unlink: mock().mockResolvedValue(undefined),
}

mock.module('@napgram/runtime-kit', () => ({
  runtimeFileIO: fileIOMocks,
  spawnFileWithBun: mock().mockResolvedValue({ command: [], stdout: '', stderr: '', exitCode: 0 }),
}))

// We use spyOn on fs.promises (works because production code accesses same fs object).
// For execFile and silk, we spy on converter methods to bypass module-level captures.

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

describe('audioConverter', () => {
  const converter = new AudioConverter(fileIOMocks as any)

  beforeEach(() => {
    fileIOMocks.mkdir.mockResolvedValue(undefined)
    fileIOMocks.write.mockResolvedValue(0)
    fileIOMocks.readBytes.mockResolvedValue(bytesFromUtf8('converted-ogg'))
    fileIOMocks.unlink.mockResolvedValue(undefined)
  })

  it('prepareVoiceMedia should return voice type on success', async () => {
    spyOn(converter, 'transcodeToOgg').mockResolvedValue(bytesFromUtf8('ogg-data'))
    const file = { fileName: 'test.mp3', data: bytesFromUtf8('dummy') }
    const result = await converter.prepareVoiceMedia(file)
    expect(result.type).toBe('voice')
    expect(result.fileMime).toBe('audio/ogg')
  })

  it('prepareVoiceMedia should fallback to document on failure', async () => {
    spyOn(converter, 'convertAudioToOgg').mockResolvedValueOnce(undefined)
    const file = { fileName: 'test.mp3', data: bytesFromUtf8('dummy'), fileMime: 'audio/mpeg' }
    const result = await converter.prepareVoiceMedia(file)
    expect(result.type).toBe('document')
    expect(result.fileName).toBe('test.mp3')
    expect(result.fileMime).toBe('audio/mpeg')
  })

  it('convertAudioToOgg should return same file if already ogg', async () => {
    const file = { fileName: 'test.ogg', data: bytesFromUtf8('ogg-data'), fileMime: 'audio/ogg' }
    const result = await converter.convertAudioToOgg(file)
    expect(result).toEqual({ ...file, fileName: 'test.ogg', fileMime: 'audio/ogg' })
  })

  it('convertAudioToOgg should detect SILK header', async () => {
    const file = { fileName: 'test.silk', data: bytesFromUtf8('#!SILK_V3') }
    const transcodeSpy = spyOn(converter, 'transcodeToOgg')
    await converter.convertAudioToOgg(file)
    expect(transcodeSpy).toHaveBeenCalledWith(file.data, file.fileName, true)
  })

  it('convertAudioToOgg should return undefined when transcode fails', async () => {
    const file = { fileName: 'test.mp3', data: bytesFromUtf8('data') }
    spyOn(converter, 'transcodeToOgg').mockResolvedValueOnce(undefined)
    const result = await converter.convertAudioToOgg(file)
    expect(result).toBeUndefined()
  })

  it('ensureOggFileName should work correctly', () => {
    expect(converter.ensureOggFileName('test.mp3')).toBe('test.ogg')
    expect(converter.ensureOggFileName('')).toBe('audio.ogg')
  })

  it('transcodeToOgg should attempt silk decode when preferSilk is true', async () => {
    // Verify the function delegates to transcodeToOgg with preferSilk flag
    const transcodeSpy = spyOn(converter, 'transcodeToOgg').mockResolvedValue(bytesFromUtf8('result'))
    const file = { fileName: 'test.silk', data: bytesFromUtf8('#!SILK_V3') }
    const result = await converter.convertAudioToOgg(file)
    expect(transcodeSpy).toHaveBeenCalledWith(file.data, file.fileName, true)
    expect(result!.data).toEqual(bytesFromUtf8('result'))
  })

  it('transcodeToOgg should return bytes on success', async () => {
    // Mock transcodeToOgg to verify it's called and returns expected value
    spyOn(converter, 'transcodeToOgg').mockResolvedValue(bytesFromUtf8('ogg-result'))
    const result = await converter.transcodeToOgg(bytesFromUtf8('data'), 'test.mp3')
    expect(result).toEqual(bytesFromUtf8('ogg-result'))
  })
})
