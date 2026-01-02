import { EventEmitter } from 'node:events';
import { NapLink } from '@naplink/naplink';
import { getQQClientDependencies, resolveLoggerFactory } from './deps';
import { napCatForwardMultiple } from './napcatConvert';
function getLogger(name) {
    const { loggerFactory } = getQQClientDependencies();
    return resolveLoggerFactory(loggerFactory)(name);
}
function getMessageConverter() {
    return getQQClientDependencies().messageConverter;
}
export class NapCatAdapter extends EventEmitter {
    params;
    clientType = 'napcat';
    _uin = 0;
    _nickname = '';
    client;
    logger = getLogger('NapCatAdapter');
    constructor(params) {
        const clientLogger = getLogger('NapLink');
        super();
        this.params = params;
        this.client = new NapLink({
            connection: {
                url: params.wsUrl,
            },
            reconnect: params.reconnect
                ? {
                    enabled: true,
                    maxAttempts: 100,
                }
                : undefined,
            logging: {
                level: 'info',
                logger: {
                    debug: (_msg, ..._args) => { },
                    info: (msg, ...args) => clientLogger.info(msg, ...args),
                    warn: (msg, ...args) => clientLogger.warn(msg, ...args),
                    error: (msg, err, ...args) => clientLogger.error(msg, err, ...args),
                },
            },
        });
        this.setupEvents();
    }
    get uin() {
        return this._uin;
    }
    get nickname() {
        return this._nickname;
    }
    setupEvents() {
        this.client.on('connect', () => {
            this.emit('online');
            this.refreshSelfInfo();
        });
        this.client.on('disconnect', () => {
            this.emit('offline');
        });
        this.client.on('connection:lost', (data) => {
            const timestamp = typeof data?.timestamp === 'number' ? data.timestamp : Date.now();
            const attempts = typeof data?.attempts === 'number' ? data.attempts : undefined;
            const reason = attempts ? `Reconnect attempts exceeded (${attempts})` : 'Connection lost';
            this.emit('connection:lost', { timestamp, reason });
        });
        this.client.on('connection:restored', (data) => {
            const timestamp = typeof data?.timestamp === 'number' ? data.timestamp : Date.now();
            this.emit('connection:restored', { timestamp });
        });
        this.client.on('message', async (data) => {
            try {
                const messageConverter = getMessageConverter();
                this.normalizeMediaIds(data.message);
                await this.client.hydrateMessage(data.message);
                const unifiedMsg = messageConverter.fromNapCat(data);
                this.emit('message', unifiedMsg);
            }
            catch (err) {
                this.logger.error('Failed to handle message event:', err);
            }
        });
        this.client.on('notice.group_recall', (data) => {
            ;
            this.emit('recall', {
                messageId: String(data.message_id),
                chatId: String(data.group_id),
                operatorId: String(data.operator_id),
                timestamp: data.time * 1000,
            });
        });
        this.client.on('notice.friend_recall', (data) => {
            ;
            this.emit('recall', {
                messageId: String(data.message_id),
                chatId: String(data.user_id),
                operatorId: String(data.user_id),
                timestamp: data.time * 1000,
            });
        });
        this.client.on('notice.group_increase', (data) => {
            ;
            this.emit('group.increase', String(data.group_id), {
                id: String(data.user_id),
                name: '',
            });
        });
        this.client.on('notice.group_decrease', (data) => {
            ;
            this.emit('group.decrease', String(data.group_id), String(data.user_id));
        });
        this.client.on('notice.friend_add', (data) => {
            ;
            this.emit('friend.increase', {
                id: String(data.user_id),
                name: '',
            });
        });
        this.client.on('notice.notify.poke', (data) => {
            ;
            this.emit('poke', String(data.group_id || data.user_id), String(data.user_id), String(data.target_id));
        });
        this.client.on('request.friend', (data) => {
            ;
            this.emit('request.friend', {
                flag: data.flag,
                userId: String(data.user_id),
                comment: data.comment || '',
                timestamp: data.time * 1000,
            });
        });
        this.client.on('request.group', (data) => {
            ;
            this.emit('request.group', {
                flag: data.flag,
                groupId: String(data.group_id),
                userId: String(data.user_id),
                subType: data.sub_type,
                comment: data.comment || '',
                timestamp: data.time * 1000,
            });
        });
    }
    normalizeMediaIds(message) {
        const segments = Array.isArray(message) ? message : [];
        for (const segment of segments) {
            const data = segment?.data;
            if (!data || typeof data !== 'object')
                continue;
            for (const key of ['file_id', 'file']) {
                const value = data[key];
                if (typeof value !== 'string')
                    continue;
                if (!value.startsWith('/'))
                    continue;
                const rest = value.slice(1);
                if (rest.includes('/'))
                    continue // likely a local absolute path
                    ;
                data[key] = rest;
            }
        }
    }
    async refreshSelfInfo() {
        try {
            const info = await this.client.getLoginInfo();
            this._uin = info.user_id;
            this._nickname = info.nickname;
            this.logger.info(`Logged in as ${this._nickname} (${this._uin})`);
        }
        catch (error) {
            this.logger.error('Failed to get login info:', error);
        }
    }
    async isOnline() {
        try {
            const status = await this.client.getStatus();
            return status.online === true;
        }
        catch {
            return false;
        }
    }
    async sendMessage(chatId, message) {
        const messageConverter = getMessageConverter();
        const segments = message.__napCatSegments
            ? message.content
            : await messageConverter.toNapCat(message);
        try {
            const result = await this.client.sendMessage({
                [message.chat.type === 'group' ? 'group_id' : 'user_id']: Number(chatId),
                message: segments,
            });
            return {
                messageId: String(result.message_id),
                timestamp: Date.now(),
                success: true,
            };
        }
        catch (error) {
            return {
                messageId: '',
                timestamp: Date.now(),
                success: false,
                error: error.message,
            };
        }
    }
    async sendGroupForwardMsg(groupId, messages) {
        try {
            const result = await this.client.sendGroupForwardMessage(groupId, messages);
            return {
                messageId: String(result.message_id),
                timestamp: Date.now(),
                success: true,
            };
        }
        catch (error) {
            return {
                messageId: '',
                timestamp: Date.now(),
                success: false,
                error: error.message,
            };
        }
    }
    async recallMessage(messageId) {
        await this.client.deleteMessage(messageId);
    }
    async getMessage(messageId) {
        try {
            const messageConverter = getMessageConverter();
            const msg = await this.client.getMessage(messageId);
            return messageConverter.fromNapCat(msg);
        }
        catch {
            return null;
        }
    }
    async getForwardMsg(messageId, _fileName) {
        const data = await this.client.getForwardMessage(messageId); // file_name not supported in SDK types yet or not common
        const rawMessages = data?.messages || [];
        await Promise.all(rawMessages.map(async (node) => {
            const content = node?.message;
            const segments = Array.isArray(content) ? content : (content ? [content] : []);
            if (segments.length === 0)
                return;
            this.normalizeMediaIds(segments);
            await this.client.hydrateMessage(segments);
        }));
        return napCatForwardMultiple(rawMessages);
    }
    async getFile(fileId) {
        try {
            const normalizedId = fileId.replace(/^\//, '');
            return await this.client.getFile(normalizedId);
        }
        catch (e) {
            this.logger.warn(e, 'get_file failed');
            return null;
        }
    }
    async getFriendList() {
        const friends = await this.client.getFriendList();
        return friends.map((f) => ({
            id: String(f.user_id),
            name: f.nickname || f.remark,
        }));
    }
    async getGroupList() {
        const groups = await this.client.getGroupList();
        return groups.map((g) => ({
            id: String(g.group_id),
            type: 'group',
            name: g.group_name,
        }));
    }
    async getGroupMemberList(groupId) {
        const members = await this.client.getGroupMemberList(groupId);
        return members.map((m) => ({
            id: String(m.user_id),
            name: m.card || m.nickname,
        }));
    }
    async getFriendInfo(uin) {
        try {
            const info = await this.client.getStrangerInfo(uin);
            return {
                id: String(info.user_id),
                name: info.nickname,
            };
        }
        catch {
            return null;
        }
    }
    async getGroupInfo(groupId) {
        try {
            const info = await this.client.getGroupInfo(groupId);
            return {
                id: String(info.group_id),
                type: 'group',
                name: info.group_name,
            };
        }
        catch {
            return null;
        }
    }
    async getGroupMemberInfo(groupId, userId) {
        try {
            return await this.client.getGroupMemberInfo(groupId, userId);
        }
        catch {
            return null;
        }
    }
    async getUserInfo(userId) {
        try {
            return await this.client.getStrangerInfo(userId);
        }
        catch {
            return null;
        }
    }
    async login() {
        return this.client.connect(); // NCWebsocket has connect()
    }
    async logout() {
        this.client.disconnect();
    }
    async destroy() {
        this.client.disconnect();
    }
    async callApi(method, params) {
        return this.client.callApi(method, params);
    }
    async getStrangerInfo(userId, noCache = false) {
        return this.client.api.getStrangerInfo(userId, noCache);
    }
    async getVersionInfo() {
        return this.client.api.getVersionInfo();
    }
    async hydrateMedia(message) {
        return this.client.api.hydrateMedia(message);
    }
    async getImage(file) {
        return this.client.api.getImage(file);
    }
    async getRecord(file, outFormat) {
        return this.client.api.getRecord(file, outFormat);
    }
    async sendPrivateMessage(userId, message) {
        return this.client.api.sendPrivateMessage(userId, message);
    }
    async sendGroupMessage(groupId, message) {
        return this.client.api.sendGroupMessage(groupId, message);
    }
    async setEssenceMessage(messageId) {
        return this.client.api.setEssenceMessage(messageId);
    }
    async deleteEssenceMessage(messageId) {
        return this.client.api.deleteEssenceMessage(messageId);
    }
    async getEssenceMessageList(groupId) {
        return this.client.api.getEssenceMessageList(groupId);
    }
    async markMessageAsRead(messageId) {
        return this.client.api.markMessageAsRead(messageId);
    }
    async getGroupAtAllRemain(groupId) {
        return this.client.api.getGroupAtAllRemain(groupId);
    }
    async getGroupSystemMsg() {
        return this.client.api.getGroupSystemMsg();
    }
    async setGroupLeave(groupId, isDismiss = false) {
        return this.client.api.setGroupLeave(groupId, isDismiss);
    }
    async setGroupAnonymousBan(groupId, anonymousFlag, duration) {
        return this.client.api.setGroupAnonymousBan(groupId, anonymousFlag, duration);
    }
    async uploadGroupFile(groupId, file, name) {
        return this.client.api.uploadGroupFile(groupId, file, name);
    }
    async uploadPrivateFile(userId, file, name) {
        return this.client.api.uploadPrivateFile(userId, file, name);
    }
    async setGroupPortrait(groupId, file) {
        return this.client.api.setGroupPortrait(groupId, file);
    }
    async getGroupFileSystemInfo(groupId) {
        return this.client.api.getGroupFileSystemInfo(groupId);
    }
    async getGroupRootFiles(groupId) {
        return this.client.api.getGroupRootFiles(groupId);
    }
    async getGroupFilesByFolder(groupId, folderId) {
        return this.client.api.getGroupFilesByFolder(groupId, folderId);
    }
    async getGroupFileUrl(groupId, fileId, busid) {
        return this.client.api.getGroupFileUrl(groupId, fileId, busid);
    }
    async deleteGroupFile(groupId, fileId, busid) {
        return this.client.api.deleteGroupFile(groupId, fileId, busid);
    }
    async createGroupFileFolder(groupId, name, parentId) {
        return this.client.api.createGroupFileFolder(groupId, name, parentId);
    }
    async deleteGroupFolder(groupId, folderId) {
        return this.client.api.deleteGroupFolder(groupId, folderId);
    }
    async downloadFile(url, threadCount, headers) {
        return this.client.api.downloadFile(url, threadCount, headers);
    }
    async uploadFileStream(file, options) {
        return this.client.api.uploadFileStream(file, options);
    }
    async getUploadStreamStatus(streamId) {
        return this.client.api.getUploadStreamStatus(streamId);
    }
    async sendGroupPoke(groupId, userId) {
        const api = this.client.api;
        if (typeof api.sendGroupPoke === 'function')
            return api.sendGroupPoke(groupId, userId);
        return this.client.callApi('group_poke', { group_id: groupId, user_id: userId });
    }
    async sendFriendPoke(userId) {
        const api = this.client.api;
        if (typeof api.sendFriendPoke === 'function')
            return api.sendFriendPoke(userId);
        return this.client.callApi('friend_poke', { user_id: userId });
    }
    async sendPoke(targetId, groupId) {
        const api = this.client.api;
        if (typeof api.sendPoke === 'function')
            return api.sendPoke(targetId, groupId);
        return this.client.callApi('send_poke', groupId ? { group_id: groupId, target_id: targetId } : { user_id: targetId });
    }
    async markGroupMsgAsRead(groupId) {
        const api = this.client.api;
        if (typeof api.markGroupMsgAsRead === 'function')
            return api.markGroupMsgAsRead(groupId);
        return this.client.callApi('mark_group_msg_as_read', { group_id: groupId });
    }
    async markPrivateMsgAsRead(userId) {
        const api = this.client.api;
        if (typeof api.markPrivateMsgAsRead === 'function')
            return api.markPrivateMsgAsRead(userId);
        return this.client.callApi('mark_private_msg_as_read', { user_id: userId });
    }
    async markAllMsgAsRead() {
        const api = this.client.api;
        if (typeof api.markAllMsgAsRead === 'function')
            return api.markAllMsgAsRead();
        return this.client.callApi('_mark_all_as_read');
    }
    async getGroupMsgHistory(params) {
        const api = this.client.api;
        if (typeof api.getGroupMsgHistory === 'function')
            return api.getGroupMsgHistory(params);
        return this.client.callApi('get_group_msg_history', params);
    }
    async getFriendMsgHistory(params) {
        const api = this.client.api;
        if (typeof api.getFriendMsgHistory === 'function')
            return api.getFriendMsgHistory(params);
        return this.client.callApi('get_friend_msg_history', params);
    }
    async getRecentContact(count) {
        const api = this.client.api;
        if (typeof api.getRecentContact === 'function')
            return api.getRecentContact(count);
        return this.client.callApi('get_recent_contact', { count });
    }
    async downloadFileStreamToFile(fileId, options) {
        const api = this.client.api;
        if (typeof api.downloadFileStreamToFile !== 'function') {
            throw new TypeError('downloadFileStreamToFile is not available (requires newer NapLink)');
        }
        return api.downloadFileStreamToFile(fileId, options);
    }
    async downloadFileImageStreamToFile(fileId, options) {
        const api = this.client.api;
        if (typeof api.downloadFileImageStreamToFile !== 'function') {
            throw new TypeError('downloadFileImageStreamToFile is not available (requires newer NapLink)');
        }
        return api.downloadFileImageStreamToFile(fileId, options);
    }
    async downloadFileRecordStreamToFile(fileId, outFormat, options) {
        const api = this.client.api;
        if (typeof api.downloadFileRecordStreamToFile !== 'function') {
            throw new TypeError('downloadFileRecordStreamToFile is not available (requires newer NapLink)');
        }
        return api.downloadFileRecordStreamToFile(fileId, outFormat, options);
    }
    async cleanStreamTempFile() {
        const api = this.client.api;
        if (typeof api.cleanStreamTempFile !== 'function') {
            throw new TypeError('cleanStreamTempFile is not available (requires newer NapLink)');
        }
        return api.cleanStreamTempFile();
    }
    async getOnlineClients(noCache = false) {
        const api = this.client.api;
        if (typeof api.getOnlineClients === 'function')
            return api.getOnlineClients(noCache);
        return this.client.callApi('get_online_clients', { no_cache: noCache });
    }
    async getRobotUinRange() {
        const api = this.client.api;
        if (typeof api.getRobotUinRange === 'function')
            return api.getRobotUinRange();
        return this.client.callApi('get_robot_uin_range');
    }
    async canSendImage() {
        const api = this.client.api;
        if (typeof api.canSendImage === 'function')
            return api.canSendImage();
        return this.client.callApi('can_send_image');
    }
    async canSendRecord() {
        const api = this.client.api;
        if (typeof api.canSendRecord === 'function')
            return api.canSendRecord();
        return this.client.callApi('can_send_record');
    }
    async getCookies(domain) {
        const api = this.client.api;
        if (typeof api.getCookies === 'function')
            return api.getCookies(domain);
        return this.client.callApi('get_cookies', { domain });
    }
    async getCsrfToken() {
        const api = this.client.api;
        if (typeof api.getCsrfToken === 'function')
            return api.getCsrfToken();
        return this.client.callApi('get_csrf_token');
    }
    async getCredentials(domain) {
        const api = this.client.api;
        if (typeof api.getCredentials === 'function')
            return api.getCredentials(domain);
        return this.client.callApi('get_credentials', { domain });
    }
    async setInputStatus(userId, eventType) {
        const api = this.client.api;
        if (typeof api.setInputStatus === 'function')
            return api.setInputStatus(userId, eventType);
        return this.client.callApi('set_input_status', { user_id: userId, event_type: eventType, eventType });
    }
    async ocrImage(image, dot = false) {
        const api = this.client.api;
        if (typeof api.ocrImage === 'function')
            return api.ocrImage(image, dot);
        return this.client.callApi(dot ? '.ocr_image' : 'ocr_image', { image });
    }
    async translateEn2zh(words) {
        const api = this.client.api;
        if (typeof api.translateEn2zh === 'function')
            return api.translateEn2zh(words);
        return this.client.callApi('translate_en2zh', { words });
    }
    async checkUrlSafely(url) {
        const api = this.client.api;
        if (typeof api.checkUrlSafely === 'function')
            return api.checkUrlSafely(url);
        return this.client.callApi('check_url_safely', { url });
    }
    async handleQuickOperation(context, operation) {
        const api = this.client.api;
        if (typeof api.handleQuickOperation === 'function')
            return api.handleQuickOperation(context, operation);
        return this.client.callApi('.handle_quick_operation', { context, operation });
    }
    async getModelShow(model) {
        const api = this.client.api;
        if (typeof api.getModelShow === 'function')
            return api.getModelShow(model);
        return this.client.callApi('_get_model_show', { model });
    }
    async setModelShow(model, modelShow) {
        const api = this.client.api;
        if (typeof api.setModelShow === 'function')
            return api.setModelShow(model, modelShow);
        return this.client.callApi('_set_model_show', { model, model_show: modelShow });
    }
    async getPacketStatus() {
        const api = this.client.api;
        if (typeof api.getPacketStatus === 'function')
            return api.getPacketStatus();
        return this.client.callApi('nc_get_packet_status');
    }
    async getRkeyEx() {
        const api = this.client.api;
        if (typeof api.getRkeyEx === 'function')
            return api.getRkeyEx();
        return this.client.callApi('get_rkey');
    }
    async getRkeyServer() {
        const api = this.client.api;
        if (typeof api.getRkeyServer === 'function')
            return api.getRkeyServer();
        return this.client.callApi('get_rkey_server');
    }
    async getRkey() {
        const api = this.client.api;
        if (typeof api.getRkey === 'function')
            return api.getRkey();
        return this.client.callApi('nc_get_rkey');
    }
    async setFriendRemark(userId, remark) {
        const api = this.client.api;
        if (typeof api.setFriendRemark === 'function')
            return api.setFriendRemark(userId, remark);
        return this.client.callApi('set_friend_remark', { user_id: userId, remark });
    }
    async deleteFriend(userId) {
        const api = this.client.api;
        if (typeof api.deleteFriend === 'function')
            return api.deleteFriend(userId);
        return this.client.callApi('delete_friend', { user_id: userId });
    }
    async getUnidirectionalFriendList() {
        const api = this.client.api;
        if (typeof api.getUnidirectionalFriendList === 'function')
            return api.getUnidirectionalFriendList();
        return this.client.callApi('get_unidirectional_friend_list');
    }
    async setGroupRemark(groupId, remark) {
        const api = this.client.api;
        if (typeof api.setGroupRemark === 'function')
            return api.setGroupRemark(groupId, remark);
        return this.client.callApi('set_group_remark', { group_id: groupId, remark });
    }
    async getGroupInfoEx(groupId) {
        const api = this.client.api;
        if (typeof api.getGroupInfoEx === 'function')
            return api.getGroupInfoEx(groupId);
        return this.client.callApi('get_group_info_ex', { group_id: groupId });
    }
    async getGroupDetailInfo(groupId) {
        const api = this.client.api;
        if (typeof api.getGroupDetailInfo === 'function')
            return api.getGroupDetailInfo(groupId);
        return this.client.callApi('get_group_detail_info', { group_id: groupId });
    }
    async getGroupIgnoredNotifies() {
        const api = this.client.api;
        if (typeof api.getGroupIgnoredNotifies === 'function')
            return api.getGroupIgnoredNotifies();
        return this.client.callApi('get_group_ignored_notifies');
    }
    async getGroupShutList(groupId) {
        const api = this.client.api;
        if (typeof api.getGroupShutList === 'function')
            return api.getGroupShutList(groupId);
        return this.client.callApi('get_group_shut_list', { group_id: groupId });
    }
    async sendPrivateForwardMessage(params) {
        const api = this.client.api;
        if (typeof api.sendPrivateForwardMessage === 'function')
            return api.sendPrivateForwardMessage(params);
        return this.client.callApi('send_private_forward_msg', params);
    }
    async forwardFriendSingleMsg(userId, messageId) {
        const api = this.client.api;
        if (typeof api.forwardFriendSingleMsg === 'function')
            return api.forwardFriendSingleMsg(userId, messageId);
        return this.client.callApi('forward_friend_single_msg', { user_id: userId, message_id: messageId });
    }
    async forwardGroupSingleMsg(groupId, messageId) {
        const api = this.client.api;
        if (typeof api.forwardGroupSingleMsg === 'function')
            return api.forwardGroupSingleMsg(groupId, messageId);
        return this.client.callApi('forward_group_single_msg', { group_id: groupId, message_id: messageId });
    }
    async sendForwardMsg(params) {
        const api = this.client.api;
        if (typeof api.sendForwardMsg === 'function')
            return api.sendForwardMsg(params);
        return this.client.callApi('send_forward_msg', params);
    }
    async sendGroupNotice(params) {
        const api = this.client.api;
        if (typeof api.sendGroupNotice === 'function')
            return api.sendGroupNotice(params);
        return this.client.callApi('_send_group_notice', params);
    }
    async getGroupNotice(groupId) {
        const api = this.client.api;
        if (typeof api.getGroupNotice === 'function')
            return api.getGroupNotice(groupId);
        return this.client.callApi('_get_group_notice', { group_id: groupId });
    }
    async delGroupNotice(groupId, noticeId) {
        const api = this.client.api;
        if (typeof api.delGroupNotice === 'function')
            return api.delGroupNotice(groupId, noticeId);
        return this.client.callApi('_del_group_notice', { group_id: groupId, notice_id: +noticeId });
    }
    async setOnlineStatus(status, extStatus, batteryStatus) {
        const api = this.client.api;
        if (typeof api.setOnlineStatus === 'function')
            return api.setOnlineStatus(status, extStatus, batteryStatus);
        return this.client.callApi('set_online_status', { status, ext_status: extStatus, battery_status: batteryStatus });
    }
    async setDiyOnlineStatus(faceId, wording, faceType) {
        const api = this.client.api;
        if (typeof api.setDiyOnlineStatus === 'function')
            return api.setDiyOnlineStatus(faceId, wording, faceType);
        return this.client.callApi('set_diy_online_status', { face_id: faceId, wording, face_type: faceType });
    }
    async sendArkShare(params) {
        const api = this.client.api;
        if (typeof api.sendArkShare === 'function')
            return api.sendArkShare(params);
        return this.client.callApi('send_ark_share', params);
    }
    async sendGroupArkShare(groupId) {
        const api = this.client.api;
        if (typeof api.sendGroupArkShare === 'function')
            return api.sendGroupArkShare(groupId);
        return this.client.callApi('send_group_ark_share', { group_id: groupId });
    }
    async getMiniAppArk(payload) {
        const api = this.client.api;
        if (typeof api.getMiniAppArk === 'function')
            return api.getMiniAppArk(payload);
        return this.client.callApi('get_mini_app_ark', payload);
    }
    async getAiCharacters(groupId, chatType) {
        const api = this.client.api;
        if (typeof api.getAiCharacters === 'function')
            return api.getAiCharacters(groupId, chatType);
        return this.client.callApi('get_ai_characters', { group_id: groupId, chat_type: chatType ?? 1 });
    }
    async getAiRecord(groupId, character, text) {
        const api = this.client.api;
        if (typeof api.getAiRecord === 'function')
            return api.getAiRecord(groupId, character, text);
        return this.client.callApi('get_ai_record', { group_id: groupId, character, text });
    }
    async sendGroupAiRecord(groupId, character, text) {
        const api = this.client.api;
        if (typeof api.sendGroupAiRecord === 'function')
            return api.sendGroupAiRecord(groupId, character, text);
        return this.client.callApi('send_group_ai_record', { group_id: groupId, character, text });
    }
    async setGroupSign(groupId) {
        const api = this.client.api;
        if (typeof api.setGroupSign === 'function')
            return api.setGroupSign(groupId);
        return this.client.callApi('set_group_sign', { group_id: groupId });
    }
    async sendGroupSign(groupId) {
        const api = this.client.api;
        if (typeof api.sendGroupSign === 'function')
            return api.sendGroupSign(groupId);
        return this.client.callApi('send_group_sign', { group_id: groupId });
    }
    async getClientkey() {
        const api = this.client.api;
        if (typeof api.getClientkey === 'function')
            return api.getClientkey();
        return this.client.callApi('get_clientkey');
    }
    async clickInlineKeyboardButton(params) {
        const api = this.client.api;
        if (typeof api.clickInlineKeyboardButton === 'function')
            return api.clickInlineKeyboardButton(params);
        return this.client.callApi('click_inline_keyboard_button', params);
    }
    async banUser(groupId, userId, duration) {
        try {
            await this.client.setGroupBan(groupId, userId, duration);
            this.logger.info(`Banned user ${userId} in group ${groupId} for ${duration}s`);
        }
        catch (error) {
            this.logger.error(`Failed to ban user ${userId} in group ${groupId}:`, error);
            throw error;
        }
    }
    async unbanUser(groupId, userId) {
        try {
            await this.client.unsetGroupBan(groupId, userId);
            this.logger.info(`Unbanned user ${userId} in group ${groupId}`);
        }
        catch (error) {
            this.logger.error(`Failed to unban user ${userId} in group ${groupId}:`, error);
            throw error;
        }
    }
    async kickUser(groupId, userId, rejectAddRequest = false) {
        try {
            await this.client.setGroupKick(groupId, userId, rejectAddRequest);
            this.logger.info(`Kicked user ${userId} from group ${groupId}`);
        }
        catch (error) {
            this.logger.error(`Failed to kick user ${userId} from group ${groupId}:`, error);
            throw error;
        }
    }
    async setGroupCard(groupId, userId, card) {
        try {
            await this.client.setGroupCard(groupId, userId, card);
            this.logger.info(`Set group card for user ${userId} in group ${groupId} to: ${card}`);
        }
        catch (error) {
            this.logger.error(`Failed to set group card for user ${userId} in group ${groupId}:`, error);
            throw error;
        }
    }
    async setGroupWholeBan(groupId, enable) {
        try {
            await this.client.setGroupWholeBan(groupId, enable);
            this.logger.info(`[NapCat] ${enable ? '\u5f00\u542f' : '\u5173\u95ed'}\u5168\u5458\u7981\u8a00: ${groupId}`);
        }
        catch (error) {
            this.logger.error(`[NapCat] \u8bbe\u7f6e\u5168\u5458\u7981\u8a00\u5931\u8d25: ${groupId}`, error);
            throw new Error(`\u8bbe\u7f6e\u5168\u5458\u7981\u8a00\u5931\u8d25: ${error.message || 'Unknown error'}`);
        }
    }
    async setGroupAdmin(groupId, userId, enable) {
        try {
            await this.client.setGroupAdmin(groupId, userId, enable);
            this.logger.info(`[NapCat] ${enable ? '\u8bbe\u7f6e' : '\u53d6\u6d88'}\u7ba1\u7406\u5458: \u7fa4${groupId} \u7528\u6237${userId}`);
        }
        catch (error) {
            this.logger.error(`[NapCat] \u8bbe\u7f6e\u7ba1\u7406\u5458\u5931\u8d25: \u7fa4${groupId} \u7528\u6237${userId}`, error);
            throw new Error(`\u8bbe\u7f6e\u7ba1\u7406\u5458\u5931\u8d25: ${error.message || 'Unknown error'}`);
        }
    }
    async setGroupName(groupId, groupName) {
        try {
            await this.client.setGroupName(groupId, groupName);
            this.logger.info(`[NapCat] \u4fee\u6539\u7fa4\u540d: \u7fa4${groupId} -> ${groupName}`);
        }
        catch (error) {
            this.logger.error(`[NapCat] \u4fee\u6539\u7fa4\u540d\u5931\u8d25: \u7fa4${groupId}`, error);
            throw new Error(`\u4fee\u6539\u7fa4\u540d\u5931\u8d25: ${error.message || 'Unknown error'}`);
        }
    }
    async setGroupSpecialTitle(groupId, userId, title, duration = -1) {
        try {
            await this.client.setGroupSpecialTitle(groupId, userId, title, duration);
            this.logger.info(`[NapCat] \u8bbe\u7f6e\u4e13\u5c5e\u5934\u8854: \u7fa4${groupId} \u7528\u6237${userId} -> ${title}`);
        }
        catch (error) {
            this.logger.error(`[NapCat] \u8bbe\u7f6e\u4e13\u5c5e\u5934\u8854\u5931\u8d25: \u7fa4${groupId} \u7528\u6237${userId}`, error);
            throw new Error(`\u8bbe\u7f6e\u4e13\u5c5e\u5934\u8854\u5931\u8d25: ${error.message || 'Unknown error'}`);
        }
    }
    async handleFriendRequest(flag, approve, remark) {
        try {
            await this.client.handleFriendRequest(flag, approve, remark);
            this.logger.info(`[NapCat] ${approve ? '\u540c\u610f' : '\u62d2\u7edd'}\u597d\u53cb\u7533\u8bf7: ${flag}`);
        }
        catch (error) {
            this.logger.error(`[NapCat] \u5904\u7406\u597d\u53cb\u7533\u8bf7\u5931\u8d25: ${flag}`, error);
            throw new Error(`\u5904\u7406\u597d\u53cb\u7533\u8bf7\u5931\u8d25: ${error.message || 'Unknown error'}`);
        }
    }
    async handleGroupRequest(flag, subType, approve, reason) {
        try {
            await this.client.handleGroupRequest(flag, subType, approve, reason);
            this.logger.info(`[NapCat] ${approve ? '\u540c\u610f' : '\u62d2\u7edd'}\u52a0\u7fa4\u7533\u8bf7: ${flag} (${subType})`);
        }
        catch (error) {
            this.logger.error(`[NapCat] \u5904\u7406\u52a0\u7fa4\u7533\u8bf7\u5931\u8d25: ${flag}`, error);
            throw new Error(`\u5904\u7406\u52a0\u7fa4\u7533\u8bf7\u5931\u8d25: ${error.message || 'Unknown error'}`);
        }
    }
    async sendLike(userId, times = 1) {
        try {
            if (times < 1 || times > 10) {
                throw new Error('\u70b9\u8d5e\u6b21\u6570\u5fc5\u987b\u57281-10\u4e4b\u95f4');
            }
            await this.client.sendLike(userId, times);
            this.logger.info(`[NapCat] \u70b9\u8d5e\u7528\u6237 ${userId} x${times}`);
        }
        catch (error) {
            this.logger.error(`[NapCat] \u70b9\u8d5e\u5931\u8d25: ${userId}`, error);
            throw new Error(`\u70b9\u8d5e\u5931\u8d25: ${error.message || 'Unknown error'}`);
        }
    }
    async getGroupHonorInfo(groupId, type = 'all') {
        try {
            const result = await this.client.getGroupHonorInfo(groupId, type);
            this.logger.info(`[NapCat] \u83b7\u53d6\u7fa4\u8363\u8a89\u4fe1\u606f: ${groupId} (${type})`);
            return result;
        }
        catch (error) {
            this.logger.error(`[NapCat] \u83b7\u53d6\u7fa4\u8363\u8a89\u4fe1\u606f\u5931\u8d25: ${groupId}`, error);
            throw new Error(`\u83b7\u53d6\u7fa4\u8363\u8a89\u4fe1\u606f\u5931\u8d25: ${error.message || 'Unknown error'}`);
        }
    }
}
