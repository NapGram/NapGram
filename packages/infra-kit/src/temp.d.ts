export declare const TEMP_PATH: string;
export declare function createTempFile(options?: {
    postfix?: string;
    prefix?: string;
}): Promise<{
    path: string;
    cleanup: () => Promise<void>;
}>;
export declare const file: typeof createTempFile;
