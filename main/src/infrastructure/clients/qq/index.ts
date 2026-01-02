import { configureQQClient } from '@napgram/qq-client'
import { messageConverter } from '../../../domain/message/converter'
import { getLogger } from '@napgram/infra-kit'

configureQQClient({
  messageConverter,
  loggerFactory: getLogger,
})

export * from '@napgram/qq-client'
