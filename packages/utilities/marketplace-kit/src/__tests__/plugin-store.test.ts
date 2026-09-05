import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import YAML from 'yaml'
import * as store from '../plugin-store.js'
import { bunRuntime, joinPath, resolvePath } from '../path-utils.js'


const fileIOMocks = {
  access: mock(),
  readText: mock(),
  mkdir: mock(),
  write: mock(),
  rename: mock(),
  copyFile: mock(),
}
const mockedFs = fileIOMocks

mock.module('@napgram/env-kit', () => ({
  env: {
    DATA_DIR: '/test/data',
    LOG_FILE: '/test/data/logs/app.log',
    LOG_LEVEL: 'info',
    LOG_FILE_LEVEL: 'debug',
  },
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => ({
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  })),
}))

mock.module('@napgram/runtime-kit', () => ({
  runtimeFileIO: fileIOMocks,
}))

describe('plugin-store.ts', () => {
  const mockDataDir = '/test/data'
  const mockPluginsDir = joinPath(mockDataDir, 'plugins')
  const mockConfigPath = joinPath(mockPluginsDir, 'plugins.yaml')

  beforeEach(() => {
    mock.clearAllMocks()
    // Set default DATA_DIR
    bunRuntime.env.DATA_DIR = mockDataDir
    delete bunRuntime.env.PLUGINS_CONFIG_PATH
  })

  afterEach(() => {
    delete bunRuntime.env.DATA_DIR
    delete bunRuntime.env.PLUGINS_CONFIG_PATH
  })

  describe('getManagedPluginsConfigPath', () => {
    it('should return default config path', async () => {
      const configPath = await store.getManagedPluginsConfigPath()
      expect(configPath).toBe(mockConfigPath)
    })

    it('should use override from environment', async () => {
      bunRuntime.env.PLUGINS_CONFIG_PATH = '/custom/path/config.yaml'

      const configPath = await store.getManagedPluginsConfigPath()
      expect(configPath).toContain('config.yaml')
    })
  })

  describe('readPluginsConfig', () => {
    it('should return empty config when file does not exist', async () => {
      mockedFs.access.mockRejectedValue(new Error('File not found'))
      const result = await store.readPluginsConfig()

      expect(result.exists).toBe(false)
      expect(result.config.plugins).toEqual([])
      expect(result.path).toBe(mockConfigPath)
    })

    it('should migrate legacy config when default config is missing', async () => {
      const legacyPath = joinPath(mockPluginsDir, 'plugins.json')
      const jsonContent = JSON.stringify({
        plugins: [{
          id: 'legacy-plugin',
          module: './legacy.js',
        }],
      })

      mockedFs.access.mockImplementation(async (p: any) => {
        if (p === mockConfigPath)
          throw new Error('File not found')
        if (p === legacyPath)
          return undefined
        throw new Error('File not found')
      })
      mockedFs.readText.mockImplementation(async (p: any) => {
        if (p === legacyPath)
          return jsonContent
        throw new Error('File not found')
      })

      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.write.mockResolvedValue(undefined)

      const result = await store.readPluginsConfig()

      expect(result.exists).toBe(true)
      expect(result.config.plugins).toHaveLength(1)
      expect(result.config.plugins[0].id).toBe('legacy-plugin')
      expect(mockedFs.write).toHaveBeenCalledWith(
        `${mockConfigPath}.tmp`,
        expect.stringContaining('legacy-plugin'),
      )
    })

    it('should read and parse YAML config', async () => {
      const yamlContent = `plugins:
  - id: test-plugin
    module: ./test-plugin.js
    enabled: true
    config:
      key: value`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(yamlContent)
      const result = await store.readPluginsConfig()

      expect(result.exists).toBe(true)
      expect(result.config.plugins).toHaveLength(1)
      expect(result.config.plugins[0].id).toBe('test-plugin')
      expect(result.config.plugins[0].module).toBe('./test-plugin.js')
      expect(result.config.plugins[0].enabled).toBe(true)
    })

    it('should filter out invalid plugins', async () => {
      const yamlContent = `plugins:
  - id: valid-plugin
    module: ./valid.js
  - id: ''
    module: ./no-id.js
  - id: no-module
    module: ''`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(yamlContent)
      const result = await store.readPluginsConfig()

      expect(result.config.plugins).toHaveLength(2)
      expect(result.config.plugins.map(p => p.id)).toEqual(['valid-plugin', 'no-module'])
      expect(result.config.plugins.find(p => p.id === 'no-module')?.module).toBeUndefined()
    })

    it('should keep id-only plugin records for builtin override', async () => {
      const yamlContent = `plugins:
  - id: ping-pong
    enabled: false`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(yamlContent)
      const result = await store.readPluginsConfig()

      expect(result.config.plugins).toHaveLength(1)
      expect(result.config.plugins[0].id).toBe('ping-pong')
      expect(result.config.plugins[0].module).toBeUndefined()
      expect(result.config.plugins[0].enabled).toBe(false)
    })

    it('should handle JSON config files', async () => {
      const jsonContent = JSON.stringify({
        plugins: [{
          id: 'json-plugin',
          module: './plugin.js',
        }],
      })

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(jsonContent)
      // Mock JSON config path inside DATA_DIR
      bunRuntime.env.PLUGINS_CONFIG_PATH = joinPath(mockDataDir, 'plugins', 'config.json')

      const result = await store.readPluginsConfig()

      expect(result.config.plugins).toHaveLength(1)
      expect(result.config.plugins[0].id).toBe('json-plugin')
    })

    it('should set enabled=true by default', async () => {
      const yamlContent = `plugins:
  - id: test-plugin
    module: ./test.js`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(yamlContent)
      const result = await store.readPluginsConfig()

      expect(result.config.plugins[0].enabled).toBe(true)
    })

    it('should respect enabled=false', async () => {
      const yamlContent = `plugins:
  - id: disabled-plugin
    module: ./test.js
    enabled: false`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(yamlContent)
      const result = await store.readPluginsConfig()

      expect(result.config.plugins[0].enabled).toBe(false)
    })

    it('should handle legacy migration errors gracefully', async () => {
      const legacyPath = joinPath(mockPluginsDir, 'plugins.yml')

      mockedFs.access.mockImplementation(async (p: any) => {
        if (p === mockConfigPath)
          throw new Error('File not found')
        if (p === legacyPath)
          return undefined
        throw new Error('File not found')
      })

      // Make legacy file read fail
      mockedFs.readText.mockRejectedValue(new Error('Permission denied'))
      const result = await store.readPluginsConfig()

      // Should fall back to empty config
      expect(result.exists).toBe(false)
      expect(result.config.plugins).toEqual([])
    })
  })

  describe('normalizeModuleSpecifierForPluginsConfig', () => {
    it('should handle module spec without prefix', async () => {
      const result = await store.normalizeModuleSpecifierForPluginsConfig('plugin.js')

      expect(result.stored).toBe('./plugin.js')
    })

    it('should normalize with Bun realpath', async () => {
      const result = await store.normalizeModuleSpecifierForPluginsConfig('./my-plugin/index.js')

      expect(result.absolute).toContain('my-plugin')
    })

    it('should normalize relative path', async () => {
      const result = await store.normalizeModuleSpecifierForPluginsConfig('./my-plugin/index.js')

      expect(result.stored).toMatch(/^\.\//)
      expect(result.absolute).toContain('my-plugin')
    })

    it('should handle file:// URLs', async () => {
      const fileUrl = `file://${mockPluginsDir}/plugin.js`
      const result = await store.normalizeModuleSpecifierForPluginsConfig(fileUrl)

      expect(result.absolute).toContain('plugin.js')
    })

    it('should throw error for paths outside DATA_DIR', async () => {
      await expect(
        store.normalizeModuleSpecifierForPluginsConfig('/outside/data/dir/plugin.js'),
      ).rejects.toThrow('outside DATA_DIR')
    })

    it('should throw error for empty module', async () => {
      await expect(
        store.normalizeModuleSpecifierForPluginsConfig(''),
      ).rejects.toThrow('Missing module')
    })

    it('should handle absolute paths within DATA_DIR', async () => {
      const absolutePath = joinPath(mockPluginsDir, 'plugin.js')
      const result = await store.normalizeModuleSpecifierForPluginsConfig(absolutePath)

      expect(result.absolute).toContain('plugin.js')
    })

    it('should keep absolute path outside plugins dir but inside DATA_DIR', async () => {
      const absolutePath = joinPath(mockDataDir, 'other', 'plugin.js')
      const result = await store.normalizeModuleSpecifierForPluginsConfig(absolutePath)

      expect(result.stored).toBe(absolutePath)
    })

    it('should keep absolute path when resolving to DATA_DIR root', async () => {
      const result = await store.normalizeModuleSpecifierForPluginsConfig('..')

      expect(result.stored).toBe(resolvePath(mockDataDir))
    })
  })

  describe('upsertPluginConfig', () => {
    it('should add new plugin to empty config', async () => {
      mockedFs.access.mockRejectedValue(new Error('Not found'))

      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.write.mockResolvedValue(undefined)

      const result = await store.upsertPluginConfig({
        id: 'new-plugin',
        module: './new-plugin.js',
        enabled: true,
      })

      expect(result.id).toBe('new-plugin')
      expect(mockedFs.write).toHaveBeenCalled()
    })

    it('should update existing plugin', async () => {
      const existingConfig = `plugins:
  - id: existing-plugin
    module: ./old.js
    enabled: false`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(existingConfig)

      mockedFs.write.mockResolvedValue(undefined)
      mockedFs.mkdir.mockResolvedValue(undefined)

      const result = await store.upsertPluginConfig({
        id: 'existing-plugin',
        module: './new.js',
        enabled: true,
      })

      expect(result.id).toBe('existing-plugin')
      expect(mockedFs.write).toHaveBeenCalled()
    })

    it('should infer ID from module path if not provided', async () => {
      mockedFs.access.mockRejectedValue(new Error('Not found'))

      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.write.mockResolvedValue(undefined)

      const result = await store.upsertPluginConfig({
        module: './my-awesome-plugin/index.js',
      })

      expect(result.id).toBe('my-awesome-plugin')
    })

    it('should infer ID from non-index module path', async () => {
      mockedFs.access.mockRejectedValue(new Error('Not found'))

      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.write.mockResolvedValue(undefined)

      const result = await store.upsertPluginConfig({
        module: './simple-plugin.js',
      })

      expect(result.id).toBe('simple-plugin')
    })

    it('should sanitize plugin ID', async () => {
      mockedFs.access.mockRejectedValue(new Error('Not found'))

      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.write.mockResolvedValue(undefined)

      const result = await store.upsertPluginConfig({
        id: 'My Plugin@123!!!',
        module: './plugin.js',
      })

      // Should be sanitized to only alphanumeric and dashes
      expect(result.id).toMatch(/^[a-z0-9-]+$/i)
    })

    it('should sort plugins alphabetically', async () => {
      const existingConfig = `plugins:
  - id: zebra-plugin
    module: ./zebra.js`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(existingConfig)

      mockedFs.mkdir.mockResolvedValue(undefined)

      let writtenContent = ''
      mockedFs.write.mockImplementation(async (path: any, content: any) => {
        writtenContent = String(content)
        return undefined
      })

      await store.upsertPluginConfig({
        id: 'alpha-plugin',
        module: './alpha.js',
      })

      const parsed = YAML.parse(writtenContent)
      expect(parsed.plugins[0].id).toBe('alpha-plugin')
      expect(parsed.plugins[1].id).toBe('zebra-plugin')
    })

    it('should preserve config and source fields', async () => {
      mockedFs.access.mockRejectedValue(new Error('Not found'))

      mockedFs.mkdir.mockResolvedValue(undefined)

      let writtenContent = ''
      mockedFs.write.mockImplementation(async (path: any, content: any) => {
        writtenContent = String(content)
        return undefined
      })

      await store.upsertPluginConfig({
        id: 'plugin',
        module: './plugin.js',
        config: { key: 'value' },
        source: { type: 'npm' },
      })

      const parsed = YAML.parse(writtenContent)
      expect(parsed.plugins[0].config).toEqual({ key: 'value' })
      expect(parsed.plugins[0].source).toEqual({ type: 'npm' })
    })
  })

  describe('patchPluginConfig', () => {
    it('should patch existing plugin', async () => {
      const existingConfig = `plugins:
  - id: test-plugin
    module: ./test.js
    enabled: true`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(existingConfig)

      mockedFs.mkdir.mockResolvedValue(undefined)

      let writtenContent = ''
      mockedFs.write.mockImplementation(async (path: any, content: any) => {
        writtenContent = String(content)
        return undefined
      })

      const result = await store.patchPluginConfig('test-plugin', {
        enabled: false,
        config: { newKey: 'newValue' },
      })

      expect(result.id).toBe('test-plugin')
      const parsed = YAML.parse(writtenContent)
      expect(parsed.plugins[0].enabled).toBe(false)
      expect(parsed.plugins[0].config).toEqual({ newKey: 'newValue' })
    })

    it('should create plugin if not found', async () => {
      mockedFs.access.mockRejectedValue(new Error('Not found'))

      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.write.mockResolvedValue(undefined)

      let writtenContent = ''
      mockedFs.write.mockImplementation(async (path: any, content: any) => {
        writtenContent = String(content)
        return undefined
      })

      const result = await store.patchPluginConfig('new-plugin', {
        enabled: true,
      })

      expect(result.id).toBe('new-plugin')
      const parsed = YAML.parse(writtenContent)
      expect(parsed.plugins[0].id).toBe('new-plugin')
      expect(parsed.plugins[0].enabled).toBe(true)
      expect(parsed.plugins[0].module).toBeUndefined()
    })

    it('should update module path', async () => {
      const existingConfig = `plugins:
  - id: test-plugin
    module: ./old.js`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(existingConfig)

      mockedFs.mkdir.mockResolvedValue(undefined)

      let writtenContent = ''
      mockedFs.write.mockImplementation(async (path: any, content: any) => {
        writtenContent = String(content)
        return undefined
      })

      await store.patchPluginConfig('test-plugin', {
        module: './new.js',
      })

      const parsed = YAML.parse(writtenContent)
      expect(parsed.plugins[0].module).toMatch(/new\.js/)
    })

    it('should update source when provided', async () => {
      const existingConfig = `plugins:
  - id: test-plugin
    module: ./test.js
    enabled: true`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(existingConfig)

      mockedFs.mkdir.mockResolvedValue(undefined)

      let writtenContent = ''
      mockedFs.write.mockImplementation(async (path: any, content: any) => {
        writtenContent = String(content)
        return undefined
      })

      await store.patchPluginConfig('test-plugin', {
        source: { type: 'local' },
      })

      const parsed = YAML.parse(writtenContent)
      expect(parsed.plugins[0].source).toEqual({ type: 'local' })
    })

    it('should create plugin when missing with explicit module', async () => {
      mockedFs.access.mockRejectedValue(new Error('Not found'))

      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.write.mockResolvedValue(undefined)

      const result = await store.patchPluginConfig('new-plugin', {
        module: './custom.js',
        enabled: true,
      })

      expect(result.id).toBe('new-plugin')
    })

    it('should sanitize plugin ID', async () => {
      mockedFs.access.mockRejectedValue(new Error('Not found'))

      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.write.mockResolvedValue(undefined)

      const result = await store.patchPluginConfig('Bad ID@@@', {
        enabled: true,
      })

      expect(result.id).toMatch(/^[a-z0-9-]+$/i)
    })
  })

  describe('removePluginConfig', () => {
    it('should remove existing plugin', async () => {
      const existingConfig = `plugins:
  - id: plugin1
    module: ./plugin1.js
  - id: plugin2
    module: ./plugin2.js`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(existingConfig)

      mockedFs.mkdir.mockResolvedValue(undefined)

      let writtenContent = ''
      mockedFs.write.mockImplementation(async (path: any, content: any) => {
        writtenContent = String(content)
        return undefined
      })

      const result = await store.removePluginConfig('plugin1')

      expect(result.removed).toBe(true)
      expect(result.id).toBe('plugin1')

      const parsed = YAML.parse(writtenContent)
      expect(parsed.plugins).toHaveLength(1)
      expect(parsed.plugins[0].id).toBe('plugin2')
    })

    it('should return false for non-existent plugin', async () => {
      const existingConfig = `plugins:
  - id: plugin1
    module: ./plugin1.js`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(existingConfig)
      const result = await store.removePluginConfig('non-existent')

      expect(result.removed).toBe(false)
      expect(result.id).toBe('non-existent')
      expect(mockedFs.write).not.toHaveBeenCalled()
    })

    it('should sanitize plugin ID', async () => {
      const existingConfig = `plugins:
  - id: test-plugin
    module: ./test.js`

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(existingConfig)
      const result = await store.removePluginConfig('Test Plugin!!!')

      expect(result.id).toMatch(/^[a-z0-9-]+$/i)
    })
  })

  describe('edge Cases', () => {
    it('should handle empty plugin array', async () => {
      const yamlContent = 'plugins: []'

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(yamlContent)
      const result = await store.readPluginsConfig()

      expect(result.config.plugins).toEqual([])
    })

    it('should handle malformed YAML gracefully', async () => {
      const badYaml = 'plugins:\n  - id: test\n    invalid syntax here'

      mockedFs.access.mockResolvedValue(undefined)
      mockedFs.readText.mockResolvedValue(badYaml)
      const result = await store.readPluginsConfig()

      expect(result.exists).toBe(false)
      expect(result.config.plugins).toEqual([])
    })

    it('should handle very long plugin IDs', async () => {
      mockedFs.access.mockRejectedValue(new Error('Not found'))

      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.write.mockResolvedValue(undefined)

      const longId = 'a'.repeat(100)
      const result = await store.upsertPluginConfig({
        id: longId,
        module: './plugin.js',
      })

      // Should be truncated to 64 characters
      expect(result.id.length).toBeLessThanOrEqual(64)
    })

    it('should handle special characters in module paths', async () => {
      const specialPath = './plugin with spaces/index.js'
      const result = await store.normalizeModuleSpecifierForPluginsConfig(specialPath)

      expect(result.absolute).toContain('plugin with spaces')
    })
  })

  describe('internal helpers', () => {
    it('resolveDataDir should use bunRuntime.env when env is empty', async () => {
      const envModule = await import('@napgram/env-kit')

      envModule.env.DATA_DIR = ''
      bunRuntime.env.DATA_DIR = '/env/data'

      const result = store.__testing.resolveDataDir()

      expect(result).toBe(resolvePath('/env/data'))
      envModule.env.DATA_DIR = mockDataDir
    })

    it('resolveDataDir should fall back to default when env and process missing', async () => {
      const envModule = await import('@napgram/env-kit')

      envModule.env.DATA_DIR = ''
      delete bunRuntime.env.DATA_DIR

      const result = store.__testing.resolveDataDir()

      expect(result).toBe(resolvePath('/app/data'))
      envModule.env.DATA_DIR = mockDataDir
    })

    it('parseConfig should ignore non-string fields', () => {
      const parsed = store.__testing.parseConfig(JSON.stringify({
        plugins: [
          { id: 123, module: 456 },
          { id: 'ok', module: './ok.js' },
        ],
      }), '.json')

      expect(parsed.plugins).toHaveLength(1)
      expect(parsed.plugins[0].id).toBe('ok')
    })

    it('parseConfig should default to empty plugins when plugins is not an array', () => {
      const parsed = store.__testing.parseConfig(JSON.stringify({
        plugins: { id: 'bad', module: './bad.js' },
      }), '.json')

      expect(parsed.plugins).toHaveLength(0)
    })

    it('parseConfig should use JSON parser for non-YAML extension', () => {
      const yamlSpy = spyOn(YAML, 'parse')
      const jsonSpy = spyOn(JSON, 'parse')

      store.__testing.parseConfig('{"plugins":[]}', '.json')

      expect(jsonSpy).toHaveBeenCalled()
      expect(yamlSpy).not.toHaveBeenCalled()

      yamlSpy.mockRestore()
      jsonSpy.mockRestore()
    })

    it('inferIdFromModule should handle file URLs', () => {
      const result = store.__testing.inferIdFromModule('file:///test/data/plugins/index.js')

      expect(result).toBe('plugins')
    })

    it('inferIdFromModule should fall back when parent is missing', () => {
      const result = store.__testing.inferIdFromModule('/index.js')

      expect(result).toBe('plugin')
    })

    it('inferIdFromModule should fall back when base is empty', () => {
      const result = store.__testing.inferIdFromModule('')

      expect(result).toBe('plugin')
    })

    it('sanitizeId should fall back for empty values', () => {
      expect(store.__testing.sanitizeId('')).toBe('plugin')
      expect(store.__testing.sanitizeId('!!!')).toBe('plugin')
    })
  })
})
