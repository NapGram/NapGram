export interface ForwardPairRecord {
    id: number;
    qqRoomId: bigint;
    tgChatId: bigint;
    tgThreadId?: number | null;
    flags: number;
    instanceId: number;
    apiKey: string;
    ignoreRegex?: string | null;
    ignoreSenders?: string | null;
    forwardMode?: string | null;
    nicknameMode?: string | null;
    commandReplyMode?: string | null;
    commandReplyFilter?: string | null;
    commandReplyList?: string | null;
}
/**
 * 轻量级转发表，仅依赖数据库，不依赖 icqq。
 */
export declare class ForwardMap {
    private readonly instanceId;
    private byQQ;
    private byTG;
    private constructor();
    static load(instanceId: number): Promise<ForwardMap>;
    /**
     * Reload mappings from database (in-place).
     * This is used by the web admin panel so changes take effect without restarting the process.
     */
    reload(): Promise<void>;
    find(target: any): ForwardPairRecord | null | undefined;
    add(qqRoomId: string | number | bigint, tgChatId: string | number | bigint, tgThreadId?: number): Promise<ForwardPairRecord>;
    remove(target: string | number | bigint): Promise<boolean>;
    initMapInstance(): Promise<void>;
    findByQQ(qqRoomId: string | number | bigint): ForwardPairRecord | undefined;
    findByTG(tgChatId: string | number | bigint, tgThreadId?: number, allowFallback?: boolean): ForwardPairRecord | undefined;
    getAll(): ForwardPairRecord[];
    private getTgKey;
    private refreshMaps;
}
export default ForwardMap;
