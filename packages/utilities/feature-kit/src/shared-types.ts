// ============================================================================
// 从已有包导入（优先使用）
// ============================================================================
import * as infraKit from '@napgram/infra-kit'
import { ForwardMap as actualForwardMap, and as actualAnd, count as actualCount, db as actualDb, desc as actualDesc, eq as actualEq, gt as actualGt, gte as actualGte, lt as actualLt, lte as actualLte, or as actualOr, schema as actualSchema, sql as actualSql } from '@napgram/db-kit'
import type { ForwardMap as ForwardMapType } from '@napgram/db-kit'
import { env as actualEnv, flags as actualFlags } from '@napgram/env-kit'
import { getLogger as actualGetLogger } from '@napgram/logger-kit'
import { DurationParser as actualDurationParser, md5Hex as actualMd5Hex, temp as actualTemp } from '@napgram/runtime-kit'

const compat = infraKit as Record<string, any>
const noopPerformanceMonitor = {
  recordCall(..._args: any[]) {},
  recordError(..._args: any[]) {},
  recordMessage(..._args: any[]) {},
}

function getCompatExport<T>(key: string, fallback: T): T {
  return key in compat ? compat[key] : fallback
}

export const performanceMonitor = getCompatExport('performanceMonitor', noopPerformanceMonitor)
export * from '@napgram/message-kit' // 包含 messageConverter
export { silk } from '@napgram/media-kit'
export type { ForwardPairRecord } from '@napgram/db-kit'
export type ForwardMap = ForwardMapType
export const db = getCompatExport('db', actualDb)
export const schema = getCompatExport('schema', actualSchema)
export const eq = getCompatExport('eq', actualEq)
export const and = getCompatExport('and', actualAnd)
export const or = getCompatExport('or', actualOr)
export const lt = getCompatExport('lt', actualLt)
export const lte = getCompatExport('lte', actualLte)
export const gt = getCompatExport('gt', actualGt)
export const gte = getCompatExport('gte', actualGte)
export const desc = getCompatExport('desc', actualDesc)
export const sql = getCompatExport('sql', actualSql)
export const count = getCompatExport('count', actualCount)
export const ForwardMap = getCompatExport('ForwardMap', actualForwardMap)
export const env = getCompatExport('env', actualEnv)
export const flags = getCompatExport('flags', actualFlags)
export const getLogger = getCompatExport('getLogger', actualGetLogger)

// ============================================================================
// 核心领域模型和插件接口（从 Kit 导入）
import type { IInstance as Instance } from '@napgram/runtime-kit'
export const temp = getCompatExport('temp', actualTemp)
export const md5Hex = getCompatExport<{ md5Hex?: typeof actualMd5Hex } | undefined>('hashing', undefined)?.md5Hex ?? actualMd5Hex
export const DurationParser = getCompatExport('DurationParser', actualDurationParser)

// 基础设施接口（从客户端包导入）
export type { IQQClient } from '@napgram/qq-client'
export type { default as Telegram } from '@napgram/telegram-client'

// 插件系统
import type { MessageSegment } from '@napgram/message-kit'
export { getEventPublisher } from '@napgram/plugin-kit'

// 领域常量和工具
export { PermissionChecker } from '@napgram/auth-kit'

// 导出类型
export type {
    Instance,
    MessageSegment,
}
