import { configureTelegramClient } from '@napgram/telegram-client'
import { env } from '@napgram/infra-kit'
import TelegramSession from '../../../domain/models/TelegramSession'
import { getLogger } from '@napgram/infra-kit'
import { temp } from '@napgram/infra-kit'

configureTelegramClient({
  env,
  sessionFactory: (sessionId?: number) => new TelegramSession(sessionId),
  loggerFactory: getLogger,
  tempPath: temp.TEMP_PATH,
})

export { default } from '@napgram/telegram-client'
export * from '@napgram/telegram-client'
