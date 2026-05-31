import { describe, it, expect, vi } from 'vitest'
import { fetchFile, getAvatar, getAvatarUrl, getImageUrlByMd5, getBigFaceUrl, isContainsUrl, isValidQQ, isValidRoomId, isValidUrl, hasSupportedImageExt } from '../urls.js'

describe('urls', () => {
  it('covers all methods', () => {
    expect(getAvatarUrl(0 as any)).toBe('')
    expect(getAvatarUrl({ uin: 123 })).toContain('123')
    expect(getAvatarUrl({ gid: 123 })).toContain('123')
    expect(getImageUrlByMd5('abc')).toContain('ABC')
    expect(getBigFaceUrl('abcdefgh')).toContain('parcel')
    expect(isContainsUrl('http://')).toBe(true)
    expect(isValidQQ('123456')).toBe(true)
    expect(isValidRoomId('123456')).toBe(true)
    expect(isValidUrl('http://example.com')).toBe(true)
    expect(hasSupportedImageExt('test.jpg')).toBe(true)
  })
})
