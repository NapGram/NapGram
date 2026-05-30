/**
 * Core runtime kit exports.
 * This file exports only runtime-kit's own implementations.
 * Consumers should import db/env/logger directly from their respective kits.
 */

// New Runtime Abstraction
export * from './runtime-types.js'
export * from './config-store.js'
export * from './runtime-holder.js'
export { InstanceRegistry } from './runtime-holder.js'
export { PermissionChecker } from './permission-checker.js'

export { ApiResponse } from './utils/api-response.js'
export { convert } from '@napgram/media-kit'
export { convert as default } from '@napgram/media-kit'
export { DurationParser } from './utils/duration-parser.js'
export * as hashingUtils from './utils/hashing.js'
export { md5Hex } from './utils/hashing.js'

// Re-exports kept for backward compatibility with existing consumers
// TODO: consumers should migrate to direct imports from @napgram/db-kit, @napgram/env-kit, @napgram/logger-kit
export { db, drizzleDb, schema, eq, and, or, gte, lte, count, sql, desc } from '@napgram/db-kit'
export { env } from '@napgram/env-kit'
export { getLogger } from '@napgram/logger-kit'
export * as temp from './temp.js'
