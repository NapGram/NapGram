import * as infraKit from '@napgram/infra-kit'
import * as runtimeKit from '@napgram/runtime-kit'
import { env as actualEnv } from '@napgram/env-kit'
import { getLogger as actualGetLogger } from '@napgram/logger-kit'
import {
  getGlobalRuntime as actualGetGlobalRuntime,
  patchPluginConfig as actualPatchPluginConfig,
  readPluginsConfig as actualReadPluginsConfig,
  removePluginConfig as actualRemovePluginConfig,
  upsertPluginConfig as actualUpsertPluginConfig,
} from '@napgram/runtime-kit'

const infra = infraKit as Record<string, any>
const runtime = runtimeKit as Record<string, any>

function getCompatExport<T>(fallback: T, ...keys: string[]): T {
  for (const key of keys) {
    if (key in infra)
      return infra[key] as T
    if (key in runtime)
      return runtime[key] as T
  }
  return fallback
}

export const env = getCompatExport(actualEnv, 'env')
export const getLogger = getCompatExport(actualGetLogger, 'getLogger')
export const getGlobalRuntime = getCompatExport(actualGetGlobalRuntime, 'getGlobalRuntime')
export const readPluginsConfig = getCompatExport(actualReadPluginsConfig, 'readPluginsConfig')
export const upsertPluginConfig = getCompatExport(actualUpsertPluginConfig, 'upsertPluginConfig')
export const patchPluginConfig = getCompatExport(actualPatchPluginConfig, 'patchPluginConfig')
export const removePluginConfig = getCompatExport(actualRemovePluginConfig, 'removePluginConfig')
