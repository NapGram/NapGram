# @napgram/plugin-qq-interaction

QQ 特色交互功能插件，为 NapGram 提供 QQ 平台专属的社交互动能力。

## 功能

### 命令列表

| 命令 | 别名 | 描述 | 权限 |
|------|------|------|------|
| `/poke` | `戳一戳` | 戳一戳指定用户 | 普通用户 |
| `/nick` | `群名片` | 获取/设置机器人群名片 | 普通用户 |
| `/like` | `点赞` | 给指定用户点赞（1-10次） | 普通用户 |
| `/honor` | `群荣誉` | 查看群荣誉榜单 | 普通用户 |

### 使用示例

```bash
# 戳一戳
/poke                  # 回复消息使用
/poke 123456789       # 指定 QQ 号

# 群名片
/nick                  # 查看当前群名片
/nick 新名片           # 修改群名片

# 点赞
/like                  # 回复消息使用，点赞 1 次
/like 5                # 回复消息使用，点赞 5 次
/like 123456789        # 给指定 QQ 号点赞 1 次
/like 123456789 10     # 给指定 QQ 号点赞 10 次

# 群荣誉
/honor                 # 查看所有荣誉榜单
/honor talkative       # 查看龙王榜
/honor performer       # 查看群聊之火
/honor legend          # 查看快乐源泉
```

## 安装

### 1. 添加到插件配置

编辑 `data/plugins/plugins.yaml`:

```yaml
plugins:
  - id: qq-interaction
    module: ../../packages/plugin-qq-interaction/dist/index.js
    enabled: true
```

### 2. 构建插件

```bash
cd packages/plugin-qq-interaction
pnpm install
pnpm build
```

### 3. 重启 NapGram

或使用热重载：

```bash
POST /api/admin/plugins/reload
```

## 开发

### 构建

```bash
pnpm build
```

### 开发模式（监听文件变化）

```bash
pnpm dev
```

## 依赖
- NapGram >= 0.0.2
- NapCat >= 1.0.0（部分功能需要）

## 许可证

MIT
