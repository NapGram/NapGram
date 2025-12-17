import { Context } from '@koishijs/core';
import { getLogger } from '../shared/logger';
import env from '../domain/models/env';
import { loadKoishiPluginSpecs, resolveKoishiEndpoint, resolveKoishiInstances, resolveKoishiEnabled } from './config';
import * as gatewayAdapter from './adapter-napgram-gateway';
import * as pingPong from './plugins/ping-pong';

const logger = getLogger('KoishiHost');

type KoishiStartOptions = { defaultInstances?: number[] };

export interface KoishiReloadResult {
  enabled: boolean;
  endpoint?: string;
  instances?: number[];
  loaded: string[];
  failed: Array<{ module: string; error: string }>;
}

export class KoishiHost {
  private static ctx?: Context;
  private static startLock?: Promise<void>;
  private static lastStartOptions?: KoishiStartOptions;
  private static lastReport: KoishiReloadResult = { enabled: false, loaded: [], failed: [] };

  static getContext(): Context | undefined {
    return this.ctx;
  }

  static getLastReport(): KoishiReloadResult {
    return this.lastReport;
  }

  static async start(options?: KoishiStartOptions): Promise<void> {
    this.lastStartOptions = options;
    if (this.ctx) return;
    if (this.startLock) return this.startLock;

    this.startLock = this.startInternal(options).finally(() => {
      this.startLock = undefined;
    });
    return this.startLock;
  }

  static async stop(): Promise<void> {
    if (this.startLock) await this.startLock;
    const ctx = this.ctx;
    this.ctx = undefined;
    if (!ctx) return;
    try {
      await ctx.stop();
      logger.info('KoishiHost stopped');
    } catch (error: any) {
      logger.error({ error }, 'KoishiHost stop failed');
    }
  }

  static async reload(options?: KoishiStartOptions): Promise<KoishiReloadResult> {
    this.lastStartOptions = options ?? this.lastStartOptions;
    await this.stop();
    await this.start(this.lastStartOptions);
    return this.lastReport;
  }

  private static async startInternal(options?: KoishiStartOptions): Promise<void> {
    if (!resolveKoishiEnabled()) {
      this.lastReport = { enabled: false, loaded: [], failed: [] };
      logger.info('KoishiHost disabled');
      return;
    }

    const endpoint = resolveKoishiEndpoint();
    const instances = resolveKoishiInstances(options?.defaultInstances);
    const token = env.ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';
    if (!token) {
      this.lastReport = { enabled: true, endpoint, instances, loaded: [], failed: [{ module: 'adapter-napgram-gateway', error: 'Missing ADMIN_TOKEN' }] };
      logger.warn('Missing ADMIN_TOKEN; KoishiHost will not start');
      return;
    }

    const report: KoishiReloadResult = {
      enabled: true,
      endpoint,
      instances,
      loaded: [],
      failed: [],
    };

    const ctx = new Context();
    this.ctx = ctx;

    ctx.plugin(gatewayAdapter as any, {
      endpoint,
      token,
      instances,
      selfId: 'napgram',
      name: 'napgram',
      adapterVersion: '0.0.0',
    });
    report.loaded.push('adapter-napgram-gateway');

    // MVP 内置插件：收到 ping 回复 pong
    ctx.plugin(pingPong as any, {});
    report.loaded.push('napgram-ping-pong');

    if (String(process.env.KOISHI_DEBUG_SESSIONS || '').trim() === '1') {
      ctx.on('message', (session: any) => {
        logger.info({
          platform: session.platform,
          selfId: session.selfId,
          userId: session.userId,
          guildId: session.guildId,
          channelId: session.channelId,
          content: String(session.content || '').slice(0, 200),
          referrer: session.referrer?.napgram,
        }, 'Koishi session');
      });
    }

    // 可选：加载用户插件
    const specs = await loadKoishiPluginSpecs();
    for (const spec of specs) {
      try {
        if (!spec.enabled) continue;
        const plugin = await spec.load();
        ctx.plugin(plugin as any, spec.config ?? {});
        report.loaded.push(spec.module);
        logger.info({ module: spec.module }, 'Loaded Koishi plugin');
      } catch (error: any) {
        report.failed.push({ module: spec.module, error: (error as any)?.message || String(error) });
        logger.error({ module: spec.module, error }, 'Failed to load Koishi plugin');
      }
    }

    await ctx.start();
    this.lastReport = report;
    logger.info({ endpoint, instances }, 'KoishiHost started');
  }
}
