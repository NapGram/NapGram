import { getLogger } from '@napgram/infra-kit'
import { configureQQClient } from '@napgram/qq-client'
import { messageConverter } from '../../../domain/message/converter'

configureQQClient({
  messageConverter,
  loggerFactory: getLogger,
})

export * from '@napgram/qq-client'
