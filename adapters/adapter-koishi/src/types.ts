export type Platform = 'qq' | 'tg';

export type Segment =
  | { type: 'text'; data: { text: string } }
  | { type: 'image'; data: { url?: string; fileId?: string; uniqueFileId?: string } }
  | { type: 'video'; data: { url?: string; fileId?: string; uniqueFileId?: string; duration?: number } }
  | { type: 'audio'; data: { url?: string; fileId?: string; uniqueFileId?: string; duration?: number } }
  | { type: 'file'; data: { url?: string; fileId?: string; uniqueFileId?: string; name?: string; size?: number } }
  | { type: 'at'; data: { userId: string; name?: string; username?: string } }
  | { type: 'reply'; data: { messageId: string; sender?: { userId: string; name: string }; text?: string } }
  | { type: 'forward'; data: any }
  | { type: 'raw'; data: { type: string; data: any } };

export interface MessageCreatedEvent {
  seq: number;
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
    platform: Platform;
    threadId?: number | null;
    native: any;
    segments: Segment[];
    timestamp: number;
  };
}

export type GatewayEvent = MessageCreatedEvent;

export type Frame =
  | { op: 'hello'; v: number; t: number; data: any }
  | { op: 'ready'; v: number; t: number; data: any }
  | { op: 'ping' | 'pong'; v: number; t: number; data?: any }
  | { op: 'event'; v: number; t: number; data: GatewayEvent }
  | { op: 'result'; v: number; t: number; id?: string; data: any }
  | { op: 'error'; v: number; t: number; id?: string; data: any }
  | { op: string; v: number; t: number; id?: string; data?: any };

