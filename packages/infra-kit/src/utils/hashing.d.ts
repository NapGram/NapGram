import crypto from 'node:crypto';
export declare function md5(input: crypto.BinaryLike): NonSharedBuffer;
export declare function md5Hex(input: crypto.BinaryLike): string;
export declare function md5B64(input: crypto.BinaryLike): string;
export declare function sha256Hex(input: crypto.BinaryLike): string;
export declare function sha256B64(input: crypto.BinaryLike): string;
