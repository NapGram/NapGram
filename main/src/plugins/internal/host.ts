import { getLogger } from '../../shared/logger';
import env from '../../domain/models/env';
import { loadPluginSpecs, resolveDebugSessions, resolveGatewayEndpoint, resolvePluginsEnabled, resolvePluginsInstances } from './config';

const logger = getLogger('PluginHost');

type StartOptions = { defaultInstances?: number[] };

export interface ReloadResult {
  enabled: boolean;
  endpoint?: string;
  instances?: number[];
  loaded: string[];
  failed: Array<{ module: string; error: string }>;
}

function corePkg(): string {
  return ['@', 'k', 'o', 'i', 's', 'h', 'i', 'j', 's', '/', 'core'].join('');
}

export class PluginHost {
  private static ctx?: any;
  private static startLock?: Promise<void>;
  private static lastStartOptions?: StartOptions;
  private static lastReport: ReloadResult = { enabled: false, loaded: [], failed: [] };

  static getContext(): any {
    return this.ctx;
  }

  static getLastReport(): ReloadResult {
    return this.lastReport;
  }

  static async start(options?: StartOptions): Promise<void> {
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
      logger.info('PluginHost stopped');
    } catch (error: any) {
      logger.error({ error }, 'PluginHost stop failed');
    }
  }

  static async reload(options?: StartOptions): Promise<ReloadResult> {
    this.lastStartOptions = options ?? this.lastStartOptions;
    await this.stop();
    await this.start(this.lastStartOptions);
    return this.lastReport;
  }

  private static async startInternal(options?: StartOptions): Promise<void> {
    if (!resolvePluginsEnabled()) {
      this.lastReport = { enabled: false, loaded: [], failed: [] };
      logger.info('PluginHost disabled');
      return;
    }

    const endpoint = resolveGatewayEndpoint();
    const instances = resolvePluginsInstances(options?.defaultInstances);
    const token = env.ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';
    if (!token) {
      this.lastReport = { enabled: true, endpoint, instances, loaded: [], failed: [{ module: 'gateway-adapter', error: 'Missing ADMIN_TOKEN' }] };
      logger.warn('Missing ADMIN_TOKEN; PluginHost will not start');
      return;
    }

    const report: ReloadResult = {
      enabled: true,
      endpoint,
      instances,
      loaded: [],
      failed: [],
    };

    const { Context } = await import(corePkg() as any);
    const ctx = new Context();
    this.ctx = ctx;

    const gatewayAdapter = await import('../../adapters/gateway/adapter');
    ctx.plugin(gatewayAdapter as any, {
      endpoint,
      token,
      instances,
      selfId: 'napgram',
      name: 'napgram',
      adapterVersion: '0.0.0',
    });
    report.loaded.push('gateway-adapter');

    const pingPong = await import('./plugins/ping-pong');
    ctx.plugin(pingPong as any, {});
    report.loaded.push('ping-pong');

    if (resolveDebugSessions()) {
      ctx.on('message', (session: any) => {
        logger.info({
          platform: session.platform,
          selfId: session.selfId,
          userId: session.userId,
          guildId: session.guildId,
          channelId: session.channelId,
          content: String(session.content || '').slice(0, 200),
          referrer: session.referrer?.napgram,
        }, 'Plugin session');
      });
    }

    const specs = await loadPluginSpecs();
    for (const spec of specs) {
      try {
        if (!spec.enabled) continue;
        const plugin = await spec.load();
        ctx.plugin(plugin as any, spec.config ?? {});
        report.loaded.push(spec.module);
        logger.info({ module: spec.module }, 'Loaded plugin');
      } catch (error: any) {
        report.failed.push({ module: spec.module, error: (error as any)?.message || String(error) });
        logger.error({ module: spec.module, error }, 'Failed to load plugin');
      }
    }

    await ctx.start();
    this.lastReport = report;
    logger.info({ endpoint, instances }, 'PluginHost started');
  }
}

