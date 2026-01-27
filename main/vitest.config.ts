import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@naplink/naplink': fileURLToPath(new URL('./test/mocks/naplink.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    deps: {
      inline: [
        '@napgram/qq-client',
        '@naplink/naplink',
        '@napgram/telegram-client',
        '@mtcute/node',
        '@mtcute/dispatcher',
        '@mtcute/core',
      ],
    },
    server: {
      deps: {
        inline: [
          '@napgram/qq-client',
          '@naplink/naplink',
          '@napgram/telegram-client',
          '@mtcute/node',
          '@mtcute/dispatcher',
          '@mtcute/core',
        ],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'build/**',
        'dist/**',
        '**/*.config.*',
        '**/__tests__/**',
      ],
    },
  },
})
