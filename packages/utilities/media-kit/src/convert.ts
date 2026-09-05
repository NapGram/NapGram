import { Transformer, ResizeFit } from '@napi-rs/image'
import { fileTypeFromBuffer } from 'file-type'
import { runtimeFileIO } from './bun-file-io.js'
import convertWithFfmpeg from './encoding/convertWithFfmpeg.js'
import { env, getLogger, temp } from './shared-runtime.js'
import tgsToGif from './encoding/tgsToGif.js'

const joinPath = (...parts: string[]) => parts.filter(Boolean).join('/').replaceAll(/\/+/g, '/')

const CACHE_PATH = env.CACHE_DIR
let cacheDirInitialized = false
async function ensureCacheDir() {
    if (!cacheDirInitialized) {
        await runtimeFileIO.mkdir(CACHE_PATH, { recursive: true })
        cacheDirInitialized = true
    }
}

// 首先查找缓存，要是缓存中没有的话执行第二个参数的方法转换到缓存的文件
async function cachedConvert(key: string, convert: (outputPath: string) => Promise<any>) {
    await ensureCacheDir()
    const convertedPath = joinPath(CACHE_PATH, key)
    if (!await runtimeFileIO.exists(convertedPath)) {
        await convert(convertedPath)
    }
    return convertedPath
}

