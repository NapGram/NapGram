export class ApiResponse {
  static success<T = unknown>(data?: T, message?: string) {
    const response: { success: true, data?: T, message?: string } = { success: true }

    if (data !== undefined) {
      response.data = data
    }

    if (message) {
      response.message = message
    }

    return response
  }

  static error(message: string, error?: unknown) {
    const response: { success: false, message: string, error?: string } = {
      success: false,
      message,
    }

    if (error) {
      response.error = typeof error === 'string' ? error : ((error as any)?.message || String(error))
    }

    return response
  }

  static paginated<T = unknown>(items: T[], total: number, page: number, pageSize: number) {
    return {
      success: true as const,
      items,
      total,
      page,
      pageSize,
    }
  }
}

export interface ApiSuccessResponse<T = unknown> {
  success: true
  data?: T
  message?: string
}

export interface ApiErrorResponse {
  success: false
  message: string
  error?: string
  details?: unknown
}

export interface ApiPaginatedResponse<T = unknown> {
  success: true
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type ApiResult<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse
