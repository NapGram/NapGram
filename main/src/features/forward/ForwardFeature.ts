import { getLogger } from '../../shared/logger';
import type { IQQClient } from '../../infrastructure/clients/qq';
import type { UnifiedMessage, MessageContent, ImageContent, VideoContent, AudioContent, FileContent } from '../../domain/message';
import { messageConverter } from '../../domain/message';
import type Telegram from '../../infrastructure/clients/telegram/client';
import type Instance from '../../domain/models/Instance';
import ForwardMap from '../../domain/models/ForwardMap';
import { MediaFeature } from '../media/MediaFeature';
import { CommandsFeature } from '../commands/CommandsFeature';
import env from '../../domain/models/env';
import db from '../../domain/models/db';
import flags from '../../domain/constants/flags';
import { Message } from '@mtcute/core';
import path from 'path';
import fs from 'fs';
import { md5Hex } from '../../shared/utils/hashing';
import silk from '../../shared/encoding/silk';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { fileTypeFromBuffer } from 'file-type';

const logger = getLogger('ForwardFeature');
const execFileAsync = promisify(execFile);

/**
 * 基于新架构的简化转发实现（NapCat <-> Telegram）。
 */
export class ForwardFeature {
    private forwardMap: ForwardMap;

    constructor(
        private readonly instance: Instance,
        private readonly tgBot: Telegram,
        private readonly qqClient: IQQClient,
        private readonly media?: MediaFeature,
        private readonly commands?: CommandsFeature,
    ) {
        const pairs = instance.forwardPairs;
        const isForwardMap = pairs && typeof (pairs as any).findByQQ === 'function' && typeof (pairs as any).findByTG === 'function';
        if (!isForwardMap) {
            throw new Error('Forward map is not initialized for NapCat pipeline.');
        }
        this.forwardMap = pairs as ForwardMap;
        this.setupListeners();
        logger.info('ForwardFeature initialized');

        // Register commands
        if (this.commands) {
            this.commands.registerCommand({
                name: 'mode',
                aliases: ['模式'],
                description: '控制昵称显示和转发开关 (QQ->TG/TG->QQ)',
                usage: '/mode <nickname|forward> <00|01|10|11>',
                handler: this.handleModeCommand,
                adminOnly: true,
            });
        }
    }

    private setupListeners() {
        this.qqClient.on('message', this.handleQQMessage);
        this.tgBot.addNewMessageEventHandler(this.handleTGMessage);
        logger.debug('ForwardFeature listeners attached');
    }

    public nicknameMode: string = env.SHOW_NICKNAME_MODE;
    public forwardMode: string = env.FORWARD_MODE;

    private handleQQMessage = async (msg: UnifiedMessage) => {
        // Check forward mode (QQ -> TG is index 0)
        if (this.forwardMode[0] === '0') {
            return;
        }

        try {
            const pair = this.forwardMap.findByQQ(msg.chat.id);
            if (!pair) {
                logger.debug(`No TG mapping for QQ chat ${msg.chat.id}`);
                return;
            }

            const tgChatId = Number(pair.tgChatId);
            const chat = await this.instance.tgBot.getChat(tgChatId);

            // 处理回复
            let replyToMsgId: number | undefined;
            const replyContent = msg.content.find(c => c.type === 'reply');
            if (replyContent && replyContent.type === 'reply') { // Type guard
                const qqMsgId = replyContent.data.messageId;
                replyToMsgId = await this.findTgMsgId(pair.instanceId, pair.qqRoomId, qqMsgId);
            }

            const sentMsg = await this.sendToTelegram(chat, msg, pair, replyToMsgId);

            if (sentMsg) {
                await this.saveMessage(msg, sentMsg, pair.instanceId, pair.qqRoomId, BigInt(tgChatId));
                logger.info(`QQ message ${msg.id} forwarded to TG ${tgChatId} (TG ID: ${sentMsg.id})`);
            }
        } catch (error) {
            logger.error('Failed to forward QQ message:', error);
        }
    };

    private handleModeCommand = async (msg: UnifiedMessage, args: string[]) => {
        const chatId = msg.chat.id;
        // Extract threadId from raw message
        const raw = (msg.metadata as any)?.raw;
        const threadId = raw?.replyTo?.replyToTopId
            || raw?.replyTo?.replyToMsgId
            || raw?.replyToMsgId;

        const type = args[0];
        const value = args[1];

        if (!type || !value || !/^[01]{2}$/.test(value)) {
            await this.replyTG(chatId, '用法：/mode <nickname|forward> <00|01|10|11>\n示例：/mode nickname 10 (QQ->TG显示昵称，TG->QQ不显示)', threadId);
            return;
        }

        if (type === 'nickname') {
            this.nicknameMode = value;
            await this.replyTG(chatId, `昵称显示模式已更新为: ${value}`, threadId);
        } else if (type === 'forward') {
            this.forwardMode = value;
            await this.replyTG(chatId, `转发模式已更新为: ${value}`, threadId);
        } else {
            await this.replyTG(chatId, '未知模式类型，请使用 nickname 或 forward', threadId);
        }
    };

