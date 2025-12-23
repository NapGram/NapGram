import esbuild from 'esbuild'
import packageJson from './package.json'

const banner = {
  js: `
    import { createRequire } from 'module';
    import { fileURLToPath } from 'url';
    import { dirname } from 'path';
    const require = createRequire(import.meta.url);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
  `,
}

esbuild.buildSync({
  bundle: true,
  entryPoints: ['src/index.ts'],
  outdir: 'build',
  sourcemap: true,
  platform: 'node',
  format: 'esm',
  banner,
  external: Object.keys(packageJson.dependencies),
})
