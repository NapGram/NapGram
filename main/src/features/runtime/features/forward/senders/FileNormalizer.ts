import type { MessageContent } from '@napgram/message-kit'
import type { MediaFeature } from '../../MediaFeature.js'
import { concatBytes } from '../../../../../shared/utils/binary.js'
import { basename, joinPath, parsePath } from '../../../../../shared/utils/path.js'
import { convertWithFfmpeg } from '@napgram/media-kit'
import { runtimeFileIO } from '@napgram/runtime-kit'
import { Transformer } from '@napi-rs/image'
import { fileTypeFromBuffer } from 'file-type'
import { getLogger } from '../../../capabilities/logging.js'
import { temp } from '../../../capabilities/temp.js'
function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value && typeof (value as any)[Symbol.asyncIterator] === 'function')
}

export interface NormalizedFile {
  fileName: string
  data: Uint8Array
  fileMime?: string
}

/**
 * File normalization and handling utilities
 * Converts various file sources (Uint8Array, async iterable, URL, path) to normalized format
 */
export class FileNormalizer {
  private readonly logger = getLogger('FileNormalizer')

  constructor(private readonly media?: MediaFeature, private readonly fileIO = runtimeFileIO) { }

  /**
   * Normalize input file from various sources to Uint8Array with metadata
   */
  async normalizeInputFile(src: any, fallbackName: string): Promise<NormalizedFile | undefined> {
    if (!src)
      return undefined

    let data: Uint8Array | undefined
    let fileName = basename(fallbackName || 'file') || 'file'
    let fileMime: string | undefined

    if ((src as any).data && (src as any).fileName) {
      fileName = basename((src as any).fileName || fileName)
      if ((src as any).data instanceof Uint8Array) {
        data = (src as any).data
      }
      else if (isAsyncIterable((src as any).data)) {
        data = await this.streamToBuffer((src as any).data as AsyncIterable<unknown>)
      }
    }
    else if (src instanceof Uint8Array) {
      data = src
    }
    else if (typeof src === 'string') {
      if (src.startsWith('/')) {
        ({ data, fileName } = await this.tryReadLocalWithFallback(src, fileName) || { data, fileName })
        if (!data)
          return undefined
      }
      else if (/^https?:\/\//.test(src) && this.media) {
        try {
          data = await this.media.downloadMedia(src)
        }
        catch (err) {
          this.logger.warn(err, 'Failed to download media from url:')
          return undefined
        }
      }
    }
    else if (isAsyncIterable(src)) {
      data = await this.streamToBuffer(src)
    }

    if (!data)
      return undefined

    try {
      const type = await fileTypeFromBuffer(data)
      if (type?.ext) {
        const base = parsePath(fileName).name || 'file'
        fileName = `${base}.${type.ext}`
      }
      fileMime = type?.mime
    }
    catch (err) {
      this.logger.debug(err, 'File type detection failed:')
    }

    return { fileName, data, fileMime }
  }

  /**
   * Handle local files and mtcute Media objects
   * Converts to Uint8Array if needed
   */
  async handleLocalOrMtcuteMedia(fileSrc: any, defaultExt: string, tgBotDownloader?: (media: any) => Promise<Uint8Array>) {
    if (typeof fileSrc === 'string' && fileSrc.startsWith('/')) {
      try {
        fileSrc = new Uint8Array(await this.fileIO.readBytes(fileSrc))
      }
      catch (e) {
        this.logger.warn(e, 'Failed to read local image file, keeping as path:')
      }
    }

    if (fileSrc && typeof fileSrc === 'object' && 'type' in fileSrc && !(fileSrc instanceof Uint8Array) && !isAsyncIterable(fileSrc)) {
      if (!tgBotDownloader) {
        this.logger.warn('Cannot download mtcute Media object: downloader not provided')
        return undefined
      }
      try {
        this.logger.debug(`Detected mtcute Media object (type=${fileSrc.type}), downloading...`)
        const buffer = await tgBotDownloader(fileSrc)
        if (buffer && buffer.length > 0) {
          fileSrc = buffer as Uint8Array
          this.logger.debug(`Downloaded media buffer size: ${buffer.length}`)
        }
        else {
          this.logger.warn('Downloaded buffer is empty')
          fileSrc = undefined
        }
      }
      catch (e) {
        this.logger.warn(e, 'Failed to download mtcute Media object:')
        fileSrc = undefined
      }
    }

    if (isAsyncIterable(fileSrc)) {
      fileSrc = { fileName: `media.${defaultExt}`, data: fileSrc }
    }
    else if (fileSrc instanceof Uint8Array) {
      let ext = defaultExt
      if (defaultExt === 'jpg') {
        const type = await fileTypeFromBuffer(fileSrc)
        ext = type?.ext || 'jpg'
        this.logger.debug(`Detected image type: ${ext}, mime: ${type?.mime}`)
      }
      fileSrc = { fileName: `media.${ext}`, data: fileSrc }
    }

    return fileSrc
  }

