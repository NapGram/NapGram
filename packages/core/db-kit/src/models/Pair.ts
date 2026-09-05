import db, { schema, eq } from '../db.js'
import { flags } from '@napgram/env-kit'
import { getLogger } from '@napgram/logger-kit'
import { hashWithRuntime } from '@napgram/runtime-kit'

export type ForwardPairQqRoom = { uin: number } | { gid: number }

export interface ForwardPairTelegramChat {
  readonly id: number | bigint | string
  editTitle(title: string): Promise<unknown>
  setProfilePhoto(photo: Uint8Array): Promise<unknown>
}

export interface ForwardPairQqClient {
  getGroupInfo(groupId: string): Promise<{ name?: string } | null | undefined>
}

const log = getLogger('ForwardPair')

function bytesEqual(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length)
    return false
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i])
      return false
  }
  return true
}

function getAvatarUrl(room: number | bigint | ForwardPairQqRoom): string {
  if (!room) return ''
  if (typeof room === 'object' && 'uin' in room) room = room.uin
  if (typeof room === 'object' && 'gid' in room) room = -room.gid
  return room < 0
    ? `https://p.qlogo.cn/gh/${-room}/${-room}/0`
    : `https://q1.qlogo.cn/g?b=qq&nk=${room}&s=0`
}

async function getAvatar(room: number | bigint | ForwardPairQqRoom) {
  const res = await fetch(getAvatarUrl(room))
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

export class Pair {
  private static readonly apiKeyMap = new Map<string, Pair>()
  private static readonly dbIdMap = new Map<number, Pair>()

  public static getByApiKey(key: string) {
    return this.apiKeyMap.get(key)
  }

  public static getByDbId(dbId: number) {
    return this.dbIdMap.get(dbId)
  }

  public readonly instanceMapForTg = {} as { [tgUserId: string]: ForwardPairQqRoom }

  constructor(
    public readonly qq: ForwardPairQqRoom,
    private _tg: ForwardPairTelegramChat,
    public readonly tgUser: ForwardPairTelegramChat,
    public dbId: number,
    private _flags: number,
    public readonly apiKey: string,
    public readonly qqClient: ForwardPairQqClient,
  ) {
    if (apiKey) {
      Pair.apiKeyMap.set(apiKey, this)
    }
    Pair.dbIdMap.set(dbId, this)
  }

  public async updateInfo() {
    const rows = await db.select().from(schema.avatarCache)
      .where(eq(schema.avatarCache.forwardPairId, this.dbId))
      .limit(1)
    const avatarCache = rows[0]
    const lastHash = avatarCache ? avatarCache.hash : null
    const avatar = await getAvatar(this.qqRoomId)
    const newHash = new Uint8Array(hashWithRuntime('md5', avatar, 'buffer') as Uint8Array)

    if (!(this.flags & flags.NAME_LOCKED) && this.qqRoomId < 0) {
      try {
        const groupInfo = await this.qqClient.getGroupInfo(String(-this.qqRoomId))
        if (groupInfo && groupInfo.name) {
          await this._tg.editTitle(groupInfo.name)
        }
      }
      catch (e: any) {
        log.error(`修改群名失败: ${e.message}`)
      }
    }

    if (!lastHash || !bytesEqual(lastHash, newHash)) {
      log.debug(`更新群头像: ${this.qqRoomId}`)
      await this._tg.setProfilePhoto(avatar)
      if (avatarCache) {
        await db.update(schema.avatarCache)
          .set({ hash: newHash as never })
          .where(eq(schema.avatarCache.forwardPairId, this.dbId))
      }
      else {
        await db.insert(schema.avatarCache)
          .values({ forwardPairId: this.dbId, hash: newHash } as never)
      }
    }
  }

  get qqRoomId() {
    return 'uin' in this.qq ? this.qq.uin : -this.qq.gid
  }

  get tgId() {
    return Number(this._tg.id)
  }

  get tg() {
    return this._tg
  }

  set tg(value: ForwardPairTelegramChat) {
    this._tg = value
    db.update(schema.forwardPair)
      .set({ tgChatId: BigInt(value.id) })
      .where(eq(schema.forwardPair.id, this.dbId))
      .then(() => log.info(`出现了到超级群组的转换: ${value.id}`))
  }

  get flags() {
    return this._flags
  }

  set flags(value) {
    this._flags = value
    db.update(schema.forwardPair)
      .set({ flags: value })
      .where(eq(schema.forwardPair.id, this.dbId))
      .then(() => 0)
  }
}
