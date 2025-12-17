import type { Segment } from './adapter-napgram-gateway';

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// MVP：足够支持 ping/pong 与基础回复；后续再做严格映射（TG at/reply 等）
export function segmentsToSatoriContent(segments: Segment[]): string {
  const parts: string[] = [];

  for (const seg of segments) {
    if (!seg) continue;
    if (seg.type === 'text') {
      const text = String(seg.data?.text ?? '');
      if (text) parts.push(text);
      continue;
    }
    if (seg.type === 'at') {
      const id = String(seg.data?.userId ?? '');
      const name = String(seg.data?.name ?? seg.data?.username ?? '').trim();
      if (id) {
        const attrs = [`id="${escapeAttr(id)}"`];
        if (name) attrs.push(`name="${escapeAttr(name)}"`);
        parts.push(`<at ${attrs.join(' ')}/>`);
      }
      continue;
    }
    if (seg.type === 'reply') {
      const id = String(seg.data?.messageId ?? '');
      if (id) parts.push(`<quote id="${escapeAttr(id)}"/>`);
      continue;
    }
  }

  return parts.join('');
}

