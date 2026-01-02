/**
 * NapGram Web API (route registration)
 */
import { getLogger } from '@napgram/infra-kit';
const logger = getLogger('WebAPI');
export class WebAPIImpl {
    registrar;
    constructor(registrar) {
        this.registrar = registrar;
    }
    registerRoutes(register, pluginId) {
        if (!this.registrar) {
            logger.warn('WebAPI not configured (route registration unavailable)');
            return;
        }
        this.registrar(register, pluginId);
    }
}
export function createWebAPI(registrar) {
    return new WebAPIImpl(registrar);
}
