import type { AppLogger } from '@napgram/logger-kit'

const TRANSIENT_DB_FRAGMENTS = [
  'terminating connection due to administrator command',
  'server closed the connection unexpectedly',
  'Connection terminated',
  'Connection terminated unexpectedly',
  'ECONNRESET',
  '57P01',
  '57P02',
  '57P03',
]

export function isTransientDbError(error: unknown): boolean {
  const message = String((error as Error)?.message || error)
  return TRANSIENT_DB_FRAGMENTS.some(fragment => message.includes(fragment))
}

export async function withDbRetry<T>(
  action: () => Promise<T>,
  context: string,
  log: AppLogger,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action()
    }
    catch (error) {
      if (!isTransientDbError(error) || attempt === maxAttempts) {
        throw error
      }
      const delay = 250 * attempt
      log.warn({ error, attempt, delay }, `Transient DB error during ${context}, retrying...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error(`Failed to execute ${context}`)
}
