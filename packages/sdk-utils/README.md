# @napgram/utils

Utility functions for NapGram native plugins.

## Installation

```bash
pnpm add @napgram/utils
```

## Usage

```typescript
import {
  extractPlainText,
  makeText,
  makeAt,
  makeReply,
  makeImage,
  prepareForwardMessagesForQQ,
  parseUserId,
  sleep,
  randomChoice
} from '@napgram/utils';

// Extract plain text from message segments
const text = extractPlainText(event.message.segments);

// Create message segments
const segments = [
  makeReply(event.message.id),
  makeAt(event.sender.userId),
  makeText(' Hello!'),
  makeImage('https://example.com/image.png')
];

await event.send(segments);

// Parse IDs
const { platform, id } = parseUserId('qq:u:123456');

// Utilities
await sleep(1000);
const choice = randomChoice(['a', 'b', 'c']);

// Prepare forward messages for QQ (download remote media to local temp files)
const preparedForward = await prepareForwardMessagesForQQ(forwardMessages);
await event.send([{ type: 'forward', data: { messages: preparedForward } }]);
```

## Subpath Exports

```typescript
import { sendPoke } from '@napgram/utils/qq-helpers';
```

## API Reference

### Message Segments

- `makeText(text)` - Create text segment
- `makeAt(userId, userName?)` - Create @mention segment
- `makeReply(messageId)` - Create reply segment
- `makeImage(url, file?)` - Create image segment
- `makeVideo(url, file?)` - Create video segment
- `makeAudio(url, file?)` - Create audio segment
- `makeFile(url, name?)` - Create file segment
- `makeFace(id)` - Create emoji segment

### Parsers

- `extractPlainText(segments)` - Extract plain text
- `parseUserId(userId)` - Parse user ID (qq:u:xxx / tg:u:xxx)
- `parseGroupId(groupId)` - Parse group ID

### Utilities

- `sleep(ms)` - Delay function
- `randomInt(min, max)` - Random integer
- `randomChoice(array)` - Random array element

### Forward Helpers

- `prepareForwardMessagesForQQ(messages, options?)` - Download remote media in forward messages to local temp files for QQ compatibility

## License

MIT
