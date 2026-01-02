let globalRuntime = null;
/**
 * Set the global runtime instance.
 * Should be called by the host application (main) on startup.
 */
export function setGlobalRuntime(runtime) {
    globalRuntime = runtime;
}
/**
 * Get the global runtime instance.
 * Throws if runtime is not initialized.
 */
export function getGlobalRuntime() {
    if (!globalRuntime) {
        throw new Error('PluginRuntime not initialized. Ensure the application has started correctly.');
    }
    return globalRuntime;
}
/**
 * Try to get the global runtime instance.
 * Returns null if not initialized.
 */
export function tryGetGlobalRuntime() {
    return globalRuntime;
}
