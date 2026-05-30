import type { CommandConfig, MessageEvent, NapGramPlugin, PluginContext, PluginLogger, PluginPermissions } from '@napgram/core';

export * from '@napgram/core';
export * from '@napgram/utils';
export * from './guards/index.js';

export type PluginWithConfig<TConfig = unknown> = Omit<NapGramPlugin, 'install'> & {
    install(ctx: PluginContext, config?: TConfig): void | Promise<void>;
};

export type PluginConfigResolver<TConfig> = (config: unknown) => TConfig;

export function definePlugin<TConfig = unknown, T extends PluginWithConfig<TConfig> = PluginWithConfig<TConfig>>(plugin: T): T {
    return plugin;
}

export function defineCommand<T extends CommandConfig>(command: T): T {
    return command;
}

export function definePermissions<T extends PluginPermissions>(permissions: T): T {
    return permissions;
}

export type ReplyInfo = {
    id?: string;
    text?: string;
    userId?: string;
    raw?: unknown;
};

export type CommandGuardMessages = {
    wrongPlatform?: string;
    adminOnly?: string;
    ownerOnly?: string;
    missingReply?: string;
    cooldown?: (retryInMs: number) => string;
    error?: string;
};

export type CommandGuardOptions = {
    platform?: 'qq' | 'tg';
    requireAdmin?: boolean;
    requireOwner?: boolean;
    requireReply?: boolean;
    silent?: boolean;
    messages?: CommandGuardMessages;
    onError?: (error: unknown, event: MessageEvent, args: string[]) => void | Promise<void>;
};

const defaultGuardMessages: Required<CommandGuardMessages> = {
    wrongPlatform: 'This command is not available on this platform.',
    adminOnly: 'Admin permission required.',
    ownerOnly: 'Owner permission required.',
    missingReply: 'Please reply to a message first.',
    cooldown: (retryInMs: number) => `Please wait ${Math.ceil(retryInMs / 1000)}s before using this command again.`,
    error: 'Command failed. Please check logs.',
};

export type ErrorBoundaryOptions = {
    silent?: boolean;
    errorMessage?: string;
    logger?: PluginLogger;
    onError?: (error: unknown, event: MessageEvent, args: string[]) => void | Promise<void>;
};

export function withCommandGuards(
    handler: CommandConfig['handler'],
    options: CommandGuardOptions = {}
): CommandConfig['handler'] {
    const messages = { ...defaultGuardMessages, ...(options.messages || {}) };

    return async (event: MessageEvent, args: string[]) => {
        if (options.platform && event.platform !== options.platform) {
            if (!options.silent) await event.reply(messages.wrongPlatform);
            return;
        }

        if (options.requireOwner && !event.sender.isOwner) {
            if (!options.silent) await event.reply(messages.ownerOnly);
            return;
        }

        if (options.requireAdmin && !(event.sender.isAdmin || event.sender.isOwner)) {
            if (!options.silent) await event.reply(messages.adminOnly);
            return;
        }

        if (options.requireReply && !getReplyMessage(event)) {
            if (!options.silent) await event.reply(messages.missingReply);
            return;
        }

        try {
            await handler(event, args);
        } catch (error) {
            if (options.onError) {
                await options.onError(error, event, args);
                return;
            }

            if (!options.silent) await event.reply(messages.error);
        }
    };
}

export function createCommand<T extends CommandConfig>(config: T, options?: CommandGuardOptions): T {
    if (!options) return config;
    return { ...config, handler: withCommandGuards(config.handler, options) };
}

export function withErrorBoundary(handler: CommandConfig['handler'], options: ErrorBoundaryOptions = {}): CommandConfig['handler'] {
    const message = options.errorMessage || defaultGuardMessages.error;
    return async (event: MessageEvent, args: string[]) => {
        try {
            await handler(event, args);
        } catch (error) {
            if (options.onError) {
                await options.onError(error, event, args);
                return;
            }

            if (options.logger) {
                options.logger.error('Command failed', error);
            }

            if (!options.silent) {
                await event.reply(message);
            }
        }
    };
}

export type CooldownResult = { allowed: boolean; retryInMs: number };

export type CooldownOptions = {
    durationMs: number;
    key?: (event: MessageEvent, args: string[]) => string;
    onCooldown?: (event: MessageEvent, retryInMs: number) => void | Promise<void>;
    messages?: Pick<CommandGuardMessages, 'cooldown'>;
};

export function createCooldown(durationMs: number) {
    const buckets = new Map<string, number>();

    return (key: string): CooldownResult => {
        const now = Date.now();
        const until = buckets.get(key) || 0;
        if (now < until) {
            return { allowed: false, retryInMs: until - now };
        }
        buckets.set(key, now + durationMs);
        return { allowed: true, retryInMs: 0 };
    };
}

