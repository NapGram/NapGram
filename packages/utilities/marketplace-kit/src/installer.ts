import { unzipSync } from 'fflate'
import { spawnFileWithBun, createHashWithRuntime, runtimeFileIO } from '@napgram/runtime-kit'
import { dirname, bunRuntime, isWithin, joinPath, relative, resolvePath } from './path-utils.js'
import { env, getGlobalRuntime, getLogger, patchPluginConfig, readPluginsConfig, removePluginConfig, upsertPluginConfig } from './shared-runtime.js'
import { readMarketplaceCache } from './marketplace.js'

const logger = getLogger('PluginInstaller')

export type DistType = 'zip' | 'tgz'

export interface MarketplaceIndexV1 {
  schemaVersion: 1
  name?: string
  plugins: Array<{
    id: string
    name?: string
    description?: string
    readme?: string
    homepage?: string
    tags?: string[]
    categories?: string[]
    commands?: Array<{
      name: string
      description?: string
      usage?: string
    }>
    dependencies?: Array<{
      name: string
      type: 'required' | 'optional'
    }>
    versions: Array<MarketplacePluginVersion>
  }>
}

export interface MarketplacePluginVersion {
  version: string
  entry: { type: 'file', path: string }
  dist: { type: DistType, url: string, sha256: string }
  install?: {
    mode?: 'none' | 'bun'
    production?: boolean
    ignoreScripts?: boolean
    frozenLockfile?: boolean
    registry?: string
  }
  permissions?: {
    network?: string[]
    fs?: string[]
    instances?: Array<number | string>
  }
  configSchema?: any // JSON Schema or simplified config schema
}

export interface InstallOptions {
  marketplaceId: string
  pluginId: string
  version?: string
  enabled?: boolean
  config?: any
  reload?: boolean
  dryRun?: boolean
}

export interface UpgradeOptions {
  marketplaceId?: string
  version?: string
  reload?: boolean
  dryRun?: boolean
}

export interface RollbackOptions {
  version?: string
  reload?: boolean
  dryRun?: boolean
}

export interface UninstallOptions {
  removeFiles?: boolean
  reload?: boolean
  dryRun?: boolean
}

export interface PluginInstallResult {
  id: string
  version: string
  entryPath: string
  module: string
  installDir: string
  permissions: Required<NonNullable<MarketplacePluginVersion['permissions']>>
  source: any
}

let installQueue: Promise<void> = Promise.resolve()

function resolveDataDir(): string {
  return resolvePath(String(env.DATA_DIR || bunRuntime.env.DATA_DIR || '/app/data'))
}

function resolvePluginsRoot(...parts: string[]): string {
  return joinPath(resolveDataDir(), 'plugins', ...parts)
}

function normalizeHexSha256(input: string): string {
  const v = String(input || '').trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(v))
    throw new Error('Invalid sha256 (expected 64 hex chars)')
  return v
}

function sanitizeId(input: string): string {
  return String(input || '')
    .trim()
    .replace(/[^\w-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64) || 'plugin'
}

function safeJoin(root: string, rel: string): string {
  const out = resolvePath(root, rel)
  if (isWithin(root, out))
    return out
  throw new Error(`Unsafe path traversal: ${rel}`)
}

function isSafeArchivePath(p: string): boolean {
  if (!p)
    return false
  if (p.startsWith('/'))
    return false
  if (p.includes('\\'))
    return false
  const parts = p.split('/').filter(Boolean)
  if (!parts.length)
    return false
  if (parts.some(x => x === '.' || x === '..'))
    return false
  return true
}

function parseSemver3(v: string): [number, number, number, string] | null {
  const m = String(v || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)([-+].+)?$/)
  if (!m)
    return null
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] || '']
}

function compareVersions(a: string, b: string): number {
  const pa = parseSemver3(a)
  const pb = parseSemver3(b)
  if (!pa || !pb)
    return a.localeCompare(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] as number) - (pb[i] as number)
    if (d)
      return d
  }
  const ra = pa[3] || ''
  const rb = pb[3] || ''
  if (!ra && rb)
    return 1
  if (ra && !rb)
    return -1
  return ra.localeCompare(rb)
}

