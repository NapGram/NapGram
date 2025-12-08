import { getLogger } from '../../shared/logger';
import type { IQQClient } from '../../infrastructure/clients/qq';
import type { UnifiedMessage } from '../../domain/message';
import type Telegram from '../../infrastructure/clients/telegram/client';
import { Message } from '@mtcute/core';
import type Instance from '../../domain/models/Instance';
import ForwardMap from '../../domain/models/ForwardMap';
import env from '../../domain/models/env';
import db from '../../domain/models/db';
import { ThreadIdExtractor } from './services/ThreadIdExtractor';
import { CommandRegistry, type Command } from './services/CommandRegistry';
import { PermissionChecker } from './services/PermissionChecker';
import { InteractiveStateManager } from './services/InteractiveStateManager';

const logger = getLogger('CommandsFeature');

/**
 * 命令类型
 */
export type CommandHandler = (msg: UnifiedMessage, args: string[]) => Promise<void>;
export type { Command } from './services/CommandRegistry';

/**
 * 命令处理功能
 * Phase 3: 统一的命令处理系统
 */
export class CommandsFeature {
    private readonly registry: CommandRegistry;
    private readonly permissionChecker: PermissionChecker;
    private readonly stateManager: InteractiveStateManager;

    constructor(
        private readonly instance: Instance,
        private readonly tgBot: Telegram,
        private readonly qqClient: IQQClient,
    ) {
        this.registry = new CommandRegistry();
        this.permissionChecker = new PermissionChecker(instance);
        this.stateManager = new InteractiveStateManager();
        this.registerDefaultCommands();
        this.setupListeners();
        logger.info('CommandsFeature initialized');
    }

    /**
     * 注册默认命令
     */
    private registerDefaultCommands() {
        // TODO: 旧版 constants/commands.ts 中有更细分的指令清单（preSetup/group/private 等），后续可按需合并： 
        // setup/login/flags/alive/add/addfriend/addgroup/refresh_all/newinstance/info/q/rm/rmt/rmq/forwardoff/forwardon/disable_qq_forward/enable_qq_forward/disable_tg_forward/enable_tg_forward/refresh/poke/nick/mute 等。

        // 帮助命令
        this.registerCommand({
            name: 'help',
            aliases: ['h', '帮助'],
            description: '显示帮助信息',
            handler: this.handleHelp,
        });

        // 状态命令
        this.registerCommand({
            name: 'status',
            aliases: ['状态'],
            description: '显示机器人状态',
            handler: this.handleStatus,
        });

        // 绑定命令
        this.registerCommand({
            name: 'bind',
            aliases: ['绑定'],
            description: '绑定指定 QQ 群到当前 TG 聊天',
            usage: '/bind <qq_group_id> [thread_id]',
            handler: this.handleBind,
            adminOnly: true,
        });

        // 解绑命令
        this.registerCommand({
            name: 'unbind',
            aliases: ['解绑'],
            description: '解绑当前 TG 聊天关联的 QQ 群',
            usage: '/unbind [qq_group_id] [thread_id]',
            handler: this.handleUnbind,
            adminOnly: true,
        });

        // 撤回命令
        this.registerCommand({
            name: 'rm',
            aliases: ['撤回'],
            description: '撤回指定消息（回复触发），默认撤回自己，管理员可撤回所有',
            usage: '/rm (请回复要撤回的消息)',
            handler: this.handleRecall,
            adminOnly: false,
        });


        logger.debug(`Registered ${this.registry.getUniqueCommandCount()} commands (${this.registry.getAll().size} including aliases)`);
    }

    /**
     * 注册命令
     */
    registerCommand(command: Command) {
        this.registry.register(command);
    }



    /**
     * 设置事件监听器
     */
    private setupListeners() {
        // 监听 TG 侧消息
        logger.info('CommandsFeature listening Telegram messages for commands');
        this.tgBot.addNewMessageEventHandler(this.handleTgMessage);

        // 监听 QQ 侧消息
        logger.info('CommandsFeature listening QQ messages for commands');
        this.qqClient.on('message', this.handleQqMessage);
    }

