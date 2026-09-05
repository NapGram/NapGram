export type RuntimeHashInput = string | ArrayBuffer | ArrayBufferView
export type RuntimeHashEncoding = 'buffer' | 'hex' | 'base64'

export interface RuntimeHasher {
  update(input: RuntimeHashInput): void
  digest(encoding?: Exclude<RuntimeHashEncoding, 'buffer'>): string | Uint8Array
}

type BunCryptoHasher = {
  update(data: string | Uint8Array): unknown
  digest(encoding?: 'hex' | 'base64'): string | Uint8Array
}

type BunCryptoRuntime = {
  CryptoHasher: new (algorithm: string) => BunCryptoHasher
}

function detectBunCrypto(): BunCryptoRuntime {
  const runtime = (globalThis as typeof globalThis & { Bun?: BunCryptoRuntime }).Bun
  if (!runtime?.CryptoHasher) {
    throw new Error('Bun.CryptoHasher is unavailable; run this adapter under Bun')
  }
  return runtime
}

function toRuntimeInput(input: RuntimeHashInput): string | Uint8Array {
  if (typeof input === 'string') return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  return new Uint8Array(input.buffer as ArrayBuffer, input.byteOffset, input.byteLength)
}

export function createHashWithRuntime(algorithm: string): RuntimeHasher {
  const hasher = new (detectBunCrypto().CryptoHasher)(algorithm)
  return {
    update(input) {
      hasher.update(toRuntimeInput(input))
    },
    digest(encoding?: 'hex' | 'base64') {
      return hasher.digest(encoding)
    },
  }
}

export function hashWithRuntime(
  algorithm: string,
  input: RuntimeHashInput,
  encoding: RuntimeHashEncoding = 'buffer',
): Uint8Array | string {
  const hasher = createHashWithRuntime(algorithm)
  hasher.update(input)
  return encoding === 'buffer' ? hasher.digest() : hasher.digest(encoding)
}
