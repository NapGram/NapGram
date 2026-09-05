export function bytesFromUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function bytesToUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

export function concatBytes(...values: Uint8Array[]): Uint8Array {
  const length = values.reduce((total, value) => total + value.byteLength, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const value of values) {
    result.set(value, offset)
    offset += value.byteLength
  }
  return result
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength)
    return false
  return left.every((value, index) => value === right[index])
}

export function readUint32BE(value: Uint8Array): number {
  return new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(0, false)
}

export function readUint16BE(value: Uint8Array): number {
  return new DataView(value.buffer, value.byteOffset, value.byteLength).getUint16(0, false)
}
