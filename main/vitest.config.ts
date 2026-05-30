import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@naplink/naplink': fileURLToPath(new URL('./test/mocks/naplink.ts', import.meta.url)),
      '@mtcute/core/tl/api-schema.json': fileURLToPath(new URL('./test/mocks/mtcute-api-schema.ts', import.meta.url)),
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
        '@mtcute/test',
        '@mtcute/web',
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
          '@mtcute/test',
          '@mtcute/web',
        ],
        // Treat workspace @napgram/* packages (now local under ../packages)
        // as external so they load their built dist with real implementations,
        // matching the pre-monorepo behavior where they were installed from the
        // registry. The two clients above are explicitly inlined and excluded
        // here via negative lookahead.
        external: [/\/packages\/(?!clients\/(?:qq-client|telegram-client)\/)/],
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