function resolveRequestedPermissions(p?: MarketplacePluginVersion['permissions']): Required<NonNullable<MarketplacePluginVersion['permissions']>> {
  return {
    network: Array.isArray(p?.network) ? p!.network.map(String) : [],
    fs: Array.isArray(p?.fs) ? p!.fs.map(String) : [],
    instances: Array.isArray(p?.instances) ? p!.instances.map(x => (typeof x === 'number' ? x : String(x))) : [],
  }
}

async function ensureDir(p: string) {
  await runtimeFileIO.mkdir(p, { recursive: true })
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await runtimeFileIO.access(p)
    return true
  }
  catch {
    return false
  }
}

async function downloadToFile(url: string, filePath: string): Promise<{ sha256: string, bytes: number }> {
  logger.info({ url }, 'Downloading plugin archive')
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  }

  await ensureDir(dirname(filePath))
  const file = await runtimeFileIO.openWrite(filePath)
  const hash = createHashWithRuntime('sha256')
  let bytes = 0

  try {
    for await (const chunk of res.body) {
      const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer)
      bytes += buf.length
      hash.update(buf)
      await file.write(buf)
    }
  }
  finally {
    await file.close()
  }

  logger.info({ url, bytes }, 'Plugin archive downloaded')
  return { sha256: hash.digest('hex') as string, bytes }
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  logger.info({ zipPath }, 'Extracting zip archive')
  const data = await runtimeFileIO.readBytes(zipPath)
  const files = unzipSync(new Uint8Array(data))
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('/'))
      continue
    if (!isSafeArchivePath(name)) {
      throw new Error(`Unsafe zip entry path: ${name}`)
    }
    const outPath = safeJoin(destDir, name)
    await ensureDir(dirname(outPath))
    await runtimeFileIO.write(outPath, content)
  }
  logger.info({ zipPath }, 'Zip archive extracted')
}

async function listTarEntriesVerbose(tgzPath: string): Promise<Array<{ type: string, name: string }>> {
  const { stdout } = await spawnFileWithBun('tar', ['-tvzf', tgzPath])
  const lines = String(stdout || '').split('\n').map(s => s.trim()).filter(Boolean)
  return lines.map((line) => {
    const type = line[0] || '?'
    const arrow = line.indexOf(' -> ')
    const last = arrow >= 0 ? line.slice(0, arrow) : line
    const name = last.split(/\s+/).slice(-1)[0] || ''
    return { type, name }
  })
}

async function extractTgz(tgzPath: string, destDir: string): Promise<void> {
  logger.info({ tgzPath }, 'Extracting tgz archive')
  const entries = await listTarEntriesVerbose(tgzPath)
  for (const e of entries) {
    if (!isSafeArchivePath(e.name))
      throw new Error(`Unsafe tar entry path: ${e.name}`)
    if (!['-', 'd'].includes(e.type)) {
      throw new Error(`Unsupported tar entry type "${e.type}" for: ${e.name}`)
    }
  }
  await spawnFileWithBun('tar', ['-xzf', tgzPath, '-C', destDir, '--no-same-owner', '--no-same-permissions'])
  logger.info({ tgzPath }, 'Tgz archive extracted')
}

async function extractArchive(distType: DistType, archivePath: string, destDir: string): Promise<void> {
  logger.info({ distType, archivePath, destDir }, 'Extracting archive')
  try {
    await ensureDir(destDir)
    if (distType === 'zip')
      return await extractZip(archivePath, destDir)
    if (distType === 'tgz')
      return await extractTgz(archivePath, destDir)
    throw new Error(`Unsupported dist.type: ${distType}`)
  } catch (error: any) {
    logger.error({ error: error?.message || String(error), stack: error?.stack, archivePath, destDir }, 'Archive extraction failed')
    throw error
  }
}

async function resolveEntryFile(destDir: string, entryPath: string): Promise<string> {
  const direct = safeJoin(destDir, entryPath)
  if (await pathExists(direct))
    return direct
  const npmLayout = safeJoin(destDir, joinPath('package', entryPath))
  if (await pathExists(npmLayout))
    return npmLayout
  throw new Error(`Entry not found after extract: ${entryPath}`)
}

/**
 * Create symlink to host's @napgram SDK packages in plugin's node_modules
 * This allows plugins to import '@napgram/sdk' without bundling it
 */
