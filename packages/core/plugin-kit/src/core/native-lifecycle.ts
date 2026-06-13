/**
 * 原生插件实例生命周期辅助
 *
 * 用于把 instance-status 事件转换为 attach / detach 生命周期。
 */

import type {
  EventSubscription,
  InstanceStatusEvent,
  PluginContext,
  PluginRuntimeInstance,
} from './interfaces.js'

export interface NativeInstanceLifecycleHandlers<TInstance extends PluginRuntimeInstance = PluginRuntimeInstance> {
  attach: (instance: TInstance) => boolean | void | Promise<boolean | void>
  detach: (instance: TInstance) => void | Promise<void>
  shouldAttach?: (instance: TInstance) => boolean
}

export interface NativeInstanceLifecycle {
  refresh: () => Promise<void>
  dispose: () => Promise<void>
}

function isRunningInstance(instance: PluginRuntimeInstance): boolean {
  if (instance.status === 'running') {
    return true
  }

  return Boolean(instance.qqClient?.isConnected && instance.tgBot?.isRunning)
}

function isDetachingStatus(status: InstanceStatusEvent['status']): boolean {
  return status === 'stopping' || status === 'stopped' || status === 'error'
}

/**
 * 将 instance-status 事件绑定为按实例的 attach / detach 生命周期。
 */
export async function bindInstanceLifecycle<TInstance extends PluginRuntimeInstance = PluginRuntimeInstance>(
  ctx: Pick<PluginContext, 'native' | 'on' | 'logger'>,
  handlers: NativeInstanceLifecycleHandlers<TInstance>,
): Promise<NativeInstanceLifecycle> {
  const attached = new Map<number, TInstance>()
  const attaching = new Map<number, Promise<void>>()

  const attachInstance = async (instanceId: number): Promise<void> => {
    if (attached.has(instanceId) || attaching.has(instanceId)) {
      return
    }

    const instance = ctx.native.getInstance(instanceId) as TInstance | undefined
    if (!instance || !isRunningInstance(instance)) {
      return
    }

    if (handlers.shouldAttach && !handlers.shouldAttach(instance)) {
      return
    }

    const pending = (async () => {
      try {
        try {
          const attachedNow = await handlers.attach(instance)
          if (attachedNow === false) {
            return
          }

          attached.set(instanceId, instance)
        }
        catch (error) {
          ctx.logger.error({ error, instanceId }, 'Failed to attach native instance lifecycle')
        }
      }
      finally {
        attaching.delete(instanceId)
      }
    })()

    attaching.set(instanceId, pending)
    await pending
  }

  const detachInstance = async (instanceId: number): Promise<void> => {
    const instance = attached.get(instanceId) ?? ctx.native.getInstance(instanceId) as TInstance | undefined
    if (!instance) {
      attaching.delete(instanceId)
      return
    }

    try {
      await handlers.detach(instance)
    }
    catch (error) {
      ctx.logger.error({ error, instanceId }, 'Failed to detach native instance lifecycle')
    }
    finally {
      attached.delete(instanceId)
      attaching.delete(instanceId)
    }
  }

  const subscription: EventSubscription = ctx.on('instance-status', async (event) => {
    if (event.status === 'running') {
      await attachInstance(event.instanceId)
      return
    }

    if (isDetachingStatus(event.status)) {
      await detachInstance(event.instanceId)
    }
  })

  await refresh()

  async function refresh(): Promise<void> {
    const instances = ctx.native.getInstances() as TInstance[]
    for (const instance of instances) {
      if (!isRunningInstance(instance)) {
        continue
      }

      if (handlers.shouldAttach && !handlers.shouldAttach(instance)) {
        continue
      }

      await attachInstance(Number(instance.id ?? 0))
    }
  }

  async function dispose(): Promise<void> {
    subscription.unsubscribe()

    for (const [instanceId] of attached.entries()) {
      await detachInstance(instanceId)
    }
  }

  return { refresh, dispose }
}
