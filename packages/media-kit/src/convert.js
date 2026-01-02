import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import fsP from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { decode, write } from 'image-js';
import { env } from '@napgram/infra-kit';
import { getLogger } from '@napgram/infra-kit';
import convertWithFfmpeg from './encoding/convertWithFfmpeg';
import tgsToGif from './encoding/tgsToGif';
import { temp } from '@napgram/infra-kit';
const CACHE_PATH = env.CACHE_DIR;
let cacheDirInitialized = false;
function ensureCacheDir() {
    if (!cacheDirInitialized) {
        fs.mkdirSync(CACHE_PATH, { recursive: true });
        cacheDirInitialized = true;
    }
}
// 首先查找缓存，要是缓存中没有的话执行第二个参数的方法转换到缓存的文件
async function cachedConvert(key, convert) {
    ensureCacheDir();
    const convertedPath = path.join(CACHE_PATH, key);
    if (!fs.existsSync(convertedPath)) {
        await convert(convertedPath);
    }
    return convertedPath;
}
const convert = {
    cached: cachedConvert,
    cachedBuffer: (key, buf) => cachedConvert(key, async (convertedPath) => {
        await fsP.writeFile(convertedPath, await buf());
    }),
    // webp2png，这里 webpData 是方法因为不需要的话就不获取了
    png: (key, webpData) => cachedConvert(`${key}.png`, async (convertedPath) => {
        const buffer = Buffer.from(await webpData());
        const image = decode(buffer);
        await write(convertedPath, image);
    }),
    video2gif: (key, webmData, webm = false) => cachedConvert(`${key}.gif`, async (convertedPath) => {
        const t = await temp.createTempFile();
        await fsP.writeFile(t.path, await webmData());
        await convertWithFfmpeg(t.path, convertedPath, 'gif', webm ? 'libvpx-vp9' : undefined);
        await t.cleanup();
    }),
    tgs2gif: (key, tgsData) => cachedConvert(`${key}.gif`, async (convertedPath) => {
        const logger = getLogger('TGSConverter');
        const src = await tgsData();
        logger.debug(`[tgs2gif] Start conversion for key: ${key}, dest: ${convertedPath}`);
        logger.debug(`[tgs2gif] src type: ${typeof src}, isBuffer: ${Buffer.isBuffer(src)}`);
        if (Buffer.isBuffer(src)) {
            logger.debug(`[tgs2gif] Processing buffer, size: ${src.length}`);
            const tempDir = path.join(env.DATA_DIR, 'temp');
            await fsP.mkdir(tempDir, { recursive: true });
            const tempTgsPath = path.join(tempDir, `sticker-${Date.now()}-${Math.random().toString(16).slice(2)}.tgs`);
            try {
                logger.debug(`[tgs2gif] Writing TGS buffer to: ${tempTgsPath}`);
                await fsP.writeFile(tempTgsPath, src);
                logger.info(`[tgs2gif] TGS file written successfully, calling tgsToGif...`);
                await tgsToGif(tempTgsPath, convertedPath);
                logger.info(`[tgs2gif] tgsToGif completed, checking output...`);
                // Verify output file exists
                try {
                    const stats = await fsP.stat(convertedPath);
                    logger.info(`[tgs2gif] GIF created successfully, size: ${stats.size}`);
                }
                catch {
                    logger.error(`[tgs2gif] Output GIF file not found: ${convertedPath}`);
                    throw new Error('TGS to GIF conversion produced no output file');
                }
                // Cleanup temp files
                try {
                    await fsP.unlink(tempTgsPath);
                    logger.debug(`[tgs2gif] Cleaned up temp TGS file: ${tempTgsPath}`);
                }
                catch (cleanupErr) {
                    logger.warn(cleanupErr, '[tgs2gif] Failed to cleanup temp TGS file');
                }
            }
            catch (e) {
                logger.error(e, `[tgs2gif] Conversion failed for key: ${key}`);
                logger.error(`[tgs2gif] Error details: ${e instanceof Error ? e.stack : String(e)}`);
                throw e;
            }
        }
        else if (typeof src === 'string' && /\.tgs$/i.test(src)) {
            logger.debug(`[tgs2gif] Processing TGS file path: ${src}`);
            try {
                await tgsToGif(src, convertedPath);
                logger.info(`[tgs2gif] Direct file conversion completed for key: ${key}`);
            }
            catch (e) {
                logger.error(e, `[tgs2gif] Direct file conversion failed for key: ${key}`);
                throw e;
            }
        }
        else {
            const errMsg = `Unsupported sticker source type for key ${key}: ${typeof src}`;
            logger.error(`[tgs2gif] ${errMsg}`);
            throw new Error(errMsg);
        }
    }),
    // 图片转webp (注：Image-JS不支持WebP写入，改为PNG)
    webp: (key, imageData) => cachedConvert(`${key}.png`, async (convertedPath) => {
        const buffer = Buffer.from(await imageData());
        const image = decode(buffer);
        await write(convertedPath, image);
    }),
    webm: (key, filePath) => cachedConvert(`${key}.webm`, async (convertedPath) => {
        await convertWithFfmpeg(filePath, convertedPath, 'webm');
    }),
    webpOrWebm: async (key, imageData) => {
        const filePath = await convert.cachedBuffer(key, imageData);
        const buf = await fsP.readFile(filePath);
        const fileType = await fileTypeFromBuffer(buf);
        if (fileType && fileType.mime === 'image/gif') {
            return await convert.webm(key, filePath);
        }
        else {
            return await convert.webp(key, async () => filePath);
        }
    },
    customEmoji: async (key, imageData, useSmallSize) => {
        if (useSmallSize) {
            const pathPng = path.join(CACHE_PATH, `${key}@50.png`);
            const pathGif = path.join(CACHE_PATH, `${key}@50.gif`);
            if (fs.existsSync(pathPng))
                return pathPng;
            if (fs.existsSync(pathGif))
                return pathGif;
        }
        else {
            const pathPng = path.join(CACHE_PATH, `${key}.png`);
            const pathGif = path.join(CACHE_PATH, `${key}.gif`);
            if (fs.existsSync(pathPng))
                return pathPng;
            if (fs.existsSync(pathGif))
                return pathGif;
        }
        // file not found
        const data = await imageData();
        const fileType = (await fileTypeFromBuffer(data))?.mime || 'image/';
        let pathPngOrig = '';
        let pathGifOrig = '';
        if (fileType.startsWith('image/')) {
            pathPngOrig = await convert.png(key, () => Promise.resolve(data));
        }
        else {
            pathGifOrig = await convert.tgs2gif(key, () => Promise.resolve(data));
        }
        if (!useSmallSize)
            return pathPngOrig || pathGifOrig;
        if (pathPngOrig) {
            return await cachedConvert(`${key}@50.png`, async (convertedPath) => {
                const buffer = await fsP.readFile(pathPngOrig);
                const image = decode(buffer);
                image.resize({ width: 50 });
                await write(convertedPath, image);
            });
        }
        else {
            return await cachedConvert(`${key}@50.gif`, async (convertedPath) => {
                const buffer = await fsP.readFile(pathGifOrig);
                const image = decode(buffer);
                // Image-JS handles frames if it's a GIF (limited support), but simple resize might just stick to first frame or fail.
                // Assuming single frame resize for standard emoji usage or accept limitation.
                image.resize({ width: 50 });
                await write(convertedPath, image);
            });
        }
    },
};
export default convert;
