import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';
import { getLogger } from '@napgram/infra-kit';
/**
 * File normalization and handling utilities
 * Converts various file sources (Buffer, Stream, URL, path) to normalized format
 */
export class FileNormalizer {
    media;
    logger = getLogger('FileNormalizer');
    constructor(media) {
        this.media = media;
    }
    /**
     * Normalize input file from various sources to Buffer with metadata
     */
    async normalizeInputFile(src, fallbackName) {
        if (!src)
            return undefined;
        let data;
        let fileName = path.basename(fallbackName || 'file') || 'file';
        let fileMime;
        if (src.data && src.fileName) {
            fileName = path.basename(src.fileName || fileName);
            if (Buffer.isBuffer(src.data)) {
                data = src.data;
            }
            else if (src.data instanceof Readable) {
                data = await this.streamToBuffer(src.data);
            }
        }
        else if (Buffer.isBuffer(src)) {
            data = src;
        }
        else if (typeof src === 'string') {
            if (src.startsWith('/')) {
                ({ data, fileName } = await this.tryReadLocalWithFallback(src, fileName) || { data, fileName });
                if (!data)
                    return undefined;
            }
            else if (/^https?:\/\//.test(src) && this.media) {
                try {
                    data = await this.media.downloadMedia(src);
                }
                catch (err) {
                    this.logger.warn(err, 'Failed to download media from url:');
                    return undefined;
                }
            }
        }
        else if (src instanceof Readable) {
            data = await this.streamToBuffer(src);
        }
        if (!data)
            return undefined;
        try {
            const type = await fileTypeFromBuffer(data);
            if (type?.ext) {
                const base = path.parse(fileName).name || 'file';
                fileName = `${base}.${type.ext}`;
            }
            fileMime = type?.mime;
        }
        catch (err) {
            this.logger.debug(err, 'File type detection failed:');
        }
        return { fileName, data, fileMime };
    }
    /**
     * Handle local files and mtcute Media objects
     * Converts to Buffer if needed
     */
    async handleLocalOrMtcuteMedia(fileSrc, defaultExt, tgBotDownloader) {
        if (typeof fileSrc === 'string' && fileSrc.startsWith('/')) {
            try {
                fileSrc = await fs.promises.readFile(fileSrc);
            }
            catch (e) {
                this.logger.warn(e, 'Failed to read local image file, keeping as path:');
            }
        }
        if (fileSrc && typeof fileSrc === 'object' && 'type' in fileSrc && !Buffer.isBuffer(fileSrc) && !(fileSrc instanceof Readable)) {
            if (!tgBotDownloader) {
                this.logger.warn('Cannot download mtcute Media object: downloader not provided');
                return undefined;
            }
            try {
                this.logger.debug(`Detected mtcute Media object (type=${fileSrc.type}), downloading...`);
                const buffer = await tgBotDownloader(fileSrc);
                if (buffer && buffer.length > 0) {
                    fileSrc = buffer;
                    this.logger.debug(`Downloaded media buffer size: ${buffer.length}`);
                }
                else {
                    this.logger.warn('Downloaded buffer is empty');
                    fileSrc = undefined;
                }
            }
            catch (e) {
                this.logger.warn(e, 'Failed to download mtcute Media object:');
                fileSrc = undefined;
            }
        }
        if (fileSrc instanceof Readable) {
            fileSrc = { fileName: `media.${defaultExt}`, data: fileSrc };
        }
        else if (Buffer.isBuffer(fileSrc)) {
            let ext = defaultExt;
            if (defaultExt === 'jpg') {
                const type = await fileTypeFromBuffer(fileSrc);
                ext = type?.ext || 'jpg';
                this.logger.debug(`Detected image type: ${ext}, mime: ${type?.mime}`);
            }
            fileSrc = { fileName: `media.${ext}`, data: fileSrc };
        }
        return fileSrc;
    }
    /**
     * Resolve media input from MessageContent using MediaFeature
     */
    async resolveMediaInput(content, tgBotDownloader) {
        if (!this.media)
            return content.data?.file || content.data?.url;
        let fileSrc;
        if (content.type === 'image') {
            fileSrc = await this.media.processImage(content);
            fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'jpg', tgBotDownloader);
        }
        else if (content.type === 'video') {
            fileSrc = await this.media.processVideo(content);
            fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'mp4', tgBotDownloader);
        }
        else if (content.type === 'audio') {
            fileSrc = await this.media.processAudio(content);
            fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'amr', tgBotDownloader);
        }
        else if (content.type === 'file') {
            const file = content;
            const fileId = file.data.fileId || file.data.file_id;
            const fileName = file.data.filename || 'file';
            const originalLocal = file.data.file;
            // 优先本地可读路径（已挂载 temp 卷时可命中）
            if (file.data.file && typeof file.data.file === 'string' && file.data.file.startsWith('/')) {
                try {
                    await fs.promises.access(file.data.file);
                    fileSrc = file.data.file;
                }
                catch {
                    // ignore, fallback to url/file_id below
                }
            }
            // 优先远程 URL（NapCat raw_message 中的真实链接）
            if (!fileSrc && file.data.url) {
                if (/^https?:\/\//.test(file.data.url)) {
                    try {
                        fileSrc = await this.media.downloadMedia(file.data.url);
                    }
                    catch (err) {
                        this.logger.warn(err, `Failed to download file via url=${file.data.url}, try next fallback`);
                    }
                }
                else {
                    fileSrc = file.data.url; // 可能是本地路径
                }
            }
            // 次选：NapCat file_id 直取（get_file）
            if (!fileSrc && fileId && this.media?.fetchFileById) {
                const fetched = await this.media.fetchFileById(fileId);
                if (fetched) {
                    fileSrc = fetched.buffer || fetched.path || fetched.url;
                }
                else {
                    this.logger.warn(`fetchFileById returned empty for fileId=${fileId}`);
                }
            }
            // 退回：file 字段（可能是本地路径）
            if (!fileSrc && file.data.file) {
                fileSrc = file.data.file;
            }
            // 本地路径不可读时，再尝试 NapCat get_file/file_id 兜底
            if (typeof fileSrc === 'string' && fileSrc.startsWith('/') && fileId && this.media?.fetchFileById) {
                try {
                    await fs.promises.access(fileSrc);
                }
                catch {
                    this.logger.warn(`Local file missing, try fetchFileById. path=${fileSrc}, fileId=${fileId}`);
                    const fetched = await this.media.fetchFileById(fileId);
                    if (fetched) {
                        fileSrc = fetched.buffer || fetched.path || fetched.url || fileSrc;
                    }
                    else {
                        this.logger.warn(`fetchFileById returned empty for fileId=${fileId}`);
                    }
                }
            }
            // 如果远程/兜底依然失败，保留原始本地路径作为最后尝试
            if (!fileSrc && originalLocal) {
                fileSrc = originalLocal;
            }
            // 包装流
            if (fileSrc instanceof Readable) {
                fileSrc = { fileName, data: fileSrc };
            }
        }
        else {
            fileSrc = content.data?.file || content.data?.url;
        }
        return fileSrc;
    }
    /**
     * Check if media is GIF format
     */
    isGifMedia(file) {
        return file.fileMime === 'image/gif' || file.fileName.toLowerCase().endsWith('.gif');
    }
    /**
     * Convert stream to buffer
     */
    async streamToBuffer(stream) {
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }
    /**
     * 尝试读取本地文件，如果不存在则根据常见 NapCat 临时文件命名（去除 .数字 / (数字) 后缀）和同目录模糊匹配读取
     */
    async tryReadLocalWithFallback(src, fallbackName) {
        const candidates = [];
        candidates.push(src);
        const parsed = path.parse(src);
        const baseNoCount = parsed.name.replace(/\s*\(\d+\)$/, '').replace(/\.\d+$/, '');
        if (baseNoCount !== parsed.name) {
            candidates.push(path.join(parsed.dir, `${baseNoCount}${parsed.ext}`));
            candidates.push(path.join(parsed.dir, baseNoCount));
        }
        // 去除多余的 .数字 结尾
        const strippedDot = parsed.name.replace(/\.\d+$/, '');
        if (strippedDot !== parsed.name) {
            candidates.push(path.join(parsed.dir, `${strippedDot}${parsed.ext}`));
        }
        // 尝试候选列表
        for (const p of candidates) {
            if (!p)
                continue;
            try {
                const buf = await fs.promises.readFile(p);
                return { data: buf, fileName: path.basename(p) || fallbackName };
            }
            catch {
                // continue
            }
        }
        // 最后尝试同目录模糊匹配：找到前缀相同的文件
        try {
            const files = await readdir(parsed.dir);
            const match = files.find(f => f.startsWith(baseNoCount));
            if (match) {
                const full = path.join(parsed.dir, match);
                const buf = await fs.promises.readFile(full);
                return { data: buf, fileName: path.basename(full) || fallbackName };
            }
        }
        catch (e) {
            this.logger.warn(e, `Local media not accessible: ${src}`);
        }
        this.logger.warn(`Local media not accessible after fallback: ${src}`);
        return undefined;
    }
}
