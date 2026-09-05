import type { PluginInstance } from '../../core/lifecycle.js'
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { PluginLifecycleManager, PluginState } from '../../core/lifecycle.js'

// Mock plugin for testing
const mockPlugin = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  install: mock(),
  uninstall: mock(),
  reload: mock(),
}

// Create a properly mocked plugin context
function createMockPluginContext() {
  return {
    logger: { info: mock(), warn: mock(), error: mock(), debug: mock() },
    on: mock(),
    onUnload: mock(),
    triggerUnload: mock(),
    triggerReload: mock(),
    pluginId: 'test-plugin',
    config: {},
    apis: {},
    storage: { get: mock(), set: mock(), delete: mock(), clear: mock(), keys: mock() },
    eventBus: { on: mock(), off: mock(), publish: mock(), publishSync: mock(), clear: mock() },
    cleanup: mock(),
    message: {} as any,
    instance: {} as any,
    user: {} as any,
    group: {} as any,
    web: {} as any,
    command: mock().mockReturnThis(),
    onReload: mock(),
    commands: [] as any[],
    reloadCallbacks: [] as any[],
    unloadCallbacks: [] as any[],
    createMockMessageAPI: mock(),
    createMockInstanceAPI: mock(),
    createMockUserAPI: mock(),
    createMockGroupAPI: mock(),
    createMockWebAPI: mock(),
    getCommands: mock(),
  }
}

