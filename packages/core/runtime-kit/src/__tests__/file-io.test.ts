import { describe, expect, test } from 'bun:test'
import { createBunFileIO } from '../file-io.js'

describe('Bun file I/O capabilities', () => {
  test('supports copy, streaming writes, and directory entries', async () => {
    const files = new Map<string, Uint8Array>([
      ['source.txt', new TextEncoder().encode('source')],
      ['dir/file.txt', new TextEncoder().encode('file')],
    ])
    const directories = new Set(['dir'])

    const runtime = {
      file(path: string) {
        return {
          async bytes() { return files.get(path) || new Uint8Array() },
          async text() { return new TextDecoder().decode(files.get(path) || new Uint8Array()) },
          async exists() { return files.has(path) || directories.has(path) },
          async stat() {
            const isDirectory = directories.has(path)
            return {
              size: files.get(path)?.byteLength || 0,
              mtime: new Date(0),
              mode: 0o644,
              isDirectory: () => isDirectory,
              isFile: () => !isDirectory,
            }
          },
          unlink() {
            files.delete(path)
            return Promise.resolve()
          },
          writer() {
            return {
              write(data: string | Uint8Array | ArrayBuffer) {
                const value = typeof data === 'string'
                  ? new TextEncoder().encode(data)
                  : data instanceof ArrayBuffer ? new Uint8Array(data) : data
                const previous = files.get(path) || new Uint8Array()
                const merged = new Uint8Array(previous.byteLength + value.byteLength)
                merged.set(previous)
                merged.set(value, previous.byteLength)
                files.set(path, merged)
                return value.byteLength
              },
              end() {
                return 0
              },
            }
          },
        }
      },
      async write(path: string, data: any) {
        const value = typeof data === 'string'
          ? new TextEncoder().encode(data)
          : data?.bytes ? await data.bytes() : data instanceof ArrayBuffer ? new Uint8Array(data) : data
        files.set(path, new Uint8Array(value))
        return value.byteLength
      },
      Glob: class {
        scan() {
          return (async function* () {
            yield 'file.txt'
          })()
        }
      },
    } as any

    const io = createBunFileIO(runtime)
    await io.copyFile('source.txt', 'copy.txt')
    expect(await io.readText('copy.txt')).toBe('source')

    const writer = await io.openWrite('stream.txt')
    await writer.write(new TextEncoder().encode('streamed'))
    await writer.close()
    expect(await io.readText('stream.txt')).toBe('streamed')

    const entries = await io.readdirEntries('dir')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe('file.txt')
    expect(entries[0]?.isFile()).toBe(true)
  })
})
