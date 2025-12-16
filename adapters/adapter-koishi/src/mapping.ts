import type { Segment } from './types.js';

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function segmentsToSatoriContent(segments: Segment[]): string {
  let out = '';
  for (const seg of segments) {
    if (seg.type === 'text') {
      out += seg.data.text;
      continue;
    }
    if (seg.type === 'at') {
      const id = escapeAttr(seg.data.userId);
      const name = seg.data.name ? ` name="${escapeAttr(seg.data.name)}"` : '';
      out += `<at id="${id}"${name}/>`;
      continue;
    }
    if (seg.type === 'reply') {
      const id = escapeAttr(seg.data.messageId);
      out += `<quote id="${id}"/>`;
      continue;
    }
    if (seg.type === 'image') {
      const src = seg.data.url || (seg.data.fileId ? `file:${seg.data.fileId}` : '');
      if (src) out += `<img src="${escapeAttr(src)}"/>`;
      continue;
    }
    if (seg.type === 'file') {
      const src = seg.data.url || (seg.data.fileId ? `file:${seg.data.fileId}` : '');
      const name = seg.data.name ? ` name="${escapeAttr(seg.data.name)}"` : '';
      if (src) out += `<file src="${escapeAttr(src)}"${name}/>`;
      continue;
    }
    out += `[${seg.type}]`;
  }
  return out;
}

