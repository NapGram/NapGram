import { Adapter, Bot, MessageEncoder, Schema, Universal } from '@koishijs/core';
import WebSocket from 'ws';
import { segmentsToSatoriContent } from './mapping';

export interface Segment {
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'at' | 'reply' | 'forward' | 'raw';
  data: any;
}

export interface MessageCreatedEvent {
  type: 'message.created';
  instanceId: number;
  channelId: string;
  threadId?: number | null;
  actor: {
    userId: string;
    name: string;
  };
  message: {
    messageId: string;
    platform: 'qq' | 'tg';
    timestamp: number;
    segments: Segment[];
    native?: any;
  };
}

export type GatewayEvent = MessageCreatedEvent;

export type Frame =
  | { op: 'hello'; v: number; t: number; data: any }
  | { op: 'ready'; v: number; t: number; data: any }
  | { op: 'event'; v: number; t: number; data: GatewayEvent }
  | { op: 'result'; v: number; t: number; data: any }
  | { op: 'error'; v: number; t: number; data: any }
  | { op: string; v: number; t: number; data?: any };

export interface Config extends Adapter.WsClientConfig {
  endpoint: string;
  token: string;
  instances: number[];
  selfId?: string;
  name?: string;
  adapterVersion?: string;
  defaultInstanceId?: number;
  heartbeatMs?: number;
}

export const name = 'adapter-napgram-gateway';

export const Config: Schema<Config> = Schema.object({
  endpoint: Schema.string().description('NapGram Gateway WebSocket 地址。').default('ws://127.0.0.1:8765'),
  token: Schema.string().description('Gateway Token（当前复用 ADMIN_TOKEN）。').required(),
  instances: Schema.array(Number).description('订阅/可访问的 instanceId 列表。').default([0]),
  selfId: Schema.string().description('Koishi 侧 bot selfId。').default('napgram'),
  name: Schema.string().description('Adapter 名称（Identify 上报）。').default('napgram'),
  adapterVersion: Schema.string().description('Adapter 版本（Identify 上报）。').default('0.0.0'),
  defaultInstanceId: Schema.number().description('发送消息时默认使用的 instanceId。').default(0),
  heartbeatMs: Schema.number().description('发送 ping 的间隔 (ms)。').default(25_000),
  retryTimes: Schema.number().description('初次连接最大重试次数。').default(6),
  retryInterval: Schema.number().description('初次连接重试间隔 (ms)。').default(5_000),
  retryLazy: Schema.number().description('断线后重试间隔 (ms)。').default(60_000),
});

class NapGramMessageEncoder extends MessageEncoder {
  private segments: Segment[] = [];

  async flush(): Promise<void> {
    if (!this.segments.length) return;
    const adapter = this.bot.adapter as NapGramAdapter;
    const instanceId =
      this.session?.referrer?.napgram?.instanceId ??
      adapter.getInstanceIdForChannel(this.channelId);
    const result = await adapter.call('message.send', { channelId: this.channelId, segments: this.segments }, instanceId);
    this.results.push({ id: String(result?.messageId || '') });
    this.segments = [];
  }

  async visit(element: any): Promise<void> {
    if (!element) return;
    const { type, attrs } = element;

    if (type === 'text') {
      const text = String(attrs?.content ?? '');
      if (text) this.segments.push({ type: 'text', data: { text } });
      return;
    }

    if (type === 'at') {
      const rawId = String(attrs?.id ?? '').trim();
      const display = attrs?.name ? String(attrs.name) : undefined;
      const userId = this.normalizeAtId(rawId);
      if (userId) this.segments.push({ type: 'at', data: { userId, name: display } });
      return;
    }

    if (type === 'quote') {
      const rawId = String(attrs?.id ?? '').trim();
      const messageId = this.normalizeReplyId(rawId);
      if (messageId) this.segments.push({ type: 'reply', data: { messageId } });
      return;
    }

    if (typeof element.toString === 'function') {
      const text = String(element.toString());
      if (text) this.segments.push({ type: 'text', data: { text } });
    }
  }

