import { runtimeFileIO } from '@napgram/runtime-kit'
import env from './env.js'

function joinPath(...parts: string[]): string {
    return parts.reduce((joined, part) => {
        if (!joined) return part
        return `${joined.replace(/[\\/]+$/, '')}/${part.replace(/^[/\\]+/, '')}`
    }, '')
}

export const TEMP_PATH = joinPath(env.DATA_DIR, 'temp')

// Initialize lazily to avoid permission issues when only importing.
let tempDirInitialized = false
async function ensureTempDir() {
    if (tempDirInitialized && await runtimeFileIO.exists(TEMP_PATH)) return
    if (!await runtimeFileIO.exists(TEMP_PATH)) {
        await runtimeFileIO.mkdir(TEMP_PATH, { recursive: true })
    }
    tempDirInitialized = true
}

export async function createTempFile(options?: { postfix?: string, prefix?: string }) {
    await ensureTempDir()
    const filename = `temp-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}${options?.postfix || '.tmp'}`
    const filePath = joinPath(TEMP_PATH, filename)

    return {
        path: filePath,
        cleanup: async () => {
            try {
                await runtimeFileIO.remove(filePath, { force: true })
            }
            catch { }
        },
    }
}

export const file = createTempFile
