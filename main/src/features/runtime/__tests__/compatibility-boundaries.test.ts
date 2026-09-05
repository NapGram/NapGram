import { joinPath, resolvePath } from '../../../shared/utils/path.js'
import { describe, expect, it } from 'bun:test'

const runtimeRoot = resolvePath(import.meta.dir, '..')
const webRoot = resolvePath(import.meta.dir, '../../../../../packages/utilities/web-interfaces/src')

async function expectNoImportMatches(filePath: string, patterns: RegExp[]) {
  const source = await Bun.file(filePath).text()
  for (const pattern of patterns) {
    expect(source).not.toMatch(pattern)
  }
}

describe('compatibility boundaries', async () => {
  it('keeps runtime feature entrypoints on direct capability/type modules', async () => {
    for (const file of [
      'features/MediaFeature.ts',
      'features/commands/CommandsFeature.ts',
      'features/forward/ForwardFeature.ts',
    ]) {
      await expectNoImportMatches(joinPath(runtimeRoot, file), [
        /from ['"].*shared-types(\.js)?['"]/,
        /from ['"].*host-kit(\.js)?['"]/,
        /from ['"].*runtime-capabilities(\.js)?['"]/,
      ])
    }
  })

  it('keeps runtime feature entrypoints off direct low-level package imports', async () => {
    for (const file of [
      'features/MediaFeature.ts',
      'features/commands/CommandsFeature.ts',
      'features/forward/ForwardFeature.ts',
    ]) {
      await expectNoImportMatches(joinPath(runtimeRoot, file), [
        /from ['"]@napgram\/db-kit['"]/,
        /from ['"]@napgram\/env-kit['"]/,
        /from ['"]@napgram\/logger-kit['"]/,
        /from ['"]@napgram\/plugin-kit['"]/,
        /from ['"]@napgram\/media-kit['"]/,
      ])
    }
  })

  it('keeps web route entrypoints on concrete web helper modules', async () => {
    for (const file of [
      'instances.ts',
      'statistics.ts',
      'messages.ts',
      'pairs.ts',
      'telegramAvatar.ts',
      'richHeader.tsx',
    ]) {
      await expectNoImportMatches(joinPath(webRoot, file), [
        /from ['"].*shared-host(\.js)?['"]/,
      ])
    }
  })

  it('keeps web route entrypoints off direct runtime-kit imports', async () => {
    for (const file of [
      'instances.ts',
      'statistics.ts',
      'messages.ts',
      'pairs.ts',
      'telegramAvatar.ts',
      'richHeader.tsx',
    ]) {
      await expectNoImportMatches(joinPath(webRoot, file), [
        /from ['"]@napgram\/runtime-kit['"]/,
      ])
    }
  })
})
