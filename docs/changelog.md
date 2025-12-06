# Changelog

所有重要的项目更改都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [0.0.1] - 2025-12-05

### ✨ 新增功能

- **原生 QQ 回复支持**: 为所有消息类型添加了原生 QQ 回复功能 (fa088ab)
- **Web 前端**: 新增 Web 管理界面，改进聊天历史 UI 设计 (2e47ed1, d91770a)
- **架构升级**: 完成项目架构现代化改造，升级到 DDD 分层架构 (f862f35)
  - 领域层 (Domain Layer)
  - 基础设施层 (Infrastructure Layer)
  - 功能特性层 (Features Layer)
  - 接口层 (Interfaces Layer)
  - 共享层 (Shared Layer)

### 🔧 改进优化

- **消息转发增强**: 优化媒体转发机制，标准化 API 路由，改进话题处理 (08ea545)
- **回复逻辑重构**: 修复回复 API 并集中管理消息解析逻辑 (466dc1a)
- **日志系统统一**: 将日志系统统一到 `shared/logger`，移除 pino 相关依赖 (626b9e2, f03cf21)
- **依赖清理**: 清理未使用的依赖，优化 Docker 构建流程 (16842e5)
- **UI 样式改进**: 优化聊天气泡布局、边框、背景和文字间距 (2745614, 67f1c42)

### 🐛 Bug 修复

- **构建依赖**: 添加缺失的构建依赖 (15b856d)
- **调试日志清理**: 移除 rich header 和回复功能的调试日志 (915625e, 0c46804)

### 📦 依赖更新

- **Prisma 升级**: 从 7.0.1 升级到 7.1.0
  - `prisma@7.1.0` (6e452ef, b1b817d)
  - `@prisma/client@7.1.0` (769da42)
  - `@prisma/adapter-pg@7.1.0` (8bd0afa, 38b5703)
- **file-type 升级**: 从 20.5.0 升级到 21.1.1 (f82b8b1, af37431)
- **@types/node 升级**: 升级到 24.10.1
  - main workspace (92d566f, 4617daf)
  - web workspace (f76d367, 8fa2700)
- **date-fns**: 添加缺失的 date-fns 依赖 (157e4a6)
- **pnpm-lock.yaml**: 更新锁文件以反映依赖变更 (5dca925)

### 🔒 CI/CD

- **GitHub Actions**: 为 GHCR 推送添加 packages 写入权限 (cc34856)

### 🎉 初始发布

- **NapGram v0.0.1**: 基于 Q2TG 的重大架构重构版本 (c388368)
  - 迁移到 ESM 模块系统
  - 采用分层 DDD 架构
  - 从 log4js 迁移到 pino
  - 从 GramJS 迁移到 mtcute
  - 移除 OICQ，专注 NapCat
  - 引入 Vitest 测试框架
  - 添加 Telegram Forum Topics 支持
  - 添加消息过滤功能 (ignoreRegex, ignoreSenders)