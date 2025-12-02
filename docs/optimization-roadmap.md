# Q2TG 优化路线（持续更新）

面向现有重构版的优化待办，按优先级排列，后续可逐步落实。

## 高优先
- **数据库变更流程**：已改为 `prisma migrate deploy`（替换启动时的 `prisma db push --accept-data-loss`），使用迁移文件落库，避免生产环境潜在数据丢失。
- **入口脚本可靠性**：`docker-entrypoint.sh` 已启用 `set -euo pipefail`，并在启动前确保目录存在后再 chown/chmod，流程失败即退出。
- **迁移容错机制**：`docker-entrypoint.sh` 已添加 P3005 错误（数据库非空）的自动处理，遇到该错误时会自动 baseline 所有迁移后重试，避免首次部署或数据库恢复时的启动失败。
- **容器最小权限化**：已使用 node 基础镜像自带的 node 用户（UID/GID 1000）运行服务，在构建阶段完成权限设置，移除运行时 `chown -R` 和 `chmod -R a+rwX` 操作，提升安全性和启动速度。
- **启动时递归 chown 优化**：已在容器最小权限化过程中实现。通过构建期设置文件所有权和移除 entrypoint 中的权限修复逻辑，消除了启动时的 IO 开销。
- **HTTP 客户端统一**：已移除 `axios` 依赖，全面迁移至 `undici` (Node 22 原生 fetch)，统一了网络请求方式并减少了依赖体积。
- **WebSocket 重连**：已移除 `reconnecting-websocket` 依赖，使用 Node 22 原生 `WebSocket` + 自定义封装类实现自动重连，实现了零依赖 WebSocket 客户端。
- **构建链路简化**：已移除 `build` 脚本中冗余的 `tsc` 编译步骤，直接使用 `esbuild` (via `tsx build.ts`) 进行打包，提升了构建速度。

## 中优先

## 低优先
- **Dockerfile 清理**：移除重复的 `ENV TGS_TO_GIF`；为服务增加轻量 `/health` 端点和 Docker `HEALTHCHECK`，提升可观测性。

## 技术栈更新建议
- **日志库**：已从 `log4js` 迁移至 `tslog`，当前为 JSON 行输出、按天分文件；后续可评估集中化收集（ELK/OpenSearch、Loki 等）。
- **Telegram SDK 跟进**：使用自维护的 gramJS fork，建议持续跟进 upstream/官方 MTProto 实现，评估回归上游以降低维护成本。
- **文件类型识别升级**：`file-type@16` 较旧，可升级到新版（19+），获取更多格式支持与安全修复，注意可能的 ESM 变更。