    private handleTGMessage = async (tgMsg: Message) => {
        try {
            const rawText = tgMsg.text || '';
            logger.info('[Forward] TG incoming', {
                id: tgMsg.id,
                chatId: tgMsg.chat.id,
                text: rawText.slice(0, 100),
            });

            const threadId = (tgMsg as any).replyTo?.replyToTopId || (tgMsg as any).replyTo?.replyToMsgId;

            // 兜底处理 /bind，防止命令层未捕获
            if (rawText.startsWith('/bind') || rawText.startsWith('/unbind')) {
                const tokens = rawText.split(/\s+/);
                // 支持 /bind@bot 格式
                if (tokens[0].includes('@')) tokens[0] = tokens[0].split('@')[0];
                const cmd = tokens[0].replace('/', '');
                const qqId = tokens[1];
                const chatId = tgMsg.chat.id;
                const senderId = tgMsg.sender.id;

                if (!this.isAdmin(String(senderId))) {
                    await this.replyTG(chatId, '无权限执行该命令', threadId);
                    return;
                }

                if (cmd === 'bind') {
                    if (!qqId || !/^-?\d+$/.test(qqId) || !chatId) {
                        await this.replyTG(chatId, '用法：/bind <qq_group_id> [thread_id]', threadId);
                        return;
                    }

                    const bindThreadId = tokens[2] ? parseInt(tokens[2]) : undefined;
                    const existed = this.forwardMap.findByQQ(qqId) || this.forwardMap.findByTG(chatId, bindThreadId);
                    if (existed) {
                        await this.replyTG(chatId, '该 QQ 或 TG 已存在绑定', threadId);
                        return;
                    }

                    await this.forwardMap.add(qqId, chatId, bindThreadId);
                    const threadInfo = bindThreadId ? ` (话题 ${bindThreadId})` : '';
                    await this.replyTG(chatId, `绑定成功：QQ ${qqId} <-> TG ${chatId}${threadInfo}`, threadId);
                } else if (cmd === 'unbind') {
                    const target = qqId && /^-?\d+$/.test(qqId)
                        ? this.forwardMap.findByQQ(qqId)
                        : this.forwardMap.findByTG(chatId);
                    if (!target) {
                        await this.replyTG(chatId, '未找到绑定关系', threadId);
                        return;
                    }
                    await this.forwardMap.remove(target.qqRoomId);
                    await this.replyTG(chatId, `已解绑：QQ ${target.qqRoomId} <-> TG ${target.tgChatId}`, threadId);
                }
                return;
            }

            // Check forward mode (TG -> QQ is index 1)
            if (this.forwardMode[1] === '0') {
                return;
            }

            const pair = this.forwardMap.findByTG(
                tgMsg.chat.id,
                threadId,
                !threadId, // 如果有 threadId，禁用 fallback，避免落到 general
            );
            if (!pair) {
                logger.debug(`No QQ mapping for TG chat ${tgMsg.chat.id} thread ${threadId || 'none'}`);
                return;
            }

            const unified = messageConverter.fromTelegram(tgMsg as any);
            await this.prepareMediaForQQ(unified);

            // 如果是回复，尝试找到对应的 QQ 消息 ID，构造 QQ 的 reply 段
            const tgReplyToId = (tgMsg as any).replyTo?.replyToMsgId;
            let qqReplyId: string | undefined;
            if (tgReplyToId) {
                const source = await this.findQqSource(pair.instanceId, Number(pair.tgChatId), tgReplyToId);
                if (source?.seq) {
                    qqReplyId = String(source.seq);
                    logger.debug(`Mapped TG reply ${tgReplyToId} -> QQ seq ${qqReplyId}`);
                } else {
                    logger.debug(`No QQ mapping found for TG reply ${tgReplyToId}`);
                }
            }

            const replySegment = qqReplyId ? [{
                type: 'reply' as const,
                data: { messageId: qqReplyId }
            }] : [];

            // Remove reply content as per user request (TG -> QQ reply not needed)
            // Also remove 'at' segments to avoid redundant mentions
            unified.content = unified.content.filter(c => c.type !== 'at');

            // Strip explicit @mention from the beginning of the text if present
            const firstTextIndex = unified.content.findIndex(c => c.type === 'text');
            if (firstTextIndex !== -1) {
                const textData = unified.content[firstTextIndex].data as any;
                if (textData.text) {
                    const originalText = textData.text;
                    // Remove @username or @userid at the start, allowing for whitespace
                    textData.text = textData.text.replace(/^\s*@\S+\s*/, '');
                    if (originalText !== textData.text) {
                        logger.debug(`Stripped mention from text: "${originalText}" -> "${textData.text}"`);
                    }
                }
            }

            const hasMedia = unified.content.some(c => ['video', 'file'].includes(c.type));
            const hasSplitMedia = unified.content.some(c => ['audio', 'image'].includes(c.type));
            const showTGToQQNickname = this.nicknameMode[1] === '1';

            let receipt;

            if (hasMedia) {
                // 使用合并转发 (Video, File)
                const segments = await messageConverter.toNapCat(unified);

                unified.content = [
                    ...replySegment,
                    ...unified.content
                ];

                const mediaSegments = await messageConverter.toNapCat(unified);

                const node = {
                    type: 'node',
                    data: {
                        name: showTGToQQNickname ? unified.sender.name : 'Anonymous', // 控制节点名称
                        uin: this.qqClient.uin, // 使用 Bot 的 UIN，但显示 TG 用户名
                        content: mediaSegments
                    }
                };

                receipt = await this.qqClient.sendGroupForwardMsg(String(pair.qqRoomId), [node]);

            } else if (hasSplitMedia) {
                // 语音和图片消息特殊处理：分两次调用 API 发送
                const headerText = showTGToQQNickname ? `${unified.sender.name}:\n` : '';
                const textSegments = unified.content.filter(c =>
                    !['audio', 'image'].includes(c.type) &&
                    !(c.type === 'text' && !c.data.text)
                );

                const hasContentToSend = headerText || textSegments.length > 0 || replySegment.length > 0;

                if (hasContentToSend) {
                    const content: any[] = [...replySegment];
                    if (headerText) {
                        content.push({ type: 'text', data: { text: headerText } });
                    }
                    content.push(...textSegments);

                    const headerMsg: UnifiedMessage = {
                        ...unified,
                        content
                    };
                    // 发送 Header
                    await this.qqClient.sendMessage(String(pair.qqRoomId), headerMsg);
                }

                // 2. 发送媒体 (Audio, Image)
                const mediaSegments = unified.content.filter(c => ['audio', 'image'].includes(c.type));
                const mediaMsg: UnifiedMessage = {
                    ...unified,
                    content: mediaSegments
                };

                receipt = await this.qqClient.sendMessage(String(pair.qqRoomId), mediaMsg);

            } else {
                // 普通文本消息，保持原样
                const headerText = showTGToQQNickname ? `${unified.sender.name}:\n` : '';
                unified.content = [
                    ...replySegment,
                    { type: 'text', data: { text: headerText } },
                    ...unified.content,
                ];

                unified.chat.id = String(pair.qqRoomId);
                unified.chat.type = 'group';

                receipt = await this.qqClient.sendMessage(String(pair.qqRoomId), unified);
            }

            if (receipt.success) {
                logger.info(`TG message ${tgMsg.id} forwarded to QQ ${pair.qqRoomId} (receipt:\n${JSON.stringify(receipt, null, 2)})`);
                const msgId = receipt.messageId || (receipt as any).data?.message_id || (receipt as any).id;
                if (msgId) {
                    // Save mapping for reply lookup (QQ -> TG reply)
                    try {
                        await db.message.create({
                            data: {
                                qqRoomId: pair.qqRoomId,
                                qqSenderId: BigInt(0), // Self sent
                                time: Math.floor(Date.now() / 1000),
                                seq: Number(msgId), // Store message_id as seq
                                rand: BigInt(0),
                                pktnum: 0,
                                tgChatId: BigInt(pair.tgChatId),
                                tgMsgId: tgMsg.id,
                                tgSenderId: BigInt(tgMsg.sender.id || 0),
                                instanceId: pair.instanceId,
                                brief: unified.content.map(c => this.renderContent(c)).join(' ').slice(0, 50),
                            }
                        });
                        logger.debug(`Saved TG->QQ mapping: seq=${msgId} <-> tgMsgId=${tgMsg.id}`);
                    } catch (e) {
                        logger.warn('Failed to save TG->QQ message mapping:', e);
                    }
                } else {
                    logger.warn('TG->QQ forwarded but no messageId in receipt, cannot save mapping.');
                }
            } else if (receipt.error) {
                logger.warn(`TG message ${tgMsg.id} forwarded to QQ ${pair.qqRoomId} failed: ${receipt.error}`);
            }
        } catch (error) {
            logger.error('Failed to forward TG message:', error);
        }
    };