async function linkHostSdk(installDir: string): Promise<void> {
  const candidates = [installDir, joinPath(installDir, 'package')]
  let pluginRoot: string | null = null

  for (const candidate of candidates) {
    const pkgPath = joinPath(candidate, 'package.json')
    if (await pathExists(pkgPath)) {
      pluginRoot = candidate
      break
    }
  }

  if (!pluginRoot)
    throw new Error(`Plugin package.json not found under ${installDir}`)

  const pluginNodeModules = joinPath(pluginRoot, 'node_modules', '@napgram')
  await ensureDir(pluginNodeModules)

  const hostNodeModules = resolvePath('/app/node_modules/@napgram')
  if (!await pathExists(hostNodeModules))
    throw new Error(`Host SDK packages not found: ${hostNodeModules}`)

  const sdkPackages = await runtimeFileIO.readdir(hostNodeModules)
  for (const pkg of sdkPackages) {
    const hostPkg = joinPath(hostNodeModules, pkg)
    const pluginPkg = joinPath(pluginNodeModules, pkg)
    if (!await pathExists(hostPkg))
      throw new Error(`Host SDK package not found: ${hostPkg}`)
    await runtimeFileIO.remove(pluginPkg, { recursive: true, force: true })
    await spawnFileWithBun('ln', ['-s', hostPkg, pluginPkg])
  }
}

async function findBunProjectDir(destDir: string): Promise<string | null> {
  const direct = joinPath(destDir, 'package.json')
  if (await pathExists(direct))
    return destDir
  const npm = joinPath(destDir, 'package', 'package.json')
  if (await pathExists(npm))
    return joinPath(destDir, 'package')
  return null
}

async function runBunInstall(projectDir: string, opts: Required<NonNullable<MarketplacePluginVersion['install']>>) {
  logger.info({ projectDir }, 'Running bun install for plugin')
  const args = ['install']
  if (opts.production)
    args.push('--prod')
  if (opts.ignoreScripts)
    args.push('--ignore-scripts')
  if (opts.frozenLockfile)
    args.push('--frozen-lockfile')

  const envVars: Record<string, string | undefined> = { ...bunRuntime.env }
  if (opts.registry)
    envVars.npm_config_registry = opts.registry

  await spawnFileWithBun('bun', args, {
    cwd: projectDir,
    env: envVars,
  }).catch((error: unknown) => {
    const processError = error as Error & { result?: { stderr?: string, stdout?: string } }
    logger.error({
      error: processError.message,
      stderr: processError.result?.stderr,
      stdout: processError.result?.stdout,
      projectDir,
    }, 'bun install failed')
    throw error
  })
  logger.info({ projectDir }, 'bun install completed')
}

async function loadPluginDefaultConfig(installDir: string): Promise<any | null> {
  const candidates = [
    joinPath(installDir, 'dist', 'config.js'),
    joinPath(installDir, 'dist', 'config.mjs'),
    joinPath(installDir, 'config.js'),
    joinPath(installDir, 'config.mjs'),
    joinPath(installDir, 'config.json'),
  ]

  for (const candidate of candidates) {
    if (!await pathExists(candidate))
      continue
    try {
      if (candidate.endsWith('.json')) {
        const raw = await runtimeFileIO.readText(candidate)
        return JSON.parse(raw)
      }
      const mod = await import(candidate)
      if (mod?.defaultConfig)
        return mod.defaultConfig
      if (mod?.default)
        return mod.default
    }
    catch (error) {
      logger.warn({ error, candidate }, 'Failed to load plugin default config')
    }
  }

  return null
}

async function syncPluginSchemaIfNeeded(installDir: string, pluginId: string) {
  const candidates = [
    joinPath(installDir, 'dist', 'schema.ts'),
    joinPath(installDir, 'src', 'schema.ts'),
    joinPath(installDir, 'schema.ts'),
  ]

  for (const schemaPath of candidates) {
    if (!await pathExists(schemaPath))
      continue

    logger.info({ pluginId, schemaPath }, 'Plugin contains Drizzle schema definition')
    logger.info('Note: Plugin schemas are now managed via the central @napgram/database package sync mechanism.')
    return true
  }

  return false
}

async function loadMarketplaceIndex(marketplaceId: string): Promise<MarketplaceIndexV1> {
  logger.info({ marketplaceId }, 'Loading marketplace index')
  const cached = await readMarketplaceCache(marketplaceId)
  if (!cached.exists) {
    throw new Error(`Marketplace cache not found for "${marketplaceId}". Call /api/admin/marketplaces/refresh first.`)
  }
  const data = cached.data?.data
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.plugins)) {
    throw new Error('Invalid marketplace index schema')
  }
  logger.info({ marketplaceId, pluginCount: data.plugins.length }, 'Marketplace index loaded')
  return data as MarketplaceIndexV1
}

