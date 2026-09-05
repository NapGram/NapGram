import { beforeAll, describe, expect, it, mock } from 'bun:test'

const { warnMock, infoMock } = (() => ({
  warnMock: mock(),
  infoMock: mock(),
}))()

mock.module('@napgram/logger-kit', () => ({
  getLogger: () => ({
    warn: warnMock,
    info: infoMock,
  }),
}))

let createWebAPI: typeof import('../web.js').createWebAPI
let WebAPIImpl: typeof import('../web.js').WebAPIImpl
beforeAll(async () => {
  ({ createWebAPI, WebAPIImpl } = await import('../web.js'))
})

describe('webAPI', () => {
  it('should register routes when configured', () => {
    const registrar = mock()
    const api = createWebAPI(registrar)
    const registerFn = mock()

    api.registerRoutes(registerFn, 'test-plugin')
    expect(registrar).toHaveBeenCalledWith(registerFn, 'test-plugin')
  })

  it('should log warning when not configured', () => {
    const api = new WebAPIImpl(undefined)
    const registerFn = mock()

    api.registerRoutes(registerFn)
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('not configured'))
    expect(registerFn).not.toHaveBeenCalled()
  })
})
