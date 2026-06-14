import type { PluginContext } from './interfaces-api.js'

export interface NapGramPlugin {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  homepage?: string
  defaultConfig?: any
  exports?: Record<string, unknown>
  permissions?: PluginPermissions
  install: (ctx: PluginContext, config?: any) => void | Promise<void>
  uninstall?: () => void | Promise<void>
  reload?: () => void | Promise<void>
  drizzleSchema?: Record<string, unknown>
}

export interface PluginPermissions {
  instances?: number[]
  network?: NetworkPermission
  filesystem?: FilesystemPermission
  database?: DatabasePermission
}

export interface NetworkPermission {
  enabled: boolean
  allowList?: string[]
}

export interface FilesystemPermission {
  enabled: boolean
  allowList?: string[]
}

export interface DatabasePermission {
  enabled: boolean
  tables?: string[]
}
