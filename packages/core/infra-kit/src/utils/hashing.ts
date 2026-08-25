import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'

function hashInput(input: crypto.BinaryLike) {
  if (typeof input === 'string') return input
  return 'buffer' in input
    ? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
    : Buffer.from(input)
}

export function md5(input: crypto.BinaryLike) {
  const hash = crypto.createHash('md5')
  return hash.update(hashInput(input)).digest()
}

export function md5Hex(input: crypto.BinaryLike) {
  const hash = crypto.createHash('md5')
  return hash.update(hashInput(input)).digest('hex')
}

export function md5B64(input: crypto.BinaryLike) {
  const hash = crypto.createHash('md5')
  return hash.update(hashInput(input)).digest('base64')
}

export function sha256Hex(input: crypto.BinaryLike) {
  const hash = crypto.createHash('sha256')
  return hash.update(hashInput(input)).digest('hex')
}

export function sha256B64(input: crypto.BinaryLike) {
  const hash = crypto.createHash('sha256')
  return hash.update(hashInput(input)).digest('base64')
}
