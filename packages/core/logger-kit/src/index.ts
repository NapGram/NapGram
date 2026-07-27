export { default } from './logger.js'
export { configureLoggerKit as configureInfraKit, getInfraLogger } from './deps.js'
export type { InfraLogger, LoggerFactory } from './deps.js'
export { default as getLogger, redactSensitiveLogText, rotateIfNeeded, setConsoleLogLevel } from './logger.js'
export type { AppLogger } from './logger.js'
export {
  default as telemetry,
  activeWindows,
  captureException,
  captureMessage,
  event,
  flush,
  initTelemetry,
  resolveServiceInstanceId,
  setExceptionFilter,
  shutdown,
} from './telemetry.js'
