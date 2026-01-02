import db from '../db';
import getLogger from '../logger';
const logger = getLogger('ForwardMap');
/**
 * 轻量级转发表，仅依赖数据库，不依赖 icqq。
 */
export class ForwardMap {
    instanceId;
    byQQ = new Map();
    byTG = new Map(); // Key: "chatId" or "chatId:threadId"
    constructor(pairs, instanceId) {
        this.instanceId = instanceId;
        for (const pair of pairs) {
            this.byQQ.set(pair.qqRoomId.toString(), pair);
            this.byTG.set(this.getTgKey(pair.tgChatId, pair.tgThreadId), pair);
        }
    }
    static async load(instanceId) {
        const rows = await db.forwardPair.findMany({
            where: { instanceId },
            select: { id: true, qqRoomId: true, tgChatId: true, tgThreadId: true, flags: true, instanceId: true, apiKey: true, ignoreRegex: true, ignoreSenders: true, forwardMode: true, nicknameMode: true, commandReplyMode: true, commandReplyFilter: true, commandReplyList: true },
        });
        return new ForwardMap(rows, instanceId);
    }
    /**
     * Reload mappings from database (in-place).
     * This is used by the web admin panel so changes take effect without restarting the process.
     */
    async reload() {
        const rows = await db.forwardPair.findMany({
            where: { instanceId: this.instanceId },
            select: {
                id: true,
                qqRoomId: true,
                tgChatId: true,
                tgThreadId: true,
                flags: true,
                instanceId: true,
                apiKey: true,
                ignoreRegex: true,
                ignoreSenders: true,
                forwardMode: true,
                nicknameMode: true,
                commandReplyMode: true,
                commandReplyFilter: true,
                commandReplyList: true,
            },
        });
        this.byQQ.clear();
        this.byTG.clear();
        for (const pair of rows) {
            this.byQQ.set(pair.qqRoomId.toString(), pair);
            this.byTG.set(this.getTgKey(pair.tgChatId, pair.tgThreadId), pair);
        }
    }
    // 兼容旧接口：根据 QQ/TG/数字进行查找
    find(target) {
        if (!target)
            return null;
        if (typeof target === 'object' && 'uin' in target) {
            return this.findByQQ(target.uin);
        }
        if (typeof target === 'object' && 'gid' in target) {
            return this.findByQQ(target.gid);
        }
        if (typeof target === 'object' && 'id' in target) {
            return this.findByTG(target.id);
        }
        return this.findByQQ(target) || this.findByTG(target) || null;
    }
    async add(qqRoomId, tgChatId, tgThreadId) {
        const normalizedThreadId = tgThreadId ?? null;
        const existingByQQ = this.findByQQ(qqRoomId);
        const existingByTG = this.findByTG(tgChatId, tgThreadId, false);
        // 如果目标 TG 话题已被其他 QQ 占用，则返回该记录以便上层处理
        if (existingByTG && (!existingByQQ || existingByTG.id !== existingByQQ.id)) {
            return existingByTG;
        }
        // 已存在该 QQ 的绑定，直接更新到新的话题
        if (existingByQQ) {
            // 目标一致则直接返回
            if (existingByQQ.tgChatId === BigInt(tgChatId)
                && (existingByQQ.tgThreadId ?? null) === normalizedThreadId) {
                return existingByQQ;
            }
            const updated = await db.forwardPair.update({
                where: { id: existingByQQ.id },
                data: {
                    tgChatId: BigInt(tgChatId),
                    tgThreadId: normalizedThreadId,
                },
                select: { id: true, qqRoomId: true, tgChatId: true, tgThreadId: true, flags: true, instanceId: true, apiKey: true, ignoreRegex: true, ignoreSenders: true, forwardMode: true, nicknameMode: true, commandReplyMode: true, commandReplyFilter: true, commandReplyList: true },
            });
            const rec = updated;
            this.refreshMaps(existingByQQ, rec);
            return rec;
        }
        const row = await db.forwardPair.create({
            data: {
                qqRoomId: BigInt(qqRoomId),
                tgChatId: BigInt(tgChatId),
                tgThreadId: normalizedThreadId,
                instance: {
                    connect: { id: this.instanceId },
                },
            },
            select: { id: true, qqRoomId: true, tgChatId: true, tgThreadId: true, flags: true, instanceId: true, apiKey: true, ignoreRegex: true, ignoreSenders: true, forwardMode: true, nicknameMode: true, commandReplyMode: true, commandReplyFilter: true, commandReplyList: true },
        });
        const rec = row;
        this.byQQ.set(rec.qqRoomId.toString(), rec);
        this.byTG.set(this.getTgKey(rec.tgChatId, rec.tgThreadId), rec);
        return rec;
    }
    async remove(target) {
        const rec = this.find(target);
        if (!rec)
            return false;
        await db.forwardPair.delete({ where: { id: rec.id } });
        this.byQQ.delete(rec.qqRoomId.toString());
        this.byTG.delete(this.getTgKey(rec.tgChatId, rec.tgThreadId));
        return true;
    }
    async initMapInstance() { }
    findByQQ(qqRoomId) {
        return this.byQQ.get(String(qqRoomId));
    }
    findByTG(tgChatId, tgThreadId, allowFallback = true) {
        const key = this.getTgKey(tgChatId, tgThreadId);
        const exact = this.byTG.get(key);
        // Debug log for troubleshooting
        if (!exact && (this.byTG.size > 0)) {
            logger.debug(`[ForwardMap] findByTG failed. Key: "${key}", Total keys: ${this.byTG.size}`);
            logger.debug(`[ForwardMap] Available keys: ${Array.from(this.byTG.keys()).join(', ')}`);
        }
        if (exact)
            return exact;
        return allowFallback ? this.byTG.get(String(tgChatId)) : undefined; // Fallback to chatId only
    }
    getAll() {
        return Array.from(this.byQQ.values());
    }
    getTgKey(tgChatId, tgThreadId) {
        return tgThreadId ? `${tgChatId}:${tgThreadId}` : String(tgChatId);
    }
    refreshMaps(oldRec, newRec) {
        this.byQQ.set(newRec.qqRoomId.toString(), newRec);
        this.byTG.delete(this.getTgKey(oldRec.tgChatId, oldRec.tgThreadId));
        this.byTG.set(this.getTgKey(newRec.tgChatId, newRec.tgThreadId), newRec);
    }
}
export default ForwardMap;