function pickVersion(versions: MarketplacePluginVersion[], requested?: string): MarketplacePluginVersion {
  if (!versions.length)
    throw new Error('No versions available')
  if (requested) {
    const v = versions.find(x => x.version === requested)
    if (!v)
      throw new Error(`Version not found: ${requested}`)
    return v
  }
  const sorted = [...versions].sort((a, b) => compareVersions(a.version, b.version))
  return sorted[sorted.length - 1]
}

function buildModuleSpecifier(pluginId: string, version: string, entryPath: string): string {
  return `./${pluginId}/${version}/${entryPath.split('/').join('/')}`
}

async function listInstalledVersions(pluginId: string): Promise<string[]> {
  const root = resolvePluginsRoot(pluginId)
  if (!await pathExists(root))
    return []
  const entries = await runtimeFileIO.readdirEntries(root)
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(Boolean)
    .sort((a, b) => compareVersions(a, b))
}

async function inferCurrentVersion(pluginId: string): Promise<string | null> {
  const { config } = await readPluginsConfig()
  const entry = config.plugins.find((p: any) => p.id === pluginId)
  const src = (entry as any)?.source
  if (typeof src?.version === 'string' && src.version)
    return src.version

  const mod = String(entry?.module || '')
  const m = mod.match(new RegExp(`^\\./${pluginId}/([^/]+)/`))
  if (m)
    return m[1]
  return null
}

async function writeInstallMeta(installDir: string, meta: any) {
  await runtimeFileIO.write(joinPath(installDir, 'napgram-plugin.json'), JSON.stringify(meta, null, 2))
}

async function withInstallLock<T>(fn: () => Promise<T>): Promise<T> {
  const start = installQueue
  let release!: () => void
  installQueue = new Promise<void>(resolve => (release = resolve))
  await start
  try {
    return await fn()
  }
  finally {
    release()
  }
}