describe('pluginLifecycleManager', () => {
  let lifecycleManager: PluginLifecycleManager

  beforeEach(() => {
    lifecycleManager = new PluginLifecycleManager()
    mock.clearAllMocks()
  })

  it('should initialize', () => {
    expect(lifecycleManager).toBeInstanceOf(PluginLifecycleManager)
  })

  it('should install plugin correctly', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: mockPlugin as any,
      context: pluginContext as any as any,
      config: {},
      state: PluginState.Uninitialized,
    }

    await lifecycleManager.install(pluginInstance)

    expect(pluginInstance.state).toBe(PluginState.Installed)
    expect(mockPlugin.install).toHaveBeenCalled()
  })

  it('should fail install when already installed', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: mockPlugin as any,
      context: pluginContext as any as any,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.install(pluginInstance)

    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('already installed')
    expect(pluginInstance.state).toBe(PluginState.Error)
  })

  it('should handle install failure', async () => {
    const failingPlugin = {
      ...mockPlugin,
      install: mock().mockRejectedValue(new Error('Install failed')),
    }

    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'failing-plugin',
      plugin: failingPlugin as any,
      context: pluginContext as any as any,
      config: {},
      state: PluginState.Uninitialized,
    }

    const result = await lifecycleManager.install(pluginInstance)

    expect(result.success).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(pluginInstance.state).toBe(PluginState.Error)
    expect(failingPlugin.install).toHaveBeenCalled()
  })

  it('should uninstall plugin correctly', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, uninstall: mock() } as any,
      context: pluginContext as any as any,
      config: {},
      state: PluginState.Installed,
    }

    await lifecycleManager.uninstall(pluginInstance)

    expect(pluginInstance.state).toBe(PluginState.Uninstalled)
    expect(pluginContext.triggerUnload).toHaveBeenCalled()
  })

  it('should return early when plugin is already uninstalled', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, uninstall: mock() } as any,
      context: pluginContext as any as any,
      config: {},
      state: PluginState.Uninstalled,
    }

    const result = await lifecycleManager.uninstall(pluginInstance)

    expect(result.success).toBe(true)
    expect(result.duration).toBe(0)
    expect(pluginInstance.state).toBe(PluginState.Uninstalled)
    expect(pluginContext.triggerUnload).not.toHaveBeenCalled()
  })

  it('should handle uninstall failure', async () => {
    const pluginContext = {
      ...createMockPluginContext(),
      triggerUnload: mock().mockRejectedValue(new Error('Unload failed')),
    }

    const pluginInstance: PluginInstance = {
      id: 'failing-plugin',
      plugin: { ...mockPlugin, uninstall: mock() } as any,
      context: pluginContext as any as any,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.uninstall(pluginInstance)

    expect(result.success).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(pluginInstance.state).toBe(PluginState.Error)
  })

  it('should reload plugin correctly', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: mock() },
      context: pluginContext as any,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.reload(pluginInstance, { newConfig: true })

    expect(result.success).toBe(true)
    expect(pluginInstance.config).toEqual({ newConfig: true })
    expect(pluginContext.triggerReload).toHaveBeenCalled()
  })

  it('should reload plugin via uninstall/install when no reload hook', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: undefined } as any,
      context: pluginContext as any as any,
      config: { oldConfig: true },
      state: PluginState.Installed,
    }

    const uninstallSpy = spyOn(lifecycleManager, 'uninstall').mockResolvedValue({
      success: true,
      duration: 1,
    })
    const installSpy = spyOn(lifecycleManager, 'install').mockResolvedValue({
      success: true,
      duration: 1,
    })

    const newConfig = { newConfig: true }
    const result = await lifecycleManager.reload(pluginInstance, newConfig)

    expect(result.success).toBe(true)
    expect(uninstallSpy).toHaveBeenCalledTimes(1)
    expect(installSpy).toHaveBeenCalledTimes(1)
    expect(pluginContext.triggerReload).toHaveBeenCalled()
    expect(pluginInstance.config).toEqual(newConfig)
    expect((pluginInstance.context as any).config).toEqual(newConfig)
    expect(pluginInstance.state).toBe(PluginState.Uninitialized)
  })

  it('should handle reload failure', async () => {
    const pluginContext = {
      ...createMockPluginContext(),
      triggerReload: mock().mockRejectedValue(new Error('Reload failed')),
    }

    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: mock() },
      context: pluginContext as any,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.reload(pluginInstance)

    expect(result.success).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
  })

  it('should install all plugins', async () => {
    const pluginContext1 = createMockPluginContext()
    const pluginContext2 = createMockPluginContext()

    const pluginInstances: PluginInstance[] = [
      {
        id: 'plugin-1',
        plugin: mockPlugin as any,
        context: pluginContext1 as any,
        config: {},
        state: PluginState.Uninitialized,
      },
      {
        id: 'plugin-2',
        plugin: { ...mockPlugin, id: 'plugin-2' } as any,
        context: pluginContext2 as any,
        config: {},
        state: PluginState.Uninitialized,
      },
    ]

    const result = await lifecycleManager.installAll(pluginInstances)

    expect(result.succeeded).toHaveLength(2)
    expect(result.failed).toHaveLength(0)
    expect(pluginInstances[0].state).toBe(PluginState.Installed)
    expect(pluginInstances[1].state).toBe(PluginState.Installed)
  })

  it('should handle installAll with some failures', async () => {
    const pluginContext1 = createMockPluginContext()
    const pluginContext2 = createMockPluginContext()

    const failingPlugin = {
      ...mockPlugin,
      id: 'plugin-2',
      install: mock().mockRejectedValue(new Error('Install failed')),
    }

    const pluginInstances: PluginInstance[] = [
      {
        id: 'plugin-1',
        plugin: mockPlugin as any,
        context: pluginContext1 as any,
        config: {},
        state: PluginState.Uninitialized,
      },
      {
        id: 'plugin-2',
        plugin: failingPlugin as any,
        context: pluginContext2 as any,
        config: {},
        state: PluginState.Uninitialized,
      },
    ]

    const result = await lifecycleManager.installAll(pluginInstances)

    expect(result.succeeded).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].id).toBe('plugin-2')
    expect(pluginInstances[0].state).toBe(PluginState.Installed)
    expect(pluginInstances[1].state).toBe(PluginState.Error)
  })

  it('should uninstall all plugins', async () => {
    const pluginContext1 = createMockPluginContext()
    const pluginContext2 = createMockPluginContext()

    const pluginInstances: PluginInstance[] = [
      {
        id: 'plugin-1',
        plugin: { ...mockPlugin, uninstall: mock() },
        context: pluginContext1 as any,
        config: {},
        state: PluginState.Installed,
      },
      {
        id: 'plugin-2',
        plugin: { ...mockPlugin, id: 'plugin-2', uninstall: mock() },
        context: pluginContext2 as any,
        config: {},
        state: PluginState.Installed,
      },
    ]

    const result = await lifecycleManager.uninstallAll(pluginInstances)

    expect(result.succeeded).toHaveLength(2)
    expect(result.failed).toHaveLength(0)
    expect(pluginInstances[0].state).toBe(PluginState.Uninstalled)
    expect(pluginInstances[1].state).toBe(PluginState.Uninstalled)
  })

  it('should handle uninstallAll with some failures', async () => {
    const pluginContext1 = createMockPluginContext()
    const pluginContext2 = {
      ...createMockPluginContext(),
      triggerUnload: mock().mockRejectedValue(new Error('Unload failed')),
    }

    const pluginInstances: PluginInstance[] = [
      {
        id: 'plugin-1',
        plugin: { ...mockPlugin, uninstall: mock() } as any,
        context: pluginContext1 as any,
        config: {},
        state: PluginState.Installed,
      },
      {
        id: 'plugin-2',
        plugin: { ...mockPlugin, id: 'plugin-2', uninstall: mock() } as any,
        context: pluginContext2 as any,
        config: {},
        state: PluginState.Installed,
      },
    ]

    const result = await lifecycleManager.uninstallAll(pluginInstances)

    expect(result.succeeded).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].id).toBe('plugin-2')
    expect(pluginInstances[0].state).toBe(PluginState.Uninstalled)
    expect(pluginInstances[1].state).toBe(PluginState.Error)
  })

  it('should update config during reload with custom reload hook (line 202)', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: mock().mockResolvedValue(undefined) } as any,
      context: pluginContext as any as any,
      config: { old: true },
      state: PluginState.Installed,
    }

    const newConfig = { new: true }
    await lifecycleManager.reload(pluginInstance, newConfig)

    expect(pluginInstance.config).toEqual(newConfig)
    expect((pluginInstance.context as any).config).toEqual(newConfig)
  })

  it('should update config during reload via uninstall/install (line 190)', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: undefined } as any,
      context: pluginContext as any as any,
      config: { old: true },
      state: PluginState.Installed,
    }

    // Ensure uninstall/install succeed
    spyOn(lifecycleManager, 'uninstall').mockResolvedValue({ success: true, duration: 1 })
    spyOn(lifecycleManager, 'install').mockResolvedValue({ success: true, duration: 1 })

    const newConfig = { new: true }
    await lifecycleManager.reload(pluginInstance, newConfig)

    expect(pluginInstance.config).toEqual(newConfig)
    expect((pluginInstance.context as any).config).toEqual(newConfig)
  })

  it('should report health and stats', () => {
    const healthyInstance: PluginInstance = {
      id: 'healthy',
      plugin: mockPlugin,
      context: createMockPluginContext() as any,
      config: {},
      state: PluginState.Installed,
    }
    const errorInstance: PluginInstance = {
      id: 'error',
      plugin: mockPlugin,
      context: createMockPluginContext() as any,
      config: {},
      state: PluginState.Error,
      error: new Error('fail'),
    }
    const uninstalledInstance: PluginInstance = {
      id: 'uninstalled',
      plugin: mockPlugin,
      context: createMockPluginContext() as any,
      config: {},
      state: PluginState.Uninstalled,
    }

    expect(lifecycleManager.isHealthy(healthyInstance)).toBe(true)
    expect(lifecycleManager.isHealthy(errorInstance)).toBe(false)

    const stats = lifecycleManager.getStats([healthyInstance, errorInstance, uninstalledInstance])
    expect(stats).toEqual({
      total: 3,
      installed: 1,
      error: 1,
      uninstalled: 1,
    })
  })

  it('should reload plugin without newConfig', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: mock() } as any,
      context: pluginContext as any as any,
      config: { old: true },
      state: PluginState.Installed,
    }

    await lifecycleManager.reload(pluginInstance)
    expect(pluginInstance.config).toEqual({ old: true })
  })

  it('should uninstall plugin without uninstall hook', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, uninstall: undefined } as any,
      context: pluginContext as any as any,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.uninstall(pluginInstance)
    expect(result.success).toBe(true)
  })

  it('should handle empty lists for batch operations', async () => {
    const installResult = await lifecycleManager.installAll([])
    expect(installResult.succeeded).toHaveLength(0)
    expect(installResult.failed).toHaveLength(0)

    const uninstallResult = await lifecycleManager.uninstallAll([])
    expect(uninstallResult.succeeded).toHaveLength(0)
    expect(uninstallResult.failed).toHaveLength(0)
  })

  it('should reload plugin via uninstall/install without new config (line 190)', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin-no-config-reload',
      plugin: { ...mockPlugin, reload: undefined } as any,
      context: pluginContext as any as any,
      config: { existing: true },
      state: PluginState.Installed,
    }

    spyOn(lifecycleManager, 'uninstall').mockResolvedValue({ success: true, duration: 1 })
    spyOn(lifecycleManager, 'install').mockResolvedValue({ success: true, duration: 1 })

    // Call reload without newConfig
    await lifecycleManager.reload(pluginInstance)

    // Config should remain unchanged
    expect(pluginInstance.config).toEqual({ existing: true })
    // Verify uninstall/install cycle happen
    expect(lifecycleManager.uninstall).toHaveBeenCalled()
    expect(lifecycleManager.install).toHaveBeenCalled()
  })

  it('should handle installAll/uninstallAll with malformed results (lines 241, 276)', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance = {
      id: 'p1',
      plugin: mockPlugin,
      context: pluginContext as any,
      config: {},
      state: PluginState.Uninitialized,
    } as PluginInstance

    // Mock install to return success: false but no error (should trigger implicit else)
    spyOn(lifecycleManager, 'install').mockResolvedValue({ success: false, duration: 0 } as any)
    const installRes = await lifecycleManager.installAll([pluginInstance])
    expect(installRes.succeeded).toHaveLength(0)
    expect(installRes.failed).toHaveLength(0)

    // Mock uninstall to return success: false but no error
    spyOn(lifecycleManager, 'uninstall').mockResolvedValue({ success: false, duration: 0 } as any)
    const uninstallRes = await lifecycleManager.uninstallAll([pluginInstance])
    expect(uninstallRes.succeeded).toHaveLength(0)
    expect(uninstallRes.failed).toHaveLength(0)
  })
})
