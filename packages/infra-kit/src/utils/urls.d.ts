import { Buffer } from 'node:buffer';
export declare function getAvatarUrl(room: number | bigint | {
    uin: number;
} | {
    gid: number;
}): string;
export declare function getImageUrlByMd5(md5: string): string;
export declare function getBigFaceUrl(file: string): string;
export declare function fetchFile(url: string): Promise<Buffer>;
export declare function getAvatar(room: number | bigint | {
    uin: number;
} | {
    gid: number;
}): Promise<Buffer<ArrayBufferLike>>;
export declare function isContainsUrl(msg: string): boolean;
export declare const SUPPORTED_IMAGE_EXTS: string[];
export declare function isValidQQ(str: string): boolean;
export declare function isValidRoomId(str: string): boolean;
export declare function isValidUrl(str: string): boolean;
export declare function hasSupportedImageExt(name: string): boolean;