  private normalizeAtId(rawId: string): string {
    if (!rawId) return '';
    if (rawId.includes(':')) return rawId;

    const channelId = String(this.channelId || '');
    if (channelId.startsWith('tg:c:')) {
      const id = rawId.replace(/^@/, '');
      return /^\d+$/.test(id) ? `tg:u:${id}` : `tg:username:${id}`;
    }
    if (channelId.startsWith('qq:')) {
      return `qq:u:${rawId}`;
    }
    return rawId;
  }

  private normalizeReplyId(rawId: string): string {
    if (!rawId) return '';
    if (rawId.includes(':')) return rawId;

    const channelId = String(this.channelId || '');
    if (channelId.startsWith('tg:c:')) {
      const parts = channelId.split(':');
      const chatId = parts[2];
      if (chatId) return `tg:m:${chatId}:${rawId}`;
    }
    if (channelId.startsWith('qq:')) {
      return `qq:m:${rawId}`;
    }
    return rawId;
  }
}

class NapGramBot extends Bot<any, Config> {
  static MessageEncoder = NapGramMessageEncoder;

  constructor(ctx: any, config: Config) {
    super(ctx, config, 'napgram');
    this.user = { id: config.selfId || 'napgram', name: 'NapGram Gateway' };
  }
}

class NapGramAdapter extends Adapter.WsClient<any, NapGramBot> {
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();
  private heartbeat?: NodeJS.Timeout;
  private channelInstance = new Map<string, number>();
  private channelPair = new Map<string, { instanceId: number; pairId: number; side: 'qq' | 'tg' }>();

  constructor(ctx: any, bot: NapGramBot) {
    super(ctx, bot);
  }

  async prepare(): Promise<any> {
    return new WebSocket(this.bot.config.endpoint);
  }

  accept(socket: any): void {
    socket.addEventListener('message', (e: any) => this.onMessage(String(e.data ?? e)));
    socket.addEventListener('close', () => this.stopHeartbeat());
    socket.addEventListener('open', () => this.stopHeartbeat());
  }

  private onMessage(raw: string): void {
    let frame: Frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    if (frame.op === 'hello') {
      const identify = {
        op: 'identify',
        v: 1,
        t: Date.now(),
        data: {
          token: this.bot.config.token,
          name: this.bot.config.name,
          adapterVersion: this.bot.config.adapterVersion,
          scope: { instances: this.bot.config.instances },
          capabilities: ['events', 'actions', 'segments.v1'],
        },
      };
      this.socket?.send(JSON.stringify(identify));
      return;
    }

    if (frame.op === 'ready') {
      const user = (frame as any).data?.user;
      if (user?.id) this.bot.user = { id: String(user.id), name: String(user.name || user.id) };
      this.ingestReadyPairs((frame as any).data);
      this.bot.online();
      this.startHeartbeat();
      return;
    }

    if (frame.op === 'event') {
      this.handleEvent((frame as any).data as GatewayEvent);
      return;
    }

    if (frame.op === 'result') {
      const id = (frame as any).data?.id;
      const pending = id ? this.pending.get(String(id)) : undefined;
      if (!pending) return;
      this.pending.delete(String(id));
      if ((frame as any).data?.success) pending.resolve((frame as any).data.result);
      else pending.reject((frame as any).data?.error || new Error('Gateway call failed'));
      return;
    }
  }

  private handleEvent(event: GatewayEvent): void {
    if (event.type !== 'message.created') return;
    const e = event as MessageCreatedEvent;

    this.channelInstance.set(e.channelId, e.instanceId);
    this.channelPair.set(e.channelId, { instanceId: e.instanceId, pairId: -1, side: e.message.platform === 'qq' ? 'qq' : 'tg' });

    const ids = this.resolveChannelIds(e);
    const isDirect = ids.isDirect;
    const session = this.bot.session({
      type: 'message-created',
      timestamp: e.message.timestamp,
      user: { id: ids.userId, name: e.actor.name },
      channel: { id: ids.channelId, type: isDirect ? Universal.Channel.Type.DIRECT : Universal.Channel.Type.TEXT },
      guild: ids.guildId ? { id: ids.guildId } : undefined,
      message: { id: e.message.messageId },
      referrer: { napgram: { instanceId: e.instanceId, threadId: e.threadId ?? null, platform: e.message.platform } },
    });

    session.content = segmentsToSatoriContent(e.message.segments);
    this.bot.dispatch(session);
  }

