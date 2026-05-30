export class DurationParser {
  static parse(duration: string): number {
    const match = duration.trim().match(/^(\d+)([mhd])$/i)

    if (!match) {
      throw new Error(
        `无效的时长格式: "${duration}"\n支持格式: 1m (分钟), 1h (小时), 1d (天)`,
      )
    }

    const value = Number.parseInt(match[1], 10)
    const unit = match[2].toLowerCase()

    if (value <= 0) {
      throw new Error('时长必须大于0')
    }

    switch (unit) {
      case 'm':
        return value * 60
      case 'h':
        return value * 3600
      case 'd':
        return value * 86400
      default:
        throw new Error(`未知的时间单位: ${unit}`)
    }
  }

  static format(seconds: number): string {
    if (seconds === 0) {
      return '0秒'
    }

    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    const parts: string[] = []
    if (days > 0)
      parts.push(`${days}天`)
    if (hours > 0)
      parts.push(`${hours}小时`)
    if (minutes > 0)
      parts.push(`${minutes}分钟`)
    if (secs > 0)
      parts.push(`${secs}秒`)

    return parts.join('')
  }

  static get DEFAULT_BAN_DURATION(): number {
    return 30 * 60
  }

  static get MAX_BAN_DURATION(): number {
    return 30 * 86400
  }
}
