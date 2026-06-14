import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const runtimeRoot = resolve(__dirname, '..')
const webRoot = resolve(__dirname, '../../../../../packages/utilities/web-interfaces/src')

function expectNoImportMatches(filePath: string, patterns: RegExp[]) {
  const source = readFileSync(filePath, 'utf8')
  for (const pattern of patterns) {
    expect(source).not.toMatch(pattern)
  }
}

describe('compatibility boundaries', () => {
  it('keeps runtime feature entrypoints on direct capability/type modules', () => {
    for (const file of [
      'features/MediaFeature.ts',
      'features/commands/CommandsFeature.ts',
      'features/forward/ForwardFeature.ts',
    ]) {
      expectNoImportMatches(resolve(runtimeRoot, file), [
        /from ['"].*shared-types(\.js)?['"]/,
        /from ['"].*host-kit(\.js)?['"]/,
        /from ['"].*runtime-capabilities(\.js)?['"]/,
      ])
    }
  })

  it('keeps runtime feature entrypoints off direct low-level package imports', () => {
    for (const file of [
      'features/MediaFeature.ts',
      'features/commands/CommandsFeature.ts',
      'features/forward/ForwardFeature.ts',
    ]) {
      expectNoImportMatches(resolve(runtimeRoot, file), [
        /from ['"]@napgram\/db-kit['"]/,
        /from ['"]@napgram\/env-kit['"]/,
        /from ['"]@napgram\/logger-kit['"]/,
        /from ['"]@napgram\/plugin-kit['"]/,
        /from ['"]@napgram\/media-kit['"]/,
      ])
    }
  })

  it('keeps web route entrypoints on concrete web helper modules', () => {
    for (const file of [
      'instances.ts',
      'statistics.ts',
      'messages.ts',
      'pairs.ts',
      'telegramAvatar.ts',
      'richHeader.tsx',
    ]) {
      expectNoImportMatches(resolve(webRoot, file), [
        /from ['"].*shared-host(\.js)?['"]/,
      ])
    }
  })

  it('keeps web route entrypoints off direct runtime-kit imports', () => {
    for (const file of [
      'instances.ts',
      'statistics.ts',
      'messages.ts',
      'pairs.ts',
      'telegramAvatar.ts',
      'richHeader.tsx',
    ]) {
      expectNoImportMatches(resolve(webRoot, file), [
        /from ['"]@napgram\/runtime-kit['"]/,
      ])
    }
  })
})
