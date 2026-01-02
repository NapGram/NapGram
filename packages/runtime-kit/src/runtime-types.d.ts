export interface RuntimeStats {
    total: number;
    native: number;
    installed: number;
    error: number;
}
export interface RuntimeReport {
    enabled: boolean;
    loaded: string[];
    loadedPlugins?: Array<{
        id: string;
        context: any;
        plugin?: {
            id: string;
            name: string;
            version: string;
            description?: string;
            homepage?: string;
            defaultConfig?: any;
        };
    }>;
    failed: Array<{
        id: string;
        error: string;
    }>;
    stats: RuntimeStats;
}
export interface ReloadPluginResult {
    id: string;
    success: boolean;
    error?: string;
}
/**
 * Interface for PluginRuntime to allow dependency inversion.
 * Consumers (like marketplace-kit) depend on this interface,
 * while the implementation (main/server) provides it.
 */
export interface IPluginRuntime {
    /**
     * Get the last runtime report
     */
    getLastReport(): RuntimeReport;
    /**
     * Check if runtime is active
     */
    isActive(): boolean;
    /**
     * Reload a single plugin
     */
    reloadPlugin(pluginId: string, newConfig?: any): Promise<ReloadPluginResult>;
    /**
     * Reload the entire runtime (reloads all plugins)
     */
    reload(options?: any): Promise<any>;
    /**
     * Get a plugin instance by ID
     */
    getPlugin(id: string): any;
    /**
     * Get event bus (abstract return type to avoid coupling)
     */
    getEventBus(): any;
}
export interface IInstance {
    id: number;
    tgBot: any;
    qqClient?: any;
    forwardPairs: any;
    owner: number;
    flags: number;
}