  /**
   * Resolve media input from MessageContent using MediaFeature
   */
  async resolveMediaInput(content: MessageContent, tgBotDownloader?: (media: any) => Promise<Uint8Array>): Promise<any> {
    if (!this.media)
      return (content as any).data?.file || (content as any).data?.url

    let fileSrc: any

    if (content.type === 'image') {
      fileSrc = await this.media.processImage(content as any)
      fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'jpg', tgBotDownloader)
    }
    else if (content.type === 'video') {
      fileSrc = await this.media.processVideo(content as any)
      fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'mp4', tgBotDownloader)
    }
    else if (content.type === 'audio') {
      fileSrc = await this.media.processAudio(content as any)
      fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'amr', tgBotDownloader)
    }
    else if (content.type === 'file') {
      const file = content as any
      const fileId = file.data.fileId || file.data.file_id
      const fileName = file.data.filename || 'file'
      const originalLocal = file.data.file

      // 优先本地可读路径（已挂载 temp 卷时可命中）
      if (file.data.file && typeof file.data.file === 'string' && file.data.file.startsWith('/')) {
        try {
          await this.fileIO.access(file.data.file)
          fileSrc = file.data.file
        }
        catch {
          // ignore, fallback to url/file_id below
        }
      }

      // 优先远程 URL（NapCat raw_message 中的真实链接）
      if (!fileSrc && file.data.url) {
        if (/^https?:\/\//.test(file.data.url)) {
          try {
            fileSrc = await this.media.downloadMedia(file.data.url)
          }
          catch (err) {
            this.logger.warn(err, `Failed to download file via url=${file.data.url}, try next fallback`)
          }
        }
        else {
          fileSrc = file.data.url // 可能是本地路径
        }
      }

      // 次选：NapCat file_id 直取（get_file）
      if (!fileSrc && fileId && this.media?.fetchFileById) {
        const fetched = await this.media.fetchFileById(fileId)
        if (fetched) {
          fileSrc = fetched.buffer || fetched.path || fetched.url
        }
        else {
          this.logger.warn(`fetchFileById returned empty for fileId=${fileId}`)
        }
      }

      // 退回：file 字段（可能是本地路径）
      if (!fileSrc && file.data.file) {
        fileSrc = file.data.file
      }

      // 本地路径不可读时，再尝试 NapCat get_file/file_id 兜底
      if (typeof fileSrc === 'string' && fileSrc.startsWith('/') && fileId && this.media?.fetchFileById) {
        try {
          await this.fileIO.access(fileSrc)
        }
        catch {
          this.logger.warn(`Local file missing, try fetchFileById. path=${fileSrc}, fileId=${fileId}`)
          const fetched = await this.media.fetchFileById(fileId)
          if (fetched) {
            fileSrc = fetched.buffer || fetched.path || fetched.url || fileSrc
          }
          else {
            this.logger.warn(`fetchFileById returned empty for fileId=${fileId}`)
          }
        }
      }

      // 如果远程/兜底依然失败，保留原始本地路径作为最后尝试
      if (!fileSrc && originalLocal) {
        fileSrc = originalLocal
      }

      // 包装流
      if (isAsyncIterable(fileSrc)) {
        fileSrc = { fileName, data: fileSrc }
      }
    }
    else {
      fileSrc = (content as any).data?.file || (content as any).data?.url
    }

    return fileSrc
  }

  /**
   * Check if media is GIF format
   */
  isGifMedia(file: NormalizedFile): boolean {
    return file.fileMime === 'image/gif' || file.fileName.toLowerCase().endsWith('.gif')
  }

  /**
   * Ensure Telegram photo compatibility (webp -> png)
   */
  async ensureTelegramPhotoCompatible(file: NormalizedFile): Promise<NormalizedFile> {
    const isWebp = file.fileMime === 'image/webp' || file.fileName.toLowerCase().endsWith('.webp')
    if (!isWebp) {
      return file
    }

    try {
      const image = new Transformer(file.data)
      const buffer = await image.png()
      const base = parsePath(file.fileName).name || 'image'
      return {
        fileName: `${base}.png`,
        data: buffer,
        fileMime: 'image/png',
      }
    }
    catch (err) {
      this.logger.debug(err, 'Native WebP conversion failed, try ffmpeg:')
    }

    const base = parsePath(file.fileName).name || 'image'
    const input = await temp.createTempFile({ postfix: '.webp' })
    const output = await temp.createTempFile({ postfix: '.png' })
    try {
      await this.fileIO.write(input.path, file.data)
      await convertWithFfmpeg(input.path, output.path, 'png')
      const buffer = new Uint8Array(await this.fileIO.readBytes(output.path))
      if (buffer.length > 0) {
        return {
          fileName: `${base}.png`,
          data: buffer,
          fileMime: 'image/png',
        }
      }
    }
    catch (err) {
      this.logger.warn(err, 'ffmpeg webp convert failed, keep original:')
    }
    finally {
      await input.cleanup()
      await output.cleanup()
    }

    return file
  }

  /**
   * Convert stream to buffer
   */
  async streamToBuffer(stream: AsyncIterable<unknown>): Promise<Uint8Array> {
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk instanceof Uint8Array ? chunk : typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk as ArrayBuffer))
    }
    return concatBytes(...chunks)
  }

  /**
   * 尝试读取本地文件，如果不存在则根据常见 NapCat 临时文件命名（去除 .数字 / (数字) 后缀）和同目录模糊匹配读取
   */
  private async tryReadLocalWithFallback(src: string, fallbackName: string): Promise<{ data: Uint8Array, fileName: string } | undefined> {
    const candidates: string[] = []
    candidates.push(src)

    const parsed = parsePath(src)
    const baseNoCount = parsed.name.replace(/\s*\(\d+\)$/, '').replace(/\.\d+$/, '')
    if (baseNoCount !== parsed.name) {
      candidates.push(joinPath(parsed.dir, `${baseNoCount}${parsed.ext}`))
      candidates.push(joinPath(parsed.dir, baseNoCount))
    }

    // 去除多余的 .数字 结尾
    const strippedDot = parsed.name.replace(/\.\d+$/, '')
    if (strippedDot !== parsed.name) {
      candidates.push(joinPath(parsed.dir, `${strippedDot}${parsed.ext}`))
    }

    // 尝试候选列表
    for (const p of candidates) {
      if (!p)
        continue
      try {
        const buf = new Uint8Array(await this.fileIO.readBytes(p))
        return { data: buf, fileName: basename(p) || fallbackName }
      }
      catch {
        // continue
      }
    }

    // 最后尝试同目录模糊匹配：找到前缀相同的文件
    try {
      const files = await this.fileIO.readdir(parsed.dir)
      const match = files.find((f: string) => f.startsWith(baseNoCount))
      if (match) {
        const full = joinPath(parsed.dir, match)
        const buf = new Uint8Array(await this.fileIO.readBytes(full))
        return { data: buf, fileName: basename(full) || fallbackName }
      }
    }
    catch (e) {
      this.logger.warn(e, `Local media not accessible: ${src}`)
    }

    this.logger.warn(`Local media not accessible after fallback: ${src}`)
    return undefined
  }
}
