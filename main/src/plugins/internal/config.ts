import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { getLogger } from '../../shared/logger';
import env from '../../domain/models/env';
import { readBoolEnv, readStringEnv } from './env';
import { getManagedPluginsConfigPath } from './store';

const logger = getLogger('PluginHost');

export interface PluginSpec {
  module: string;
  enabled: boolean;
  config?: any;
  load: () => Promise<any>;
}

export function resolvePluginsEnabled(): boolean {
  return readBoolEnv(['PLUGINS_ENABLED']);
}

export function resolveGatewayEndpoint(): string {
  return readStringEnv(['PLUGINS_GATEWAY_URL']) || 'ws://127.0.0.1:8765';
}

export function resolvePluginsInstances(defaultInstances?: number[]): number[] {
  const raw = readStringEnv(['PLUGINS_INSTANCES']);
  if (!raw) return Array.isArray(defaultInstances) && defaultInstances.length ? defaultInstances : [0];
  const instances = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => Number(s))
    .filter(n => Number.isFinite(n));
  return instances.length ? instances : (defaultInstances?.length ? defaultInstances : [0]);
}

export function resolveAllowTsPlugins(): boolean {
  return readBoolEnv(['PLUGINS_ALLOW_TS']);
}

export function resolveDebugSessions(): boolean {
  return readBoolEnv(['PLUGINS_DEBUG_SESSIONS']);
}

function resolveDataDir(): string {
  const dataDir = String(env.DATA_DIR || process.env.DATA_DIR || '/app/data');
  return path.resolve(dataDir);
}

async function realpathSafe(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return p;
  }
}

async function resolvePathUnderDataDir(inputPath: string): Promise<string> {
  const abs = path.resolve(inputPath);
  const real = await realpathSafe(abs);
  const dataDir = resolveDataDir();
  const dataReal = await realpathSafe(dataDir);

  if (real === dataReal) return real;
  if (!real.startsWith(dataReal + path.sep)) {
    throw new Error(`Path is outside DATA_DIR: ${inputPath}`);
  }
  return real;
}

async function loadConfigFile(filePath: string): Promise<any> {
  const raw = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') return YAML.parse(raw);
  return JSON.parse(raw);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function resolveModuleSpecifier(spec: string, baseDir: string): string {
  if (!spec) return spec;
  if (spec.startsWith('file://')) return spec;
  if (spec.startsWith('.') || spec.startsWith('/')) return path.resolve(baseDir, spec);
  return '';
}

function isTsFile(specifier: string): boolean {
  const s = specifier.startsWith('file://') ? specifier.slice('file://'.length) : specifier;
  return /\.ts$/i.test(s);
}

function fileUrlToPathSafe(specifier: string): string {
  try {
    return fileURLToPath(specifier);
  } catch {
    return specifier;
  }
}

async function loadModule(specifier: string): Promise<any> {
  if (isTsFile(specifier) && !resolveAllowTsPlugins()) {
    throw new Error(`Refusing to load TypeScript plugin without PLUGINS_ALLOW_TS=1: ${specifier}`);
  }
  if (specifier.startsWith('file://')) {
    const mod = await import(specifier);
    return mod?.default ?? mod;
  }
  if (specifier.startsWith('/') || specifier.startsWith('.')) {
    const url = pathToFileURL(specifier).href;
    const mod = await import(url);
    return mod?.default ?? mod;
  }
  throw new Error(`Refusing to load package module: ${specifier}`);
}

export async function loadPluginSpecs(): Promise<PluginSpec[]> {
  const specs: PluginSpec[] = [];
  const allowTs = resolveAllowTsPlugins();
  const dataDir = resolveDataDir();

  const managedConfigPath = await getManagedPluginsConfigPath();
  const configPath = readStringEnv(['PLUGINS_CONFIG_PATH']) || managedConfigPath;
  if (configPath && await exists(configPath)) {
    try {
      const abs = await resolvePathUnderDataDir(configPath);
      const baseDir = path.dirname(abs);
      const config = await loadConfigFile(abs);
      const plugins = Array.isArray(config?.plugins) ? config.plugins : [];

      for (const p of plugins) {
        const moduleRaw = typeof p?.module === 'string' ? p.module : '';
        const module = resolveModuleSpecifier(moduleRaw, baseDir);
        if (!module) {
          logger.warn({ module: moduleRaw }, 'Skip non-file plugin (only DATA_DIR file paths are allowed)');
          continue;
        }
        if (isTsFile(module) && !allowTs) {
          logger.warn({ module }, 'Skip .ts plugin (set PLUGINS_ALLOW_TS=1 to enable)');
          continue;
        }
        const resolved = module.startsWith('file://')
          ? await resolvePathUnderDataDir(fileUrlToPathSafe(module))
          : await resolvePathUnderDataDir(module);
        const enabled = p?.enabled === false ? false : true;
        specs.push({
          module: resolved,
          enabled,
          config: p?.config,
          load: () => loadModule(resolved),
        });
      }
    } catch (error: any) {
      logger.error({ configPath, dataDir, error }, 'Failed to load PLUGINS_CONFIG_PATH');
    }
  }

  const defaultDir = path.join(dataDir, 'plugins', 'local');
  const pluginsDir = readStringEnv(['PLUGINS_DIR']) || defaultDir;
  if (pluginsDir && await exists(pluginsDir)) {
    try {
      const absDir = await resolvePathUnderDataDir(pluginsDir);
      const entries = await fs.readdir(absDir, { withFileTypes: true });
      const files = entries
        .filter(e => e.isFile())
        .map(e => e.name)
        .filter(name => !name.startsWith('.'))
        .filter(name => /\.(mjs|cjs|js)$/i.test(name) || (allowTs && /\.ts$/i.test(name)))
        .sort((a, b) => a.localeCompare(b));

      for (const filename of files) {
        const modulePath = path.join(absDir, filename);
        specs.push({
          module: modulePath,
          enabled: true,
          load: () => loadModule(modulePath),
        });
      }
    } catch (error: any) {
      logger.error({ pluginsDir, dataDir, error }, 'Failed to load PLUGINS_DIR');
    }
  }

  return specs;
}
