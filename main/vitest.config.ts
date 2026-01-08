import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
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
