import { hashWithRuntime, type RuntimeHashInput } from '@napgram/runtime-kit'

export function md5(input: RuntimeHashInput) {
  return new Uint8Array(hashWithRuntime('md5', input, 'buffer') as Uint8Array)
}

export function md5Hex(input: RuntimeHashInput) {
  return hashWithRuntime('md5', input, 'hex') as string
}

export function md5B64(input: RuntimeHashInput) {
  return hashWithRuntime('md5', input, 'base64') as string
}

export function sha256Hex(input: RuntimeHashInput) {
  return hashWithRuntime('sha256', input, 'hex') as string
}

export function sha256B64(input: RuntimeHashInput) {
  return hashWithRuntime('sha256', input, 'base64') as string
}
