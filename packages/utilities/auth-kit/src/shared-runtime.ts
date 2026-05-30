import {
  and,
  count,
  db,
  eq,
  gt,
  isNull,
  lt,
  or,
  schema,
} from '@napgram/db-kit'
import { getLogger } from '@napgram/logger-kit'

export { db, schema, eq, and, or, gt, isNull, lt, count, getLogger }

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
