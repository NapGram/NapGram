import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import z from 'zod'

const detectDefaultUiPath = () => {
  const devPath = path.resolve('../web/dist')
  if (fs.existsSync(devPath) && fs.existsSync(path.join(devPath, 'index.html'))) {
    return devPath
  }
  return undefined
}

const processUiPath = (value: unknown) => {
  const val = value === '' ? undefined : value
  return val ?? detectDefaultUiPath()
}

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value)

if (process.env.NODE_ENV === 'test') {
  process.env.TG_API_ID ??= '1'
  process.env.TG_API_HASH ??= 'dummy-hash'
  process.env.TG_BOT_TOKEN ??= 'dummy-token'
}

const configParsed = z.object({
  DATA_DIR: z.string().default(path.resolve('./data')),
  DATABASE_URL: z.string().default('postgresql://postgres:password@localhost:5432/napgram'),
  CACHE_DIR: z.string().default(path.join(process.env.DATA_DIR || path.resolve('./data'), 'cache')),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('info'),
  LOG_FILE_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('debug'),
  LOG_FILE: z.string().default(path.join(process.env.DATA_DIR || path.resolve('./data'), 'logs', 'app.log')),
  LOG_RETENTION_DAYS: z.string().regex(/^\d+$/).default('30').transform(Number),
  OICQ_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('warn'),
  TG_LOG_LEVEL: z.enum(['none', 'error', 'warn', 'info', 'debug']).default('warn'),

  FFMPEG_PATH: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),
  FFPROBE_PATH: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),

  NAPCAT_WS_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()).optional(),
  NAPCAT_WS_TOKEN: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),

  SIGN_API: z.preprocess(emptyStringToUndefined, z.string().url().optional()).optional(),
  SIGN_VER: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),

  TG_API_ID: z.string().regex(/^\d+$/).transform(Number),
  TG_API_HASH: z.string(),
  TG_BOT_TOKEN: z.string(),
  TG_CONNECTION: z.enum(['websocket', 'tcp']).default('tcp'),
  TG_INITIAL_DCID: z.preprocess(emptyStringToUndefined, z.string().regex(/^\d+$/).transform(Number).optional()).optional(),
  TG_INITIAL_SERVER: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),
  TG_USE_TEST_DC: z.string().default('false').transform(v => ['true', '1', 'yes'].includes(v.toLowerCase())),
  TG_MEDIA_TTL_SECONDS: z.string().regex(/^\d+$/).transform(Number).optional(),
  IPV6: z.string().default('false').transform(v => ['true', '1', 'yes'].includes(v.toLowerCase())),
  ADMIN_QQ: z.preprocess(emptyStringToUndefined, z.string().regex(/^\d+$/).transform(Number).optional()).optional(),
  ADMIN_TG: z.preprocess(emptyStringToUndefined, z.string().regex(/^-?\d+$/).transform(Number).optional()).optional(),

  PROXY_IP: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),
  PROXY_PORT: z.preprocess(emptyStringToUndefined, z.string().regex(/^\d+$/).transform(Number).optional()).optional(),
  PROXY_USERNAME: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),
  PROXY_PASSWORD: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),

  TGS_TO_GIF: z.string().default('tgs_to_gif'),

  DISABLE_FILE_UPLOAD_TIP: z.string().default('false').transform(v => ['true', '1', 'yes'].includes(v.toLowerCase())),
  IMAGE_SUMMARY: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),
  ENABLE_FEATURE_MANAGER: z.string().default('false').transform(v => ['true', '1', 'yes'].includes(v.toLowerCase())),

  LISTEN_PORT: z.string().regex(/^\d+$/).default('8080').transform(Number),

  ADMIN_TOKEN: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),
  UI_PATH: z.preprocess(processUiPath, z.string().optional()).optional(),
  UI_PROXY: z.preprocess(emptyStringToUndefined, z.string().url().optional()).optional(),
  WEB_ENDPOINT: z.preprocess(emptyStringToUndefined, z.string().url().optional()).optional(),
  RICH_HEADER_VERSION: z.preprocess(emptyStringToUndefined, z.string().optional()).optional(),
  INTERNAL_WEB_ENDPOINT: z.preprocess(emptyStringToUndefined, z.string().url().optional()).optional(),

  ERROR_REPORTING: z.string().default('1').transform(v => ['true', '1', 'yes'].includes(v.toLowerCase())),

  SHOW_NICKNAME_MODE: z.string().regex(/^[01]{2}$/).default('11'),
  FORWARD_MODE: z.string().regex(/^[01]{2}$/).default('11'),
  COMMAND_REPLY_BOTH_SIDES: z.string().default('false').transform(v => ['true', '1', 'yes'].includes(v.toLowerCase())),
  ENABLE_AUTO_RECALL: z.string().default('true').transform(v => ['true', '1', 'yes'].includes(v.toLowerCase())),
  ENABLE_OFFLINE_NOTIFICATION: z.string().default('true').transform(v => ['true', '1', 'yes'].includes(v.toLowerCase())),
  OFFLINE_NOTIFICATION_COOLDOWN: z.string().regex(/^\d+$/).default('3600000').transform(Number),

  REPO: z.string().default('Local Build'),
  REF: z.string().default('Local Build'),
  COMMIT: z.string().default('Local Build'),
}).safeParse(process.env)

if (!configParsed.success) {
  console.error('环境变量解析错误:', (configParsed as any).error)
  process.exit(1)
}

export default configParsed.data
