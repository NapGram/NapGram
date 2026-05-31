import { describe, expect, it } from 'vitest'
import { ApiResponse } from '../apiResponse'

describe('ApiResponse', () => {
  describe('success()', () => {
    it('returns a success response with no data or message', () => {
      const result = ApiResponse.success()

      expect(result).toEqual({ success: true })
      expect(result.success).toBe(true)
      expect(result).not.toHaveProperty('data')
      expect(result).not.toHaveProperty('message')
    })

    it('includes data when provided', () => {
      const data = { id: 1, name: 'test' }
      const result = ApiResponse.success(data)

      expect(result).toEqual({ success: true, data: { id: 1, name: 'test' } })
    })

    it('includes message when provided', () => {
      const result = ApiResponse.success(undefined, 'Operation completed')

      expect(result).toEqual({ success: true, message: 'Operation completed' })
      expect(result).not.toHaveProperty('data')
    })

    it('includes both data and message when provided', () => {
      const result = ApiResponse.success({ value: 42 }, 'Done')

      expect(result).toEqual({ success: true, data: { value: 42 }, message: 'Done' })
    })

    it('includes data when it is null', () => {
      const result = ApiResponse.success(null)

      expect(result).toEqual({ success: true, data: null })
    })

    it('excludes data when it is undefined', () => {
      const result = ApiResponse.success(undefined)

      expect(result).toEqual({ success: true })
      expect(result).not.toHaveProperty('data')
    })

    it('excludes message when it is an empty string', () => {
      const result = ApiResponse.success('some data', '')

      expect(result).toEqual({ success: true, data: 'some data' })
      expect(result).not.toHaveProperty('message')
    })

    it('handles array data', () => {
      const result = ApiResponse.success([1, 2, 3])

      expect(result).toEqual({ success: true, data: [1, 2, 3] })
    })
  })

  describe('error()', () => {
    it('returns an error response with message only', () => {
      const result = ApiResponse.error('Something went wrong')

      expect(result).toEqual({ success: false, message: 'Something went wrong' })
      expect(result.success).toBe(false)
      expect(result).not.toHaveProperty('error')
    })

    it('includes error string when error is a string', () => {
      const result = ApiResponse.error('Failed', 'detailed reason')

      expect(result).toEqual({
        success: false,
        message: 'Failed',
        error: 'detailed reason',
      })
    })

    it('extracts message from Error object', () => {
      const result = ApiResponse.error('Request failed', new Error('connection timeout'))

      expect(result).toEqual({
        success: false,
        message: 'Request failed',
        error: 'connection timeout',
      })
    })

    it('uses String() for non-string, non-Error objects without message', () => {
      const result = ApiResponse.error('Failed', 42)

      expect(result).toEqual({
        success: false,
        message: 'Failed',
        error: '42',
      })
    })

    it('uses .message property from error-like objects', () => {
      const result = ApiResponse.error('Failed', { message: 'custom error' })

      expect(result).toEqual({
        success: false,
        message: 'Failed',
        error: 'custom error',
      })
    })

    it('excludes error field when error is undefined', () => {
      const result = ApiResponse.error('Not found', undefined)

      expect(result).toEqual({ success: false, message: 'Not found' })
      expect(result).not.toHaveProperty('error')
    })

    it('excludes error field when error is null', () => {
      const result = ApiResponse.error('Not found', null)

      expect(result).toEqual({ success: false, message: 'Not found' })
      expect(result).not.toHaveProperty('error')
    })

    it('handles empty string message', () => {
      const result = ApiResponse.error('')

      expect(result).toEqual({ success: false, message: '' })
    })
  })

  describe('paginated()', () => {
    it('returns a paginated response with items and metadata', () => {
      const items = [{ id: 1 }, { id: 2 }]
      const result = ApiResponse.paginated(items, 10, 1, 5)

      expect(result).toEqual({
        success: true,
        items: [{ id: 1 }, { id: 2 }],
        total: 10,
        page: 1,
        pageSize: 5,
      })
    })

    it('handles empty items array', () => {
      const result = ApiResponse.paginated([], 0, 1, 10)

      expect(result).toEqual({
        success: true,
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      })
    })

    it('handles zero page and pageSize', () => {
      const result = ApiResponse.paginated(['a', 'b'], 2, 0, 0)

      expect(result).toEqual({
        success: true,
        items: ['a', 'b'],
        total: 2,
        page: 0,
        pageSize: 0,
      })
    })

    it('preserves item types', () => {
      const items = [1, 2, 3]
      const result = ApiResponse.paginated(items, 100, 3, 3)

      expect(result.items).toEqual([1, 2, 3])
      expect(result.total).toBe(100)
      expect(result.page).toBe(3)
      expect(result.pageSize).toBe(3)
      expect(result.success).toBe(true)
    })
  })
})
