export default class TelegramSession {
    private _dbId?;
    private log;
    private _sessionString?;
    constructor(_dbId?: number | undefined);
    get dbId(): number | undefined;
    get sessionString(): string | undefined;
    load(): Promise<void>;
    save(session: string): Promise<void>;
}
