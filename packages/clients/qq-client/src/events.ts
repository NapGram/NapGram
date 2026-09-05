export type EventHandler = (...args: any[]) => void

export class EventEmitter {
  private readonly listeners = new Map<string, Set<EventHandler>>()

  on(event: string, handler: EventHandler): this {
    let handlers = this.listeners.get(event)
    if (!handlers) {
      handlers = new Set()
      this.listeners.set(event, handlers)
    }
    handlers.add(handler)
    return this
  }

  off(event: string, handler: EventHandler): this {
    const handlers = this.listeners.get(event)
    handlers?.delete(handler)
    if (handlers?.size === 0)
      this.listeners.delete(event)
    return this
  }

  once(event: string, handler: EventHandler): this {
    const wrapped: EventHandler = (...args) => {
      this.off(event, wrapped)
      handler(...args)
    }
    return this.on(event, wrapped)
  }

  emit(event: string, ...args: any[]): boolean {
    const handlers = this.listeners.get(event)
    if (!handlers)
      return false
    for (const handler of [...handlers])
      handler(...args)
    return true
  }
}
