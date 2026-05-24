export type WorkMode = 'group' | 'personal' | 'public'

export const WORK_MODE_COMMANDS = new Set(['start', 'workmode'])
export const CONFIGURED_WORK_MODES = new Set<string>(['group', 'personal', 'public'])

export const WORK_MODE_ALIASES: Record<string, WorkMode> = {
  group: 'group',
  groups: 'group',
  qqgroup: 'group',
  群: 'group',
  群组: 'group',
  群模式: 'group',
  personal: 'personal',
  private: 'personal',
  user: 'personal',
  个人: 'personal',
  个人模式: 'personal',
  public: 'public',
  shared: 'public',
  公共: 'public',
  公共模式: 'public',
}

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  group: '群模式',
  personal: '个人模式',
  public: '公共模式',
}

export function getWorkMode(instance: any): string {
  return String(instance?.workMode || '').trim()
}

export function hasConfiguredWorkMode(instance: any): boolean {
  if (typeof instance?.hasConfiguredWorkMode === 'function')
    return Boolean(instance.hasConfiguredWorkMode())
  return CONFIGURED_WORK_MODES.has(getWorkMode(instance))
}

export function parseWorkMode(value: string | undefined): WorkMode | undefined {
  if (!value)
    return undefined
  return WORK_MODE_ALIASES[value.trim().toLowerCase()]
}

export function isWorkModeCommand(command: { name?: string } | string | undefined): boolean {
  const name = typeof command === 'string' ? command : command?.name
  return WORK_MODE_COMMANDS.has(String(name || '').toLowerCase())
}

export function buildWorkModePrompt(instance: any): string {
  const current = getWorkMode(instance)
  const currentLine = hasConfiguredWorkMode(instance)
    ? `当前工作模式: ${WORK_MODE_LABELS[current as WorkMode] || current}`
    : '当前工作模式: 未设置'

  return [
    currentLine,
    '',
    '请先设置工作模式，未设置前转发、绑定、撤回、插件命令等功能不会生效。',
    '',
    '可选模式:',
    '- group: 群模式，按 QQ 群和 TG 群/话题手动绑定转发',
    '- personal: 个人模式，支持 QQ 好友/群映射到独立 TG 群，自动建群需要 TG UserBot',
    '- public: 公共模式，保留公共实例/插件场景使用',
    '',
    '用法:',
    '/start group',
    '/start personal',
    '/workmode public',
  ].join('\n')
}
