import type { MessageContent, UnifiedMessage } from '@napgram/message-kit';
export declare class ForwardMapper {
    private readonly contentRenderer;
    private readonly logger;
    constructor(contentRenderer?: (content: MessageContent) => string);
    private shouldSkipPersistence;
    saveTgToQqMapping(unified: UnifiedMessage, tgMsg: any, receipt: any, pair: any): Promise<void>;
    saveMessage(qqMsg: UnifiedMessage, tgMsg: any, instanceId: number, qqRoomId: bigint, tgChatId: bigint): Promise<void>;
    findTgMsgId(instanceId: number, qqRoomId: bigint, qqMsgId: string): Promise<number | undefined>;
    findQqSource(instanceId: number, tgChatId: number, tgMsgId: number): Promise<{
        id: number;
        qqRoomId: bigint;
        qqSenderId: bigint;
        time: number;
        brief: string | null;
        seq: number;
        rand: bigint;
        pktnum: number;
        tgChatId: bigint;
        tgMsgId: number;
        instanceId: number;
        tgFileId: bigint | null;
        tgMessageText: string | null;
        nick: string | null;
        tgSenderId: bigint | null;
        richHeaderUsed: boolean;
        ignoreDelete: boolean;
    } | null | undefined>;
}
