import type { Message } from '@mtcute/core'
import type { MessageContent, UnifiedMessage } from './types.js'
export type { UnifiedMessage }

import { Buffer } from 'node:buffer'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { decode, encode } from 'image-js'
import { convert, env, getLogger } from './shared-runtime.js'
import type { Instance } from './shared-runtime.js'

import { NapCatConverter } from './converters/index.js'

const logger = getLogger('MessageConverter')

/**
 * 增强的消息转换器
 * Phase 2: 完整支持所有消息类型
 */
export class MessageConverter {
  private napCatConverter = new NapCatConverter()
  private instance?: Instance

  setInstance(instance: Instance) {
    this.instance = instance
  }

  /**
   * 从 NapCat 消息转换为统一格式
   */
  fromNapCat(napCatMsg: any): UnifiedMessage {
    return this.napCatConverter.fromNapCat(napCatMsg)
  }

  /**
   * 统一格式转换为 NapCat 格式
   */

  /**
   * 从 Telegram 消息转换为统一格式
   */
  fromTelegram(tgMsg: Message, repliedMsgOverride?: Message): UnifiedMessage {
    logger.debug('Converting from Telegram:', tgMsg.id)

    const content: MessageContent[] = []
    const text = tgMsg.text

    if (text) {
      content.push({
        type: 'text',
        data: { text },
      })
    }

    const media = tgMsg.media

    if (media) {
      if (media.type === 'photo') {
        content.push({
          type: 'image',
          data: {
            file: media, // mtcute Photo object
            // url: media.full?.url, // mtcute doesn't expose URL directly for private media
          },
        })
      }
      else if (media.type === 'video') {
        content.push({
          type: 'video',
          data: {
            file: media,
            duration: media.duration,
          },
        })
      }
      else if (media.type === 'voice') {
        content.push({
          type: 'audio',
          data: {
            file: media,
            duration: media.duration,
          },
        })
      }
      else if (media.type === 'audio') {
        content.push({
          type: 'audio',
          data: {
            file: media,
            duration: media.duration,
          },
        })
      }
      else if (media.type === 'document') {
        // Check if it's a GIF (mime type)
        if (media.mimeType === 'image/gif') {
          content.push({
            type: 'image',
            data: {
              file: media,
              isSpoiler: false,
            },
          })
        }
        else {
          content.push({
            type: 'file',
            data: {
              file: media,
              filename: media.fileName || 'file',
              size: media.fileSize,
            },
          })
        }
      }
      else if (media.type === 'sticker') {
        // Treat sticker as image (or file if animated?)
        content.push({
          type: 'image',
          data: {
            file: media,
            mimeType: (media as any).mimeType,
            isSticker: true,
          },
        })
      }
      else if (media.type === 'dice') {
        content.push({
          type: 'dice',
          data: {
            emoji: (media as any).emoji || '🎲',
            value: (media as any).value,
          },
        })
      }
      else if (media.type === 'location' || media.type === 'live_location' || media.type === 'venue') {
        const geo: any = (media as any).geo || (media as any).location || media
        content.push({
          type: 'location',
          data: {
            latitude: Number(geo.lat ?? geo.latitude),
            longitude: Number(geo.lng ?? geo.longitude ?? geo.lon),
            title: (geo.title || geo.name) as any,
            address: (geo.address || geo.desc) as any,
          },
        })
      }
    }

    const geoMsg: any = (tgMsg as any).location
    if (geoMsg && !media) {
      content.push({
        type: 'location',
        data: {
          latitude: Number(geoMsg.latitude ?? geoMsg.lat),
          longitude: Number(geoMsg.longitude ?? geoMsg.lng ?? geoMsg.lon),
          title: geoMsg.title,
          address: geoMsg.address,
        },
      })
    }

    if (repliedMsgOverride || tgMsg.replyToMessage) {
      const reply = repliedMsgOverride || tgMsg.replyToMessage!
      if (repliedMsgOverride) {
        logger.info(`Using repliedMsgOverride for TG msg ${tgMsg.id}`)
      }
      else {
        logger.debug(`Detected replyToMessage in TG msg ${tgMsg.id}`)
      }
      content.push({
        type: 'reply',
        data: {
          messageId: String(reply.id),
          senderId: String((reply.sender as any)?.id || (reply.chat as any)?.id || ''),
          senderName: (reply.sender as any)?.displayName || (reply.chat as any)?.title || 'Unknown',
          text: (reply as any).text || '',
        },
      })
    }
    else if ((tgMsg as any).replyTo) {
      logger.info(`Detected replyTo ID but no replyToMessage object in TG msg ${tgMsg.id}`)
    }

    const senderId = String((tgMsg.sender as any)?.id || (tgMsg.chat as any)?.id || '')
    const senderName = (tgMsg.sender as any)?.displayName || (tgMsg.chat as any)?.title || 'Unknown'
    const chatId = String(tgMsg.chat.id)
    const timestamp = tgMsg.date.getTime()

    return {
      id: String(tgMsg.id),
      platform: 'telegram',
      sender: {
        id: senderId,
        name: senderName,
      },
      chat: {
        id: chatId,
        type: (tgMsg.chat.type as string) === 'private' ? 'private' : 'group',
      },
      content,
      timestamp,
      metadata: {
        raw: tgMsg,
      },
    }
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

  // ============ NapCat 转换辅助方法 ============

  private async saveBufferToTemp(buffer: Buffer, type: 'image' | 'video' | 'audio' | 'file', ext: string, filename?: string): Promise<string> {
    // 尝试使用 NapCat 共享目录 (假设 NapCat 容器内路径也是 /app/.config/QQ)
    const sharedRoot = '/app/.config/QQ'
    const napcatTempDir = path.join(sharedRoot, 'NapCat', 'temp')
    const sharedDir = path.join(sharedRoot, 'temp_napgram_share')
    const sharedRootExists = fsSync.existsSync(sharedRoot)
    const name = filename || `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`
    logger.debug('Forward media buffer', {
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
          logger.debug('Saved forward media to shared path', { filePath })
          return filePath
        }
        catch (e) {
          logger.warn(`Failed to write to shared dir ${dir}:`, e)
        }
      }
    }

    // 回退到本地临时目录 (QQ 端可能无法访问)
    const tempDir = path.join(env.DATA_DIR, 'temp')
    logger.warn('Forward media fallback to local temp dir', { tempDir })
    await fs.mkdir(tempDir, { recursive: true })
    const filePath = path.join(tempDir, name)
    await fs.writeFile(filePath, buffer)
    logger.warn('Saved forward media to local temp path', { filePath })
    return filePath
  }

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

