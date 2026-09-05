interface BunRandomRuntime {
  randomUUIDv7?: () => string
}

function getBunRandomRuntime(): BunRandomRuntime | undefined {
  return (globalThis as typeof globalThis & { Bun?: BunRandomRuntime }).Bun
}

const random = {
  int(min: number, max: number) {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1)) + min // 含最大值，含最小值
  },
  hex(length: number) {
    const bytes = new Uint8Array(Math.ceil(length / 2))
    crypto.getRandomValues(bytes)
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length)
  },
  pick<T>(...array: T[]) {
    const index = random.int(0, array.length - 1)
    return array[index]
  },
  fakeUuid() {
    const nativeUuid = getBunRandomRuntime()?.randomUUIDv7?.()
    return nativeUuid || `${random.hex(8)}-${random.hex(4)}-${random.hex(4)}-${random.hex(4)}-${random.hex(12)}`
  },
  imei() {
    const uin = random.int(1000000, 4294967295)
    let imei = uin % 2 ? '86' : '35'
    const bytes = new Uint8Array(4)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, uin)
    let a: number | string = view.getUint16(0)
    let b: number | string = view.getUint32(0) & 0xFFFFFF
    if (a > 9999)
      a = Math.trunc(a / 10)
    else if (a < 1000)
      a = String(uin).substring(0, 4)
    while (b > 9999999)
      b = b >>> 1
    if (b < 1000000)
      b = String(uin).substring(0, 4) + String(uin).substring(0, 3)
    imei += `${a}0${b}`

    function calcSP(imei: string) {
      let sum = 0
      for (let i = 0; i < imei.length; ++i) {
        if (i % 2) {
          const j = Number.parseInt(imei[i]) * 2
          sum += j % 10 + Math.floor(j / 10)
        }
        else {
          sum += Number.parseInt(imei[i])
        }
      }
      return (100 - sum) % 10
    }

    return imei + calcSP(imei)
  },
}

export default random
