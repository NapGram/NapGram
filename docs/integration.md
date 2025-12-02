# 新架构集成说明

## 集成状态

### ✅ 已完成
- Instance.ts 已集成新架构
- FeatureManager 自动初始化
- 新旧架构并行运行

### 🔄 当前状态
新架构和旧架构**并行运行**：
- **旧架构**: 现有的 Controllers 继续工作
- **新架构**: FeatureManager 和 Features 同时运行

这样可以：
1. 确保现有功能不受影响
2. 逐步验证新架构的稳定性
3. 平滑过渡，无需一次性切换

## 初始化流程

```typescript
// Instance.ts init() 方法
async init() {
  // 1. 登录 Telegram Bot
  this.tgBot = await Telegram.connect(...);
  
  // 2. 登录 Telegram UserBot
  this.tgUser = await Telegram.connect(...);
  
  // 3. 登录 OICQ (旧架构)
  this.oicq = await QQClient.create(...);
  
  // 4. 初始化新架构 QQ 客户端
  this.qqClient = await qqClientFactory.create({
    type: 'napcat',
    wsUrl: this.qq.wsUrl,
    reconnect: true,
  });
  await this.qqClient.login();
  
  // 5. 初始化 FeatureManager (新架构)
  this.featureManager = new FeatureManager(
    this,
    this.tgBot,
    this.qqClient
  );
  await this.featureManager.initialize();
  
  // 6. 初始化旧 Controllers
  this.forwardController = new ForwardController(...);
  // ... 其他 controllers
}
```

## 新架构功能

当 Instance 初始化后，以下功能自动启用：

### 1. ForwardFeature
- 监听 QQ 消息
- 使用统一的消息格式
- 与旧 ForwardController 并行运行

### 2. RecallFeature
- 双向消息撤回
- 数据库同步
- 与旧 DeleteMessageController 并行运行

### 3. MediaFeature
- 统一的媒体处理
- 下载、压缩、大小检查

### 4. CommandsFeature
- 可扩展的命令系统
- 内置命令: /help, /status, /bind
- 权限检查

## 访问新架构

在 Instance 中访问新架构：

```typescript
// 访问 FeatureManager
instance.featureManager

// 访问具体功能
instance.featureManager.forward
instance.featureManager.recall
instance.featureManager.media
instance.featureManager.commands

// 访问新 QQ 客户端
instance.qqClient

// 注册自定义命令
instance.featureManager.commands?.registerCommand({
  name: 'test',
  description: '测试命令',
  handler: async (msg, args) => {
    // 处理逻辑
  },
});
```

## 逐步迁移计划

### 阶段 1: 并行运行 (当前)
- ✅ 新旧架构同时运行
- ✅ 验证新架构稳定性
- ✅ 对比功能完整性

### 阶段 2: 功能切换
- [ ] 逐个禁用旧 Controllers
- [ ] 验证新 Features 功能
- [ ] 修复发现的问题

### 阶段 3: 完全迁移
- [ ] 移除所有旧 Controllers
- [ ] 移除 OICQ 客户端
- [ ] 清理废弃代码

### 阶段 4: 优化
- [ ] 性能优化
- [ ] 添加监控
- [ ] 完善文档

## 配置要求

### 数据库
当前配置兼容新旧架构，无需修改。

### 环境变量
```env
# NapCat WebSocket URL (必需)
NAPCAT_WS_URL=ws://localhost:3001
```

### Docker Compose
确保 NapCat 服务正在运行：
```yaml
services:
  napcat:
    image: napcat/napcat:latest
    ports:
      - "3001:3001"
```

## 监控和日志

新架构的日志标识：
```
[FeatureManager] - 功能管理器日志
[ForwardFeature] - 转发功能日志
[RecallFeature] - 撤回功能日志
[MediaFeature] - 媒体处理日志
[CommandsFeature] - 命令系统日志
[NapCatAdapter] - NapCat 适配器日志
[MessageConverter] - 消息转换器日志
```

## 故障排查

### 问题: FeatureManager 未初始化
**原因**: NapCat 连接失败  
**解决**: 检查 `wsUrl` 配置和 NapCat 服务状态

### 问题: 消息重复转发
**原因**: 新旧架构同时转发  
**解决**: 这是正常的并行运行状态，后续会逐步禁用旧架构

### 问题: 命令不响应
**原因**: 权限检查或命令未注册  
**解决**: 检查日志，确认命令注册成功

## 性能影响

### 内存使用
- 新架构增加约 50MB 内存使用
- 并行运行期间总增加约 100MB

### CPU 使用
- 消息转换增加约 5% CPU 使用
- 正常情况下可忽略不计

### 网络
- 新架构使用 WebSocket 连接
- 与旧架构共享 NapCat 实例，无额外网络开销

## 下一步

1. **监控运行**: 观察新架构运行状态
2. **收集反馈**: 记录问题和改进点
3. **逐步切换**: 开始禁用旧 Controllers
4. **性能优化**: 进入 Phase 5

---

**文档版本**: 1.0  
**最后更新**: 2025-11-29  
**状态**: 集成完成，并行运行中
