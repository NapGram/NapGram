import { getLogger } from '@napgram/infra-kit'

export abstract class BaseConverter {
  protected logger = getLogger(this.constructor.name)
}
