import type { CommandsFeature, ForwardFeature, MediaFeature, RecallFeature } from '@napgram/feature-kit';
import type Instance from '../domain/models/Instance';
import type { IQQClient } from '../infrastructure/clients/qq';
import type Telegram from '../infrastructure/clients/telegram/client';
export declare class FeatureManager {
    private readonly instance;
    private readonly tgBot;
    private readonly qqClient;
    private features;
    private initialized;
    forward?: ForwardFeature;
    recall?: RecallFeature;
    media?: MediaFeature;
    commands?: CommandsFeature;
    constructor(instance: Instance, tgBot: Telegram, qqClient: IQQClient);
    initialize(): Promise<void>;
    registerFeature(name: 'media' | 'commands' | 'forward' | 'recall', feature?: MediaFeature | CommandsFeature | ForwardFeature | RecallFeature): boolean;
    enableFeature(name: string): boolean;
    disableFeature(name: string): boolean;
    getFeatureStatus(): Record<string, boolean>;
    destroy(): Promise<void>;
}
export default FeatureManager;