    /**
     * 为 QQ 侧填充媒体 Buffer/URL，提升兼容性。
     */
    private async prepareMediaForQQ(msg: UnifiedMessage) {
        if (!this.media) return;

        await Promise.all(msg.content.map(async (content) => {
            try {
                if (content.type === 'image') {
                    content.data.file = await this.ensureFilePath(await this.ensureBufferOrPath(content as ImageContent), '.jpg');
                } else if (content.type === 'video') {
                    // 使用可外网访问的 URL，NapCat 发送视频需要 URL 而非本地路径
                    content.data.file = await this.ensureFilePath(await this.ensureBufferOrPath(content as VideoContent), '.mp4', false);
                } else if (content.type === 'audio') {
                    const oggPath = await this.ensureFilePath(await this.ensureBufferOrPath(content as AudioContent, true), '.ogg', true);
                    if (oggPath) {
                        try {
                            // QQ 语音需要 silk，避免 NapCat 报“语音转换失败”
                            const silkBuffer = await silk.encode(oggPath);
                            logger.debug(`Encoded silk buffer size: ${silkBuffer?.length}`);
                            // 保存 silk 文件并获取 URL (forceLocal=false)，以便 NapCat 可以下载
                            content.data.file = await this.ensureFilePath(silkBuffer, '.silk', false);
                        } catch (err) {
                            // 转码失败则改为普通文件发送，至少保证可收到
                            logger.warn('Audio silk encode failed, fallback to file', err);
                            content.type = 'file';
                            content.data = {
                                file: oggPath,
                                filename: path.basename(oggPath),
                            } as any;
                        }
                    } else {
                        content.data.file = undefined;
                    }
                } else if (content.type === 'file') {
                    const file = content as FileContent;
                    content.data.file = await this.ensureFilePath(await this.ensureBufferOrPath(file), undefined);
                }
            } catch (err) {
                logger.warn('Prepare media for QQ failed, skip media content:', err);
                content.type = 'text';
                (content as any).data = { text: this.renderContent(content) };
            }
        }));
    }

