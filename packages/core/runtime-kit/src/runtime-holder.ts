import { IInstance, IPluginRuntime } from './runtime-types.js'

let globalRuntime: IPluginRuntime | null = null
 
export interface RuntimeRegistryEntry {
    id: number
}

export class RuntimeRegistry<T extends RuntimeRegistryEntry> {
    private items: T[] = []

    add(instance: T) {
        if (!this.items.find(i => i.id === instance.id)) {
            this.items.push(instance)
        }
    }

    remove(id: number) {
        const index = this.items.findIndex(i => i.id === id)
        if (index !== -1) {
            this.items.splice(index, 1)
        }
    }

    getAll(): T[] {
        return [...this.items]
    }

    getById(id: number): T | undefined {
        return this.items.find(i => i.id === id)
    }

    reset(): void {
        this.items = []
    }

    dispose(): void {
        this.reset()
    }
}

/**
 * Registry for active instances.
 */
export const InstanceRegistry = new RuntimeRegistry<IInstance>()

/**
 * Set the global runtime instance.
 * Should be called by the host application (main) on startup.
 */
export function setGlobalRuntime(runtime: IPluginRuntime) {
    globalRuntime = runtime
}

/**
 * Reset the global runtime instance.
 * Intended for tests and runtime teardown coordination.
 */
export function resetGlobalRuntime(): void {
    globalRuntime = null
}

/**
 * Get the global runtime instance.
 * Throws if runtime is not initialized.
 */
export function getGlobalRuntime(): IPluginRuntime {
    if (!globalRuntime) {
        throw new Error('PluginRuntime not initialized. Ensure the application has started correctly.')
    }
    return globalRuntime
}

/**
 * Try to get the global runtime instance.
 * Returns null if not initialized.
 */
export function tryGetGlobalRuntime(): IPluginRuntime | null {
    return globalRuntime
}
