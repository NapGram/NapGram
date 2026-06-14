import { getLogger } from '@napgram/logger-kit'
import { messageConverter } from '@napgram/message-kit'
import { configureQQClient } from '@napgram/qq-client'

configureQQClient({
  messageConverter,
  loggerFactory: getLogger,
})

export * from '@napgram/qq-client'
