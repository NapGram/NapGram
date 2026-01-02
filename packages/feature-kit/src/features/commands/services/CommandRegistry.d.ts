export interface Command {
    name: string;
    aliases?: string[];
    description: string;
    usage?: string;
    handler: (msg: any, args: string[]) => Promise<void>;
    adminOnly?: boolean;
}
/**
 * 命令注册管理器
 */
export declare class CommandRegistry {
    private commands;
    private readonly commandPrefix;
    /**
     * 注册命令
     */
    register(command: Command): void;
    /**
     * 获取命令
     */
    get(commandName: string): Command | undefined;
    /**
     * 获取所有命令
     */
    getAll(): Map<string, Command>;
    /**
     * 计算不含别名的命令数量
     */
    getUniqueCommandCount(): number;
    /**
     * 清空所有命令
     */
    clear(): void;
    get prefix(): string;
}
