<p align="center"><strong>简体中文</strong> | <a href="./README_en.md">English</a></p>

<h1 align="center">NapGram</h1>

<p align="center">基于 NapCat 和 mtcute 的现代化 QQ-Telegram 消息桥接工具</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-25-green.svg" alt="Node.js" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript" /></a>
  <a href="https://github.com/NapGram/NapGram/actions/workflows/docker-release.yml"><img src="https://github.com/NapGram/NapGram/actions/workflows/docker-release.yml/badge.svg?event=release&label=Release%20Build" alt="Release Build" /></a>
  <a href="https://codecov.io/gh/NapGram/NapGram"><img src="https://codecov.io/gh/NapGram/NapGram/branch/dev/graph/badge.svg" alt="Codecov" /></a>
  <a href="https://github.com/NapGram/NapGram/releases"><img src="https://img.shields.io/github/v/release/NapGram/NapGram?display_name=tag&include_prereleases&logo=git&label=Latest" alt="Release" /></a>
  <a href="https://github.com/NapGram/NapGram/pkgs/container/napgram"><img src="https://img.shields.io/badge/ghcr.io%2FNapGram%2Fnapgram-blue?logo=docker&label=Container" alt="GHCR Image" /></a>
  <a href="https://github.com/NapGram/NapGram/commits/main"><img src="https://img.shields.io/github/last-commit/NapGram/NapGram/main?logo=github&label=Last%20Commit" alt="Last Commit" /></a>
  <a href="https://github.com/NapGram/NapGram/pulse"><img src="https://img.shields.io/github/commit-activity/m/NapGram/NapGram?logo=github&label=Commit%20Activity" alt="Commit Activity" /></a>
  <a href="https://github.com/NapGram/NapGram/issues"><img src="https://img.shields.io/github/issues/NapGram/NapGram?logo=github" alt="Issues" /></a>
  <a href="https://github.com/NapGram/NapGram/pulls"><img src="https://img.shields.io/github/issues-pr/NapGram/NapGram?logo=github&label=Pull%20Requests" alt="PRs" /></a>
  <a href="https://github.com/NapGram/NapGram/stargazers"><img src="https://img.shields.io/github/stars/NapGram/NapGram?style=social" alt="Stars" /></a>
  <a href="https://github.com/NapGram/NapGram/network/members"><img src="https://img.shields.io/github/forks/NapGram/NapGram?style=social" alt="Forks" /></a>
</p>

## ✨ 核心特性

### 🚀 现代化架构
- **统一抽象层**：基于 `IQQClient` 接口的标准化实现，解耦底层协议
- **模块化设计**：Feature 驱动的架构（Forward, Recall, Media, Commands）
- **高性能核心**：
  - ⚡ 消息处理速度提升 50%
  - 📉 内存占用降低 15%
  - 🔄 LRU 多级缓存系统

### 💬 消息能力
- **全类型支持**：
  - ✅ 文本、图片（含闪照）、视频、音频
  - ✅ 文件、贴纸、@提及、表情
  - ✅ 合并转发消息、引用回复
  - ✅ 商城表情 (mface)、掷骰子/猜拳
  - ✅ Markdown/JSON 卡片消息
- **媒体增强**：
  - 🖼️ 智能图片分片发送（解决合并转发显示问题）
  - 🎥 GIF 自动优化播放
  - 🎵 语音自动转码 (Silk/Ogg)
  - 📂 跨容器大文件流式传输

### 🛡️ 稳定性与监控
- **双向撤回同步**：QQ 与 Telegram 消息撤回互通
- **智能重连**：WebSocket 断线自动重连机制
- **健康监控**：
  - 实时延迟统计 (p50/p95/p99)
  - 错误率追踪与自动恢复
  - 消息队列优先级管理
