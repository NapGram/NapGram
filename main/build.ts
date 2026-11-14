import packageJson from './package.json'

// drizzle-orm must stay out of the externals: Bun.build generates a broken
// chunk for db-kit's `export * from 'drizzle-orm'` when the module is
// external under splitting (references drizzle_orm without importing it,
// -> ReferenceError on import). Inlining it keeps the bundle shape
// production ran on before 990605e2. The dependency stays in
// package.json because tools/migrate.ts resolves it from node_modules
// at runtime.
const externalDeps = [
  ...Object.keys(packageJson.dependencies ?? {})
    .filter(dep => !dep.startsWith('@napgram/') && dep !== 'drizzle-orm'),
  '@napi-rs/image',
]

async function build() {
  const result = await Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'build',
    target: 'bun',
    format: 'esm',
    sourcemap: 'linked',
    splitting: true,
    naming: {
      chunk: 'chunks/[name]-[hash].[ext]',
    },
    external: externalDeps,
  })

  if (!result.success) {
    const details = result.logs.map(log => log.message).join('\n')
    throw new Error(`Bun.build failed${details ? `:\n${details}` : ''}`)
  }

  console.warn(`Bun.build succeeded: ${result.outputs.length} output files`)
}

build().catch((error: unknown) => {
  console.error(error)
  throw error
})
