import { env } from '@napgram/env-kit'

interface BunLoggerWriter {
  write(data: string): unknown
  end(): unknown
}

interface BunLoggerRuntime {
  env: Record<string, string | undefined>
  file(path: string): { writer(): BunLoggerWriter }
  stdout: { write(data: string): unknown }
  stderr: { write(data: string): unknown }
  inspect(value: unknown, options?: { depth?: number, colors?: boolean, breakLength?: number, compact?: boolean }): string
  spawnSync(command: string[], options?: { stdin?: string | Uint8Array, stdout?: 'pipe', stderr?: 'pipe' }): {
    exitCode: number
    stdout?: Uint8Array
  }
}

const bunRuntime = (globalThis as typeof globalThis & { Bun: BunLoggerRuntime }).Bun
const decoder = new TextDecoder()

function runBun(command: string[], options?: { stdin?: string | Uint8Array, stdout?: 'pipe', stderr?: 'pipe' }) {
  return bunRuntime.spawnSync(command, options)
}

const pathUtils = {
  dirname(filePath: string) {
    const index = filePath.lastIndexOf('/')
    return index > 0 ? filePath.slice(0, index) : '.'
  },
  join(...parts: string[]) {
    return parts.filter(Boolean).join('/')
  },
}

const bunFileIO = {
  existsSync(filePath: string) {
    return runBun(['test', '-e', filePath]).exitCode === 0
  },
  mkdirSync(filePath: string) {
    const result = runBun(['mkdir', '-p', filePath])
    if (result.exitCode !== 0) throw new Error(`Failed to create directory: ${filePath}`)
  },
  readdirSync(filePath: string) {
    // busybox find (Alpine images) has no -printf; list full paths and
    // reduce to basenames here instead.
    const result = runBun(['find', filePath, '-maxdepth', '1', '-type', 'f'], { stdout: 'pipe' })
    if (result.exitCode !== 0) throw new Error(`Failed to list directory: ${filePath}`)
    return decoder
      .decode(result.stdout ?? new Uint8Array())
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((full) => full.slice(full.lastIndexOf('/') + 1))
  },
  statSync(filePath: string) {
    const result = runBun(['stat', '-c', '%Y', filePath], { stdout: 'pipe' })
    if (result.exitCode !== 0) throw new Error(`Failed to stat file: ${filePath}`)
    return { mtimeMs: Number(decoder.decode(result.stdout ?? new Uint8Array()).trim()) * 1000 }
  },
  unlinkSync(filePath: string) {
    const result = runBun(['rm', '-f', filePath])
    if (result.exitCode !== 0) throw new Error(`Failed to remove file: ${filePath}`)
  },
  createWriteStream(filePath: string) {
    return bunRuntime.file(filePath).writer()
  },
}


type LogLevel = 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
type EnvLogLevel = Exclude<LogLevel, 'silly'> | 'mark' | 'off'

const levelId: Record<LogLevel | 'mark' | 'off', number> = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
  mark: 3,
  off: 7,
}

function normalizeLevel(level: string | undefined): EnvLogLevel {
  const normalized = (level || '').toLowerCase()
  if (['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off'].includes(normalized)) {
    return normalized as EnvLogLevel
  }
  return 'info'
}

let consoleLevel = normalizeLevel(env.LOG_LEVEL as any)
const fileLevel = normalizeLevel(env.LOG_FILE_LEVEL as any)
let consoleThreshold = levelId[consoleLevel]
const fileThreshold = levelId[fileLevel]
const fileLoggingRequested = fileThreshold < levelId.off
const tz = bunRuntime.env.TZ || 'Asia/Shanghai'
const timeFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: tz,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: tz,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const logDir = pathUtils.dirname(env.LOG_FILE)
let fileStream: BunLoggerWriter | null = null
let fileLoggingEnabled = fileLoggingRequested
if (fileLoggingRequested) {
  try {
    if (!bunFileIO.existsSync(logDir)) {
      bunFileIO.mkdirSync(logDir)
    }
  }
  catch {
    fileLoggingEnabled = false
  }
}

