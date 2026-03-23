export class MockMessage {
  media?: any
  chat: any
  id!: number

  constructor(props: any = {}) {
    Object.assign(this, props)
  }
}

export async function createMtcuteCoreMock(importOriginal: any) {
  const actual = await importOriginal()
  return {
    ...actual,
    Message: MockMessage,
  }
}
