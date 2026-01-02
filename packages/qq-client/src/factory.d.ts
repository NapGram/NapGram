import type { IQQClient, IQQClientFactory, QQClientCreateParams } from './interface';
export declare class QQClientFactory implements IQQClientFactory {
    private creators;
    create(params: QQClientCreateParams): Promise<IQQClient>;
    register(type: string, creator: (params: QQClientCreateParams) => Promise<IQQClient>): void;
}
export declare const qqClientFactory: QQClientFactory;
