import { IInstance, IPluginRuntime } from './runtime-types';
/**
 * Registry for active instances.
 */
export declare const InstanceRegistry: {
    add(instance: IInstance): void;
    remove(id: number): void;
    getAll(): IInstance[];
    getById(id: number): IInstance | undefined;
};
/**
 * Set the global runtime instance.
 * Should be called by the host application (main) on startup.
 */
export declare function setGlobalRuntime(runtime: IPluginRuntime): void;
/**
 * Get the global runtime instance.
 * Throws if runtime is not initialized.
 */
export declare function getGlobalRuntime(): IPluginRuntime;
/**
 * Try to get the global runtime instance.
 * Returns null if not initialized.
 */
export declare function tryGetGlobalRuntime(): IPluginRuntime | null;
