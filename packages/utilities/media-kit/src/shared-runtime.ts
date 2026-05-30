import * as infraKit from '@napgram/infra-kit'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { env as actualEnv } from '@napgram/env-kit'
import { getLogger as actualGetLogger } from '@napgram/logger-kit'

const compat = infraKit as Record<string, any>

function getCompatExport<T>(key: string, fallback: T): T {
  return key in compat ? compat[key] : fallback
}

const fallbackRandom = {
  pick<T>(...items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]
  },
}

const TEMP_PATH = join(actualEnv.DATA_DIR, 'temp')
let tempDirInitialized = false

function ensureTempDir() {
  if (!tempDirInitialized) {
    if (!fs.existsSync(TEMP_PATH)) {
      fs.mkdirSync(TEMP_PATH, { recursive: true })
    }
    tempDirInitialized = true
  }
}

const fallbackTemp = {
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
    return fallbackTemp.createTempFile(options)
  },
}

export const env = getCompatExport('env', actualEnv)
export const getLogger = getCompatExport('getLogger', actualGetLogger)
export const temp = getCompatExport('temp', fallbackTemp)
export const random = getCompatExport('random', fallbackRandom)
