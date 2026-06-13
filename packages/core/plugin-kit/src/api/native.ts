/**
 * NapGram 原生实例访问器
 *
 * 为特权插件提供对运行时真实实例对象的只读访问。
 */

import type {
  PluginInstanceResolver,
  PluginInstancesResolver,
  PluginNativeInstanceAPI,
  PluginRuntimeInstance,
} from '../core/interfaces.js'

/**
 * 原生实例访问器实现
 */
export class NativeInstanceAPIImpl implements PluginNativeInstanceAPI {
  constructor(
    private readonly instanceResolver?: PluginInstanceResolver,
    private readonly instancesResolver?: PluginInstancesResolver,
  ) {}

  getInstance(instanceId: number): PluginRuntimeInstance | undefined {
    return this.instanceResolver?.(instanceId)
  }

  getInstances(): PluginRuntimeInstance[] {
    return this.instancesResolver?.() ?? []
  }
}

/**
 * 创建原生实例访问器
 */
export function createNativeAPI(
  instanceResolver?: PluginInstanceResolver,
  instancesResolver?: PluginInstancesResolver,
): PluginNativeInstanceAPI {
  return new NativeInstanceAPIImpl(instanceResolver, instancesResolver)
}
