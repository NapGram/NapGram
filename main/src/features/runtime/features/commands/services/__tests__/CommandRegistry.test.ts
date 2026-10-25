import { beforeEach, describe, expect, it } from 'bun:test'
import { CommandRegistry } from '../CommandRegistry.js'
import type { Command } from '../../types.js'

function makeCommand(name: string, aliases?: string[]): Command {
  return {
    name,
    description: `${name} command`,
    handler: async () => {},
    aliases,
  } as Command
}

describe('CommandRegistry', () => {
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
  })

  it('registers commands and resolves them by name', () => {
    const help = makeCommand('help')
    registry.register(help)
    expect(registry.get('help')).toBe(help)
    expect(registry.get('unknown')).toBeUndefined()
  })

  it('registers aliases that resolve to the same command', () => {
    const cmd = makeCommand('bind', ['b', 'connect'])
    registry.register(cmd)
    expect(registry.get('b')).toBe(cmd)
    expect(registry.get('connect')).toBe(cmd)
  })

  it('exposes all registered entries including aliases', () => {
    registry.register(makeCommand('help'))
    registry.register(makeCommand('bind', ['b']))
    expect(registry.getAll().size).toBe(3)
  })

  it('counts unique commands without aliases', () => {
    registry.register(makeCommand('help'))
    registry.register(makeCommand('bind', ['b', 'connect']))
    expect(registry.getUniqueCommandCount()).toBe(2)
  })

  it('clears every registration', () => {
    registry.register(makeCommand('help'))
    registry.register(makeCommand('bind', ['b']))
    registry.clear()
    expect(registry.getAll().size).toBe(0)
    expect(registry.getUniqueCommandCount()).toBe(0)
    expect(registry.get('help')).toBeUndefined()
  })

  it('uses a slash command prefix', () => {
    expect(registry.prefix).toBe('/')
  })
})