    /**
     * 对外暴露的处理函数，便于其他模块手动调用
     * 返回 true 表示命令已处理，外部可中断后续逻辑
     */
    public processTgMessage = async (tgMsg: any): Promise<boolean> => {
        return await this.handleTgMessage(tgMsg);
    };

    private handleTgMessage = async (tgMsg: Message): Promise<boolean> => {
        try {
            const text = tgMsg.text;
            const chatId = tgMsg.chat.id;
            const senderId = tgMsg.sender.id;

            // 记录所有到达的 TG 文本，方便排查是否收不到事件
            logger.info('[Commands] TG message', {
                id: tgMsg.id,
                chatId,
                senderId,
                text: (text || '').slice(0, 200),
            });

            // 检查是否有正在进行的绑定操作
            const bindingState = this.stateManager.getBindingState(String(chatId), String(senderId));

            // 如果有等待输入的绑定状态，且消息不是命令（防止命令嵌套）
            if (bindingState && text && !text.startsWith(this.registry.prefix)) {
                // 检查是否超时
                if (this.stateManager.isTimeout(bindingState)) {
                    this.stateManager.deleteBindingState(String(chatId), String(senderId));
                    await this.replyTG(chatId, '绑定操作已超时，请重新开始', bindingState.threadId);
                    return true; // 即使超时也视为已处理（防止误触其他逻辑）
                }

                // 尝试解析 QQ 群号
                if (/^-?\d+$/.test(text.trim())) {
                    const qqGroupId = text.trim();
                    const threadId = bindingState.threadId;

                    // 执行绑定逻辑
                    const forwardMap = this.instance.forwardPairs as ForwardMap;

                    // 检查冲突
                    const tgOccupied = forwardMap.findByTG(chatId, threadId, false);
                    if (tgOccupied && tgOccupied.qqRoomId.toString() !== qqGroupId) {
                        await this.replyTG(chatId, `绑定失败：该 TG 话题已绑定到其他 QQ 群 (${tgOccupied.qqRoomId})`, threadId);
                        this.stateManager.deleteBindingState(String(chatId), String(senderId));
                        return true;
                    }

                    try {
                        const rec = await forwardMap.add(qqGroupId, chatId, threadId);
                        if (rec && rec.qqRoomId.toString() !== qqGroupId) {
                            await this.replyTG(chatId, '绑定失败：检测到冲突，请检查现有绑定', threadId);
                        } else {
                            const threadInfo = threadId ? ` (话题 ${threadId})` : '';
                            await this.replyTG(chatId, `绑定成功：QQ ${qqGroupId} <-> TG ${chatId}${threadInfo}`, threadId);
                            logger.info(`Interactive Bind: QQ ${qqGroupId} <-> TG ${chatId}${threadInfo}`);
                        }
                    } catch (e) {
                        logger.error('Interactive bind failed:', e);
                        await this.replyTG(chatId, '绑定过程中发生错误', threadId);
                    }

                    this.stateManager.deleteBindingState(String(chatId), String(senderId));
                    return true;
                } else {
                    // 输入非数字，视为取消
                    await this.replyTG(chatId, '输入格式错误或已取消绑定操作', bindingState.threadId);
                    this.stateManager.deleteBindingState(String(chatId), String(senderId));
                    return true;
                }
            }

            if (!text || !text.startsWith(this.registry.prefix)) return false;
            if (!chatId) return false;

            const senderName = tgMsg.sender.displayName || `${senderId}`;

            // 兼容 /cmd@bot 的写法，并解决多 bot 冲突
            const parts = text.slice(this.registry.prefix.length).split(/\s+/);
            let commandName = parts[0];

            if (commandName.includes('@')) {
                const [cmd, targetBot] = commandName.split('@');
                const myUsername = this.tgBot.me?.username;

                // 如果指定了 bot 但不是我，则忽略该命令
                if (targetBot && myUsername && targetBot.toLowerCase() !== myUsername.toLowerCase()) {
                    logger.debug(`Ignored command for other bot: ${targetBot}`);
                    return false;
                }
                commandName = cmd;
            }

            commandName = commandName.toLowerCase();
            const args = parts.slice(1);

            const command = this.registry.get(commandName);
            if (!command) {
                logger.debug(`Unknown command: ${commandName}`);
                return false;
            }

            if (command.adminOnly && !this.permissionChecker.isAdmin(String(senderId))) {
                logger.warn(`Non-admin user ${senderId} tried to use admin command: ${commandName}`);
                await this.replyTG(chatId, '无权限执行该命令');
                return true;
            }

            logger.info(`Executing command: ${commandName} by ${senderName}`);
            await command.handler({
                id: String(tgMsg.id),
                platform: 'telegram',
                sender: { id: String(senderId), name: senderName },
                chat: { id: String(chatId), type: 'group' },
                content: [{ type: 'text', data: { text } }],
                timestamp: tgMsg.date.getTime(),
                metadata: { raw: tgMsg },
            } as UnifiedMessage, args);
            return true;

        } catch (error) {
            logger.error('Failed to handle command:', error);
            return false;
        }
    };

