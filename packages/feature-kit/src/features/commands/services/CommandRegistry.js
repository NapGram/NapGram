import { getLogger } from '@napgram/infra-kit';
const logger = getLogger('CommandRegistry');
/**
 * 命令注册管理器
 */
export class CommandRegistry {
    commands = new Map();
    commandPrefix = '/';
    /**
     * 注册命令
     */
    register(command) {
        this.commands.set(command.name, command);
        // 注册别名
        if (command.aliases) {
            for (const alias of command.aliases) {
                this.commands.set(alias, command);
            }
        }
        logger.debug(`Registered command: ${command.name}`);
    }
    /**
     * 获取命令
     */
    get(commandName) {
        return this.commands.get(commandName);
    }
    /**
     * 获取所有命令
     */
    getAll() {
        return this.commands;
    }
    /**
     * 计算不含别名的命令数量
     */
    getUniqueCommandCount() {
        return new Set(this.commands.values()).size;
    }
    /**
     * 清空所有命令
     */
    clear() {
        this.commands.clear();
    }
    get prefix() {
        return this.commandPrefix;
    }
}
