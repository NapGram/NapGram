import { IInstance, IPluginRuntime } from './runtime-types'

let globalRuntime: IPluginRuntime | null = null
const globalInstances: IInstance[] = []

/**
 * Registry for active instances.
 */
export const InstanceRegistry = {
    add(instance: IInstance) {
        if (!globalInstances.find(i => i.id === instance.id)) {
            globalInstances.push(instance)
        }
    },
    remove(id: number) {
        const index = globalInstances.findIndex(i => i.id === id)
        if (index !== -1) {
            globalInstances.splice(index, 1)
        }
    },
    getAll(): IInstance[] {
        return globalInstances
    },
    getById(id: number): IInstance | undefined {
        return globalInstances.find(i => i.id === id)
    }
}

/**
 * Set the global runtime instance.
 * Should be called by the host application (main) on startup.
 */
export function setGlobalRuntime(runtime: IPluginRuntime) {
    globalRuntime = runtime
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
