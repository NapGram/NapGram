import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const packageSrc = (...segments: string[]) =>
  path.resolve(rootDir, ...segments, 'src', 'index.ts')
const coreSrc = (name: string) => packageSrc('core', name)
const utilitySrc = (name: string) => packageSrc('utilities', name)
const clientSrc = (name: string) => packageSrc('clients', name)

export default defineConfig({
  resolve: {
    alias: {
      '@napgram/infra-kit': coreSrc('infra-kit'),
      '@napgram/runtime-kit': coreSrc('runtime-kit'),
      '@napgram/marketplace-kit': utilitySrc('marketplace-kit'),
      '@napgram/message-kit': utilitySrc('message-kit'),
      '@napgram/database': clientSrc('database'),
      '@napgram/qq-client': clientSrc('qq-client'),
      '@napgram/telegram-client': clientSrc('telegram-client'),
    },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.*'],
    exclude: ['dist/**', 'node_modules/**'],
  },
})
