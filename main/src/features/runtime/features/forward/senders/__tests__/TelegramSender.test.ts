import { bytesFromUtf8 } from '../../../../../../shared/utils/binary.js'
import { db } from '@napgram/db-kit'
import { env } from '@napgram/env-kit'
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { TelegramSender } from '../TelegramSender.js'

mock.module('@napgram/db-kit', () => ({
  db: {
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock().mockResolvedValue([{ id: 1 }]),
      })),
    })),
  },
  schema: {
    forwardMultiple: { id: 'id' },
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
  flags: {
    DISABLE_RICH_HEADER: 1,
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

describe('telegramSender', () => {
  const mockInstance = {
    id: 1,
    flags: 0,
    tgBot: {
      downloadMedia: mock(),
    },
  } as any
  const mockChat = {
    id: 100,
    sendMessage: mock().mockResolvedValue({ id: 123 }),
    client: {
      sendMedia: mock().mockResolvedValue({ id: 456 }),
    },
  } as any

  beforeEach(() => {
    mockChat.sendMessage.mockReset()
    mockChat.sendMessage.mockResolvedValue({ id: 123 })
    mockChat.client.sendMedia.mockReset()
    mockChat.client.sendMedia.mockResolvedValue({ id: 456 })
    mockInstance.tgBot.downloadMedia.mockReset()
    // Reset db.insert to default chain: insert -> values -> returning -> [{ id: 1 }]
    ;(db.insert as any).mockReset()
    ;(db.insert as any).mockImplementation(() => ({
      values: mock(() => ({
        returning: mock().mockResolvedValue([{ id: 1 }]),
      })),
    }))
  })

  it('sendToTelegram sends simple text message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'text', data: { text: 'hello' } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.sendMessage).toHaveBeenCalledWith('hello', expect.any(Object))
  })

  it('sendToTelegram handles nickname mode 10 (show nickname)', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'text', data: { text: 'hello' } }],
    }
    await sender.sendToTelegram(mockChat, msg, { apiKey: 'key' }, undefined, '10')
    expect(mockChat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('hello') }),
      expect.any(Object),
    )
  })

  it('sendToTelegram handles media group (photo/video)', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [
        { type: 'image', data: { file: bytesFromUtf8('img') } },
        { type: 'video', data: { file: bytesFromUtf8('vid') } },
      ],
    }
    // Mock mediaSender.sendMediaGroup
    const sendMediaGroupSpy = spyOn((sender as any).mediaSender, 'sendMediaGroup').mockResolvedValue({ id: 789 })

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(sendMediaGroupSpy).toHaveBeenCalled()
  })

  it('sendToTelegram handles audio message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'audio', data: { file: bytesFromUtf8('aud') } }],
    }
    // Mock sendMediaToTG indirectly
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('norm'), fileName: 'aud.ogg' })
    spyOn((sender as any).audioConverter, 'prepareVoiceMedia').mockResolvedValue({ type: 'voice', file: bytesFromUtf8('voice') })

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.client.sendMedia).toHaveBeenCalled()
    const mediaInput = mockChat.client.sendMedia.mock.calls[0][1]
    expect(mediaInput.type).toBe('voice')
  })

  it('sendToTelegram handles dice message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'dice', data: { emoji: '🎲' } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'dice' }), expect.any(Object))
  })

  it('sendToTelegram falls back to text for unsupported dice', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'dice', data: { emoji: '🎉', value: 3 } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.sendMessage).toHaveBeenCalled()
    expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
  })

  it('sendToTelegram handles forward message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'forward', data: { id: 'f1' } }],
    }
    await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
    expect(db.insert).toHaveBeenCalled()
    expect(mockChat.sendMessage).toHaveBeenCalledWith('[转发消息]', expect.any(Object))
  })

  it('sendToTelegram handles location message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'location', data: { latitude: 1, longitude: 2 } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'geo' }), expect.any(Object))
  })

  it('sendToTelegram sends venue when location has title', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'location', data: { latitude: 1, longitude: 2, title: 'Place', address: 'Addr' } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'venue' }), expect.any(Object))
  })

  it('sendMediaToTG sends placeholder when file missing', async () => {
    const sender = new TelegramSender(mockInstance)
    const content: any = { type: 'file', data: { file: 'missing', filename: 'report.txt' } }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('missing')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue(undefined)

    const result = await (sender as any).sendMediaToTG(mockChat, '', content)

    expect(mockChat.sendMessage).toHaveBeenCalledWith('[文件不可用] report.txt', expect.any(Object))
    expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('sendMediaToTG retries without ttlSeconds when sendMedia fails', async () => {
    const sender = new TelegramSender(mockInstance)
    const content: any = { type: 'image', data: { file: '/tmp/test.jpg' } }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('/tmp/test.jpg')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('img'), fileName: 'test.jpg' })
    spyOn((sender as any).fileNormalizer, 'isGifMedia').mockReturnValue(false)

    const ttlValues: Array<number | undefined> = []
    mockChat.client.sendMedia.mockImplementation((_chatId: any, mediaInput: any) => {
      ttlValues.push(mediaInput.ttlSeconds)
      if (ttlValues.length === 1)
        return Promise.reject(new Error('fail'))
      return Promise.resolve({ id: 999 })
    })

    const prevTtl = env.TG_MEDIA_TTL_SECONDS
    env.TG_MEDIA_TTL_SECONDS = 5 as any
    try {
      await (sender as any).sendMediaToTG(mockChat, 'head', content)
    }
    finally {
      env.TG_MEDIA_TTL_SECONDS = prevTtl as any
    }

    expect(mockChat.client.sendMedia).toHaveBeenCalledTimes(2)
    expect(ttlValues).toEqual([5, undefined])
  })

  it('sendToTelegram sends forward without WEB_ENDPOINT', async () => {
    const sender = new TelegramSender(mockInstance)
    const prevEndpoint = env.WEB_ENDPOINT
    env.WEB_ENDPOINT = '' as any
    try {
      const msg: any = {
        sender: { id: 'q1', name: 'QQUser' },
        content: [{ type: 'forward', data: { id: 'f1' } }],
      }
      await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
      expect(mockChat.sendMessage).toHaveBeenCalledWith(expect.stringContaining('未配置 WEB_ENDPOINT'), expect.any(Object))
    }
    finally {
      env.WEB_ENDPOINT = prevEndpoint as any
    }
  })

  it('sendToTelegram falls back when forward create fails', async () => {
    const sender = new TelegramSender(mockInstance)
    ;(db.insert as any).mockReturnValue({
      values: mock(() => ({
        returning: mock().mockRejectedValue(new Error('fail')),
      })),
    } as any)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'forward', data: { id: 'f1', messages: ['m1'] } }],
    }
    await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
    expect(mockChat.sendMessage).toHaveBeenCalledWith('[转发消息x1]', expect.any(Object))
  })

  it('sendToTelegram sends rich header for audio message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'audio', data: { file: 'aud.amr' } }],
    }
    // Mock normalize
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('aud'), fileName: 'aud.ogg' })
    spyOn((sender as any).audioConverter, 'prepareVoiceMedia').mockResolvedValue({ type: 'voice', file: bytesFromUtf8('voice') })

    // Setup Rich Header environment
    const pair = { apiKey: 'key', flags: 0 }

    // Create spy for richHeaderBuilder
    const buildUrlSpy = spyOn((sender as any).richHeaderBuilder, 'generateRichHeaderUrl').mockReturnValue('http://header.url')
    const applyHeaderSpy = spyOn((sender as any).richHeaderBuilder, 'applyRichHeader').mockReturnValue({ text: 'Rich', params: {} })

    await sender.sendToTelegram(mockChat, msg, pair, undefined, '10') // nickname '10' enables rich header if env present

    expect(buildUrlSpy).toHaveBeenCalled()
    expect(applyHeaderSpy).toHaveBeenCalled()

    // Should send header message separate from media
    expect(mockChat.sendMessage).toHaveBeenCalledWith('Rich', expect.any(Object))
    expect(mockChat.client.sendMedia).toHaveBeenCalled()
  })

  it('handles rich header failure gracefully', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'audio', data: { file: 'aud.amr' } }],
    }
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('aud'), fileName: 'aud.ogg' })
    spyOn((sender as any).audioConverter, 'prepareVoiceMedia').mockResolvedValue({ type: 'voice', file: bytesFromUtf8('voice') })

    const pair = { apiKey: 'key', flags: 0 }
    spyOn((sender as any).richHeaderBuilder, 'generateRichHeaderUrl').mockReturnValue('http://header.url')
    spyOn((sender as any).richHeaderBuilder, 'applyRichHeader').mockReturnValue({ text: 'Rich', params: {} })

    // Mock header send failure
    mockChat.sendMessage.mockRejectedValueOnce(new Error('Header fail'))

    await sender.sendToTelegram(mockChat, msg, pair, undefined, '10')

    // Media should still be sent
    expect(mockChat.client.sendMedia).toHaveBeenCalled()
  })

  it('handles local file path in media', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'image', data: { file: '/local/path/img.png' } }],
    }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('/local/path/img.png')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('img'), fileName: 'img.png' })
    spyOn((sender as any).fileNormalizer, 'isGifMedia').mockReturnValue(false)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).toHaveBeenCalled()
    const mediaInput = mockChat.client.sendMedia.mock.calls[0][1]
    expect(mediaInput.fileName).toBe('img.png')
  })

  it('handles gif media as animation', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'image', data: { file: 'anim.gif' } }],
    }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('anim.gif')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('gif'), fileName: 'anim.gif' })
    spyOn((sender as any).fileNormalizer, 'isGifMedia').mockReturnValue(true)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).toHaveBeenCalled()
    const mediaInput = mockChat.client.sendMedia.mock.calls[0][1]
    expect(mediaInput.type).toBe('animation')
  })

  it('handles video source failure', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'video', data: { file: 'bad.mp4' } }],
    }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('bad.mp4')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue(undefined)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
    // Error is logged and swallowed in sendToTelegram loop, but sendMediaToTG returns null
  })

  it('handles image source failure', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'image', data: { file: 'bad.jpg' } }],
    }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('bad.jpg')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue(undefined)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
  })

  it('handles empty header in sendMediaToTG gracefully', async () => {
    const sender = new TelegramSender(mockInstance)
    const content: any = { type: 'audio', data: { file: 'aud.amr' } }

    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('aud'), fileName: 'aud.ogg' })
    spyOn((sender as any).audioConverter, 'prepareVoiceMedia').mockResolvedValue({ type: 'voice', file: bytesFromUtf8('voice') })
    spyOn((sender as any).richHeaderBuilder, 'applyRichHeader').mockReturnValue({ text: '   ', params: {} }) // empty text

    await (sender as any).sendMediaToTG(mockChat, 'header_present_but_returns_empty', content)

    // Media sent, but caption is empty, sendMessage is not called in sendMediaToTG for header
    expect(mockChat.client.sendMedia).toHaveBeenCalled()
    const callArgs = mockChat.client.sendMedia.mock.calls[0][1]
    expect(callArgs.caption).toBeUndefined()
  })

  it('handles audio source failure', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'audio', data: { file: 'bad.amr' } }],
    }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('bad.amr')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue(undefined)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
  })

  it('routes to specific topic via replyTo when tgThreadId provided', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'text', data: { text: 'threaded' } }],
    }
    const pair = { tgThreadId: '999' }

    await sender.sendToTelegram(mockChat, msg, pair, undefined, '00')

    expect(mockChat.sendMessage).toHaveBeenCalledWith(
      'threaded',
      expect.objectContaining({ replyTo: 999 }),
    )
  })

  it('normalizes bigint tgThreadId for Telegram topic sends', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'text', data: { text: 'topic message' } }],
    }
    const pair = { tgThreadId: 363n }

    await sender.sendToTelegram(mockChat, msg, pair, undefined, '00')

    expect(mockChat.sendMessage).toHaveBeenCalledWith(
      'topic message',
      expect.objectContaining({ replyTo: 363 }),
    )
    expect(mockChat.sendMessage).toHaveBeenCalledWith(
      'topic message',
      expect.not.objectContaining({ replyTo: 363n }),
    )
  })
  it('handles dice fallback failure', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'dice', data: { emoji: '🎉', value: 3 } }],
    }

    // Mock sendMessage failure
    mockChat.sendMessage.mockRejectedValueOnce(new Error('Fallback fail'))

    await expect(sender.sendToTelegram(mockChat, msg, {}, undefined, '00')).rejects.toThrow('Fallback fail')
  })

  it('handles sendMedia non-ttl failure', async () => {
    const sender = new TelegramSender(mockInstance)
    const content: any = { type: 'image', data: { file: '/tmp/test.jpg' } }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('/tmp/test.jpg')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('img'), fileName: 'test.jpg' })

    mockChat.client.sendMedia.mockRejectedValueOnce(new Error('Fatal error'))

    await (sender as any).sendMediaToTG(mockChat, 'head', content)
    // Error logged
    // No throw because sendMediaToTG catches it and logs it, returning null
  })

  it('handles forward message fallback when no id', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'forward', data: { text: 'fwd text' } }], // No ID
    }
    await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
    expect(mockChat.sendMessage).toHaveBeenCalledWith('[转发消息x0]', expect.any(Object))
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('sendToTelegram handles file message successfully', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'file', data: { file: 'doc.pdf', filename: 'doc.pdf' } }],
    }
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('doc'), fileName: 'doc.pdf' })

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'document', fileName: 'doc.pdf' }), expect.any(Object))
  })

  it('flushes text before image content', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [
        { type: 'text', data: { text: 'Look at this:' } },
        { type: 'image', data: { file: '/tmp/photo.jpg' } },
      ],
    }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('/tmp/photo.jpg')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('img'), fileName: 'photo.jpg' })

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    // Text should be sent first
    expect(mockChat.sendMessage).toHaveBeenCalled()
    // Then image
    expect(mockChat.client.sendMedia).toHaveBeenCalled()
  })

  it('handles audio content', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'audio', data: { file: '/tmp/audio.mp3' } }],
    }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('/tmp/audio.mp3')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: bytesFromUtf8('audio'), fileName: 'audio.mp3' })

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    // Audio goes through mediaSender which determines the actual type
    expect(mockChat.client.sendMedia).toHaveBeenCalled()
  }, 15_000)

  it('handles location content', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'location', data: { latitude: 30.5, longitude: 120.1, title: 'Home' } }],
    }

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).toHaveBeenCalled()
  })

  it('handles forward content with text before it', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [
        { type: 'text', data: { text: 'Check this:' } },
        { type: 'forward', data: { messages: [{ userId: '1', userName: 'User', segments: [{ type: 'text', data: { text: 'fwd' } }] }] } },
      ],
    }

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    // Text should be sent first, then forward
    expect(mockChat.sendMessage).toHaveBeenCalled()
  })

  it('handles default content type', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'sticker', data: { emoji: '😊' } }],
    }

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    // Default type renders as text
    expect(mockChat.sendMessage).toHaveBeenCalled()
  })

  it('preserves lastSent when sendMediaGroup returns null', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [
        { type: 'text', data: { text: 'initial' } },
        { type: 'image', data: { file: bytesFromUtf8('img') } },
        { type: 'video', data: { file: bytesFromUtf8('vid') } },
      ],
    }
    mockChat.sendMessage.mockResolvedValueOnce({ id: 'text-msg' })
    const sendMediaGroupSpy = spyOn((sender as any).mediaSender, 'sendMediaGroup').mockResolvedValue(null)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(sendMediaGroupSpy).toHaveBeenCalled()
    expect(mockChat.sendMessage).toHaveBeenCalled()
  })

  it('handles error when sending file placeholder fails', async () => {
    const sender = new TelegramSender(mockInstance)
    const content: any = { type: 'file', data: { file: 'missing', filename: 'report.txt' } }
    spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('missing')
    spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue(undefined)

    // Mock chat.sendMessage to fail
    mockChat.sendMessage.mockRejectedValueOnce(new Error('Placeholder failed'))

    const result = await (sender as any).sendMediaToTG(mockChat, '', content)

    expect(mockChat.sendMessage).toHaveBeenCalledWith('[文件不可用] report.txt', expect.any(Object))
    expect(result).toBeNull()
  })
})