function cleanupOldLogs() {
  if (!fileLoggingEnabled || !bunFileIO.existsSync(logDir)) return

  try {
    const retentionDays = env.LOG_RETENTION_DAYS
    if (retentionDays <= 0) return

    const now = Date.now()
    const files = bunFileIO.readdirSync(logDir)

    for (const file of files) {
      if (!file.endsWith('.log') && !file.endsWith('.jsonl')) continue

      const filePath = pathUtils.join(logDir, file)
      try {
        const stat = bunFileIO.statSync(filePath)
        const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24)

        if (ageDays > retentionDays) {
          bunFileIO.unlinkSync(filePath)
          bunRuntime.stdout.write(`[Logger] Cleaned up old log file: ${file} (Age: ${ageDays.toFixed(1)} days)\n`)
        }
      }
      catch {
      }
    }
  }
  catch (error) {
    bunRuntime.stderr.write(`[Logger] Failed to cleanup logs: ${error}\n`)
  }
}

cleanupOldLogs()

function buildDatedFile(dateStr: string) {
  return pathUtils.join(logDir, `${dateStr}.1.jsonl`)
}

let currentDate = dateFormatter.format(new Date())
if (fileLoggingEnabled) {
  try {
    fileStream = bunFileIO.createWriteStream(buildDatedFile(currentDate))
  }
  catch {
    fileLoggingEnabled = false
    fileStream = null
  }
}

export function rotateIfNeeded() {
  if (!fileLoggingEnabled || !fileStream) return
  const today = dateFormatter.format(new Date())
  if (today === currentDate) return

  fileStream.end()
  currentDate = today
  try {
    fileStream = bunFileIO.createWriteStream(buildDatedFile(currentDate))
    cleanupOldLogs()
  }
  catch {
    fileLoggingEnabled = false
    fileStream = null
  }
}

export function redactSensitiveLogText(value: string): string {
  return value
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_token|auth_token|api_token|admin_token|token|password|secret)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/(\b(?:access_token|auth_token|api_token|admin_token|token|password|secret)\b(?:\s*\([^)]*\))?\s*[:=]\s*['"]?)[^'"\s,;&}]+/gi, '$1[REDACTED]')
}

function formatArgs(args: unknown[]) {
  return args.map((arg) => {
    if (typeof arg === 'string')
      return redactSensitiveLogText(arg)

    return redactSensitiveLogText(bunRuntime.inspect(arg, { depth: 4, colors: false, breakLength: Number.POSITIVE_INFINITY, compact: true }))
  })
}

const resetColor = '\x1B[0m'

const MODULE_COLORS: Record<string, string> = {
  steel_blue: '\x1B[38;5;67m',
  orange: '\x1B[38;5;208m',
  bright_green: '\x1B[38;5;82m',
  pale_blue: '\x1B[38;5;68m',
  bold_white: '\x1B[1;97m',
  bright_yellow: '\x1B[93m',
  bright_purple: '\x1B[95m',
  bright_cyan: '\x1B[96m',
  purple: '\x1B[35m',
  dark_grey: '\x1B[38;5;242m',
  cyan: '\x1B[38;5;45m',
  green: '\x1B[38;5;10m',
  grey: '\x1B[38;5;8m',
  soft_pink: '\x1B[38;5;175m',
  dark_orange: '\x1B[38;5;166m',
  light_purple: '\x1B[38;5;141m',
  gold: '\x1B[38;5;220m',
  teal: '\x1B[38;5;30m',
  crimson: '\x1B[38;5;161m',
  sky_blue: '\x1B[38;5;39m',
}

