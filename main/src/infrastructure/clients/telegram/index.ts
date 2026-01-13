import { env, getLogger, temp } from '@napgram/infra-kit'
import { configureTelegramClient } from '@napgram/telegram-client'
import TelegramSession from '../../../domain/models/TelegramSession'

configureTelegramClient({
  env,
  sessionFactory: (sessionId?: number) => new TelegramSession(sessionId),
  loggerFactory: getLogger,
  tempPath: temp.TEMP_PATH,
})

export { default } from '@napgram/telegram-client'
export * from '@napgram/telegram-client'
