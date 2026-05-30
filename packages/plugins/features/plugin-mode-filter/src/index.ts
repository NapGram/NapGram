import type { NapGramPlugin, PluginContext, MessageEvent, ExtendedModeFilterConfig, FilterMode } from '@napgram/sdk';
import { createModeFilter } from '@napgram/sdk';

type ModeFilterCommandsConfig = {
    enabled?: boolean;
    adminOnly?: boolean;
    name?: string;
    aliases?: string[];
};

export type ModeFilterPluginConfig = ExtendedModeFilterConfig & {
    enabled?: boolean;
    logBlocked?: boolean;
    stats?: boolean;
    commands?: ModeFilterCommandsConfig;
};

type ModeFilterStorage = Pick<
    ExtendedModeFilterConfig,
    'mode' | 'qqGroups' | 'tgGroups' | 'qqUsers' | 'tgUsers' | 'allowPrivateChat'
>;

type ModeFilterStats = {
    allowed: number;
    blocked: number;
    byPlatform: Record<'qq' | 'tg', { allowed: number; blocked: number }>;
};

const STORAGE_KEY = 'mode-filter-config-v1';

const defaultCommands: Required<ModeFilterCommandsConfig> = {
    enabled: true,
    adminOnly: true,
    name: 'mode-filter',
    aliases: ['modefilter', 'mode'],
};

const defaultConfig: ModeFilterPluginConfig = {
    enabled: true,
    mode: 'blacklist',
    qqGroups: [],
    tgGroups: [],
    qqUsers: [],
    tgUsers: [],
    allowPrivateChat: true,
    logBlocked: false,
    stats: true,
    commands: defaultCommands,
};

const normalizeList = (list?: Array<string | number>): string[] => {
    if (!Array.isArray(list)) return [];
    const set = new Set<string>();
    for (const item of list) {
        const value = String(item ?? '').trim();
        if (!value) continue;
        set.add(value);
    }
    return Array.from(set);
};

const buildConfig = (
    base: ModeFilterPluginConfig,
    rawConfig: ModeFilterPluginConfig | undefined,
    stored: ModeFilterStorage | undefined,
): ModeFilterPluginConfig => {
    const config = (rawConfig && typeof rawConfig === 'object' ? rawConfig : {}) as Partial<ModeFilterPluginConfig>;
    return {
        ...base,
        ...config,
        ...stored,
        enabled: config.enabled ?? base.enabled,
        logBlocked: config.logBlocked ?? base.logBlocked,
        stats: config.stats ?? base.stats,
        mode: (stored?.mode ?? config.mode ?? base.mode) as FilterMode,
        allowPrivateChat: stored?.allowPrivateChat ?? config.allowPrivateChat ?? base.allowPrivateChat,
        qqGroups: normalizeList(stored?.qqGroups ?? config.qqGroups ?? base.qqGroups),
        tgGroups: normalizeList(stored?.tgGroups ?? config.tgGroups ?? base.tgGroups),
        qqUsers: normalizeList(stored?.qqUsers ?? config.qqUsers ?? base.qqUsers),
        tgUsers: normalizeList(stored?.tgUsers ?? config.tgUsers ?? base.tgUsers),
        commands: {
            ...defaultCommands,
            ...(config.commands || {}),
        },
    };
};

const loadOverrides = async (ctx: PluginContext): Promise<ModeFilterStorage | undefined> => {
    try {
        const stored = await ctx.storage.get<ModeFilterStorage>(STORAGE_KEY);
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return undefined;
        return stored;
    } catch (error) {
        ctx.logger.warn('Mode filter: failed to load stored config', error);
        return undefined;
    }
};

const saveOverrides = async (ctx: PluginContext, config: ModeFilterPluginConfig) => {
    const payload: ModeFilterStorage = {
        mode: config.mode,
        qqGroups: config.qqGroups,
        tgGroups: config.tgGroups,
        qqUsers: config.qqUsers,
        tgUsers: config.tgUsers,
        allowPrivateChat: config.allowPrivateChat,
    };
    await ctx.storage.set(STORAGE_KEY, payload);
};

