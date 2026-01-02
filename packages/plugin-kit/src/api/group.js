/**
 * NapGram 群组 API 实现
 *
 * 提供插件操作群组的能力
 */
import { getLogger } from '@napgram/infra-kit';
const logger = getLogger('GroupAPI');
/**
 * 群组 API 实现
 */
export class GroupAPIImpl {
    /**
     * 实例访问器（Phase 4 注入）
     */
    instanceResolver;
    constructor(instanceResolver) {
        this.instanceResolver = instanceResolver;
    }
    /**
     * 获取群组信息
     */
    async getInfo(params) {
        logger.debug({ params }, 'Getting group info');
        try {
            // 获取实例
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }
            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }
            // 解析群组 ID
            const { platform, id } = this.parseGroupId(params.groupId);
            // 根据平台获取群组信息
            let groupInfo = null;
            if (platform === 'qq') {
                groupInfo = await this.getQQGroupInfo(instance, id);
            }
            else if (platform === 'tg') {
                groupInfo = await this.getTGGroupInfo(instance, id);
            }
            else {
                throw new Error(`Unknown platform: ${platform}`);
            }
            if (groupInfo) {
                logger.debug({ params, groupInfo }, 'Group info retrieved');
            }
            return groupInfo;
        }
        catch (error) {
            logger.error({ error, params }, 'Failed to get group info');
            throw error;
        }
    }
    /**
     * 获取群成员列表
     */
    async getMembers(params) {
        logger.debug({ params }, 'Getting group members');
        try {
            // 获取实例
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }
            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }
            // 解析群组 ID
            const { platform, id } = this.parseGroupId(params.groupId);
            // 根据平台获取成员列表
            let members = [];
            if (platform === 'qq') {
                members = await this.getQQGroupMembers(instance, id);
            }
            else if (platform === 'tg') {
                members = await this.getTGGroupMembers(instance, id);
            }
            else {
                throw new Error(`Unknown platform: ${platform}`);
            }
            logger.debug({ params, count: members.length }, 'Group members retrieved');
            return members;
        }
        catch (error) {
            logger.error({ error, params }, 'Failed to get group members');
            throw error;
        }
    }
    /**
     * 设置管理员
     */
    async setAdmin(params) {
        logger.debug({ params }, 'Setting admin');
        try {
            // 获取实例
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }
            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }
            // 解析 ID
            const { platform: groupPlatform, id: groupId } = this.parseGroupId(params.groupId);
            const { platform: userPlatform, id: userId } = this.parseUserId(params.userId);
            if (groupPlatform !== userPlatform) {
                throw new Error('Group and user must be on the same platform');
            }
            // 根据平台设置管理员
            if (groupPlatform === 'qq') {
                await this.setQQAdmin(instance, groupId, userId, params.enable);
            }
            else if (groupPlatform === 'tg') {
                await this.setTGAdmin(instance, groupId, userId, params.enable);
            }
            else {
                throw new Error(`Unknown platform: ${groupPlatform}`);
            }
            logger.info({ params }, 'Admin status updated');
        }
        catch (error) {
            logger.error({ error, params }, 'Failed to set admin');
            throw error;
        }
    }
    /**
     * 禁言用户
     */
    async muteUser(params) {
        logger.debug({ params }, 'Muting user');
        try {
            // 获取实例
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }
            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }
            // 解析 ID
            const { platform: groupPlatform, id: groupId } = this.parseGroupId(params.groupId);
            const { platform: userPlatform, id: userId } = this.parseUserId(params.userId);
            if (groupPlatform !== userPlatform) {
                throw new Error('Group and user must be on the same platform');
            }
            // 根据平台禁言
            if (groupPlatform === 'qq') {
                await this.muteQQUser(instance, groupId, userId, params.duration);
            }
            else if (groupPlatform === 'tg') {
                await this.muteTGUser(instance, groupId, userId, params.duration);
            }
            else {
                throw new Error(`Unknown platform: ${groupPlatform}`);
            }
            logger.info({ params }, 'User muted');
        }
        catch (error) {
            logger.error({ error, params }, 'Failed to mute user');
            throw error;
        }
    }
    /**
     * 踢出用户
     */
    async kickUser(params) {
        logger.debug({ params }, 'Kicking user');
        try {
            // 获取实例
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }
            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }
            // 解析 ID
            const { platform: groupPlatform, id: groupId } = this.parseGroupId(params.groupId);
            const { platform: userPlatform, id: userId } = this.parseUserId(params.userId);
            if (groupPlatform !== userPlatform) {
                throw new Error('Group and user must be on the same platform');
            }
            // 根据平台踢出
            if (groupPlatform === 'qq') {
                await this.kickQQUser(instance, groupId, userId, params.rejectAddRequest);
            }
            else if (groupPlatform === 'tg') {
                await this.kickTGUser(instance, groupId, userId);
            }
            else {
                throw new Error(`Unknown platform: ${groupPlatform}`);
            }
            logger.info({ params }, 'User kicked');
        }
        catch (error) {
            logger.error({ error, params }, 'Failed to kick user');
            throw error;
        }
    }
    // === 私有方法 ===
    /**
     * 解析群组 ID
     */
    parseGroupId(groupId) {
        const parts = groupId.split(':');
        if (parts.length < 3) {
            throw new Error(`Invalid groupId format: ${groupId}`);
        }
        const platform = parts[0];
        const id = parts.slice(2).join(':');
        return { platform, id };
    }
    /**
     * 解析用户 ID
     */
    parseUserId(userId) {
        const parts = userId.split(':');
        if (parts.length < 3) {
            throw new Error(`Invalid userId format: ${userId}`);
        }
        const platform = parts[0];
        const id = parts.slice(2).join(':');
        return { platform, id };
    }
    // === QQ 平台方法（Phase 4 实现） ===
    async getQQGroupInfo(_instance, _groupId) {
        return null;
    }
    async getQQGroupMembers(_instance, _groupId) {
        return [];
    }
    async setQQAdmin(_instance, _groupId, _userId, _enable) {
        // Phase 4: instance.qqClient.setGroupAdmin()
    }
    async muteQQUser(_instance, _groupId, _userId, _duration) {
        // Phase 4: instance.qqClient.muteGroupMember()
    }
    async kickQQUser(_instance, _groupId, _userId, _reject) {
        // Phase 4: instance.qqClient.kickGroupMember()
    }
    // === TG 平台方法（Phase 4 实现） ===
    async getTGGroupInfo(_instance, _chatId) {
        return null;
    }
    async getTGGroupMembers(_instance, _chatId) {
        return [];
    }
    async setTGAdmin(_instance, _chatId, _userId, _enable) {
        // Phase 4: instance.tgBot.promoteChatMember()
    }
    async muteTGUser(_instance, _chatId, _userId, _duration) {
        // Phase 4: instance.tgBot.restrictChatMember()
    }
    async kickTGUser(_instance, _chatId, _userId) {
        // Phase 4: instance.tgBot.banChatMember()
    }
}
/**
 * 创建群组 API
 */
export function createGroupAPI(instanceResolver) {
    return new GroupAPIImpl(instanceResolver);
}
