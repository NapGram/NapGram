import { describe, expect, test } from 'bun:test'
import { BunSpawnError, spawnFileWithBun } from '../encoding/bun-spawn.js'

describe('Bun spawn adapter', () => {
  test('runs an argv array and captures output', async () => {
    const calls: string[][] = []
    const result = await spawnFileWithBun('ffmpeg', ['-y', '-i', 'input file'], {}, {
      spawn(argv) {
        calls.push(argv)
        return {
          stdout: { text: async () => 'stdout' },
          stderr: { text: async () => '' },
          exited: Promise.resolve(0),
        }
      },
    })

    expect(calls).toEqual([['ffmpeg', '-y', '-i', 'input file']])
    expect(result.stdout).toBe('stdout')
    expect(result.exitCode).toBe(0)
  })

  test('retains stderr on failure', async () => {
    await expect(spawnFileWithBun('ffmpeg', [], {}, {
      spawn() {
        return {
          stdout: { text: async () => '' },
          stderr: { text: async () => 'codec failed' },
          exited: Promise.resolve(1),
        }
      },
    })).rejects.toBeInstanceOf(BunSpawnError)
  })

  test('runs the Bun subprocess contract without a Node fallback', async () => {
    const result = await spawnFileWithBun('printf', ['strict'])

    expect(result.stdout).toBe('strict')
    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
  })
})
