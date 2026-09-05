import { getLogger } from '../shared-runtime.js'
import { runtimeFileIO } from '../bun-file-io.js'
import { spawnFileWithBun } from './bun-spawn.js'

const logger = getLogger('convertWithFfmpeg')

export default async function (sourcePath: string, targetPath: string, format: string, srcFormat?: string, videoFilter?: string) {
  try {
    const args: string[] = ['-y']
    if (srcFormat) {
      args.push('-c:v', srcFormat)
    }
    args.push('-i', sourcePath)
    if (format === 'gif') {
      if (videoFilter) {
        args.push('-filter_complex', `[0:v]${videoFilter},palettegen=reserve_transparent=on [p]; [0:v]${videoFilter}[scaled]; [scaled][p]paletteuse=dither=floyd_steinberg`)
      }
      else {
        args.push('-filter_complex', '[0:v] palettegen=reserve_transparent=on [p]; [0:v][p] paletteuse=dither=floyd_steinberg')
      }
    }
    if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9')
    }
    if (format === 'png') {
      args.push('-frames:v', '1', '-c:v', 'png', '-f', 'image2', targetPath)
    }
    else {
      args.push('-f', format, targetPath)
    }

    logger.debug(`正在启动 ffmpeg: ffmpeg ${args.join(' ')}`)
    await spawnFileWithBun('ffmpeg', args)
  }
  catch (e) {
    logger.error(e, 'ffmpeg 转换失败')
    try {
      const stats = await runtimeFileIO.stat(targetPath)
      logger.debug(`转换结果文件大小: ${stats.size}`)
      if (!stats.size) {
        logger.error(new Error('转换结果文件为空'), `转换结果文件为空: ${targetPath}`)
        await runtimeFileIO.remove(targetPath)
      }
    }
    catch (cleanupError) {
      logger.warn(cleanupError, `无法清理转换结果文件: ${targetPath}`)
    }
    throw e
  }
}
