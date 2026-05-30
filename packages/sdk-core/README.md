# @napgram/core

TypeScript type definitions for NapGram native plugins.

## Installation

```bash
pnpm add @napgram/core
```

## Usage

```typescript
import type {
  NapGramPlugin,
  PluginContext,
  MessageEvent,
  MessageAPI,
  // ... more types
} from '@napgram/core';

const plugin: NapGramPlugin = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  
  async install(ctx: PluginContext) {
    ctx.on('message', async (event: MessageEvent) => {
      await event.reply('Hello!');
    });
  }
};

export default plugin;
```

## Exported Types

### Plugin

- `NapGramPlugin` - Plugin definition
- `PluginSpec` - Plugin specification
- `PluginPermissions` - Permission system

### Context

- `PluginContext` - Plugin runtime context

### Events

- `MessageEvent` - Message events
- `FriendRequestEvent` - Friend request events
- `GroupRequestEvent` - Group request events
- More event types...

### APIs

- `MessageAPI` - Send/recall messages
- `InstanceAPI` - Instance management
- `UserAPI` - User information
- `GroupAPI` - Group operations
- `PluginStorage` - Data persistence
- `PluginLogger` - Logging

### Message Segments

- `MessageSegment` - Base segment type
- `TextSegment`, `AtSegment`, `ReplySegment`
- `ImageSegment`, `VideoSegment`, `AudioSegment`
- More segment types...

## License

MIT
