import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      'build',
      'dist',
      'node_modules',
      '**/*.md',
    ],
    rules: {
      'no-console': 'warn',
    },
  },
  {
    files: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      'src/gateway/test-client.ts',
      'tools/**',
    ],
    rules: {
      'no-console': 'off',
    },
  },
)
