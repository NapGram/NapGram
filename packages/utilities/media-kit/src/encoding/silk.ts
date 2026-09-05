import { decode, encode } from 'silk-wasm'
import { runtimeFileIO } from '../bun-file-io.js'
import { spawnFileWithBun } from './bun-spawn.js'
import { temp } from '../shared-runtime.js'

async function runFfmpeg(args: string[]) {
  await spawnFileWithBun('ffmpeg', args)
}

function conventPcmToOgg(pcmPath: string, savePath: string): Promise<void> {
  return runFfmpeg([
    '-y',
    '-f',
    's16le',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-i',
    pcmPath,
    '-c:a',
    'libopus', // 使用 libopus 编码
    '-b:a',
    '24k', // 比特率
    savePath,
  ])
}

export default {
  /**
   * 解码 SILK 为 OGG (Opus)
   */
  async decode(bufSilk: Uint8Array, outputPath: string): Promise<void> {
    // silk-wasm 解码得到 PCM 数据
    const result = await decode(bufSilk, 24000)
    const bufPcm = Uint8Array.from(result.data)

    // 写入临时 PCM 文件
    const { path, cleanup } = await temp.file()
    await runtimeFileIO.write(path, bufPcm)

    // 使用 ffmpeg 将 PCM 转为 OGG
    try {
      await conventPcmToOgg(path, outputPath)
    }
    finally {
      cleanup()
    }
  },

  /**
   * 编码音频文件为 SILK Uint8Array
   */
  async encode(filePath: string): Promise<Uint8Array> {
    const { path: pcmPath, cleanup } = await temp.file()

    try {
      // 1. 转为 PCM
      await runFfmpeg([
        '-y',
        '-i',
        filePath,
        '-f',
        's16le',
        '-ar',
        '24000',
        '-ac',
        '1',
        pcmPath,
      ])

      // 2. 读取 PCM
      const pcmUint8Array = Uint8Array.from(await runtimeFileIO.readBytes(pcmPath))

      // 3. 编码为 SILK (24000Hz)
      const result = await encode(pcmUint8Array, 24000)
      return Uint8Array.from(result.data)
    }
    finally {
      cleanup()
    }
  },
}
