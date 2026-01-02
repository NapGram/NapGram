import { getLogger } from '@napgram/infra-kit';
export class BaseConverter {
    logger = getLogger(this.constructor.name);
}
