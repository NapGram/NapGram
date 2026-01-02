import { Buffer } from 'node:buffer';
declare function cachedConvert(key: string, convert: (outputPath: string) => Promise<any>): Promise<string>;
declare const convert: {
    cached: typeof cachedConvert;
    cachedBuffer: (key: string, buf: () => Promise<Buffer | Uint8Array | string>) => Promise<string>;
    png: (key: string, webpData: () => Promise<Buffer | Uint8Array | string>) => Promise<string>;
    video2gif: (key: string, webmData: () => Promise<Buffer | Uint8Array | string>, webm?: boolean) => Promise<string>;
    tgs2gif: (key: string, tgsData: () => Promise<Buffer | Uint8Array | string>) => Promise<string>;
    webp: (key: string, imageData: () => Promise<Buffer | Uint8Array | string>) => Promise<string>;
    webm: (key: string, filePath: string) => Promise<string>;
    webpOrWebm: (key: string, imageData: () => Promise<Buffer | Uint8Array>) => Promise<string>;
    customEmoji: (key: string, imageData: () => Promise<Buffer | Uint8Array | string>, useSmallSize: boolean) => Promise<string>;
};
export default convert;
