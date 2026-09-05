export class MockMessage {
  media?: any
  chat: any
  id!: number

  constructor(props: any = {}) {
    Object.assign(this, props)
  }
}

export function createMtcuteCoreMock() {
  return {
    Message: MockMessage,
  }
}