            // Handle sticker: if file is mtcute Media object, download it first
            if (content.data.isSticker && file && typeof file === 'object' && !Buffer.isBuffer(file) && 'type' in file) {
              try {
                if (!this.instance) {
                  logger.error('Instance not set, cannot download sticker')
                  segments.push({
                    type: 'text',
                    data: { text: '[贴纸下载失败:未初始化]' },
                  })
                  break
                }
                logger.debug('Downloading mtcute Media object for sticker')
                const buffer = await this.instance.tgBot.downloadMedia(file)
                if (!buffer || buffer.length === 0) {
                  logger.warn('Downloaded sticker buffer is empty')
                  segments.push({
                    type: 'text',
                    data: { text: '[贴纸下载为空]' },
                  })
                  break
                }
                file = buffer
                logger.debug(`Downloaded sticker buffer, size: ${buffer.length}`)
              }
              catch (downloadErr) {
                logger.error('Failed to download sticker Media object', downloadErr)
                segments.push({
                  type: 'text',
                  data: { text: '[贴纸下载失败]' },
                })
                break
              }
            }

            if (Buffer.isBuffer(file)) {
              let targetBuffer = file
              let targetExt = '.jpg'
              let detected
              try {
                detected = await fileTypeFromBuffer(file)
              }
              catch (e) {
                logger.debug('fileTypeFromBuffer failed for image buffer', e)
              }
              if (content.data.isSticker) {
                try {
                  logger.debug('Converting sticker buffer for QQ', {
                    mimeType: content.data.mimeType,
                    detectedExt: detected?.ext,
                    bufferSize: file.length,
                  })

                  // 检查是否是 TGS (gzip 压缩的 JSON)
                  // TGS 文件以 0x1f 0x8b 开头（gzip magic number）
                  const isTGS = file.length >= 2 && file[0] === 0x1F && file[1] === 0x8B

                  if (isTGS) {
                    logger.info('Detected TGS sticker, converting to GIF...')
                    const tempDir = path.join(env.DATA_DIR, 'temp')
                    await fs.mkdir(tempDir, { recursive: true })
                    const tgsKey = `tgs-sticker-${Date.now()}-${Math.random().toString(16).slice(2)}`

                    try {
                      const gifPath = await convert.tgs2gif(tgsKey, () => Promise.resolve(file))
                      logger.info(`TGS converted to GIF: ${gifPath}`)
                      targetBuffer = await fs.readFile(gifPath)
                      targetExt = '.gif'
                    }
                    catch (tgsErr) {
                      logger.error('TGS to GIF conversion failed', tgsErr)
                      segments.push({
                        type: 'text',
                        data: { text: '[动画贴纸转换失败]' },
                      })
                      break
                    }
                  }
                  else {
                    // 静态贴纸：转成 png，避免 WEBP 直接当 jpg 触发 QQ 富媒体失败
                    const image = decode(file)
                    targetBuffer = Buffer.from(encode(image, { format: 'png' }))
                    targetExt = '.png'
                  }
                }
                catch (e) {
                  logger.warn('Failed to convert sticker buffer, fallback to text', e)
                  segments.push({
                    type: 'text',
                    data: { text: '[贴纸]' },
                  })
                  break
                }
              }
              else if (content.data.mimeType) {
                if (content.data.mimeType.includes('webp'))
                  targetExt = '.webp'
                else if (content.data.mimeType.includes('png'))
                  targetExt = '.png'
              }
              else {
                if (detected?.ext)
                  targetExt = `.${detected.ext}`
              }
              logger.debug('Saving image buffer for QQ', {
                isSticker: content.data.isSticker,
                mimeType: content.data.mimeType,
                detectedExt: detected?.ext,
                targetExt,
              })
              file = await this.saveBufferToTemp(targetBuffer, 'image', targetExt)
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
          segments.push({
            type: 'at',
            data: { qq: content.data.targetId },
          })
          break

        case 'reply':
          segments.push({
            type: 'reply',
            data: { id: content.data.messageId },
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

        case 'dice':
          segments.push({
            type: 'dice',
            data: {
              result: content.data.value ?? Math.floor(Math.random() * 6) + 1,
              emoji: content.data.emoji || '🎲',
            },
          })
          break

        case 'location':
          {
            const loc = content.data
            const jsonData = this.buildLocationJson(loc, message)
            if (jsonData) {
              segments.push({
                type: 'json',
                data: {
                  data: jsonData,
                },
              })
            }
            else {
              segments.push({
                type: 'location',
                data: {
                  lat: loc.latitude,
                  lng: loc.longitude,
                  title: loc.title,
                  address: loc.address,
                },
              })
            }
            // 文本兜底，方便 QQ 端至少看到坐标/链接
            const link = (loc.latitude && loc.longitude)
              ? `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`
              : ''
            const textLines = [
              loc.title ? `[位置]${loc.title}` : '[位置]',
              loc.address || '',
              link,
            ].filter(Boolean).join('\n')
            if (textLines) {
              segments.push({
                type: 'text',
                data: {
                  text: textLines,
                },
              })
            }
          }
          break
      }
    }
    return segments
  }

  private buildLocationJson(loc: any, message: UnifiedMessage): string | null {
    if (loc.latitude == null || loc.longitude == null) {
      return null
    }
    const ctime = Math.floor(Date.now() / 1000)
    const token = Math.random().toString(16).slice(2, 18)
    const app = 'com.tencent.map'
    const prompt = `[位置]${loc.title || loc.address || ''}`

    const data = {
      app,
      config: {
        autosize: false,
        ctime,
        forward: true,
        token,
        type: 'normal',
      },
      desc: '',
      from: 1,
      meta: {
        'Location.Search': {
          address: loc.address || loc.title || '',
          enum_relation_type: 1,
          from: 'api',
          from_account: Number(message?.sender?.id ?? 0),
          id: '',
          lat: String(loc.latitude),
          lng: String(loc.longitude),
          name: loc.title || loc.address || '位置',
          uint64_peer_account: Number(message?.chat?.id ?? 0),
        },
      },
      prompt,
      ver: '1.1.2.21',
      view: 'LocationShare',
    }

    try {
      return JSON.stringify(data)
    }
    catch {
      return null
    }
  }
}

// 导出单例
export const messageConverter = new MessageConverter()
