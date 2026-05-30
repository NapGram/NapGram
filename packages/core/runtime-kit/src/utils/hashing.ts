import crypto from 'node:crypto'

export function md5(input: crypto.BinaryLike) {
  return crypto.createHash('md5').update(input).digest()
}

export function md5Hex(input: crypto.BinaryLike) {
  return crypto.createHash('md5').update(input).digest('hex')
}

export function md5B64(input: crypto.BinaryLike) {
  return crypto.createHash('md5').update(input).digest('base64')
}

export function sha256Hex(input: crypto.BinaryLike) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function sha256B64(input: crypto.BinaryLike) {
  return crypto.createHash('sha256').update(input).digest('base64')
}