async function installFromMarketplaceUnlocked(opts: InstallOptions): Promise<PluginInstallResult> {
  const marketplaceId = sanitizeId(opts.marketplaceId)
  const pluginId = sanitizeId(opts.pluginId)
  logger.info({
    marketplaceId,
    pluginId,
    version: opts.version || 'latest',
    dryRun: opts.dryRun === true,
  }, 'Marketplace install started')

  const existing = (await readPluginsConfig()).config.plugins.find((p: any) => p.id === pluginId)
  const enabled = typeof opts.enabled === 'boolean' ? opts.enabled : (existing ? existing.enabled !== false : true)
  const requestedConfig = typeof opts.config === 'undefined' ? undefined : opts.config
  const existingConfig = existing?.config

  const index = await loadMarketplaceIndex(marketplaceId)
  const plugin = index.plugins.find(p => sanitizeId(p.id) === pluginId)
  if (!plugin)
    throw new Error(`Plugin not found in marketplace: ${pluginId}`)

  const target = pickVersion(plugin.versions, opts.version)
  logger.info({ pluginId, version: target.version }, 'Selected plugin version')
  const entryPath = String(target.entry?.path || '').trim().replace(/^\/+/, '')
  if (!entryPath)
    throw new Error('Invalid entry.path')

  const distType = target.dist?.type
  if (distType !== 'zip' && distType !== 'tgz')
    throw new Error('Invalid dist.type')
  const url = String(target.dist?.url || '').trim()
  if (!url)
    throw new Error('Missing dist.url')
  const expected = normalizeHexSha256(target.dist?.sha256)

  const permissions = resolveRequestedPermissions(target.permissions)

  const install = {
    mode: (target.install?.mode || 'none') as 'none' | 'bun',
    production: target.install?.production !== false,
    ignoreScripts: target.install?.ignoreScripts !== false,
    frozenLockfile: target.install?.frozenLockfile === true,
    registry: (target.install?.registry || undefined) as string | undefined,
  }

  const installDir = resolvePluginsRoot(pluginId, target.version)
  const tmpDir = resolvePluginsRoot('tmp')
  const archivePath = joinPath(tmpDir, `${pluginId}-${target.version}.${distType}`)

  if (opts.dryRun) {
    const module = buildModuleSpecifier(pluginId, target.version, entryPath)
    logger.info({ pluginId, version: target.version }, 'Marketplace install dry-run resolved')
    return {
      id: pluginId,
      version: target.version,
      entryPath,
      module,
      installDir,
      permissions,
      source: { type: 'marketplace', marketplaceId, pluginId, version: target.version, dist: { type: distType, url, sha256: expected }, install, permissions },
    }
  }

  await ensureDir(tmpDir)
  logger.info({ pluginId, version: target.version, distType }, 'Downloading plugin package')
  const { sha256 } = await downloadToFile(url, archivePath)
  if (sha256 !== expected) {
    throw new Error(`sha256 mismatch: expected=${expected} got=${sha256}`)
  }

  await runtimeFileIO.remove(installDir, { recursive: true, force: true })
  await ensureDir(installDir)
  logger.info({ pluginId, version: target.version, distType }, 'Extracting plugin package')
  await extractArchive(distType, archivePath, installDir)

  await syncPluginSchemaIfNeeded(installDir, pluginId)

  if (install.mode === 'bun') {
    const projectDir = await findBunProjectDir(installDir)
    if (!projectDir)
      throw new Error('install.mode=bun but package.json not found after extract')
    await runBunInstall(projectDir, install as any)
  }

  // Link host SDK packages to plugin's node_modules
  logger.info({ pluginId, version: target.version }, 'Linking host SDK packages')
  await linkHostSdk(installDir)

  const entryFile = await resolveEntryFile(installDir, entryPath)
  const entryRel = relative(installDir, entryFile).split('/').join('/')
  const module = buildModuleSpecifier(pluginId, target.version, entryRel)

  const source = { type: 'marketplace', marketplaceId, pluginId, version: target.version, dist: { type: distType, url, sha256: expected }, install, permissions }
  logger.info({ pluginId, version: target.version }, 'Writing plugin config')

  let resolvedConfig = typeof requestedConfig === 'undefined' ? existingConfig : requestedConfig
  if (typeof resolvedConfig === 'undefined') {
    const defaults = await loadPluginDefaultConfig(installDir)
    if (defaults && typeof defaults === 'object') {
      resolvedConfig = JSON.parse(JSON.stringify(defaults))
      logger.info({ pluginId }, 'Applied plugin default config')
    }
  }

  await writeInstallMeta(installDir, {
    installedAt: new Date().toISOString(),
    ...source,
    entry: { path: entryRel },
  })

  await upsertPluginConfig({
    id: pluginId,
    module,
    enabled,
    config: resolvedConfig,
    source,
  })

  logger.info({ pluginId, version: target.version }, 'Marketplace install completed')
  return { id: pluginId, version: target.version, entryPath: entryRel, module, installDir, permissions, source }
}

export async function installFromMarketplace(opts: InstallOptions): Promise<PluginInstallResult> {
  return withInstallLock(() => installFromMarketplaceUnlocked(opts))
}

export async function upgradePlugin(pluginIdRaw: string, options: UpgradeOptions): Promise<PluginInstallResult> {
  return withInstallLock(async () => {
    const pluginId = sanitizeId(pluginIdRaw)
    const current = await inferCurrentVersion(pluginId)
    logger.info({ pluginId, current: current || '-', version: options.version || 'latest' }, 'Marketplace upgrade requested')
    const rawMarketplaceId = String(options.marketplaceId || '').trim()
    if (!rawMarketplaceId) {
      const { config } = await readPluginsConfig()
      const entry = config.plugins.find((p: any) => p.id === pluginId)
      const src = (entry as any)?.source
      const mid = typeof src?.marketplaceId === 'string' ? src.marketplaceId : ''
      if (!mid)
        throw new Error('Missing marketplaceId (not installed from marketplace?)')
      options.marketplaceId = mid
    }

    const marketplaceId = sanitizeId(options.marketplaceId || '')
    const index = await loadMarketplaceIndex(marketplaceId)
    const plugin = index.plugins.find(p => sanitizeId(p.id) === pluginId)
    if (!plugin)
      throw new Error(`Plugin not found in marketplace: ${pluginId}`)
    const target = pickVersion(plugin.versions, options.version)
    if (current && target.version === current) {
      throw new Error(`Already on version ${current}`)
    }
    logger.info({ pluginId, from: current || '-', to: target.version }, 'Marketplace upgrade resolved')
    const result = await installFromMarketplaceUnlocked({
      marketplaceId: sanitizeId(options.marketplaceId!),
      pluginId,
      version: target.version,
      reload: options.reload,
      dryRun: options.dryRun,
    })
    logger.info({ pluginId, version: result.version }, 'Marketplace upgrade completed')
    return result
  })
}

