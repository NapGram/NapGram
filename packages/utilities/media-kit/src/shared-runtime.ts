import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from '@napgram/env-kit'
import { getLogger } from '@napgram/logger-kit'

const TEMP_PATH = join(env.DATA_DIR, 'temp')
let tempDirInitialized = false

function ensureTempDir() {
  if (!tempDirInitialized) {
    if (!fs.existsSync(TEMP_PATH)) {
      fs.mkdirSync(TEMP_PATH, { recursive: true })
    }
    tempDirInitialized = true
  }
}

const temp = {
  TEMP_PATH,
  async createTempFile(options?: { postfix?: string, prefix?: string }) {
    ensureTempDir()
    const prefix = options?.prefix || 'temp-'
    const filename = `${prefix}${randomBytes(6).toString('hex')}${options?.postfix || '.tmp'}`
    const filePath = join(TEMP_PATH, filename)

    return {
      path: filePath,
      cleanup: async () => {
        try {
          await rm(filePath, { force: true })
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