const LOGGER_COLOR_MAP: Record<string, string> = {
  Instance: MODULE_COLORS.bold_white,
  Main: MODULE_COLORS.bold_white,
  Plugin: MODULE_COLORS.purple,
  ForwardFeature: MODULE_COLORS.bright_green,
  ForwardPair: MODULE_COLORS.bright_yellow,
  TelegramSender: MODULE_COLORS.steel_blue,
  MediaSender: MODULE_COLORS.pale_blue,
  TelegramReply: MODULE_COLORS.steel_blue,
  TelegramMessageHandler: MODULE_COLORS.cyan,
  QQMessageHandler: MODULE_COLORS.cyan,
  MediaGroupHandler: MODULE_COLORS.pale_blue,
  ModeCommandHandler: MODULE_COLORS.orange,
  CommandsFeature: MODULE_COLORS.orange,
  HelpCommandHandler: MODULE_COLORS.orange,
  UnbindCommandHandler: MODULE_COLORS.orange,
  StatusCommandHandler: MODULE_COLORS.orange,
  BindCommandHandler: MODULE_COLORS.orange,
  RecallCommandHandler: MODULE_COLORS.orange,
  PermissionChecker: MODULE_COLORS.orange,
  InteractiveStateManager: MODULE_COLORS.orange,
  TelegramClient: MODULE_COLORS.dark_grey,
  QQClientFactory: MODULE_COLORS.bright_purple,
  NapCatAdapter: MODULE_COLORS.dark_grey,
  'Web Api': MODULE_COLORS.teal,
  ReconnectingWS: MODULE_COLORS.teal,
  QQAvatar: MODULE_COLORS.teal,
  telegramAvatar: MODULE_COLORS.teal,
  RecallFeature: MODULE_COLORS.soft_pink,
  CacheManager: MODULE_COLORS.soft_pink,
  MediaFeature: MODULE_COLORS.sky_blue,
  NapCatConverter: MODULE_COLORS.bright_cyan,
  MessageConverter: MODULE_COLORS.bright_cyan,
  FileNormalizer: MODULE_COLORS.bright_cyan,
  AudioConverter: MODULE_COLORS.bright_cyan,
  TextSegmentConverter: MODULE_COLORS.bright_cyan,
  MediaSegmentConverter: MODULE_COLORS.bright_cyan,
  MessageUtils: MODULE_COLORS.bright_cyan,
  ReplyResolver: MODULE_COLORS.bright_cyan,
  convertWithFfmpeg: MODULE_COLORS.bright_cyan,
  PerformanceMonitor: MODULE_COLORS.light_purple,
  MessageQueue: MODULE_COLORS.light_purple,
  NotificationService: MODULE_COLORS.crimson,
}

function getLoggerColor(name: string) {
  if (LOGGER_COLOR_MAP[name]) return LOGGER_COLOR_MAP[name]
  for (const key of Object.keys(LOGGER_COLOR_MAP)) {
    if (name.startsWith(key)) return LOGGER_COLOR_MAP[key]
  }

  const safeColors = [
    MODULE_COLORS.steel_blue,
    MODULE_COLORS.bright_green,
    MODULE_COLORS.orange,
    MODULE_COLORS.bright_yellow,
    MODULE_COLORS.bright_purple,
    MODULE_COLORS.cyan,
  ]

  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return safeColors[Math.abs(hash) % safeColors.length]
}

function writeFileLog(level: LogLevel, name: string, args: unknown[]) {
  if (!fileLoggingEnabled || !fileStream) return
  if (levelId[level] < fileThreshold) return
  rotateIfNeeded()
  const record = {
    ts: new Date().toISOString(),
    level,
    name,
    args: formatArgs(args),
  }
  fileStream.write(`${JSON.stringify(record)}\n`)
}

function writeConsole(level: LogLevel, name: string, args: unknown[]) {
  if (levelId[level] < consoleThreshold) return
  const ts = timeFormatter.format(new Date()).replace(' ', 'T')
  const color = getLoggerColor(name)
  const levelLabel = level.toUpperCase().padEnd(5)
  const prefix = `${color}[${name}]${resetColor}`
  bunRuntime.stdout.write(`${ts} ${levelLabel} ${prefix} ${formatArgs(args).join(' ')}\n`)
}

export function setConsoleLogLevel(level: string) {
  consoleLevel = normalizeLevel(level)
  consoleThreshold = levelId[consoleLevel]
}

export type AppLogger = {
  trace: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export default function getLogger(name: string): AppLogger {
  const base = (level: LogLevel, args: unknown[]) => {
    writeConsole(level, name, args)
    writeFileLog(level, name, args)
  }

  return {
    trace: (...args) => base('trace', args),
    debug: (...args) => base('debug', args),
    info: (...args) => base('info', args),
    warn: (...args) => base('warn', args),
    error: (...args) => base('error', args),
  }
}
