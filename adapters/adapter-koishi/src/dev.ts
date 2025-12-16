import { NapGramGatewayClient } from './gateway.js';
import { segmentsToSatoriContent } from './mapping.js';
import type { MessageCreatedEvent } from './types.js';

const url = process.env.NAPGRAM_GATEWAY_URL || 'ws://localhost:8765';
const token = process.env.NAPGRAM_GATEWAY_TOKEN || '';
const instances = String(process.env.NAPGRAM_INSTANCES || '0')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => Number(s))
  .filter(n => Number.isFinite(n));

if (!token) {
  throw new Error('NAPGRAM_GATEWAY_TOKEN is required');
}

const client = new NapGramGatewayClient({ url, token, instances });

client.on('ready', (data) => {
  console.log('[ready]', data?.user);
});

client.on('event', (event) => {
  if (event.type !== 'message.created') return;
  const e = event as MessageCreatedEvent;
  const content = segmentsToSatoriContent(e.message.segments);
  console.log(`[message.created] ${e.channelId} ${e.actor.name}:`, content);
});

client.on('error', (err) => {
  console.error('[error]', err);
});

client.connect();

