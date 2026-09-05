import { readUint16BE, readUint32BE } from './binary.js'

interface BunRandomRuntime {
  randomUUIDv7?: () => string
}

function getBunRandomRuntime(): BunRandomRuntime | undefined {
  return (globalThis as typeof globalThis & { Bun?: BunRandomRuntime }).Bun
}

function randomHex(length: number) {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length)
}

function createFallbackUuid() {
  const hex = (length: number) => randomHex(length)
  return `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`
}

const random = {
  int(min: number, max: number) {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1)) + min
  },
  hex(length: number) {
    return randomHex(length)
  },
  pick<T>(...array: T[]) {
    const index = random.int(0, array.length - 1)
    return array[index]
  },
  fakeUuid() {
    const nativeUuid = getBunRandomRuntime()?.randomUUIDv7?.()
    return nativeUuid || createFallbackUuid()
  },
  imei() {
    const uin = random.int(1000000, 4294967295)
    let imei = uin % 2 ? '86' : '35'
    const buf = new Uint8Array(4)
    new DataView(buf.buffer).setUint32(0, uin, false)
    let a: number | string = readUint16BE(buf.subarray(0, 2))
    let b: number | string = readUint32BE(new Uint8Array([0, ...buf.subarray(1)]))
    if (a > 9999)
      a = Math.trunc(a / 10)
    else if (a < 1000)
      a = String(uin).substring(0, 4)
    while (b > 9999999)
      b = b >>> 1
    if (b < 1000000)
      b = String(uin).substring(0, 4) + String(uin).substring(0, 3)
    imei += `${a}0${b}`

    function calcSP(value: string) {
      let sum = 0
      for (let i = 0; i < value.length; ++i) {
        if (i % 2) {
          const digit = Number.parseInt(value[i]) * 2
          sum += digit % 10 + Math.floor(digit / 10)
        }
        else {
          sum += Number.parseInt(value[i])
        }
      }
      return (100 - sum) % 10
    }

    return imei + calcSP(imei)
  },
}

export default random
