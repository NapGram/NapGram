import esbuild from 'esbuild'
import packageJson from './package.json'

const externalDeps = Object.keys(packageJson.dependencies ?? {})
  .filter(dep => !dep.startsWith('@napgram/'))

esbuild.buildSync({
  bundle: true,
  entryPoints: ['src/index.ts'],
  outdir: 'build',
  sourcemap: true,
  platform: 'node',
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  external: externalDeps,
})
