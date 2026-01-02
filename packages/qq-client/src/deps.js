let currentDependencies = null;
export function configureQQClient(deps) {
    currentDependencies = deps;
}
export function getQQClientDependencies() {
    if (!currentDependencies) {
        throw new Error('QQ client dependencies not configured');
    }
    return currentDependencies;
}
export function resolveLoggerFactory(factory) {
    if (factory)
        return factory;
    return (name) => {
        const prefix = `[${name}]`;
        return {
            debug: (message, ...args) => console.debug(prefix, message, ...args),
            info: (message, ...args) => console.info(prefix, message, ...args),
            warn: (message, ...args) => console.warn(prefix, message, ...args),
            error: (message, ...args) => console.error(prefix, message, ...args),
            trace: (message, ...args) => console.trace(prefix, message, ...args),
        };
    };
}