    private async ensureBufferOrPath(content: ImageContent | VideoContent | AudioContent | FileContent, forceDownload?: boolean): Promise<Buffer | string | undefined> {
        if (content.data.file) {
            if (Buffer.isBuffer(content.data.file)) return content.data.file;
            if (typeof content.data.file === 'string') {
                // NapCat 下可能给的是本地绝对路径（record/image 等），如果可访问直接用；否则尝试下载
                if (!forceDownload && !/^https?:\/\//.test(content.data.file)) {
                    try {
                        logger.debug(`Processing media:\n${JSON.stringify(content, null, 2)}`);
                        await fs.promises.access(content.data.file);
                        logger.debug(`Media file exists locally: ${content.data.file}`);
                        return content.data.file;
                    } catch {
                        logger.debug(`Local media file not found or accessible, falling back to download: ${content.data.file}`);
                        // fallback to download below
                    }
                }
                try {
                    return await this.media?.downloadMedia(content.data.file);
                } catch (e) {
                    logger.warn('Failed to download media by url', e);
                }
            }
            // Assume it is a Telegram Media Object
            try {
                const mediaObj = content.data.file as any;
                // logger.debug(`Downloading TG media: type=${mediaObj?.className}, id=${mediaObj?.id}, accessHash=${mediaObj?.accessHash}, dcId=${mediaObj?.dcId}, size=${mediaObj?.size}`);
                const buffer = await this.instance.tgBot.downloadMedia(mediaObj);
                logger.debug(`Downloaded media buffer size: ${buffer?.length}`);

                if (!buffer || buffer.length === 0) {
                    logger.warn('Downloaded buffer is empty, treating as failure');
                    return undefined;
                }
                return buffer as Buffer;
            } catch (e) {
                logger.warn('Failed to download media from TG object:', e);
            }
        }
        if (content.data.url && this.media) {
            return await this.media.downloadMedia(content.data.url);
        }
        return undefined;
    }

