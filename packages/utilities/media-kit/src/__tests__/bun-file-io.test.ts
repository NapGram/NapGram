import { describe, expect, test } from 'bun:test'
import { createBunFileIO } from '../bun-file-io.js'

describe('Bun file I/O adapter', () => {
  test('uses Bun.file and Bun.write for whole-file operations', async () => {
    const files = new Map<string, Uint8Array>([['input.bin', new Uint8Array([1, 2, 3])]])
    const runtime = {
      file(path: string) {
        return {
          async bytes() { return files.get(path) || new Uint8Array() },
          async text() { return new TextDecoder().decode(files.get(path) || new Uint8Array()) },
          async exists() { return files.has(path) },
        }
      },
      async write(path: string, data: string | Uint8Array) {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
        files.set(path, new Uint8Array(bytes))
        return bytes.byteLength
      },
    }
    const io = createBunFileIO(runtime)

    expect(await io.readBytes('input.bin')).toEqual(new Uint8Array([1, 2, 3]))
    await io.write('output.bin', 'hello')
    expect(await io.readText('output.bin')).toBe('hello')
    expect(await io.exists('output.bin')).toBe(true)
    expect(await io.exists('missing.bin')).toBe(false)
  })
})
