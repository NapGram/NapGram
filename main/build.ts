import packageJson from './package.json'

const externalDeps = [
  ...Object.keys(packageJson.dependencies ?? {})
    .filter(dep => !dep.startsWith('@napgram/')),
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