export function withCooldown(handler: CommandConfig['handler'], options: CooldownOptions): CommandConfig['handler'] {
    const cooldown = createCooldown(options.durationMs);
    const messageFactory = options.messages?.cooldown || defaultGuardMessages.cooldown;

    return async (event: MessageEvent, args: string[]) => {
        const key = options.key
            ? options.key(event, args)
            : `${event.platform}:${event.channelId}:${event.sender.userId}`;

        const result = cooldown(key);
        if (!result.allowed) {
            if (options.onCooldown) {
                await options.onCooldown(event, result.retryInMs);
            } else {
                await event.reply(messageFactory(result.retryInMs));
            }
            return;
        }

        await handler(event, args);
    };
}

export function resolveConfig<T extends Record<string, unknown>>(config: unknown, defaults: T): T {
    if (!config || typeof config !== 'object') return { ...defaults };
    return { ...defaults, ...(config as Partial<T>) };
}

export function resolveConfigWith<T extends Record<string, unknown>>(
    config: unknown,
    defaults: T,
    resolver: PluginConfigResolver<T>
): T {
    return resolver(resolveConfig(config, defaults));
}

export function parseBoolean(value: string | undefined, fallback?: boolean): boolean | undefined {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return fallback;
}

export function parseNumber(value: string | number | undefined, fallback?: number): number | undefined {
    if (value === undefined) return fallback;
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(num)) return fallback;
    return num;
}

export type ParsedArgs = {
    args: string[];
    flags: Record<string, string | boolean>;
};

export function parseArgs(rawArgs: string[]): ParsedArgs {
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 0; i < rawArgs.length; i += 1) {
        const token = rawArgs[i];
        if (token.startsWith('--')) {
            const trimmed = token.slice(2);
            if (!trimmed) continue;

            if (trimmed.includes('=')) {
                const [key, ...rest] = trimmed.split('=');
                flags[key] = rest.join('=') || '';
                continue;
            }

            const next = rawArgs[i + 1];
            if (next && !next.startsWith('-')) {
                flags[trimmed] = next;
                i += 1;
            } else {
                flags[trimmed] = true;
            }
            continue;
        }

        if (token.startsWith('-') && token.length > 1) {
            const key = token.slice(1);
            const next = rawArgs[i + 1];
            if (next && !next.startsWith('-')) {
                flags[key] = next;
                i += 1;
            } else {
                flags[key] = true;
            }
            continue;
        }

        args.push(token);
    }

    return { args, flags };
}

export async function ensureArgs(event: MessageEvent, args: string[], min: number, message = 'Missing arguments.'): Promise<boolean> {
    if (args.length >= min) return true;
    await event.reply(message);
    return false;
}

export function getChannelRef(event: MessageEvent): string | undefined {
    if (event.channelRef) return event.channelRef;
    if (event.platform === 'tg') return `tg:${event.channelId}`;
    const kind = event.channelType === 'group' ? 'group' : 'private';
    return `qq:${kind}:${event.channelId}`;
}

export function getMessageRef(event: MessageEvent): string | undefined {
    if (event.message.ref) return event.message.ref;
    if (event.platform === 'tg') return `tg:${event.channelId}:${event.message.id}`;
    return `qq:${event.message.id}`;
}

export function getReplyMessage(event: MessageEvent): ReplyInfo | null {
    if (event.message.quote) {
        return {
            id: String(event.message.quote.id),
            text: event.message.quote.text,
            userId: event.message.quote.userId,
            raw: event.message.quote,
        };
    }

    const raw = event.raw as any;
    const rawReply = raw?.rawReply || raw?.replyToMessage || raw?.replyTo;

    if (!rawReply) return null;
    if (typeof rawReply === 'string' || typeof rawReply === 'number') {
        return { id: String(rawReply), raw: rawReply };
    }

    const id =
        rawReply?.id ??
        rawReply?.messageId ??
        rawReply?.replyToMsgId ??
        rawReply?.replyTo?.replyToMsgId;
    const text = rawReply?.text ?? rawReply?.message ?? rawReply?.caption;
    const userId = rawReply?.sender?.id ?? rawReply?.senderId ?? rawReply?.from?.id;

    if (!id && !text && !userId) return null;

    return {
        id: id !== undefined ? String(id) : undefined,
        text: text !== undefined ? String(text) : undefined,
        userId: userId !== undefined ? String(userId) : undefined,
        raw: rawReply,
    };
}

export function formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export function withLoggerPrefix(logger: PluginLogger, prefix: string): PluginLogger {
    const format = (message: string) => `[${prefix}] ${message}`;
    return {
        debug: (message: string, ...args: any[]) => logger.debug(format(message), ...args),
        info: (message: string, ...args: any[]) => logger.info(format(message), ...args),
        warn: (message: string, ...args: any[]) => logger.warn(format(message), ...args),
        error: (message: string, ...args: any[]) => logger.error(format(message), ...args),
    };
}

export function createPluginLogger(ctx: PluginContext, prefix?: string): PluginLogger {
    if (!prefix) return ctx.logger;
    return withLoggerPrefix(ctx.logger, prefix);
}
