# @napgram/sdk

SDK for building NapGram native plugins.

## Installation

```bash
pnpm add @napgram/sdk
```

## Usage

```ts
import { definePlugin, makeText, createCommand, withCooldown } from '@napgram/sdk';
import type { MessageEvent } from '@napgram/sdk';

export default definePlugin({
  id: 'demo',
  name: 'Demo Plugin',
  version: '0.1.0',
  async install(ctx) {
    ctx.command(createCommand({
      name: 'ping',
      handler: withCooldown(async (event: MessageEvent) => {
        await event.reply([makeText('pong')]);
      }, { durationMs: 3000 }),
    }, { platform: 'tg' }));
  }
});
```

## Exports

- All types from `@napgram/core`
- All helpers from `@napgram/utils`
- `definePlugin` / `defineCommand` / `definePermissions`
- Guard + helper utilities from SDK

## One Package for Platform Capabilities

Install only this SDK and you can access:

- Plugin runtime types (context, events, APIs, permissions)
- Message segment builders and helpers
- QQ interaction helpers

## Advanced Helpers

### Command Guards

```ts
import { createCommand, withCommandGuards } from '@napgram/sdk';

ctx.command(createCommand({
  name: 'admin_only',
  handler: async (event) => {
    await event.reply('ok');
  }
}, { requireAdmin: true }));
```

### Reply / Reference Helpers

```ts
import { getReplyMessage, getChannelRef, getMessageRef } from '@napgram/sdk';

const reply = getReplyMessage(event);
const channelRef = getChannelRef(event);
const messageRef = getMessageRef(event);
```

### Config Defaults

```ts
import { resolveConfig } from '@napgram/sdk';

const config = resolveConfig(ctx.config, { enabled: true, timeoutMs: 5000 });
```

### Cooldown + Error Boundary

```ts
import { withCooldown, withErrorBoundary } from '@napgram/sdk';

const handler = withErrorBoundary(
  withCooldown(async (event) => {
    await event.reply('pong');
  }, { durationMs: 3000 }),
  { errorMessage: 'Command failed' }
);
```

### Args Parsing

```ts
import { parseArgs } from '@napgram/sdk';

const { args, flags } = parseArgs(['--limit=10', 'foo', '-v']);
```

### Logger Helpers

```ts
import { createPluginLogger } from '@napgram/sdk';

const logger = createPluginLogger(ctx, 'my-plugin');
logger.info('started');
```

## License

MIT
