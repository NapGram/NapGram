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
        // Tier 3 exclusions: untestable entry-point / infrastructure code
        // src/index.ts — Process entry point with Sentry init, signal handlers, and setInterval; integration test territory
        'src/index.ts',
        // src/infrastructure/temp.ts — File system side effects depending on env.DATA_DIR; not unit-testable
        'src/infrastructure/temp.ts',
        // MediaPreparer has complex ffmpeg dependency logic which is hard to mock for unit tests
        'src/features/runtime/features/forward/senders/MediaPreparer.ts',
      ],
      thresholds: {
        lines: 90,
        branches: 78,
        statements: 88,
        functions: 88,
      },
    },
  },
})
