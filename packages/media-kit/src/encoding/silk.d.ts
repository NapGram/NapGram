import { Buffer } from 'node:buffer';
declare const _default: {
    /**
     * 解码 SILK 为 OGG (Opus)
     */
    decode(bufSilk: Buffer, outputPath: string): Promise<void>;
    /**
     * 编码音频文件为 SILK Buffer
     */
    encode(filePath: string): Promise<Buffer>;
};
export default _default;
