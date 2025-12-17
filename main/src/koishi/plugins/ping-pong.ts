import type { Context } from '@koishijs/core';

export const name = 'napgram-ping-pong';

export function apply(ctx: Context) {
  ctx.on('message', async (session) => {
    if (!String(session.content || '').includes('ping')) return;
    await session.send('pong');
  });
}

