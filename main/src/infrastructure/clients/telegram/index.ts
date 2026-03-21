import { env } from '@napgram/env-kit'
import { getLogger } from '@napgram/logger-kit'
import { configureTelegramClient } from '@napgram/telegram-client'
import TelegramSession from '../../../domain/models/TelegramSession'
import * as temp from '../../temp'

configureTelegramClient({
  env,
  sessionFactory: (sessionId?: number) => new TelegramSession(sessionId),
  loggerFactory: getLogger,
  tempPath: temp.TEMP_PATH,
})

export { default } from '@napgram/telegram-client'
export * from '@napgram/telegram-client'
