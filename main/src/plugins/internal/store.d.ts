export interface PluginsConfigFile {
    plugins: Array<{
        id: string;
        module: string;
        enabled?: boolean;
        config?: any;
        source?: any;
    }>;
}
declare function resolveDataDir(): string;
declare function parseConfig(raw: string, ext: string): PluginsConfigFile;
declare function inferIdFromModule(modulePath: string): string;
declare function sanitizeId(id: string): string;
export declare function getManagedPluginsConfigPath(): Promise<string>;
export declare function normalizeModuleSpecifierForPluginsConfig(moduleRaw: string): Promise<{
    stored: string;
    absolute: string;
}>;
export declare function readPluginsConfig(): Promise<{
    path: string;
    config: PluginsConfigFile;
    exists: boolean;
}>;
export declare function upsertPluginConfig(entry: {
    id?: string;
    module: string;
    enabled?: boolean;
    config?: any;
    source?: any;
}): Promise<{
    id: string;
    path: string;
    record: {
        id: string;
        module: string;
        enabled: boolean;
        config: any;
        source: any;
    };
}>;
export declare function patchPluginConfig(id: string, patch: {
    module?: string;
    enabled?: boolean;
    config?: any;
    source?: any;
}): Promise<{
    id: string;
    path: string;
    record: any;
}>;
export declare function removePluginConfig(id: string): Promise<{
    removed: boolean;
    id: string;
    path: string;
}>;
export declare const __testing: {
    resolveDataDir: typeof resolveDataDir;
    parseConfig: typeof parseConfig;
    inferIdFromModule: typeof inferIdFromModule;
    sanitizeId: typeof sanitizeId;
};
export {};
