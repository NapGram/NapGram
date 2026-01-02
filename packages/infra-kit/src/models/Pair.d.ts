import type { Friend, Group, IQQClient } from '@napgram/qq-client';
import { TelegramChat } from '@napgram/telegram-client';
export declare class Pair {
    readonly qq: Friend | Group;
    private _tg;
    readonly tgUser: TelegramChat;
    dbId: number;
    private _flags;
    readonly apiKey: string;
    readonly qqClient: IQQClient;
    private static readonly apiKeyMap;
    static getByApiKey(key: string): Pair | undefined;
    private static readonly dbIdMap;
    static getByDbId(dbId: number): Pair | undefined;
    readonly instanceMapForTg: {
        [tgUserId: string]: Group;
    };
    constructor(qq: Friend | Group, _tg: TelegramChat, tgUser: TelegramChat, dbId: number, _flags: number, apiKey: string, qqClient: IQQClient);
    updateInfo(): Promise<void>;
    get qqRoomId(): number;
    get tgId(): number;
    get tg(): TelegramChat;
    set tg(value: TelegramChat);
    get flags(): number;
    set flags(value: number);
}