const convert = {
    cached: cachedConvert,
    cachedBuffer: (key: string, buf: () => Promise<Uint8Array | string>) =>
        cachedConvert(key, async (convertedPath) => {
            await runtimeFileIO.write(convertedPath, await buf())
        }),
    // webp2png，这里 webpData 是方法因为不需要的话就不获取了
    png: (key: string, webpData: () => Promise<Uint8Array | string>) =>
        cachedConvert(`${key}.png`, async (convertedPath) => {
            const source = await webpData()
            const buffer = typeof source === 'string' ? await runtimeFileIO.readBytes(source) : new Uint8Array(source)
            const image = new Transformer(buffer)
            await runtimeFileIO.write(convertedPath, await image.png())
        }),
    video2gif: (key: string, webmData: () => Promise<Uint8Array | string>, webm = false) =>
        cachedConvert(`${key}.gif`, async (convertedPath) => {
            const t = await temp.createTempFile()
            await runtimeFileIO.write(t.path, await webmData())
            await convertWithFfmpeg(t.path, convertedPath, 'gif', webm ? 'libvpx-vp9' : undefined)
            await t.cleanup()
        }),
    tgs2gif: (key: string, tgsData: () => Promise<Uint8Array | string>) =>
        cachedConvert(`${key}.gif`, async (convertedPath) => {
            const logger = getLogger('TGSConverter')
            const src = await tgsData()

            logger.debug(`[tgs2gif] Start conversion for key: ${key}, dest: ${convertedPath}`)
            logger.debug(`[tgs2gif] src type: ${typeof src}, isBuffer: ${src instanceof Uint8Array}`)

            if (src instanceof Uint8Array) {
                logger.debug(`[tgs2gif] Processing buffer, size: ${src.length}`)
                const tempDir = joinPath(env.DATA_DIR, 'temp')
                await runtimeFileIO.mkdir(tempDir, { recursive: true })

                const tempTgsPath = joinPath(tempDir, `sticker-${Date.now()}-${Math.random().toString(16).slice(2)}.tgs`)

                try {
                    logger.debug(`[tgs2gif] Writing TGS buffer to: ${tempTgsPath}`)
                    await runtimeFileIO.write(tempTgsPath, src)
                    logger.info(`[tgs2gif] TGS file written successfully, calling tgsToGif...`)

                    await tgsToGif(tempTgsPath, convertedPath)
                    logger.info(`[tgs2gif] tgsToGif completed, checking output...`)

                    // Verify output file exists
                    try {
                        const stats = await runtimeFileIO.stat(convertedPath)
                        logger.info(`[tgs2gif] GIF created successfully, size: ${stats.size}`)
                    }
                    catch {
                        logger.error(`[tgs2gif] Output GIF file not found: ${convertedPath}`)
                        throw new Error('TGS to GIF conversion produced no output file')
                    }

                    // Cleanup temp files
                    try {
                        await runtimeFileIO.unlink(tempTgsPath)
                        logger.debug(`[tgs2gif] Cleaned up temp TGS file: ${tempTgsPath}`)
                    }
                    catch (cleanupErr) {
                        logger.warn(cleanupErr, '[tgs2gif] Failed to cleanup temp TGS file')
                    }
                }
                catch (e) {
                    logger.error(e, `[tgs2gif] Conversion failed for key: ${key}`)
                    logger.error(`[tgs2gif] Error details: ${e instanceof Error ? e.stack : String(e)}`)
                    throw e
                }
            }
            else if (typeof src === 'string' && /\.tgs$/i.test(src)) {
                logger.debug(`[tgs2gif] Processing TGS file path: ${src}`)
                try {
                    await tgsToGif(src, convertedPath)
                    logger.info(`[tgs2gif] Direct file conversion completed for key: ${key}`)
                }
                catch (e) {
                    logger.error(e, `[tgs2gif] Direct file conversion failed for key: ${key}`)
                    throw e
                }
            }
            else {
                const errMsg = `Unsupported sticker source type for key ${key}: ${typeof src}`
                logger.error(`[tgs2gif] ${errMsg}`)
                throw new Error(errMsg)
            }
        }),
    // Telegram photo compatibility: normalize static images to PNG.
    webp: (key: string, imageData: () => Promise<Uint8Array | string>) =>
        cachedConvert(`${key}.png`, async (convertedPath) => {
            const source = await imageData()
            const buffer = typeof source === 'string' ? await runtimeFileIO.readBytes(source) : new Uint8Array(source)
            const image = new Transformer(buffer)
            await runtimeFileIO.write(convertedPath, await image.png())
        }),
    webm: (key: string, filePath: string) =>
        cachedConvert(`${key}.webm`, async (convertedPath) => {
            await convertWithFfmpeg(filePath, convertedPath, 'webm')
        }),
    webpOrWebm: async (key: string, imageData: () => Promise<Uint8Array>) => {
        const filePath = await convert.cachedBuffer(key, imageData)
        const buf = new Uint8Array(await runtimeFileIO.readBytes(filePath))
        const fileType = await fileTypeFromBuffer(buf)
        if (fileType && fileType.mime === 'image/gif') {
            return await convert.webm(key, filePath)
        }
        else {
            return await convert.webp(key, async () => filePath)
        }
    },
    customEmoji: async (key: string, imageData: () => Promise<Uint8Array | string>, useSmallSize: boolean) => {
        if (useSmallSize) {
            const pathPng = joinPath(CACHE_PATH, `${key}@50.png`)
            const pathGif = joinPath(CACHE_PATH, `${key}@50.gif`)
            if (await runtimeFileIO.exists(pathPng))
                return pathPng
            if (await runtimeFileIO.exists(pathGif))
                return pathGif
        }
        else {
            const pathPng = joinPath(CACHE_PATH, `${key}.png`)
            const pathGif = joinPath(CACHE_PATH, `${key}.gif`)
            if (await runtimeFileIO.exists(pathPng))
                return pathPng
            if (await runtimeFileIO.exists(pathGif))
                return pathGif
        }
        // file not found
        const data = await imageData() as Uint8Array
        const fileType = (await fileTypeFromBuffer(data))?.mime || 'image/'
        let pathPngOrig = ''
        let pathGifOrig = ''
        if (fileType.startsWith('image/')) {
            pathPngOrig = await convert.png(key, () => Promise.resolve(data))
        }
        else {
            pathGifOrig = await convert.tgs2gif(key, () => Promise.resolve(data))
        }
        if (!useSmallSize)
            return pathPngOrig || pathGifOrig
        if (pathPngOrig) {
            return await cachedConvert(`${key}@50.png`, async (convertedPath) => { // 缩小到50x50px
                const buffer = new Uint8Array(await runtimeFileIO.readBytes(pathPngOrig))
                const image = new Transformer(buffer)
                const metadata = image.metadataSync()
                const height = Math.max(1, Math.round(metadata.height * 50 / metadata.width))
                image.resize(50, height, undefined, ResizeFit.Fill)
                await runtimeFileIO.write(convertedPath, await image.png())
            })
        }
        else {
            return await cachedConvert(`${key}@50.gif`, async (convertedPath) => {
                await convertWithFfmpeg(pathGifOrig, convertedPath, 'gif', undefined, 'scale=50:-1')
            })
        }
    },
}

export default convert
