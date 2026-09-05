import { env } from '@napgram/env-kit'
import { getLogger } from '@napgram/logger-kit'
import { runtimeFileIO } from './bun-file-io.js'

const joinPath = (...parts: string[]) => parts.filter(Boolean).join('/').replaceAll(/\/+/g, '/')

const TEMP_PATH = joinPath(env.DATA_DIR, 'temp')

const temp = {
  TEMP_PATH,
  async createTempFile(options?: { postfix?: string, prefix?: string }) {
    await runtimeFileIO.mkdir(TEMP_PATH, { recursive: true })
    const prefix = options?.prefix || 'temp-'
    const filename = `${prefix}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}${options?.postfix || '.tmp'}`
    const filePath = joinPath(TEMP_PATH, filename)

    return {
      path: filePath,
      cleanup: async () => {
        try {
          await runtimeFileIO.remove(filePath, { force: true })
        }
        catch {}
      },
    }
  },
  file(options?: { postfix?: string, prefix?: string }) {
    return temp.createTempFile(options)
  },
}

const random = {
  pick<T>(...items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]
  },
}

export { env, getLogger, temp, random }
