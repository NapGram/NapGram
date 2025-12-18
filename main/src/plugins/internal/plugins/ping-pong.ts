export const name = 'napgram-ping-pong';

export function apply(ctx: any) {
  ctx.on('message', async (session: any) => {
    if (!String(session.content || '').includes('ping')) return;
    await session.send('pong');
  });
}

