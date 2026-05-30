import { getLogger } from '../shared-runtime.js'

export abstract class BaseConverter {
  protected logger = getLogger(this.constructor.name)
}
