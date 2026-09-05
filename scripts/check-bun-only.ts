const sourceRoots = ['main/src', 'main/tools', 'packages', 'scripts']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.sh'])
const forbiddenPatterns = [
  { label: 'node: module import', pattern: /(?:from\s+|import\s*\(|require\s*\()['"]node:/ },
  { label: 'process.env', pattern: /\bprocess\.env\b/ },
  { label: 'process.cwd', pattern: /\bprocess\.cwd\b/ },
  { label: 'process.exit', pattern: /\bprocess\.exit\b/ },
  { label: 'process signal API', pattern: /\bprocess\.(?:on|once|removeListener|removeAllListeners)\b/ },
  { label: 'NodeJS namespace', pattern: /\bNodeJS\./ },
  { label: 'Node Buffer API', pattern: /\bBuffer\.(?:from|alloc|allocUnsafe|concat|isBuffer)\b|instanceof\s+Buffer/ },
  { label: 'CommonJS module wrapper', pattern: /\b(?:module\.exports|__dirname|__filename|createRequire)\b/ },
]
const directNodeDependencies = new Set(['@types/node', '@types/pg', '@types/ws', 'pg', 'ws', 'ts-node'])

const violations: string[] = []

for (const root of sourceRoots) {
  for await (const relativePath of new Bun.Glob('**/*').scan({ cwd: root, onlyFiles: true })) {
    if (relativePath.split('/').some((segment) => ['dist', 'node_modules', '.git'].includes(segment))) continue
    const extension = relativePath.slice(relativePath.lastIndexOf('.'))
    if (!sourceExtensions.has(extension)) continue

    const path = `${root}/${relativePath}`
    if (path === 'scripts/check-bun-only.ts') continue
    const content = await Bun.file(path).text()
    for (const { label, pattern } of forbiddenPatterns) {
      if (pattern.test(content)) violations.push(`${path}: ${label}`)
    }
  }
}

for await (const relativePath of new Bun.Glob('**/package.json').scan({ cwd: '.', onlyFiles: true })) {
  if (relativePath.includes('node_modules/')) continue
  const path = relativePath
  const manifest = await Bun.file(path).json() as Record<string, Record<string, unknown>>
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const dependency of Object.keys(manifest[section] || {})) {
      if (directNodeDependencies.has(dependency)) violations.push(`${path}: direct dependency ${dependency}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Bun-only guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  throw new Error(`Found ${violations.length} Bun-only violation(s)`)
}

console.log('Bun-only guard passed')
