import type { MessageEvent } from './interfaces-events.js'

export interface PluginSpec {
  id: string
  module: string
  enabled: boolean
  config?: any
  source?: {
    type: 'marketplace' | 'local'
    version?: string
    url?: string
  }
  load?: () => Promise<any>
}

export interface CommandConfig {
  name: string
  aliases?: string[]
  description?: string
  usage?: string
  adminOnly?: boolean
  permission?: {
    level?: number
    requireOwner?: boolean
  }
  handler: CommandHandler
}

export type CommandHandler = (event: MessageEvent, args: string[]) => void | Promise<void>
