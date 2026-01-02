import type { Instance } from '../../shared-types';
import type { IQQClient } from '../../shared-types';
import type { Telegram } from '../../shared-types';
import type { CommandsFeature } from '../commands/CommandsFeature';
import type { MediaFeature } from '../MediaFeature';
/**
 * 基于新架构的简化转发实现（NapCat <-> Telegram）。
 */
export declare class ForwardFeature {
    private readonly instance;
    private readonly tgBot;
    private readonly qqClient;
    private readonly media?;
    private readonly commands?;
    private forwardMap;
    private telegramSender;
    private mapper;
    private replyResolver;
    private mediaGroupHandler;
    private tgMessageHandler;
    private mediaPreparer;
    private processedMsgIds;
    private handleTgMessage;
    constructor(instance: Instance, tgBot: Telegram, qqClient: IQQClient, media?: MediaFeature | undefined, commands?: CommandsFeature | undefined);
    private setupListeners;
    /**
     * 获取指定 pair 的转发模式配置
     * 优先使用 pair 的配置，若为 null 则使用环境变量默认值
     */
    private getForwardMode;
    /**
     * 获取指定 pair 的昵称模式配置
     * 优先使用 pair 的配置，若为 null 则使用环境变量默认值
     */
    private getNicknameMode;
    private toPluginSegments;
    private contentToText;
    private publishTgPluginEvent;
    private handleQQMessage;
    private handleModeCommand;
    private renderContent;
    private handlePokeEvent;
    destroy(): void;
}
export default ForwardFeature;