    private handleQqMessage = async (qqMsg: UnifiedMessage): Promise<void> => {
        try {
            // 提取所有文本内容并合并
            const textContents = qqMsg.content.filter(c => c.type === 'text');
            if (textContents.length === 0) return;

            const text = textContents.map(c => c.data.text || '').join('').trim();
            if (!text || !text.startsWith(this.registry.prefix)) return;

            const chatId = qqMsg.chat.id;
            const senderId = qqMsg.sender.id;

            logger.info('[Commands] QQ message', {
                id: qqMsg.id,
                chatId,
                senderId,
                text: text.slice(0, 200),
            });

            const senderName = qqMsg.sender.name || `${senderId}`;

            // 解析命令
            const parts = text.slice(this.registry.prefix.length).split(/\s+/);
            const commandName = parts[0].toLowerCase();
            const args = parts.slice(1);

            const command = this.registry.get(commandName);
            if (!command) {
                logger.debug(`Unknown QQ command: ${commandName}`);
                return;
            }

            // QQ 侧不检查管理员权限（由 handleRecall 内部的 isSelf 检查控制）

            logger.info(`Executing QQ command: ${commandName} by ${senderName}`);

            // 执行命令
            await command.handler(qqMsg, args);

            // 命令执行成功后，尝试撤回命令消息本身
            if (command.name === 'rm') {
                try {
                    await this.qqClient.recallMessage(qqMsg.id);
                    logger.info(`QQ command message ${qqMsg.id} recalled`);
                } catch (e) {
                    logger.warn(e, 'Failed to recall QQ command message');
                }
            }

        } catch (error) {
            logger.error('Failed to handle QQ command:', error);
        }
    };



    private extractThreadId(msg: UnifiedMessage, args: string[]) {
        // 1. 优先从命令参数获取（显式指定）
        const arg = args[1];
        if (arg && /^\d+$/.test(arg)) {
            logger.info(`[extractThreadId] From arg: ${arg}`);
            return Number(arg);
        }

        // 2. 使用 ThreadIdExtractor 从消息元数据中提取
        const raw = (msg.metadata as any)?.raw;
        if (raw) {
            const threadId = new ThreadIdExtractor().extractFromRaw(raw);
            logger.info(`[extractThreadId] From raw: ${threadId}, raw keys: ${Object.keys(raw).join(',')}`);
            if (threadId) return threadId;
        }

        // 3. 回退：无 thread
        logger.info(`[extractThreadId] No thread ID found`);
        return undefined;
    }

