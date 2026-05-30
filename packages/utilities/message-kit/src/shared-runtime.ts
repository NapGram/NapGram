import * as infraKit from '@napgram/infra-kit'
import { db as actualDb, eq as actualEq, schema as actualSchema } from '@napgram/db-kit'
import { env as actualEnv } from '@napgram/env-kit'
import { getLogger as actualGetLogger } from '@napgram/logger-kit'
import convert from '@napgram/runtime-kit'
import type { IInstance as Instance } from '@napgram/runtime-kit'

const compat = infraKit as Record<string, any>

function getCompatExport<T>(key: string, fallback: T): T {
  return key in compat ? compat[key] : fallback
}

export type { Instance }

export const db = getCompatExport('db', actualDb)
export const schema = getCompatExport('schema', actualSchema)
export const eq = getCompatExport('eq', actualEq)
export const env = getCompatExport('env', actualEnv)
export const getLogger = getCompatExport('getLogger', actualGetLogger)
export const qface = getCompatExport<Record<number, string>>('qface', {})
export { convert }