    private async ensureFilePath(file: Buffer | string | undefined, ext?: string, forceLocal?: boolean) {
        if (!file) return undefined;
        if (Buffer.isBuffer(file)) {
            const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext || ''}`;
            const tempDir = path.join(process.cwd(), 'data', 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const tempPath = path.join(tempDir, filename);
            await fs.promises.writeFile(tempPath, file);

            if (!forceLocal) {
                // 1. Try INTERNAL_WEB_ENDPOINT (For Docker Network)
                if (env.INTERNAL_WEB_ENDPOINT) {
                    return `${env.INTERNAL_WEB_ENDPOINT}/temp/${filename}`;
                }
                // 2. Try WEB_ENDPOINT (Public URL)
                if (env.WEB_ENDPOINT) {
                    return `${env.WEB_ENDPOINT}/temp/${filename}`;
                }

                // 2. Fallback to Docker Host IP (Bridge Gateway)
                // If running in Docker, we usually map 8082 -> 8080.
                // NapCat (external container) -> Host (172.17.0.1) -> Port 8082
                // If running locally, you might need to adjust this or set WEB_ENDPOINT.
                return `http://172.17.0.1:8082/temp/${filename}`;
            }
            return tempPath;
        }
        return file;
    }

    private async sendToTelegram(chat: any, msg: UnifiedMessage, pair?: any, replyToMsgId?: number) {
        logger.debug(`Forwarding message to TG (sendToTelegram):\n${JSON.stringify(msg, null, 2)}`);
        // 使用 RichHeader 展示头像/昵称，同时保留文字昵称兜底（仅文本消息）
        const showQQToTGNickname = this.nicknameMode[0] === '1';
        let header = showQQToTGNickname ? `${msg.sender.name}:\n` : '';
        let textParts: string[] = [];

        // Avatar / Rich Header Logic
        let richHeaderUsed = false;
        let webPagePreview: any = undefined;

        const disableFlag = pair ? ((pair.flags | this.instance.flags) & flags.DISABLE_RICH_HEADER) : 0;
        const useRichHeader = pair && env.WEB_ENDPOINT && !disableFlag && showQQToTGNickname;
        let richHeaderUrl: string | undefined = undefined;
        if (useRichHeader) {
            richHeaderUrl = this.generateRichHeaderUrl(pair.apiKey, msg.sender.id, showQQToTGNickname ? (msg.sender.name || '') : ' ');
            richHeaderUsed = true;
        }

        // 如果有 threadId 且没有指定 replyToMsgId，使用 threadId 作为 replyTo
        // 这样消息会发送到指定的话题
        const effectiveReplyTo = replyToMsgId || pair?.tgThreadId;
        const replyTo = this.buildReplyTo(pair, effectiveReplyTo);

        let lastSent: any = null;
        for (const content of msg.content) {
            switch (content.type) {
                case 'reply':
                    if (!replyToMsgId) {
                        textParts.push(this.renderContent(content));
                    }
                    break;
                case 'text':
                case 'at':
                case 'face':
                    if (content.type === 'text' && content.data.text) {
                        const text = content.data.text.trim();
                        if (text === '[图片]' || text === '[视频]' || text === '[语音]') {
                            break;
                        }
                    }
                    textParts.push(this.renderContent(content));
                    break;
                case 'forward':
                    // Send pending text parts first
                    if (textParts.length > 0) {
                        const messageText = (header + textParts.join(' ')).replace(/\\n/g, '\n');
                        await chat.sendMessage(messageText, {
                            linkPreview: richHeaderUsed ? {} : { disable: true },
                            replyTo,
                        });
                        textParts = [];
                        richHeaderUsed = false; // Reset header usage
                        header = ''; // Clear header for subsequent messages
                    }
                    lastSent = await this.sendForwardToTG(chat, content, pair, replyToMsgId, header, richHeaderUsed, webPagePreview) || lastSent;
                    break;
                case 'image':
                case 'video':
                case 'audio':
                case 'file':
                    // 媒体消息也使用 Rich Header（如果启用）
                    // 发送前先清空 textParts，避免重复发送
                    if (textParts.length > 0) {
                        const messageText = (header + textParts.join(' ')).replace(/\\n/g, '\n');
                        await chat.sendMessage(messageText, {
                            linkPreview: richHeaderUsed ? {} : { disable: true },
                            replyTo,
                        });
                        textParts = [];
                    }
                    // 媒体消息使用 header（昵称）和 richHeader（头像）
                    lastSent = await this.sendMediaToTG(chat, header, content, replyToMsgId, pair, richHeaderUsed, webPagePreview, richHeaderUrl) || lastSent;
                    // 重置 header 和 richHeader，避免后续消息重复使用
                    richHeaderUsed = false;
                    header = '';
                    break;
                default:
                    textParts.push(this.renderContent(content));
                    break;
            }
        }

        if (textParts.length > 0) {
            let finalMessageText = textParts.join(' ').replace(/\\n/g, '\n');
            if (!richHeaderUsed) {
                finalMessageText = header + finalMessageText;
            }

            const params: any = {
                linkPreview: richHeaderUsed ? {} : { disable: true },
            };
            if (replyTo) params.replyTo = replyTo;

            try {
                // If richHeaderUsed, we might need to inject the URL into the text to trigger preview
                if (richHeaderUsed && richHeaderUrl) {
                    finalMessageText = `<a href="${richHeaderUrl}">\u200b</a>` + finalMessageText;
                    params.linkPreview = {}; // Enable preview
                }

                lastSent = await chat.sendMessage(finalMessageText, params);
                return lastSent;
            } catch (e: any) {
                // Handle errors
                throw e;
            }
        }
        return lastSent;
    }

    private async sendMediaToTG(chat: any, header: string, content: MessageContent, replyToMsgId?: number, pair?: any, richHeaderUsed?: boolean, webPagePreview?: any, richHeaderUrl?: string) {
        const mediaHelper = this.media;
        let fileSrc: any;

        try {
            if (content.type === 'image' && mediaHelper) {
                fileSrc = await mediaHelper.processImage(content as ImageContent);

                // 如果是本地路径，读取为 Buffer 以便检测类型和重命名
                if (typeof fileSrc === 'string' && fileSrc.startsWith('/')) {
                    try {
                        fileSrc = await fs.promises.readFile(fileSrc);
                    } catch (e) {
                        logger.warn('Failed to read local image file, keeping as path:', e);
                    }
                }

                if (Buffer.isBuffer(fileSrc)) {
                    const type = await fileTypeFromBuffer(fileSrc);
                    const ext = type?.ext || 'jpg';
                    logger.debug(`Detected image type: ${ext}, mime: ${type?.mime}`);
                    // mtcute handles buffers directly, but we might want to name it
                    fileSrc = { fileName: `image.${ext}`, data: fileSrc };
                }
            } else if (content.type === 'video' && mediaHelper) {
                fileSrc = await mediaHelper.processVideo(content as VideoContent);
                if (Buffer.isBuffer(fileSrc)) {
                    fileSrc = { fileName: 'video.mp4', data: fileSrc };
                }
            } else if (content.type === 'audio' && mediaHelper) {
                fileSrc = await mediaHelper.processAudio(content as AudioContent);
            } else if (content.type === 'file' && mediaHelper) {
                const file = content as FileContent;
                if (file.data.file) {
                    fileSrc = file.data.file;
                } else if (file.data.url) {
                    fileSrc = await mediaHelper.downloadMedia(file.data.url);
                }
            } else {
                fileSrc = (content as any).data?.file || (content as any).data?.url;
            }
        } catch (err) {
            logger.warn('Failed to process media, fallback to placeholder:', err);
        }

        let caption = header ? header.replace(/\\n/g, '\n') : undefined;
        if (richHeaderUsed && richHeaderUrl) {
            const escapedHeader = header ? header.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : '';
            caption = `<a href="${richHeaderUrl}">\u200b</a>${escapedHeader}`;
        }

        const replyTo = this.buildReplyTo(pair, replyToMsgId);
        const commonParams = {
            caption,
            replyTo,
        };

        try {
            if (content.type === 'image') {
                return await chat.client.sendPhoto(chat.id, fileSrc, commonParams);
            } else if (content.type === 'video') {
                return await chat.client.sendVideo(chat.id, fileSrc, commonParams);
            } else if (content.type === 'audio') {
                return await chat.client.sendAudio(chat.id, fileSrc, commonParams);
            } else if (content.type === 'file') {
                return await chat.client.sendDocument(chat.id, fileSrc, commonParams);
            }
        } catch (e) {
            logger.error('Failed to send media to TG:', e);
        }
        return null;
    }

    /**
     * 预处理音频源：优先本地 wav，检查文件完整性，必要时回退到 URL 重新下载。
     */
    private async prepareAudioSource(audioContent: AudioContent, processedFile?: Buffer | string) {
        // 1) 已有可用的 fileSrc（可能是 Buffer 或路径）
        let source: Buffer | string | undefined = processedFile;

        // 2) 原始 file 字段（本地路径）
        if (!source && typeof audioContent.data.file === 'string') {
            let candidate = audioContent.data.file;
            // 优先同名 .wav，存在则直接使用，不再走 URL 下载
            if (candidate.endsWith('.amr')) {
                const wavPath = `${candidate}.wav`;
                try {
                    await fs.promises.access(wavPath);
                    candidate = wavPath;
                } catch {
                    // ignore
                }
            }
            // 等待文件写入稳定再读取
            if (await this.waitFileStable(candidate)) {
                source = candidate;
            }
        }

        // 3) 如果还没有，尝试下载 url
        if (!source && audioContent.data.url && this.media) {
            const buf = await this.media.downloadMedia(audioContent.data.url);
            const tempPath = await this.ensureFilePath(buf, '.amr', true);
            source = tempPath || buf;
        }

        // 4) 如果是 Buffer 或路径，检测实际格式；如检测不到且存在 url，重新下载
        if (source) {
            let buffer: Buffer | undefined;
            if (Buffer.isBuffer(source)) {
                buffer = source;
            } else {
                try {
                    buffer = await fs.promises.readFile(source);
                } catch {
                    buffer = undefined;
                }
            }
            if (buffer) {
                const ft = await fileTypeFromBuffer(buffer);
                if (!ft && audioContent.data.url && this.media) {
                    // 可能是占位/损坏，重新下载 url
                    const buf = await this.media.downloadMedia(audioContent.data.url);
                    const tempPath = await this.ensureFilePath(buf, '.amr', true);
                    source = tempPath || buf;
                }
            }
        }

        // 5) 最后兜底：ensureBufferOrPath 强制下载
        if (!source) {
            source = await this.ensureBufferOrPath(audioContent, true);
        }
        return source;
    }

    /**
     * 等待文件写入稳定（大小两次一致且非零）
     */
    private async waitFileStable(filePath: string, attempts = 3, intervalMs = 150) {
        if (!filePath) return false;
        let lastSize = -1;
        for (let i = 0; i < attempts; i++) {
            try {
                const stat = await fs.promises.stat(filePath);
                if (stat.size > 0 && stat.size === lastSize) {
                    return true;
                }
                lastSize = stat.size;
            } catch {
                // ignore
            }
            await new Promise(r => setTimeout(r, intervalMs));
        }
        // 最后再试一次直接 access
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private async sendForwardToTG(chat: any, content: MessageContent, pair: any, replyToMsgId?: number, header: string = '', richHeaderUsed?: boolean, webPagePreview?: any) {
        if (content.type !== 'forward' || !content.data.id) {
            return await chat.sendMessage(this.renderContent(content).replace(/\\n/g, '\n'), {
                replyTo: this.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
            });
        }

        try {
            const entry = await db.forwardMultiple.create({
                data: {
                    resId: String(content.data.id),
                    fileName: 'Forwarded Message',
                    fromPairId: pair.id,
                }
            });

            const baseUrl = env.WEB_ENDPOINT || 'https://q2tg.usdt.edu.kg';
            const webAppUrl = `${baseUrl}/ui/chatRecord?tgWebAppStartParam=${entry.id}&uuid=${entry.id}`;

            const messageText = richHeaderUsed ? '[转发消息]' : `${header}[转发消息]`;

            // mtcute buttons
            const buttons = [
                [{ text: '查看合并转发', url: webAppUrl }]
            ];

            return await chat.sendMessage(messageText, {
                replyMarkup: { inline: buttons },
                replyTo: this.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
                linkPreview: richHeaderUsed ? {} : { disable: true },
            });
        } catch (e) {
            logger.error('Failed to send forward message:', e);
            return await chat.sendMessage(this.renderContent(content).replace(/\\n/g, '\n'), {
                replyTo: this.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
            });
        }
    }

    private renderContent(content: MessageContent): string {
        switch (content.type) {
            case 'text':
                // NapCat 上报的文本有时会把换行编码为字面 "\n"，这里还原为真实换行
                return (content.data.text || '').replace(/\\n/g, '\n');
            case 'image':
                return '[图片]';
            case 'video':
                return '[视频]';
            case 'audio':
                return '[语音]';
            case 'file':
                return `[文件:${content.data.filename || '文件'}]`;
            case 'at':
                return `@${content.data.userName || content.data.userId}`;
            case 'face':
                return content.data.text || '[表情]';
            case 'reply':
                return `(回复 ${content.data.messageId}${content.data.text ? ':' + content.data.text : ''})`;
            case 'forward':
                return `[转发消息x${content.data.messages?.length ?? 0}]`;
            case 'location':
                return `[位置:${content.data.title ?? ''} ${content.data.latitude},${content.data.longitude}]`;

            default:
                return `[${content.type}]`;
        }
    }

    private buildReplyTo(pair?: any, replyToMsgId?: number) {
        const topId = pair?.tgThreadId;
        const replyId = replyToMsgId || topId;
        if (!replyId) return undefined;
        // 对于论坛话题，replyTo 填顶帖 ID 即可进入话题
        return replyId;
    }

    destroy() {
        this.qqClient.removeListener('message', this.handleQQMessage);
        this.tgBot.removeNewMessageEventHandler(this.handleTGMessage);
        logger.info('ForwardFeature destroyed');
    }

    private isAdmin(userId: string): boolean {
        const envAdminQQ = env.ADMIN_QQ ? String(env.ADMIN_QQ) : null;
        const envAdminTG = env.ADMIN_TG ? String(env.ADMIN_TG) : null;
        return userId === String(this.instance.owner)
            || (envAdminQQ && userId === envAdminQQ)
            || (envAdminTG && userId === envAdminTG);
    }

    private async replyTG(chatId: string | number, text: string, replyTo?: any) {
        try {
            const chat = await this.tgBot.getChat(chatId as any);
            const params: any = { linkPreview: { disable: true } };
            if (replyTo) params.replyTo = replyTo;
            await chat.sendMessage(text, params);
        } catch (error) {
            logger.warn('Failed to send TG reply:', error);
        }
    }

    private async saveMessage(qqMsg: UnifiedMessage, tgMsg: any, instanceId: number, qqRoomId: bigint, tgChatId: bigint) {
        try {
            // We need to extract seq/rand/time from qqMsg if available
            // UnifiedMessage metadata might have it
            const raw = qqMsg.metadata?.raw || {};
            const seq = raw.message_id || raw.seq || 0;
            const rand = raw.rand || 0;
            const time = Math.floor(qqMsg.timestamp / 1000);
            const qqSenderId = BigInt(qqMsg.sender.id);

            await db.message.create({
                data: {
                    qqRoomId: qqRoomId,
                    qqSenderId: qqSenderId,
                    time: time,
                    seq: seq,
                    rand: BigInt(rand),
                    pktnum: 0, // Not available in UnifiedMessage?
                    tgChatId: tgChatId,
                    tgMsgId: tgMsg.id,
                    tgSenderId: BigInt(tgMsg.sender.id || 0),
                    instanceId: instanceId,
                    brief: qqMsg.content.map(c => this.renderContent(c)).join(' ').slice(0, 50),
                }
            });
        } catch (e) {
            logger.warn('Failed to save message mapping:', e);
        }
    }

    private async findTgMsgId(instanceId: number, qqRoomId: bigint, qqMsgId: string): Promise<number | undefined> {
        const numericId = Number(qqMsgId);
        // 1) 先按消息 seq/id 查
        if (!isNaN(numericId)) {
            logger.debug(`Finding TG Msg ID by seq: instanceId=${instanceId}, qqRoomId=${qqRoomId}, seq=${numericId}`);
            const bySeq = await db.message.findFirst({
                where: {
                    instanceId,
                    qqRoomId,
                    seq: numericId,
                }
            });
            if (bySeq) {
                logger.debug(`Found TG Msg ID by seq: ${bySeq.tgMsgId}`);
                return bySeq.tgMsgId;
            }
        }

        // 2) 有些 NapCat 回复的 id 可能是被回复人的 QQ 号，尝试按发送者匹配最近一条
        if (!isNaN(numericId)) {
            const senderId = BigInt(numericId);
            logger.debug(`Finding TG Msg ID by sender: instanceId=${instanceId}, qqRoomId=${qqRoomId}, sender=${senderId}`);
            const bySender = await db.message.findFirst({
                where: {
                    instanceId,
                    qqRoomId,
                    qqSenderId: senderId,
                },
                orderBy: {
                    time: 'desc',
                },
            });
            if (bySender) {
                logger.debug(`Found TG Msg ID by sender: ${bySender.tgMsgId}`);
                return bySender.tgMsgId;
            }
        }

        logger.debug('TG Msg ID not found for reply');
        return undefined;
    }

    private async findQqSource(instanceId: number, tgChatId: number, tgMsgId: number) {
        logger.debug(`Finding QQ source: instanceId=${instanceId}, tgChatId=${tgChatId}, tgMsgId=${tgMsgId}`);
        const msg = await db.message.findFirst({
            where: {
                tgChatId: BigInt(tgChatId),
                tgMsgId: tgMsgId,
                instanceId: instanceId,
            },
        });
        logger.debug(`Found QQ source: ${msg ? 'yes' : 'no'} (seq=${msg?.seq})`);
        return msg;
    }

    private generateRichHeaderUrl(apiKey: string, userId: string, messageHeader: string) {
        const url = new URL(`${env.WEB_ENDPOINT}/richHeader/${apiKey}/${userId}`);
        if (messageHeader) {
            url.searchParams.set('hash', md5Hex(messageHeader).substring(0, 10));
        }
        // Use static version to allow caching but break old 404
        url.searchParams.set('v', '1');
        return url.toString();
    }

    /**
     * 将 QQ 语音转为 Telegram 兼容的 ogg/opus，失败时返回可发送的原路径。
     */
    private async convertAudioToOgg(source: Buffer | string): Promise<{ voicePath?: string; fallbackPath?: string }> {
        const tempDir = path.join(process.cwd(), 'data', 'temp');
        await fs.promises.mkdir(tempDir, { recursive: true });

        let inputPath: string;
        let inputBuffer: Buffer;

        if (typeof source === 'string') {
            inputPath = source;
            try {
                inputBuffer = await fs.promises.readFile(inputPath);
            } catch (e) {
                logger.warn(`Failed to read audio file ${inputPath}:`, e);
                return { fallbackPath: inputPath };
            }
        } else {
            inputBuffer = source;
            inputPath = path.join(tempDir, `audio-${Date.now()}-${Math.random().toString(16).slice(2)}.amr`);
            await fs.promises.writeFile(inputPath, source);
        }

        const outputPath = path.join(tempDir, `audio-${Date.now()}-${Math.random().toString(16).slice(2)}.ogg`);

        // Try SILK decode first (NapCat PTT 常见)
        try {
            if (inputBuffer.length >= 10 && inputBuffer.subarray(0, 10).toString('utf8').includes('SILK_V3')) {
                await silk.decode(inputBuffer, outputPath);
                return { voicePath: outputPath };
            }
        } catch (e) {
            logger.warn('SILK decode failed (pre-ffmpeg):', e);
            // Continue to ffmpeg
        }

        const tryConvert = async (inPath: string) => {
            await execFileAsync('ffmpeg', [
                '-y',
                '-i', inPath,
                '-c:a', 'libopus',
                '-b:a', '32k',
                '-ar', '48000',
                '-ac', '1',
                outputPath,
            ]);
            return outputPath;
        };

        try {
            return { voicePath: await tryConvert(inputPath) };
        } catch (firstErr) {
            logger.warn('ffmpeg convert audio failed, try wav fallback or send raw', firstErr);
            // 如果有同名 .wav，尝试再转一次
            if (typeof source === 'string') {
                const wavPath = `${inputPath}.wav`;
                try {
                    await fs.promises.access(wavPath);
                    return { voicePath: await tryConvert(wavPath) };
                } catch {
                    // ignore
                }
            }
            // 尝试用 silk 解码原始缓冲区（即便未检测到头也试一次）
            try {
                await silk.decode(inputBuffer, outputPath);
                return { voicePath: outputPath };
            } catch (silkErr) {
                logger.warn('Silk decode fallback failed', silkErr);
            }
            // 仍失败则返回原路径作为普通音频发送
            return { fallbackPath: inputPath };
        }
    }
}

export default ForwardFeature;
