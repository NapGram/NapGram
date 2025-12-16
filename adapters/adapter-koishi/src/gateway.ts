import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { Frame, GatewayEvent } from './types.js';

export interface GatewayClientOptions {
  url: string;
  token: string;
  instances: number[];
  name?: string;
  adapterVersion?: string;
}

export class NapGramGatewayClient extends EventEmitter {
  private ws?: WebSocket;
  private heartbeat?: NodeJS.Timeout;

  constructor(private readonly options: GatewayClientOptions) {
    super();
  }

  connect(): void {
    const ws = new WebSocket(this.options.url);
    this.ws = ws;

    ws.on('message', (data) => this.onMessage(String(data)));
    ws.on('open', () => this.emit('open'));
    ws.on('close', (code, reason) => this.emit('close', code, String(reason)));
    ws.on('error', (error) => this.emit('error', error));
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ws?.close();
  }

  private onMessage(raw: string): void {
    let frame: Frame;
    try {
      frame = JSON.parse(raw);
    } catch (e) {
      this.emit('error', e);
      return;
    }

    if (frame.op === 'hello') {
      const identify = {
        op: 'identify',
        v: 1,
        t: Date.now(),
        data: {
          token: this.options.token,
          name: this.options.name || 'adapter-koishi',
          adapterVersion: this.options.adapterVersion || '0.0.0',
          scope: { instances: this.options.instances },
          capabilities: ['events', 'actions', 'segments.v1'],
        },
      };
      this.ws?.send(JSON.stringify(identify));
      return;
    }

    if (frame.op === 'ready') {
      this.emit('ready', frame.data);
      this.startHeartbeat();
      return;
    }

    if (frame.op === 'event') {
      this.emit('event', frame.data as GatewayEvent);
      return;
    }

    if (frame.op === 'pong') {
      this.emit('pong');
      return;
    }

    this.emit('frame', frame);
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      this.ws?.send(JSON.stringify({ op: 'ping', v: 1, t: Date.now() }));
    }, 25_000);
  }
}

