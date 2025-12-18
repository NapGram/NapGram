import crypto from 'node:crypto';
import { Adapter, Bot, MessageEncoder, Schema } from '@koishijs/core';
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
  endpoint: Schema.string().description('Gateway WebSocket 地址。').default('ws://127.0.0.1:8765'),
  token: Schema.string().description('Gateway Token（当前复用 ADMIN_TOKEN）。').required(),
  instances: Schema.array(Number).description('订阅/可访问的 instanceId 列表。').default([0]),
  selfId: Schema.string().description('Adapter 侧 bot selfId。').default('napgram'),
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
    super(ctx?.root ?? ctx, config, 'napgram');
    this.user = { id: config.selfId || 'napgram', name: 'NapGram Gateway' };
  }

  override dispose(): any {
    const ctx = (this as any).ctx;
    if (!ctx || !Array.isArray(ctx.bots)) {
      return this.stop();
    }
    return super.dispose();
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
      pending.resolve((frame as any).data?.result);
      return;
    }

    if (frame.op === 'error') {
      const id = (frame as any).data?.id;
      const pending = id ? this.pending.get(String(id)) : undefined;
      if (!pending) return;
      this.pending.delete(String(id));
      pending.reject(new Error((frame as any).data?.message || 'Gateway error'));
    }
  }

  private startHeartbeat(): void {
    const ms = Number(this.bot.config.heartbeatMs || 25_000);
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      try {
        this.socket?.send(JSON.stringify({ op: 'ping', v: 1, t: Date.now(), data: {} }));
      } catch {
        // ignore
      }
    }, ms);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  private handleEvent(event: GatewayEvent): void {
    if (!event || event.type !== 'message.created') return;
    const msg = (event as any).message;
    const segments: Segment[] = Array.isArray(msg?.segments) ? msg.segments : [];
    const content = segmentsToSatoriContent(segments);

    (this as any).dispatch({
      type: 'message',
      platform: this.bot.platform,
      selfId: this.bot.selfId,
      user: {
        id: String((event as any).actor?.userId || ''),
        name: String((event as any).actor?.name || ''),
      },
      guild: {
        id: String((event as any).channelId || ''),
      },
      channel: {
        id: String((event as any).channelId || ''),
      },
      message: {
        id: String(msg?.messageId || ''),
        content,
      },
      timestamp: Number(msg?.timestamp || Date.now()),
      referrer: {
        napgram: {
          instanceId: Number((event as any).instanceId),
          threadId: (event as any).threadId ?? null,
          platform: String(msg?.platform || ''),
        },
      },
    } as any);
  }

  getInstanceIdForChannel(channelId: string): number {
    const mapped = this.channelInstance.get(channelId);
    if (typeof mapped === 'number') return mapped;
    return Number(this.bot.config.defaultInstanceId || 0);
  }

  async call(action: string, params: any, instanceId?: number): Promise<any> {
    const socket = this.socket;
    if (!socket) throw new Error('Adapter not connected');
    const id = cryptoId();
    const payload = {
      op: 'call',
      v: 1,
      t: Date.now(),
      data: {
        id,
        instanceId: typeof instanceId === 'number' ? instanceId : Number(this.bot.config.defaultInstanceId || 0),
        action,
        params: params ?? {},
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

function cryptoId(): string {
  return crypto.randomBytes(12).toString('hex');
}

export function apply(ctx: any, config: Config) {
  const bot = new NapGramBot(ctx, config);
  new NapGramAdapter(ctx, bot);
}
