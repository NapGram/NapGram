import { Buffer } from 'node:buffer';
import { getLogger } from '../../shared/logger';
import db from './db';
import env from './env';
export default class TelegramSession {
    _dbId;
    log;
    _sessionString;
    constructor(_dbId) {
        this._dbId = _dbId;
        this.log = getLogger(`TelegramSession - ${_dbId || 'new'}`);
    }
    get dbId() {
        return this._dbId;
    }
    get sessionString() {
        return this._sessionString;
    }
    async load() {
        this.log.trace('load');
        if (!this._dbId) {
            this.log.debug('Session ID not provided, creating new session entry');
            const newDbEntry = await db.session.create({
                data: {
                    dcId: env.TG_INITIAL_DCID || 2,
                    serverAddress: env.TG_INITIAL_SERVER || '149.154.167.50',
                },
            });
            this._dbId = newDbEntry.id;
            this.log = getLogger(`TelegramSession - ${this._dbId}`);
            return;
        }
        const dbEntry = await db.session.findFirst({
            where: { id: this._dbId },
        });
        if (dbEntry && dbEntry.authKey) {
            // Try to interpret authKey as session string
            const str = Buffer.from(dbEntry.authKey).toString('utf-8');
            // Basic validation for mtcute session string (starts with digit or '1'/'2' usually, or base64)
            // mtcute session strings usually start with a DC ID and some alphanumeric chars.
            // GramJS authKey is raw bytes.
            // We'll assume if it looks like a string, it is. Otherwise ignore (force re-login).
            // Allow base64/base64url chars or colon-delimited strings
            if (str.match(/^[\w+/=-]+$/) || str.includes(':')) {
                this._sessionString = str;
            }
            else {
                this.log.warn('Existing authKey does not look like a valid session string. Ignoring.');
            }
        }
    }
    async save(session) {
        this.log.trace('save session string');
        this._sessionString = session;
        if (this._dbId) {
            await db.session.upsert({
                where: { id: this._dbId },
                update: {
                    authKey: Buffer.from(session, 'utf-8'),
                },
                create: {
                    id: this._dbId,
                    dcId: env.TG_INITIAL_DCID || 2,
                    serverAddress: env.TG_INITIAL_SERVER || '149.154.167.50',
                    authKey: Buffer.from(session, 'utf-8'),
                },
            });
        }
    }
}
