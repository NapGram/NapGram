import { vi } from 'vitest'

const defaultNapLinkInstance = {
  on: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  api: {},
}

export class NapLink {
  constructor(...args: any[]) {
    const ctor = (globalThis as any).__naplinkMockConstructor || (() => {})
    ctor(...args)
    return (globalThis as any).__naplinkMockInstance || defaultNapLinkInstance
  }
}
