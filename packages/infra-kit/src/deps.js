const defaultLoggerFactory = (name) => {
    const prefix = `[${name}]`;
    return {
        trace: (...args) => console.debug(prefix, ...args),
        debug: (...args) => console.debug(prefix, ...args),
        info: (...args) => console.info(prefix, ...args),
        warn: (...args) => console.warn(prefix, ...args),
        error: (...args) => console.error(prefix, ...args),
    };
};
let loggerFactory = defaultLoggerFactory;
export function configureInfraKit(options = {}) {
    if (options.loggerFactory) {
        loggerFactory = options.loggerFactory;
    }
}
export function getInfraLogger(name) {
    return {
        trace: (...args) => loggerFactory(name).trace(...args),
        debug: (...args) => loggerFactory(name).debug(...args),
        info: (...args) => loggerFactory(name).info(...args),
        warn: (...args) => loggerFactory(name).warn(...args),
        error: (...args) => loggerFactory(name).error(...args),
    };
}
