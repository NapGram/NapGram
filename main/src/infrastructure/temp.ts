import { joinPath } from '../shared/utils/path.js'
import { env } from '@napgram/env-kit'
import { runtimeFileIO } from '@napgram/runtime-kit'

export const TEMP_PATH = joinPath(env.DATA_DIR, 'temp')

let tempDirInitialization: Promise<void> | undefined

async function ensureTempDir() {
  if (!tempDirInitialization) {
    const initialization = (async () => {
      if (!await runtimeFileIO.exists(TEMP_PATH)) {
        await runtimeFileIO.mkdir(TEMP_PATH, { recursive: true })
      }
    })()
    tempDirInitialization = initialization.catch((error) => {
      tempDirInitialization = undefined
      throw error
    })
  }

  await tempDirInitialization
}

export async function createTempFile(options?: { postfix?: string, prefix?: string }) {
  await ensureTempDir()
  const filename = `${options?.prefix || 'temp-'}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}${options?.postfix || '.tmp'}`
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
}

export const file = createTempFile