const formatList = (list: string[]): string => {
    if (!list.length) return '(empty)';
    const maxItems = 8;
    const visible = list.slice(0, maxItems);
    const extra = list.length > maxItems ? ` +${list.length - maxItems} more` : '';
    return `${visible.join(', ')}${extra}`;
};

const parseMode = (value?: string): FilterMode | null => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'whitelist' || normalized === 'white') return 'whitelist';
    if (normalized === 'blacklist' || normalized === 'black') return 'blacklist';
    return null;
};

const parseToggle = (value?: string): boolean | null => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(normalized)) return false;
    return null;
};

const resolvePlatform = (args: string[], event: MessageEvent) => {
    const head = (args[0] || '').toLowerCase();
    if (head === 'qq' || head === 'tg') {
        return { platform: head as 'qq' | 'tg', rest: args.slice(1) };
    }
    return { platform: event.platform, rest: args };
};

const plugin: NapGramPlugin = {
    id: 'mode-filter',
    name: 'Mode Filter',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Group/user allowlist and denylist filter',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext, config?: ModeFilterPluginConfig) => {
        const stored = await loadOverrides(ctx);
        let currentConfig = buildConfig(defaultConfig, config, stored);

        if (!currentConfig.enabled) {
            ctx.logger.info('Mode filter plugin disabled');
            return;
        }

        let filter = createModeFilter(currentConfig);
        const stats: ModeFilterStats = {
            allowed: 0,
            blocked: 0,
            byPlatform: {
                qq: { allowed: 0, blocked: 0 },
                tg: { allowed: 0, blocked: 0 },
            },
        };

        const refreshFilter = () => {
            filter = createModeFilter(currentConfig);
        };

        const updateConfig = async (patch: Partial<ModeFilterStorage>) => {
            currentConfig = {
                ...currentConfig,
                ...patch,
                qqGroups: normalizeList(patch.qqGroups ?? currentConfig.qqGroups),
                tgGroups: normalizeList(patch.tgGroups ?? currentConfig.tgGroups),
                qqUsers: normalizeList(patch.qqUsers ?? currentConfig.qqUsers),
                tgUsers: normalizeList(patch.tgUsers ?? currentConfig.tgUsers),
            };
            refreshFilter();
            await saveOverrides(ctx, currentConfig);
        };

        const recordStats = (event: MessageEvent, allowed: boolean) => {
            const platform = event.platform === 'qq' ? 'qq' : 'tg';
            if (allowed) {
                stats.allowed += 1;
                stats.byPlatform[platform].allowed += 1;
            } else {
                stats.blocked += 1;
                stats.byPlatform[platform].blocked += 1;
            }
        };

        ctx.on('message', (event: MessageEvent) => {
            const allowed = filter(event);
            (event as any).modeFilterAllowed = allowed;
            if (currentConfig.stats) {
                recordStats(event, allowed);
            }
            if (!allowed && currentConfig.logBlocked) {
                ctx.logger.info(
                    `Mode filter blocked: platform=${event.platform} channelType=${event.channelType} channelId=${event.channelId} userId=${event.sender.userId}`
                );
            }
        });

        if (currentConfig.commands?.enabled !== false) {
            const commandName = currentConfig.commands?.name || defaultCommands.name;
            const aliases = currentConfig.commands?.aliases || defaultCommands.aliases;
            const adminOnly = currentConfig.commands?.adminOnly ?? defaultCommands.adminOnly;

            ctx.command({
                name: commandName,
                aliases,
                description: 'Manage mode filter lists',
                adminOnly,
                handler: async (event: MessageEvent, args: string[]) => {
                    const action = (args[0] || '').toLowerCase();

                    const showHelp = async () => {
                        await event.reply(
                            'Mode filter commands:\n' +
                            '  status\n' +
                            '  mode <whitelist|blacklist>\n' +
                            '  allow-private <on|off>\n' +
                            '  add group [qq|tg] [id]\n' +
                            '  remove group [qq|tg] [id]\n' +
                            '  add user [qq|tg] [id]\n' +
                            '  remove user [qq|tg] [id]\n' +
                            '  clear group [qq|tg]\n' +
                            '  clear user [qq|tg]'
                        );
                    };

                    if (!action || action === 'help') {
                        await showHelp();
                        return;
                    }

                    if (action === 'status') {
                        const lines = [
                            `Enabled: ${currentConfig.enabled ? 'true' : 'false'}`,
                            `Mode: ${currentConfig.mode}`,
                            `Allow private: ${currentConfig.allowPrivateChat ? 'true' : 'false'}`,
                            `QQ groups: ${formatList(currentConfig.qqGroups || [])}`,
                            `TG groups: ${formatList(currentConfig.tgGroups || [])}`,
                            `QQ users: ${formatList(currentConfig.qqUsers || [])}`,
                            `TG users: ${formatList(currentConfig.tgUsers || [])}`,
                        ];

                        if (currentConfig.stats) {
                            lines.push(
                                `Stats: allowed=${stats.allowed} blocked=${stats.blocked}`,
                                `Stats by platform: qq=${stats.byPlatform.qq.allowed}/${stats.byPlatform.qq.blocked} tg=${stats.byPlatform.tg.allowed}/${stats.byPlatform.tg.blocked}`
                            );
                        } else {
                            lines.push('Stats: disabled');
                        }

                        await event.reply(lines.join('\n'));
                        return;
                    }

                    if (action === 'mode') {
                        const nextMode = parseMode(args[1]);
                        if (!nextMode) {
                            await event.reply('Usage: mode <whitelist|blacklist>');
                            return;
                        }
                        await updateConfig({ mode: nextMode });
                        await event.reply(`Mode updated: ${nextMode}`);
                        return;
                    }

                    if (action === 'allow-private' || action === 'private') {
                        const value = parseToggle(args[1]);
                        if (value === null) {
                            await event.reply('Usage: allow-private <on|off>');
                            return;
                        }
                        await updateConfig({ allowPrivateChat: value });
                        await event.reply(`Allow private updated: ${value ? 'true' : 'false'}`);
                        return;
                    }

                    if (action === 'add' || action === 'remove' || action === 'clear') {
                        const target = (args[1] || '').toLowerCase();
                        if (!target) {
                            await showHelp();
                            return;
                        }

                        const { platform, rest } = resolvePlatform(args.slice(2), event);
                        const isGroup = target === 'group' || target === 'groups';
                        const isUser = target === 'user' || target === 'users';

                        if (!isGroup && !isUser) {
                            await showHelp();
                            return;
                        }

                        const listKey = platform === 'qq'
                            ? (isGroup ? 'qqGroups' : 'qqUsers')
                            : (isGroup ? 'tgGroups' : 'tgUsers');

                        if (action === 'clear') {
                            await updateConfig({ [listKey]: [] } as Partial<ModeFilterStorage>);
                            await event.reply(`Cleared ${listKey}`);
                            return;
                        }

                        let id = rest[0];
                        if (!id) {
                            if (isGroup && event.channelType === 'group') {
                                id = String(event.channelId);
                            } else if (isUser) {
                                id = String(event.sender.userId);
                            }
                        }

                        if (!id) {
                            await event.reply('Missing id');
                            return;
                        }

                        const list = new Set(currentConfig[listKey] || []);
                        if (action === 'add') {
                            list.add(String(id));
                        } else {
                            list.delete(String(id));
                        }

                        await updateConfig({ [listKey]: Array.from(list) } as Partial<ModeFilterStorage>);
                        await event.reply(`${action} ${listKey}: ${id}`);
                        return;
                    }

                    await showHelp();
                },
            });
        }

        ctx.logger.info('Mode filter plugin installed');
    },
};

export default plugin;
