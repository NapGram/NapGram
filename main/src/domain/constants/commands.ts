interface BotCommand {
  command: string;
  description: string;
}

const preSetupCommands: BotCommand[] = [
  {
    command: 'setup',
    description: '执行初始化配置',
  },
];

const commonPrivateCommands: BotCommand[] = [
  {
    command: 'login',
    description: '当 QQ 处于下线状态时，使用此命令重新登录 QQ',
  },
  {
    command: 'flags',
    description: 'WARNING: EXPERIMENTAL FEATURES AHEAD!',
  },
  {
    command: 'alive',
    description: '状态信息',
  },
]

// 这里的 group 指群组模式，Private 指在与机器人的私聊会话中
const groupPrivateCommands: BotCommand[] = [
  ...commonPrivateCommands,
  {
    command: 'add',
    description: '添加新的群转发',
  },
];

const personalPrivateCommands: BotCommand[] = [
  ...commonPrivateCommands,
  {
    command: 'addfriend',
    description: '添加新的好友转发',
  },
  {
    command: 'addgroup',
    description: '添加新的群转发',
  },
  {
    command: 'refresh_all',
    description: '刷新所有头像和简介',
  },
];

// 服务器零号实例的管理员
const groupPrivateSuperAdminCommands: BotCommand[] = [
  ...groupPrivateCommands,
  {
    command: 'newinstance',
    description: '创建一个新的转发机器人实例',
  },
];

const personalPrivateSuperAdminCommands: BotCommand[] = [
  ...personalPrivateCommands,
  {
    command: 'newinstance',
    description: '创建一个新的转发机器人实例',
  },
];

// inChat 表示在关联了的转发群组中的命令
const inChatCommands: BotCommand[] = [
  {
    command: 'info',
    description: '查看本群或选定消息的详情',
  },
  {
    command: 'q',
    description: '生成 QuotLy 图片',
  },
  {
    command: 'rm',
    description: '在双端撤回被回复的消息',
  },
  {
    command: 'rmt',
    description: '在 TG 撤回被回复的消息',
  },
  {
    command: 'rmq',
    description: '在 QQ 撤回被回复的消息',
  },
];

const groupInChatCommands: BotCommand[] = [
  ...inChatCommands,
  {
    command: 'forwardoff',
    description: '暂停消息转发',
  },
  {
    command: 'forwardon',
    description: '恢复消息转发',
  },
  { command: 'disable_qq_forward', description: '停止从QQ转发至TG' },
  { command: 'enable_qq_forward', description: '恢复从QQ转发至TG' },
  { command: 'disable_tg_forward', description: '停止从TG转发至QQ' },
  { command: 'enable_tg_forward', description: '恢复从TG转发至QQ' },
];

const personalInChatCommands: BotCommand[] = [
  ...inChatCommands,
  {
    command: 'refresh',
    description: '刷新头像和简介',
  },
  {
    command: 'poke',
    description: '戳一戳',
  },
  {
    command: 'nick',
    description: '获取/设置群名片',
  },
  {
    command: 'mute',
    description: '设置 QQ 成员禁言',
  },
];

export default {
  preSetupCommands,
  groupPrivateCommands,
  personalPrivateCommands,
  groupPrivateSuperAdminCommands,
  personalPrivateSuperAdminCommands,
  groupInChatCommands,
  personalInChatCommands,
};
