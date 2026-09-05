import { afterEach, describe, expect, it } from 'bun:test'
import { runtimeFileIO } from '@napgram/runtime-kit'
import { createTempFile, TEMP_PATH } from '../temp.js'

const createdPaths: string[] = []
const dirname = (filePath: string) => filePath.slice(0, filePath.lastIndexOf('/'))

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map(async (filePath) => {
    await runtimeFileIO.remove(filePath, { force: true })
  }))
})

describe('temp utils', () => {
  it('creates a temp path under TEMP_PATH', async () => {
    const temp = await createTempFile({ postfix: '.log' })
    createdPaths.push(temp.path)

    expect(dirname(temp.path)).toBe(TEMP_PATH)
    expect(temp.path.endsWith('.log')).toBe(true)
  })

  it('cleanup removes created file', async () => {
    const temp = await createTempFile()
    createdPaths.push(temp.path)

    await runtimeFileIO.write(temp.path, 'test')
    expect(await runtimeFileIO.exists(temp.path)).toBe(true)

    await temp.cleanup()

    expect(await runtimeFileIO.exists(temp.path)).toBe(false)
  })

  it('recreates the temp directory if an external cleanup removed it', async () => {
    await runtimeFileIO.remove(TEMP_PATH, { recursive: true, force: true })

    const temp = await createTempFile()
    createdPaths.push(temp.path)

    expect(await runtimeFileIO.exists(TEMP_PATH)).toBe(true)
    await temp.cleanup()
  })
})
