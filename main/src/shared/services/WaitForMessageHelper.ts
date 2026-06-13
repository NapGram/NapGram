import type { Message } from '@mtcute/core'
import type Telegram from '@napgram/telegram-client'

export default class WaitForMessageHelper {
  private map = new Map<number, (event: Message) => any>()

  constructor(private tg: Telegram) {
    tg.addNewMessageEventHandler(async (event: any) => {
      const message = event as Message
      if (!message.chat || !message.chat.id)
        return
      const handler = this.map.get(message.chat.id)
      if (handler) {
        this.map.delete(message.chat.id)
        handler(message)
      }
    })
  }

  public waitForMessage(chatId: number) {
    return new Promise<Message>((resolve) => {
      this.map.set(chatId, resolve)
    })
  }

  public cancel(chatId: number) {
    this.map.delete(chatId)
  }
}