    /**
     * 撤回命令处理器
     */
    private handleRecall = async (msg: UnifiedMessage, _args: string[]) => {
        const raw = (msg.metadata as any)?.raw as any;

        // 提取 replyToId：
        // 1. TG 消息：从 raw.replyTo 中提取
        // 2. QQ 消息：从 content 中的 reply 段提取
        let replyToId: number | undefined;

        // 先尝试 TG 结构
        replyToId = raw?.replyTo?.replyToMsgId
            || raw?.replyTo?.id
            || raw?.replyTo?.replyToTopId
            || raw?.replyToMessage?.id;

        // 如果 TG 结构没找到，尝试 QQ 结构
        if (!replyToId) {
            const replyContent = msg.content.find(c => c.type === 'reply');
            if (replyContent) {
                const replyData = replyContent.data as any;
                replyToId = Number(replyData.messageId || replyData.id || replyData.seq);
            }
        }

        const chatId = msg.chat.id;
        const senderId = msg.sender.id;
        const cmdMsgId = raw?.id || msg.id;

        if (!replyToId || !chatId) {
            await this.replyTG(chatId, '请回复要撤回的消息再使用 /rm');
            return;
        }

        // 根据消息平台使用不同的查询策略
        let record;
        if (msg.platform === 'qq') {
            // QQ 消息：replyToId 是 QQ 的 seq
            record = await db.message.findFirst({
                where: {
                    qqRoomId: BigInt(chatId),
                    seq: replyToId,
                    instanceId: this.instance.id,
                },
            });
        } else {
            // TG 消息：replyToId 是 TG 的 msgId
            record = await db.message.findFirst({
                where: {
                    tgChatId: BigInt(chatId),
                    tgMsgId: replyToId,
                    instanceId: this.instance.id,
                },
            });
        }

        const isAdmin = this.permissionChecker.isAdmin(String(senderId));
        const isSelf = record?.tgSenderId ? String(record.tgSenderId) === String(senderId) : false;

        if (!isAdmin && !isSelf) {
            await this.replyTG(chatId, '无权限撤回他人消息');
            return;
        }

        // 根据平台处理撤回逻辑
        if (msg.platform === 'qq') {
            // QQ 端 /rm：撤回 QQ 的原消息(replyToId) + 删除 TG 对应消息(record.tgMsgId)

            // 撤回 QQ 原消息
            try {
                await this.qqClient.recallMessage(String(replyToId));
                logger.info(`QQ message ${replyToId} recalled by /rm command`);
            } catch (e) {
                logger.warn(e, `撤回 QQ 消息 ${replyToId} 失败`);
            }

            // 删除对应的 TG 消息
            if (record?.tgMsgId && record?.tgChatId) {
                try {
                    const chat = await this.tgBot.getChat(Number(record.tgChatId));
                    await chat.deleteMessages([record.tgMsgId]);
                    logger.info(`TG message ${record.tgMsgId} deleted by QQ /rm command`);
                } catch (e) {
                    logger.warn(e, '删除 TG 消息失败');
                }
            }

        } else {
            // TG 端 /rm：删除 TG 原消息(replyToId) + 撤回 QQ 对应消息(record.seq)

            // 删除 TG 原消息
            try {
                const chat = await this.tgBot.getChat(Number(chatId));
                await chat.deleteMessages([replyToId]);
                logger.info(`TG message ${replyToId} deleted by /rm command`);
            } catch (e) {
                logger.warn(e, '撤回 TG 消息失败');
            }

            // 撤回对应的 QQ 消息
            if (record?.seq && env.ENABLE_AUTO_RECALL) {
                try {
                    await this.qqClient.recallMessage(String(record.seq));
                    logger.info(`QQ message ${record.seq} recalled by /rm command`);
                } catch (e) {
                    logger.warn(e, '撤回 QQ 消息失败');
                }
            }
        }

        // 尝试删除命令消息自身
        if (cmdMsgId) {
            try {
                const chat = await this.tgBot.getChat(Number(chatId));
                await chat.deleteMessages([Number(cmdMsgId)]);
            } catch (e) {
                logger.warn(e, '删除命令消息失败');
            }
        }
    };

    /**
     * 帮助命令处理器
     */
    private handleHelp = async (msg: UnifiedMessage, args: string[]) => {
        const commandList: string[] = [];
        const processedCommands = new Set<string>();

        for (const [name, command] of this.registry.getAll()) {
            // 跳过别名
            if (name !== command.name) continue;
            if (processedCommands.has(command.name)) continue;

            processedCommands.add(command.name);

            let line = `${this.registry.prefix}${command.name}`;
            if (command.aliases && command.aliases.length > 0) {
                line += ` (${command.aliases.join(', ')})`;
            }
            line += ` - ${command.description}`;
            if (command.adminOnly) {
                line += ' [管理员]';
            }

            commandList.push(line);
        }

        const helpText = `可用命令:\n${commandList.join('\n')}`;

        try {
            await this.replyTG(msg.chat.id, helpText, this.extractThreadId(msg, []));
        } catch (e) {
            logger.warn('发送帮助信息失败', e);
        }
        logger.info('Help command executed');
    };