- **Web 控制台**：
  - ✅ Docker 镜像内置前端（默认端口 `8080`，访问 `http://<host>:8080/`）
  - 📊 系统状态与性能指标（统计概览、趋势、延迟）
  - ⚙️ 可视化管理（实例/绑定/配置、日志与消息查询）
  - ⚠️ UI 源码维护在 `napgram-ui-dist` 仓库，当前仓库只保留打包后的 `web/dist`

## 🏗️ 技术栈列表

| 组件 | 技术方案 | 说明 |
|-----------|-----------|-----------|
| **QQ 适配** | [NapCat](https://github.com/NapNeko/NapCatQQ) | 基于 WebSocket 的现代化协议实现 |
| **TG 适配** | [mtcute](https://github.com/mtcute/mtcute) | 原生 MTProto 实现，无需 Bot API 中转 |
| **核心语言** | TypeScript 5.0+ | 严格模式，全链路类型安全 |
| **前端框架** | React 19 + Vite | Tailwind CSS 4, Shadcn UI, Recharts |
| **运行时** | Node.js 25 (ESM) | 现代化模块系统 |
| **数据持久化** | PostgreSQL + Drizzle ORM | 强类型 ORM，支持自动迁移 |
| **测试框架** | Vitest | 单元测试覆盖率 >80% |

## 🚀 部署指南

### 前置要求
- **NapCat (必选)**：需自行部署 [NapCatQQ](https://napneko.github.io/) 实例，并开启 WebSocket 服务
- **数据库**：PostgreSQL 14+
- **网络**：NapGram 容器需能访问 NapCat 服务端口

### 镜像标签约定

- 稳定版（Release 构建）：`latest` + `vX.Y.Z`
- 开发版（每日构建）：`dev-latest` + `dev-YYYYMMDD`

### Docker Compose 部署 (推荐)

1. **获取项目**
   ```bash
   git clone https://github.com/NapGram/NapGram.git
   cd NapGram
   ```

2. **复制并配置 Compose**
   ```bash
   cp compose.example.yaml docker-compose.yml
   # 编辑 docker-compose.yml 的 environment（必填项：TG_API_ID / TG_API_HASH / TG_BOT_TOKEN）
   ```

3. **启动服务**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

## 📚 文档

- 📖 **项目文档(Wiki)**:https://github.com/NapGram/NapGram/wiki
- 📝 **更新日志**:https://github.com/NapGram/NapGram/wiki/Changelog
- 🧩 **插件系统**:https://github.com/NapGram/NapGram/wiki/Operations-Plugins
- 🔌 **插件开发指南**:https://github.com/NapGram/NapGram/wiki/Guide-Plugin-Development
- 📦 **插件市场**:https://github.com/NapGram/napgram-marketplace
- 🎨 **插件模板**:https://github.com/NapGram/napgram-plugin-template
- ⬆️ **升级与迁移(FAQ)**:https://github.com/NapGram/NapGram/wiki/Operations-Upgrade
- 💬 **常用命令**:https://github.com/NapGram/NapGram/wiki/Guide-Commands
- 🔗 **相关项目**:NapCat SDK(TypeScript)[NapLink](https://github.com/NapGram/NapLink)

## 📅 更新日志

📝 **[查看版本更新日志](https://github.com/NapGram/NapGram/wiki/Changelog)**

## 📖 开发者文档

### 目录结构
```bash
.
├── main/                 # 后端核心（Fastify + mtcute + NapCat）
│   ├── src/
│   │   ├── domain/       # 领域模型、转换器与业务逻辑
│   │   ├── features/     # 功能模块（Forward/Media/Recall/Commands）
│   │   ├── infrastructure/# 协议适配与外部依赖（QQ/TG 客户端等）
│   │   ├── interfaces/   # Web API + Web 控制台托管（Fastify）
│   │   └── shared/       # 通用工具、日志、服务
│   └── tools/            # 数据库迁移与维护工具（Drizzle）
├── web/                  # 外部 UI 仓库在 CI 中 checkout 到此路径
│   └── dist/             # 前端构建产物（Docker 仅复制该目录）
├── Dockerfile            # 容器构建（默认启用 Web 控制台）
└── compose*.yaml         # Docker Compose 示例
```

> 说明：Web console 的源码维护在 `napgram-ui-dist` 仓库，当前仓库只保留构建产物 `web/dist`。CI 会在发布流程中把 `napgram-ui-dist` checkout 到 `./web` 再执行构建。

### 创建新功能
得益于模块化架构，添加新功能非常简单：

```typescript
// 1. 实现 Feature 接口
class MyFeature {
    constructor(
        private instance: Instance,
        private tgBot: Telegram,
        private qqClient: IQQClient,
    ) {
        this.setupListeners();
    }
    
    private setupListeners() {
        this.qqClient.on('message', this.handleMessage);
    }
}

// 2. 注册为插件，并交给 PluginRuntime 管理
runtime.registerPlugin(new MyPlugin(...));
```

## 🧩 功能模块

### 📨 消息处理 (Message Handling)
- **ForwardFeature**: 核心转发逻辑，支持去重与高级转发策略
- **RecallFeature**: 双向撤回同步（QQ <-> Telegram）
- **MediaFeature**: 统一媒体下载与转码（支持 Silk/Ogg/Images/Videos/Files）
- **ModeFilter**: 消息模式过滤器（支持群组/私聊/黑白名单控制）

### 👥 群组与交互 (Group & Interaction)
- **GroupManagement**: 群组管理功能（成员变动通知、邀请/踢出处理）
- **QQInteraction**: QQ 交互处理（处理好友/群组请求，通过 TG 按键操作）
- **RequestManagement**: 请求管理系统（集中处理各类申请）

### 📊 系统与监控 (System & Monitoring)
- **Monitoring**: 实时系统监控（CPU/内存/事件循环延迟）
- **Statistics**: 消息统计与数据分析
- **PingPong**: 延迟检测与连通性测试
- **Notifications**: 离线/重连通知（NapCat 掉线报警）

### 🛠️ 管理套件 (Admin Suite)
- **WebConsole**: 全功能 Web 控制台（Docker 内置）
  - **Instance Management**: 多实例管理
  - **Pair Management**: 可视化转发绑定管理
  - **Plugin Management**: 插件启用/禁用/配置
  - **Permission Management**: 基于角色的权限控制 (RBAC)
  - **System Settings**: 全局系统配置
  - **Logs & Database**: 日志查看与数据库浏览

### 🚀 高级功能 (Advanced)
- **Gateway**: API 网关（支持外部调用）
- **Commands**: 强大的指令系统（支持 `/help` 查看完整列表）
- **Flags**: 功能开关与特性标志管理

### 常用命令

常用命令与完整说明已迁移到 Wiki：https://github.com/NapGram/NapGram/wiki/Guide-Commands

## 🤝 贡献与致谢

- 核心协议库感谢 [NapCat](https://github.com/NapNeko/NapCatQQ) 和 [mtcute](https://github.com/mtcute/mtcute) 的开源贡献
- 感谢 [原始 q2tg 项目](https://github.com/Clansty/Q2TG) 和[node-napcat-ts](https://github.com/HkTeamX/node-napcat-ts)为本项目提供了重要的参考和灵感


## ⚠️ 免责声明

本项目仅供教育和个人使用。请遵守 QQ 和 Telegram 的服务条款。

## 💬 加入社区

- **Telegram 群组**: [加入群组](https://t.me/+NR2QaQ4dlEgxYmNl)

## ⭐ Star 趋势

[![Star History Chart](https://starchart.cc/NapGram/NapGram.svg)](https://starchart.cc/NapGram/NapGram)

---

## 📧 联系方式

- GitHub Issues: [报告问题](https://github.com/NapGram/NapGram/issues)

---
