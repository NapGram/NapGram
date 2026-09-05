import { describe, expect, it } from 'bun:test'
import { Transformer } from '@napi-rs/image'

const onePixelPng = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
), char => char.charCodeAt(0))

describe('native image transformer', () => {
  it('reads metadata and encodes WebP natively', async () => {
    const image = new Transformer(onePixelPng)

    expect(image.metadataSync()).toMatchObject({ width: 1, height: 1, format: 'png' })

    const webp = await image.webp(80)
    expect(new TextDecoder().decode(webp.subarray(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(webp.subarray(8, 12))).toBe('WEBP')
  })
})
