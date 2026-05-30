import type { Chat, InputPeerLike, InputText, tl } from '@mtcute/core'
import type { TelegramClient } from '@mtcute/node'
import type { Buffer } from 'node:buffer'
import type Telegram from './client.js'

type ChatAdminRights = Omit<tl.RawChatAdminRights, '_'>

export default class TelegramChat {
  public readonly id: number | bigint

  constructor(
    public readonly parent: Telegram,
    private readonly client: TelegramClient,
    public readonly chat: Chat,
  ) {
    this.id = chat.id
  }

  public async sendMessage(text: InputText, params?: Parameters<TelegramClient['sendText']>[2]) {
    return await this.client.sendText(this.id as any, text, params)
  }

  /**
   * 设置聊天头像
   */
  public async setProfilePhoto(photo: Buffer | string) {
    return await this.client.setChatPhoto({
      chatId: this.id as any,
      media: photo,
      type: 'photo',
    })
  }

  /**
   * 设置管理员
   */
  public async setAdmin(user: InputPeerLike, rights?: ChatAdminRights, rank?: string) {
    const adminRights: ChatAdminRights = rights || {
      changeInfo: true,
      postMessages: true,
      editMessages: true,
      deleteMessages: true,
      banUsers: true,
      inviteUsers: true,
      pinMessages: true,
      manageCall: true,
      anonymous: false,
      manageTopics: false,
    }

    return await this.client.editAdminRights({
      chatId: this.id as any,
      userId: user,
      rights: adminRights,
      ...(rank !== undefined ? { rank } : {}),
    })
  }

  public async editAbout(about: string) {
    return await this.client.setChatDescription(this.id as any, about)
  }

  public async editTitle(title: string) {
    return await this.client.setChatTitle(this.id as any, title)
  }

  public async getInviteLink() {
    return await this.client.createInviteLink(this.id as any)
  }

  /**
   * 获取聊天成员信息
   */
  public async getMember(user: InputPeerLike) {
    return await this.client.getChatMember({
      chatId: this.id as any,
      userId: user,
    })
  }

  /**
   * 删除消息
   */
  public async deleteMessages(messageIds: (number | bigint)[]) {
    return await this.client.deleteMessagesById(
      this.id as any,
      messageIds.map(id => Number(id)),
    )
  }

  /**
   * 邀请成员
   */
  public async inviteMember(users: InputPeerLike[]) {
    return await this.client.addChatMembers(this.id as any, users, { forwardCount: 0 })
  }

  /**
   * 设置打字状态
   */
  public async setTyping(action: string = 'typing') {
    return await this.client.setTyping({
      peerId: this.id as any,
      status: action as any,
    })
  }
}
