import { bytesToUtf8 } from '../../../../../shared/utils/binary.js'
import { extname, joinPath, parsePath } from '../../../../../shared/utils/path.js'
import { runtimeFileIO, spawnFileWithBun } from '@napgram/runtime-kit'
import { env } from '../../../capabilities/env.js'
import { getLogger } from '../../../capabilities/logging.js'
import { silk } from '../../../capabilities/media.js'

export interface NormalizedFile {
  fileName: string
  data: Uint8Array
  fileMime?: string
}

/**
 * Audio conversion utilities for Telegram voice messages
 * Handles OGG/Opus encoding and SILK decoding
 */
export class AudioConverter {
  private readonly logger = getLogger('AudioConverter')

  constructor(private readonly fileIO = runtimeFileIO) {}

  /**
   * Prepare voice media for Telegram (convert to OGG/Opus)
   */
  async prepareVoiceMedia(file: NormalizedFile) {
    const ogg = await this.convertAudioToOgg(file)
    if (ogg) {
      return { type: 'voice', file: ogg.data, fileName: ogg.fileName, fileMime: 'audio/ogg' }
    }

    this.logger.warn('Audio conversion failed, fallback to document upload for Telegram')
    return {
      type: 'document',
      file: file.data,
      fileName: file.fileName,
      ...(file.fileMime ? { fileMime: file.fileMime } : {}),
    }
  }

  /**
   * Convert audio file to OGG/Opus format for Telegram
   */
  async convertAudioToOgg(file: NormalizedFile): Promise<NormalizedFile | undefined> {
    const alreadyOgg = file.fileMime === 'audio/ogg' || file.fileName.toLowerCase().endsWith('.ogg')
    if (alreadyOgg) {
      return { ...file, fileName: this.ensureOggFileName(file.fileName), fileMime: 'audio/ogg' }
    }

    const header = bytesToUtf8(file.data.subarray(0, 10))
    const isSilk = header.includes('SILK_V3')

    const oggBuffer = await this.transcodeToOgg(file.data, file.fileName, isSilk)
    if (!oggBuffer)
      return undefined

    return {
      fileName: this.ensureOggFileName(file.fileName),
      data: oggBuffer,
      fileMime: 'audio/ogg',
    }
  }

  /**
   * Ensure filename has .ogg extension
   */
  ensureOggFileName(name: string) {
    const parsed = parsePath(name || 'audio')
    const base = parsed.name || 'audio'
    return `${base}.ogg`
  }

  /**
   * Transcode audio to OGG/Opus using SILK or FFmpeg
   */
  async transcodeToOgg(data: Uint8Array, sourceName: string, preferSilk?: boolean): Promise<Uint8Array | undefined> {
    const tempDir = joinPath(env.DATA_DIR, 'temp')
    await this.fileIO.mkdir(tempDir, { recursive: true })

    const inputPath = joinPath(tempDir, `tg-audio-${Date.now()}-${Math.random().toString(16).slice(2)}${extname(sourceName) || '.tmp'}`)
    const outputPath = joinPath(tempDir, `tg-audio-${Date.now()}-${Math.random().toString(16).slice(2)}.ogg`)

    await this.fileIO.write(inputPath, data)

    try {
      if (preferSilk) {
        try {
          await silk.decode(data, outputPath)
          return new Uint8Array(await this.fileIO.readBytes(outputPath))
        }
        catch (err) {
          this.logger.warn(err, 'Silk decode failed, fallback to ffmpeg')
        }
      }

      await spawnFileWithBun('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-ar',
        '48000',
        '-ac',
        '1',
        outputPath,
      ])
      return new Uint8Array(await this.fileIO.readBytes(outputPath))
    }
    catch (err) {
      this.logger.error(err, 'Audio transcode failed:')
      return undefined
    }
    finally {
      this.fileIO.unlink(inputPath).catch(() => { })
      this.fileIO.unlink(outputPath).catch(() => { })
    }
  }
}