export async function rollbackPlugin(pluginIdRaw: string, options: RollbackOptions): Promise<{ id: string, from: string, to: string, module: string }> {
  return withInstallLock(async () => {
    const pluginId = sanitizeId(pluginIdRaw)
    const current = await inferCurrentVersion(pluginId)
    if (!current)
      throw new Error('Plugin not installed')

    const installed = await listInstalledVersions(pluginId)
    if (!installed.length)
      throw new Error('No installed versions on disk')

    let target = options.version
    if (!target) {
      const candidates = installed.filter(v => v !== current)
      if (!candidates.length)
        throw new Error('No previous version to rollback to')
      target = candidates[candidates.length - 1]
    }
    if (!installed.includes(target))
      throw new Error(`Target version not installed: ${target}`)

    const installDir = resolvePluginsRoot(pluginId, target)
    const metaPath = joinPath(installDir, 'napgram-plugin.json')
    const meta = await pathExists(metaPath) ? JSON.parse(await runtimeFileIO.readText(metaPath)) : null
    const entryRel = String(meta?.entry?.path || '').trim()
    if (!entryRel)
      throw new Error('Missing entry metadata for rollback target')

    const module = buildModuleSpecifier(pluginId, target, entryRel)

    if (!options.dryRun) {
      await patchPluginConfig(pluginId, { module, source: { ...(meta || {}), version: target } })
    }

    return { id: pluginId, from: current, to: target, module }
  })
}

export async function uninstallPlugin(pluginIdRaw: string, options: UninstallOptions): Promise<{ id: string, removed: boolean, filesRemoved: boolean }> {
  return withInstallLock(async () => {
    const pluginId = sanitizeId(pluginIdRaw)
    const { config } = await readPluginsConfig()
    const idx = config.plugins.findIndex((p: any) => p.id === pluginId)
    const removed = idx >= 0

    if (!options.dryRun) {
      if (removed) {
        const entry = config.plugins[idx]
        const isMarketplacePlugin = entry.source && typeof entry.source === 'object' && entry.source.type === 'marketplace'

        // For marketplace plugins, remove the config entry (they can be reinstalled)
        // For local plugins, keep the entry but set enabled: false to prevent auto-discovery from re-enabling
        if (isMarketplacePlugin) {
          await removePluginConfig(pluginId)
        }
        else {
          await patchPluginConfig(pluginId, { enabled: false })
        }
      }
      else {
        // Plugin not in config yet (probably auto-discovered local plugin)
        // Check if it's loaded in runtime to determine if it's a local plugin
        const runtime = getGlobalRuntime().getLastReport()
        const isLoaded = runtime.loaded.includes(pluginId)

        if (isLoaded) {
          // It's a local plugin that was auto-discovered - add it to config as disabled
          const loadedPlugin = runtime.loadedPlugins?.find((p: any) => p.id === pluginId)
          if (loadedPlugin) {
            // Try to infer the module path from runtime
            const possiblePaths = [
              `./local/${pluginId}/index.mjs`,
              `./local/${pluginId}/index.js`,
            ]

            // Add the plugin to config with enabled: false
            try {
              await upsertPluginConfig({
                id: pluginId,
                module: possiblePaths[0], // Use default path
                enabled: false,
              })
            }
            catch {
              // If upsert fails, it means we can't persist the disable - this is acceptable
              // The plugin will be re-enabled on next reload
            }
          }
        }
      }
    }

    let filesRemoved = false
    if (options.removeFiles && !options.dryRun) {
      const dir = resolvePluginsRoot(pluginId)
      await runtimeFileIO.remove(dir, { recursive: true, force: true })
      filesRemoved = true
    }
    return { id: pluginId, removed, filesRemoved }
  })
}

export async function getPluginVersions(pluginIdRaw: string): Promise<{ current: string | null, installed: string[] }> {
  const pluginId = sanitizeId(pluginIdRaw)
  const current = await inferCurrentVersion(pluginId)
  const installed = await listInstalledVersions(pluginId)
  return { current, installed }
}
