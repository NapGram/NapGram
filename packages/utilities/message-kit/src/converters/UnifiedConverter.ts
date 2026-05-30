import type { MessageContent, UnifiedMessage } from '../types.js'
import { Buffer } from 'node:buffer'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '../shared-runtime.js'
import { BaseConverter } from './BaseConverter.js'

export class UnifiedConverter extends BaseConverter {
  /**
   * 统一格式转换为 NapCat 格式
   */
  async toNapCat(message: UnifiedMessage): Promise<any[]> {
    const segments: any[] = []

    for (const content of message.content) {
      switch (content.type) {
        case 'text':
          segments.push({
            type: 'text',
            data: { text: content.data.text },
          })
          break

        case 'image':
          {
            let file = content.data.url || content.data.file
            if (Buffer.isBuffer(file)) {
              file = await this.saveBufferToTemp(file, 'image', '.jpg')
            }
            segments.push({
              type: 'image',
              data: {
                file,
                sub_type: content.data.isSpoiler ? 7 : 0,
              },
            })
          }
          break

        case 'video':
          {
            let file = content.data.url || content.data.file
            if (Buffer.isBuffer(file)) {
              file = await this.saveBufferToTemp(file, 'video', '.mp4')
            }
            segments.push({
              type: 'video',
              data: {
                file,
              },
            })
          }
          break

        case 'audio':
          {
            let file = content.data.url || content.data.file
            if (Buffer.isBuffer(file)) {
              file = await this.saveBufferToTemp(file, 'audio', '.ogg')
            }
            segments.push({
              type: 'record',
              data: {
                file,
              },
            })
          }
          break

        case 'file':
          {
            let file = content.data.url || content.data.file
            if (Buffer.isBuffer(file)) {
              file = await this.saveBufferToTemp(file, 'file', '', content.data.filename)
            }
            segments.push({
              type: 'file',
              data: {
                file,
                name: content.data.filename,
              },
            })
          }
          break

        case 'at':
          {
            const raw = String(content.data?.userId ?? content.data?.targetId ?? content.data?.qq ?? content.data?.user ?? '').trim()
            // NapCat/QQ only supports numeric uin mentions; non-numeric falls back to plain text.
            if (!/^\d+$/.test(raw)) {
              const name = String(content.data?.userName ?? content.data?.name ?? raw).trim()
              const text = name.startsWith('@') ? name : `@${name}`
              segments.push({ type: 'text', data: { text } })
              break
            }
            segments.push({
              type: 'at',
              data: { qq: raw },
            })
          }
          break

        case 'reply':
          segments.push({
            type: 'reply',
            data: content.data, // Pass through all fields (id, seq, time, senderUin, peer, etc.)
          })
          break

        case 'sticker':
          segments.push({
            type: 'image',
            data: {
              file: content.data.url || content.data.file,
            },
          })
          break
      }
    }
    return segments
  }

  /**
   * 统一格式转换为 Telegram 格式
   */
  toTelegram(msg: UnifiedMessage): any {
    const result: any = {
      message: '',
      media: [] as MessageContent[],
    }

    for (const content of msg.content) {
      switch (content.type) {
        case 'text':
          result.message += content.data.text
          break
        default:
          result.media.push(content)
          break
      }
    }

    return result
  }

  private async saveBufferToTemp(buffer: Buffer, type: 'image' | 'video' | 'audio' | 'file', ext: string, filename?: string): Promise<string> {
    // 尝试使用 NapCat 共享目录 (假设 NapCat 容器内路径也是 /app/.config/QQ)
    const sharedRoot = '/app/.config/QQ'
    const napcatTempDir = path.join(sharedRoot, 'NapCat', 'temp')
    const sharedDir = path.join(sharedRoot, 'temp_napgram_share')
    const sharedRootExists = fsSync.existsSync(sharedRoot)
    const name = filename || `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`
    this.logger.debug('Forward media buffer', {
      type,
      ext,
      size: buffer.length,
      sharedRootExists,
      napcatTempDir,
      sharedDir,
    })

    if (sharedRootExists) {
      const sharedDirs = [napcatTempDir, sharedDir]
      for (const dir of sharedDirs) {
        try {
          await fs.mkdir(dir, { recursive: true })
          const filePath = path.join(dir, name)
          await fs.writeFile(filePath, buffer)
          this.logger.debug('Saved forward media to shared path', { filePath })
          return filePath
        }
        catch (e) {
          this.logger.warn(e, `Failed to write to shared dir ${dir}:`)
        }
      }
    }

    // 回退到本地临时目录 (QQ 端可能无法访问)
    const tempDir = path.join(env.DATA_DIR, 'temp')
    this.logger.warn('Forward media fallback to local temp dir', { tempDir })
    await fs.mkdir(tempDir, { recursive: true })
    const filePath = path.join(tempDir, name)
    await fs.writeFile(filePath, buffer)
    this.logger.warn('Saved forward media to local temp path', { filePath })
    return filePath
  }
}
