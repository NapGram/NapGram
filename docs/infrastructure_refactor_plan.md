# Infrastructure Layer Refactoring Plan

## 现状分析

目前 `src/infrastructure/clients` 目录存在新旧代码混用和结构混乱的问题。

### 1. 目录结构现状

*   **`NapCatClient/` (旧)** - ✅ 已删除
    *   包含 `client.ts`, `entity.ts`, `event.ts` 等。
    *   这是旧的实现，直接继承自 `QQClient` (旧)。
    *   包含了很多具体的业务逻辑（如 `handleMessage`, `handleGroupIncrease` 等）。
*   **`QQClient/` (旧)** - ✅ 已删除
    *   包含 `index.ts`, `entity.ts`, `events.ts`。
    *   定义了旧的抽象基类 `QQClient` 和相关实体/事件。
*   **`qq/` (新 - Refactor Phase 1)** - ✅ 已完成
    *   包含 `interface.ts` (`IQQClient`), `factory.ts`, `napcat/adapter.ts`。
    *   这是重构的目标结构，基于接口编程，解耦具体实现。
    *   `NapCatAdapter` 实现了 `IQQClient`。
*   **`Telegram*.ts`** - ✅ 已迁移
    *   已移动到 `telegram/` 目录。

### 2. 混乱点

*   ~~**新旧共存**：`NapCatAdapter` (新) 和 `NapCatClient` (旧) 同时存在，且功能有重叠。~~ ✅ 已解决
*   ~~**依赖纠缠**：新的 Adapter 可能还在依赖旧的 Entity 或 Converter。~~ ✅ 已解决
*   ~~**命名不统一**：`qq/` vs `QQClient/`。~~ ✅ 已解决

## 整理建议 (Refactor Phase 2/3)

### 1. 目标结构 ✅ 已完成

```
src/infrastructure/clients/
├── qq/
│   ├── interface.ts       # IQQClient 接口定义
│   ├── factory.ts         # QQClientFactory
│   ├── types.ts           # 统一类型定义
│   ├── index.ts           # 统一导出
│   └── napcat/            # NapCat 具体实现
│       ├── adapter.ts     # NapCatAdapter (实现 IQQClient)
│       └── convert.ts     # NapCat 转换工具函数
└── telegram/
    ├── client.ts          # TelegramClient 封装
    ├── chat.ts            # TelegramChat
    ├── session.ts         # Session 管理
    └── index.ts           # 统一导出
```

### 2. 迁移步骤

1.  ✅ **功能完整性确认**：
    *   `NapCatAdapter` 已经实现了 `NapCatClient` 的所有核心功能（消息收发、事件处理、API 调用）。
    *   所有事件（如群成员变动、好友请求等）已正确转发到 `FeatureManager`。

2.  ✅ **解耦依赖**：
    *   已将 `NapCatClient/convert.ts` 中的工具函数迁移到 `qq/napcat/convert.ts`。
    *   已将类型定义整合到 `qq/types.ts`。

3.  ✅ **Telegram 客户端整理**：
    *   已创建 `src/infrastructure/clients/telegram/` 目录。
    *   已将 `TelegramChat.ts`, `Telegram.ts`, `TelegramImportSession.ts` 移入该目录。
    *   已更新所有相关引用。

4.  ✅ **移除旧代码**：
    *   已删除 `src/infrastructure/clients/NapCatClient/` 目录。
    *   已删除 `src/infrastructure/clients/QQClient/` 目录。

### 3. 遗留问题

⚠️ **`Pair.ts` 需要进一步迁移**：
- `Pair.ts` 仍然使用旧的 `Friend` 和 `Group` 类型（来自已删除的 `QQClient`）。
- 已暂时注释掉使用 `NapCatGroup.renew()` 的代码。
- 需要在后续的 Phase 2 中将 `Pair.ts` 完全迁移到新的 `IQQClient` 架构。

### 4. 执行时机

✅ **已完成** Infrastructure 层清理（2024-12-01）

下一步优先级：
1.  ✅ 确保功能稳定（语音/视频转发）[已完成]。
2.  ✅ 完成 `FeatureManager` 的全面接管 [已完成]。
3.  ✅ 执行 Infrastructure 层清理 [已完成]。
4.  ⏭️ 迁移 `Pair.ts` 到新架构（Phase 2）。
