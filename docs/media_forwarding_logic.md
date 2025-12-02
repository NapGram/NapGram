# 语音与视频双向转发逻辑总结

本文档详细描述了 Q2TG 项目中 QQ 与 Telegram 之间语音和视频消息的双向转发逻辑及实现细节。

## 1. QQ -> Telegram (QQ to TG)

### 1.1 语音转发 (Voice)

QQ 的语音消息通常采用 **SILK** 编码（虽然文件后缀可能为 `.amr` 或 `.slk`），而 Telegram 客户端主要支持 **OGG/Opus** 格式的语音消息。

**处理流程：**

1.  **接收消息**：从 NapCat 接收 QQ 消息，识别 `type: 'record'`。
2.  **获取文件**：获取语音文件的本地路径或下载 URL。
3.  **格式检测**：
    *   读取文件头，检查是否包含 `#!SILK_V3` 标识。
4.  **转码 (Transcoding)**：
    *   **SILK -> PCM**: 使用 `silk-wasm` 库将 SILK 数据解码为 PCM。
    *   **PCM -> OGG/Opus**: 使用 `ffmpeg` 将 PCM 数据编码为 Telegram 兼容的 OGG (Opus) 格式。
5.  **发送到 Telegram**：
    *   使用 `gramjs` 的 `sendMessage` 方法。
    *   **关键参数**：使用 `params.file` 传递 OGG 文件路径。
    *   **注意**：不使用 `params.voice`，因为 `gramjs` 会自动检测 OGG 文件并将其作为语音消息发送。`params.message` 设置为空字符串或根据是否有 Header 决定，以避免 API 校验错误。

### 1.2 视频转发 (Video)

**处理流程：**

1.  **接收消息**：从 NapCat 接收 QQ 消息，识别 `type: 'video'`。
2.  **获取文件**：
    *   优先从 `raw_message` 中提取视频 URL（解决 NapCat 有时只提供缩略图路径的问题）。
    *   对 URL 进行 HTML 实体解码（如 `&amp;` -> `&`）。
3.  **下载/流式传输**：
    *   如果文件较小或需要处理，下载为 Buffer。
    *   **Buffer 处理**：将 Buffer 包装为 `CustomFile` 对象（指定文件名如 `video.mp4`），以便 `gramjs` 识别 MIME 类型。
4.  **发送到 Telegram**：
    *   使用 `params.file` 传递视频数据（Buffer 或 URL）。
    *   设置 `params.supportsStreaming = true` 以支持流式播放。
    *   **注意**：不使用 `params.video`，而是依赖 `gramjs` 对 `file` 参数的类型推断。

---

## 2. Telegram -> QQ (TG to QQ)

### 2.1 语音转发 (Voice)

Telegram 的语音消息通常是 **OGG/Opus** 格式，而 QQ（通过 NapCat）通常需要 **SILK** 格式才能正常作为语音播放。

**处理流程：**

1.  **接收消息**：从 Telegram 接收消息，识别 `media` 类型为 `Document` 且 `mimeType` 为 `audio/ogg` 或包含 `DocumentAttributeAudio` 属性。
2.  **下载媒体**：
    *   使用 `gramjs` 下载媒体内容，得到 **Buffer**。
3.  **转码 (Transcoding)**：
    *   **OGG -> SILK**: 使用 `silk-wasm` 库将 OGG Buffer 编码为 SILK 格式的 Buffer。
4.  **文件保存与 URL 生成**：
    *   NapCat 运行在独立容器中，无法直接接收 Buffer 或访问 Q2TG 容器内的本地路径。
    *   将 SILK Buffer 保存为临时文件（如 `/app/data/temp/xxx.silk`）。
    *   **生成 URL**：根据配置的 `WEB_ENDPOINT` 生成可供 NapCat 访问的 HTTP URL（例如 `http://q2tg:8080/temp/xxx.silk`）。
5.  **发送到 QQ**：
    *   构造 NapCat 消息段：`{ type: 'record', data: { file: 'http://...' } }`。
    *   调用 NapCat API 发送消息。

### 2.2 视频转发 (Video)

**处理流程：**

1.  **接收消息**：从 Telegram 接收消息，识别 `media` 类型为 `Document` (video mime) 或 `Video`。
2.  **下载/获取 URL**：
    *   下载视频内容为 Buffer。
3.  **文件保存与 URL 生成**：
    *   同语音转发，将 Buffer 保存为临时文件（`.mp4`）。
    *   生成可供 NapCat 访问的 HTTP URL。
4.  **发送到 QQ**：
    *   构造 NapCat 消息段：`{ type: 'video', data: { file: 'http://...' } }`。
    *   调用 NapCat API 发送消息。

## 3. 关键技术点总结

| 功能点 | 关键问题 | 解决方案 |
| :--- | :--- | :--- |
| **QQ 语音格式** | QQ 使用 SILK，TG 不支持 | 使用 `silk-wasm` 解码 SILK，`ffmpeg` 转码为 OGG |
| **TG 语音格式** | TG 使用 OGG，QQ 不支持 | 使用 `silk-wasm` 编码为 SILK |
| **GramJS 发送** | `sendMessage` 参数校验严格 | 统一使用 `params.file`，让库自动推断类型；Buffer 需包装 `CustomFile` |
| **NapCat 接收** | 跨容器文件访问 | 将 Buffer 保存为临时文件，并通过 HTTP 服务提供 URL 给 NapCat 下载 |
| **异步处理** | 媒体下载/转码耗时 | 全链路使用 `async/await`，确保文件准备好后再发送 |
| **临时文件** | 磁盘占用 | (TODO) 需要定期清理 `data/temp` 目录下的临时文件 |
