import type { AppLogger } from '@napgram/logger-kit'
import type { IQQClient } from '../../../infrastructure/clients/qq'

/**
 * 为 QQ 客户端的媒体下载方法添加诊断日志包装。
 * 记录下载失败/异常情况，方便排查 FTN URL 过期等问题。
 */
export function enableQQMediaDownloadDiagnostics(qqClient: IQQClient, log: AppLogger): void {
  const qq = qqClient as any
  if (qq.__napgramMediaWrapped)
    return
  qq.__napgramMediaWrapped = true

  const rawGetFile = typeof qq.getFile === 'function' ? qq.getFile.bind(qq) : undefined
  const rawDownloadFile = typeof qq.downloadFile === 'function' ? qq.downloadFile.bind(qq) : undefined
  const rawDownloadFileStreamToFile = typeof qq.downloadFileStreamToFile === 'function'
    ? qq.downloadFileStreamToFile.bind(qq)
    : undefined

  if (rawDownloadFile) {
    qq.downloadFile = async (url: string, threadCount?: number, headers?: Record<string, string>) => {
      try {
        return await rawDownloadFile(url, threadCount, headers)
      }
      catch (error) {
        const message = String((error as Error)?.message || error)
        if (/file not found/i.test(message)) {
          log.warn(`download_file file not found (url=${url})`)
        }
        else {
          log.warn(`download_file failed (url=${url}): ${message}`)
        }
        throw error
      }
    }
  }

  if (rawDownloadFileStreamToFile) {
    qq.downloadFileStreamToFile = async (fileId: string, options?: { chunkSize?: number, filename?: string }) => {
      const normalizedId = typeof fileId === 'string' ? fileId.replace(/^\//, '') : fileId
      try {
        const res = await rawDownloadFileStreamToFile(normalizedId, options)
        if (!res?.path) {
          log.warn(`downloadFileStreamToFile returned without local path (fileId=${normalizedId})`)
        }
        return res
      }
      catch (error) {
        log.warn(`downloadFileStreamToFile failed (fileId=${normalizedId}): ${String((error as Error)?.message || error)}`)
        throw error
      }
    }
  }

  if (rawGetFile) {
    qq.getFile = async (fileId: string) => {
      const normalizedId = typeof fileId === 'string' ? fileId.replace(/^\//, '') : fileId

      if (rawDownloadFileStreamToFile) {
        try {
          const streamed = await rawDownloadFileStreamToFile(normalizedId, { chunkSize: 64 * 1024 })
          const localPath = streamed?.path
          if (typeof localPath === 'string' && localPath.startsWith('/')) {
            log.debug(`stream-first getFile success (fileId=${normalizedId}, path=${localPath})`)
            return {
              ...(streamed?.info ? { info: streamed.info } : {}),
              file: localPath,
              path: localPath,
            }
          }
          log.warn(`stream-first getFile no local path (fileId=${normalizedId})`)
        }
        catch (error) {
          log.warn(`stream-first getFile failed (fileId=${normalizedId}), fallback get_file: ${String((error as Error)?.message || error)}`)
        }
      }

      const result = await rawGetFile(normalizedId)
      if (!result) {
        log.warn(`get_file returned empty (fileId=${normalizedId})`)
      }
      return result
    }
  }
}
