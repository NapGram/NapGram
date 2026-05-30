import type { MessageEvent } from './interfaces.js'
import { globalEventBus } from './event-bus.js'

/**
 * 事件发布器
 * 提供给插件系统外部（如 feature-kit）发布事件的工具
 */
export const EventPublisher = {
  /**
   * 发布消息事件
   */
  async publishMessage(event: MessageEvent): Promise<void> {
    await globalEventBus.publish('message', event)
  },

  /**
   * 发布消息创建事件 (兼容性保留)
   */
  async publishMessageCreated(instanceId: number, message: any, pair?: any): Promise<void> {
    await globalEventBus.publish('message-created', { instanceId, message, pair, timestamp: Date.now() })
  },

  async publishNotice(event: any): Promise<void> {
    await globalEventBus.publish('notice', event)
  },

  async publishFriendRequest(event: any): Promise<void> {
    await globalEventBus.publish('friend-request', event)
  },

  async publishGroupRequest(event: any): Promise<void> {
    await globalEventBus.publish('group-request', event)
  },

  async publishInstanceStatus(event: any): Promise<void> {
    await globalEventBus.publish('instance-status', event)
  }
}

/**
 * 获取全局事件发布器
 * 为保持与旧代码兼容
 */
export function getEventPublisher() {
  return EventPublisher
}
