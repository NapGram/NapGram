/**
 * NapGram Web API (route registration)
 */
import type { WebAPI } from '../core/interfaces';
type WebRouteRegistrar = (register: (app: any) => void, pluginId?: string) => void;
export declare class WebAPIImpl implements WebAPI {
    private readonly registrar?;
    constructor(registrar?: WebRouteRegistrar | undefined);
    registerRoutes(register: (app: any) => void, pluginId?: string): void;
}
export declare function createWebAPI(registrar?: WebRouteRegistrar): WebAPI;
export {};