  private resolveChannelIds(e: MessageCreatedEvent): {
    channelId: string;
    guildId?: string;
    isDirect: boolean;
    userId: string;
  } {
    const channelId = e.channelId;
    const userId = this.normalizeUserId(e.actor.userId);

    if (channelId.startsWith('qq:p:')) {
      return { channelId, isDirect: true, userId };
    }
    if (channelId.startsWith('qq:g:')) {
      return { channelId, guildId: channelId, isDirect: false, userId };
    }

    if (channelId.startsWith('tg:c:')) {
      const parts = channelId.split(':'); // tg:c:<chatId>[:t:<threadId>]
      const chatId = parts[2];
      const baseGuildId = chatId ? `tg:c:${chatId}` : undefined;
      const isTopic = channelId.includes(':t:');
      const chatIdNum = chatId ? Number(chatId) : NaN;
      const isDirect = !isTopic && Number.isFinite(chatIdNum) && chatIdNum > 0;
      return {
        channelId,
        guildId: isDirect ? undefined : baseGuildId,
        isDirect,
        userId,
      };
    }

    // fallback
    return { channelId, isDirect: false, guildId: channelId, userId };
  }

  private normalizeUserId(id: string): string {
    const raw = String(id || '').trim();
    const m = raw.match(/^(qq|tg):u:(.+)$/);
    if (m) return m[2];
    const u = raw.match(/^tg:username:(.+)$/);
    if (u) return u[1];
    return raw;
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    const interval = Number(this.bot.config.heartbeatMs || 25_000);
    this.heartbeat = setInterval(() => {
      this.socket?.send(JSON.stringify({ op: 'ping', v: 1, t: Date.now() }));
    }, interval);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeat) return;
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  getInstanceIdForChannel(channelId: string): number {
    return this.channelPair.get(channelId)?.instanceId
      ?? this.channelInstance.get(channelId)
      ?? Number(this.bot.config.defaultInstanceId ?? 0);
  }

  call(action: string, params: any, instanceId?: number): Promise<any> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Gateway socket not connected'));
    }

    const id = `call-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      op: 'call',
      v: 1,
      t: Date.now(),
      data: {
        id,
        instanceId: typeof instanceId === 'number' ? instanceId : undefined,
        action,
        params,
      },
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      socket.send(JSON.stringify(payload));
      setTimeout(() => {
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        reject(new Error(`Gateway call timeout: ${action}`));
      }, 30_000);
    });
  }

  private ingestReadyPairs(data: any): void {
    const instances = Array.isArray(data?.instances) ? data.instances : [];
    for (const inst of instances) {
      const instanceId = Number(inst?.id);
      if (!Number.isFinite(instanceId)) continue;
      const pairs = Array.isArray(inst?.pairs) ? inst.pairs : [];
      for (const p of pairs) {
        const pairId = Number(p?.pairId);
        const qqChannelId = typeof p?.qq?.channelId === 'string' ? p.qq.channelId : undefined;
        const tgChannelId = typeof p?.tg?.channelId === 'string' ? p.tg.channelId : undefined;
        if (Number.isFinite(pairId)) {
          if (qqChannelId) this.channelPair.set(qqChannelId, { instanceId, pairId, side: 'qq' });
          if (tgChannelId) this.channelPair.set(tgChannelId, { instanceId, pairId, side: 'tg' });
        }
        if (qqChannelId) this.channelInstance.set(qqChannelId, instanceId);
        if (tgChannelId) this.channelInstance.set(tgChannelId, instanceId);
      }
    }
  }
}

export function apply(ctx: any, config: Config) {
  const bot = new NapGramBot(ctx, config);
  new NapGramAdapter(ctx, bot);
}
