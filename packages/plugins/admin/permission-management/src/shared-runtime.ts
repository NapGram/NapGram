import * as infraKit from '@napgram/infra-kit'
import * as runtimeKit from '@napgram/runtime-kit'
import {
  and as actualAnd,
  drizzleDb as actualDrizzleDb,
  eq as actualEq,
  sql as actualSql,
} from '@napgram/db-kit'
import { env as actualEnv } from '@napgram/env-kit'
import { getLogger as actualGetLogger } from '@napgram/logger-kit'
import { InstanceRegistry as actualInstanceRegistry } from '@napgram/runtime-kit'
import type { IInstance } from '@napgram/runtime-kit'

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

export const drizzleDb = getCompatExport(actualDrizzleDb, 'drizzleDb', 'db')
export const getLogger = getCompatExport(actualGetLogger, 'getLogger')
export const sql = getCompatExport(actualSql, 'sql')
export const eq = getCompatExport(actualEq, 'eq')
export const and = getCompatExport(actualAnd, 'and')
export const env = getCompatExport(actualEnv, 'env')
export const InstanceRegistry = getCompatExport(actualInstanceRegistry, 'InstanceRegistry')
export type { IInstance }
