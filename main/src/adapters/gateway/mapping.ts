import type { Segment } from './adapter';

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function normalizeAtId(userId: any): string {
  const raw = String(userId ?? '').trim();
  const m = raw.match(/^(qq|tg):u:(.+)$/);
  if (m) return m[2];
  const u = raw.match(/^tg:username:(.+)$/);
  if (u) return u[1];
  return raw.replace(/^@/, '');
}

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
      const id = normalizeAtId(seg.data?.userId);
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

