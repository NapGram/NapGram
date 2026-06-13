/**
 * Re-export PerformanceMonitor from @napgram/infra-kit to avoid duplication.
 * This ensures a single singleton instance across the entire application.
 */
export {
  PerformanceMonitor,
  performanceMonitor,
  startMonitoring,
} from '@napgram/infra-kit'

export type {
  PerformanceMetrics,
  PerformanceStats,
} from '@napgram/infra-kit'
