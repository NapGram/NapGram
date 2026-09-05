import { bytesFromUtf8 } from '../../../../shared/utils/binary.js'
import { describe, expect, it, mock } from 'bun:test'

const envMock = (() => ({
  TG_MEDIA_TTL_SECONDS: 10,
  WEB_ENDPOINT: 'http://example.test',
  DATA_DIR: '/tmp',
  CACHE_DIR: '/tmp/cache',
  flags: { DISABLE_RICH_HEADER: 16384 },
}))()

const loggerMocks = (() => ({
  info: mock(),
  warn: mock(),
  debug: mock(),
  error: mock(),
}))()

mock.module('@napgram/env-kit', async () => ({
  get env() { return envMock },
  get flags() { return envMock.flags },
}))

mock.module('@napgram/logger-kit', async () => ({
  getLogger: mock(() => loggerMocks),
}))

describe('telegram media TTL', () => {
  it('adds ttlSeconds to media-group items when configured', async () => {
    envMock.TG_MEDIA_TTL_SECONDS = 10

    const { MediaSender } = await import('../forward/senders/MediaSender.js')
    const { FileNormalizer } = await import('../forward/senders/FileNormalizer.js')
    const { RichHeaderBuilder } = await import('../forward/senders/RichHeaderBuilder.js')

    const chat: any = {
      id: 1001,
      sendMessage: mock().mockResolvedValue({ id: 1 }),
      client: {
        sendMediaGroup: mock().mockResolvedValue([{ id: 10 }]),
      },
    }

    const sender = new MediaSender(new FileNormalizer(undefined), new RichHeaderBuilder())
    await sender.sendMediaGroup(
      chat,
      [
        { type: 'image', data: { file: bytesFromUtf8('a'), fileName: 'a.jpg' } } as any,
        { type: 'video', data: { file: bytesFromUtf8('b'), fileName: 'b.mp4' } } as any,
      ],
      '',
    )

    expect(chat.client.sendMediaGroup).toHaveBeenCalledTimes(1)
    const mediaInputs = chat.client.sendMediaGroup.mock.calls[0][1]
    expect(mediaInputs[0].ttlSeconds).toBe(10)
    expect(mediaInputs[1].ttlSeconds).toBe(10)
  }, 30000)
})
