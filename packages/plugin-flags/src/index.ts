import type { NapGramPlugin, PluginContext, MessageEvent } from './types/napgram.js';

const plugin: NapGramPlugin = {
    id: 'flags',
    name: 'Flags Plugin',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Manages experimental feature flags',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext, _config?: any) => {
        ctx.logger.info('Flags plugin installed');

        ctx.command({
            name: 'flags',
            description: '管理实验性功能标志',
            adminOnly: true, // 目前在插件内部判断
            handler: async (event: MessageEvent, args: string[]) => {
                if (event.platform !== 'tg') {
                    return;
                }

                // 权限检查 (简单起见，这里假设 isAdmin 逻辑在外部集成，或者通过 event.raw 检查)
                // 暂时允许通过，生产环境建议由 CommandRegistry 统一处理 adminOnly

                const showHelp = async () => {
                    await event.reply(
                        `⚙️ **实验性功能标志管理**\n\n用法:\n` +
                        `/flags list - 查看所有标志\n` +
                        `/flags enable <name> - 启用标志\n` +
                        `/flags disable <name> - 禁用标志`
                    );
                };

                if (args.length === 0) {
                    await listFlags(event);
                    return;
                }

                const action = args[0].toLowerCase();
                const flagName = args[1];

                switch (action) {
                    case 'list':
                        await listFlags(event);
                        break;
                    case 'enable':
                    case 'on':
                        if (!flagName) {
                            await event.reply('用法: /flags enable <flag_name>');
                            return;
                        }
                        await setFlag(event, flagName, true);
                        break;
                    case 'disable':
                    case 'off':
                        if (!flagName) {
                            await event.reply('用法: /flags disable <flag_name>');
                            return;
                        }
                        await setFlag(event, flagName, false);
                        break;
                    default:
                        await showHelp();
                }
            },
        });

        const listFlags = async (event: MessageEvent) => {
            const instance = event.instance as any;
            const flagsMap = instance._flagsStore as Map<string, boolean>;

            let message = `⚙️ **实验性功能标志**\n\n`;

            if (!flagsMap || flagsMap.size === 0) {
                message += `当前没有启用任何实验性功能\n\n`;
            } else {
                for (const [key, value] of flagsMap.entries()) {
                    const status = value ? '✅ 已启用' : '❌ 已禁用';
                    message += `\`${key}\` - ${status}\n`;
                }
                message += `\n`;
            }

            message += `⚠️ **警告**: 实验性功能可能不稳定！\n`;
            message += `\n可用标志参考:\n`;
            message += `• \`experimental_quotly\` - QuotLy 生成功能\n`;
            message += `• \`debug_mode\` - 调试模式`;

            await event.reply(message);
        };

        const setFlag = async (event: MessageEvent, flagName: string, enabled: boolean) => {
            const instance = event.instance as any;

            if (!instance._flagsStore) {
                instance._flagsStore = new Map<string, boolean>();
            }

            instance._flagsStore.set(flagName, enabled);

            const status = enabled ? '✅ 已启用' : '❌ 已禁用';
            await event.reply(
                `${status} 功能标志: \`${flagName}\`\n\n⚠️ 当前使用内存存储，重启后失效`
            );
        };

        ctx.logger.info('Flags plugin: All commands registered');
    },

    uninstall: async () => {
    },
};

export default plugin;