    /**
     * 状态命令处理器
     */
    private handleStatus = async (msg: UnifiedMessage, args: string[]) => {
        const isOnline = await this.qqClient.isOnline();
        const status = `
机器人状态:
- QQ: ${isOnline ? '在线' : '离线'}
- QQ 号: ${this.qqClient.uin}
- 昵称: ${this.qqClient.nickname}
- 客户端类型: ${this.qqClient.clientType}
        `.trim();

        await this.replyTG(msg.chat.id, status);
        logger.info('Status command executed');
    };

    /**
     * 绑定命令处理器
     */
    private handleBind = async (msg: UnifiedMessage, args: string[]) => {
        const threadId = this.extractThreadId(msg, args);

        if (args.length < 1) {
            // 进入交互式绑定流程
            this.stateManager.setBindingState(msg.chat.id, msg.sender.id, threadId);

            // Dummy assignment to maintain structure


            const tip = `请输入要绑定的 QQ 群号...
(回复非数字取消)

提示：也可以直接发送完整命令，如：
/bind 123456 [topic_id]
(topic_id 可以省略，默认绑定当前话题)`;

            await this.replyTG(msg.chat.id, tip, threadId);
            return;
        }

        const qqGroupId = args[0];
        if (!/^-?\d+$/.test(qqGroupId)) {
            await this.replyTG(msg.chat.id, 'qq_group_id 必须是数字', threadId);
            return;
        }

        const forwardMap = this.instance.forwardPairs as ForwardMap;

        // 如果 TG 话题已被其他 QQ 占用，拒绝绑定
        const tgOccupied = forwardMap.findByTG(msg.chat.id, threadId, false);
        if (tgOccupied && tgOccupied.qqRoomId.toString() !== qqGroupId) {
            await this.replyTG(msg.chat.id, '该 TG 话题已绑定到其他 QQ 群', threadId);
            return;
        }

        // add 会在已存在该 QQ 时更新 tgThreadId
        const rec = await forwardMap.add(qqGroupId, msg.chat.id, threadId);
        if (rec && rec.qqRoomId.toString() !== qqGroupId) {
            await this.replyTG(msg.chat.id, '绑定失败：检测到冲突，请检查现有绑定', threadId);
            return;
        }

        const threadInfo = threadId ? ` (话题 ${threadId})` : '';
        await this.replyTG(msg.chat.id, `绑定成功：QQ ${qqGroupId} <-> TG ${msg.chat.id}${threadInfo}`, threadId);
        logger.info(`Bind command: QQ ${qqGroupId} <-> TG ${msg.chat.id}${threadInfo}`);
    };

    /**
     * 解绑命令处理器
     */
    private handleUnbind = async (msg: UnifiedMessage, args: string[]) => {
        const qqGroupId = args[0];
        const chatId = msg.chat.id;
        const forwardMap = this.instance.forwardPairs as ForwardMap;
        const threadId = this.extractThreadId(msg, args);

        const target = qqGroupId && /^-?\d+$/.test(qqGroupId)
            ? forwardMap.findByQQ(qqGroupId)
            : forwardMap.findByTG(chatId, threadId, threadId ? false : true);

        if (!target) {
            await this.replyTG(chatId, '未找到绑定关系', threadId);
            return;
        }

        await forwardMap.remove(target.qqRoomId);
        const threadInfo = target.tgThreadId ? ` (话题 ${target.tgThreadId})` : '';
        await this.replyTG(chatId, `已解绑：QQ ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`, threadId || target.tgThreadId || undefined);
        logger.info(`Unbind command: QQ ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`);
    };

    private async replyTG(chatId: string | number, text: string, threadId?: number) {
        try {
            const chat = await this.tgBot.getChat(Number(chatId));
            const params: any = { linkPreview: { disable: true } };
            if (threadId) params.replyTo = threadId;
            await chat.sendMessage(text, params);
        } catch (error) {
            logger.warn(`Failed to send reply to ${chatId}: ${error}`);
        }
    }

    /**
     * 清理资源
     */
    destroy() {
        this.tgBot.removeNewMessageEventHandler(this.handleTgMessage);
        this.qqClient.off('message', this.handleQqMessage);
        this.registry.clear();
        logger.info('CommandsFeature destroyed');
    }
}
