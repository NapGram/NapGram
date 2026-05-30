import * as infraKit from '@napgram/infra-kit'
import {
  and as actualAnd,
  count as actualCount,
  db as actualDb,
  eq as actualEq,
  gt as actualGt,
  isNull as actualIsNull,
  lt as actualLt,
  or as actualOr,
  schema as actualSchema,
} from '@napgram/db-kit'
import { getLogger as actualGetLogger } from '@napgram/logger-kit'

const compat = infraKit as Record<string, any>

function getCompatExport<T>(key: string, fallback: T): T {
  return key in compat ? compat[key] : fallback
}

export const db = getCompatExport('db', actualDb)
export const schema = getCompatExport('schema', actualSchema)
export const eq = getCompatExport('eq', actualEq)
export const and = getCompatExport('and', actualAnd)
export const or = getCompatExport('or', actualOr)
export const gt = getCompatExport('gt', actualGt)
export const isNull = getCompatExport('isNull', actualIsNull)
export const lt = getCompatExport('lt', actualLt)
export const count = getCompatExport('count', actualCount)
export const getLogger = getCompatExport('getLogger', actualGetLogger)

export function stringifyBigInts(obj: any): any {
  if (obj === null || obj === undefined)
    return obj
  if (typeof obj === 'bigint')
    return obj.toString()
  if (Array.isArray(obj))
    return obj.map(item => stringifyBigInts(item))
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, stringifyBigInts(value)]))
  }
  return obj
}
