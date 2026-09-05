import { mock } from 'bun:test'

const defaultNapLinkInstance = {
  on: mock(),
  connect: mock(),
  disconnect: mock(),
  api: {},
}

export class NapLink {
  constructor(...args: any[]) {
    const ctor = (globalThis as any).__naplinkMockConstructor || (() => {})
    ctor(...args)
    return (globalThis as any).__naplinkMockInstance || defaultNapLinkInstance
  }
}
