import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const packageSrc = (...segments: string[]) =>
  path.resolve(rootDir, ...segments, 'src', 'index.ts')

export default defineConfig({
  resolve: {
    alias: {
      '@napgram/env-kit': packageSrc('core', 'env-kit'),
    },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.*'],
    exclude: ['dist/**', 'node_modules/**'],
    environment: 'node',
  },
})
