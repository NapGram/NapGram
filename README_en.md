<p align="center"><a href="./README.md">简体中文</a> | <strong>English</strong></p>

<h1 align="center">NapGram</h1>

<p align="center">A modern QQ-Telegram message bridge powered by NapCat and mtcute</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-25-green.svg" alt="Node.js" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript" /></a>
  <a href="https://github.com/NapGram/NapGram/actions/workflows/docker-release.yml"><img src="https://github.com/NapGram/NapGram/actions/workflows/docker-release.yml/badge.svg?event=release&label=Release%20Build" alt="Release Build" /></a>
  <a href="https://codecov.io/gh/NapGram/NapGram"><img src="https://codecov.io/gh/NapGram/NapGram/branch/dev/graph/badge.svg" alt="Codecov" /></a>
  <a href="https://github.com/NapLink/NapGram/releases"><img src="https://img.shields.io/github/v/release/NapLink/NapGram?display_name=tag&include_prereleases&logo=git&label=Latest" alt="Release" /></a>
  <a href="https://github.com/NapLink/NapGram/releases"><img src="https://img.shields.io/github/downloads/NapLink/NapGram/total?label=Release%20Downloads&logo=github" alt="Downloads" /></a>
  <a href="https://github.com/NapGram/NapGram/pkgs/container/napgram"><img src="https://img.shields.io/badge/ghcr.io%2FNapGram%2Fnapgram-blue?logo=docker&label=Container" alt="GHCR Image" /></a>
  <a href="https://github.com/NapLink/NapGram/commits/main"><img src="https://img.shields.io/github/last-commit/NapLink/NapGram/main?logo=github&label=Last%20Commit" alt="Last Commit" /></a>
  <a href="https://github.com/NapLink/NapGram/pulse"><img src="https://img.shields.io/github/commit-activity/m/NapLink/NapGram?logo=github&label=Commit%20Activity" alt="Commit Activity" /></a>
  <a href="https://github.com/NapLink/NapGram/issues"><img src="https://img.shields.io/github/issues/NapLink/NapGram?logo=github" alt="Issues" /></a>
  <a href="https://github.com/NapLink/NapGram/pulls"><img src="https://img.shields.io/github/issues-pr/NapLink/NapGram?logo=github&label=Pull%20Requests" alt="PRs" /></a>
  <a href="https://github.com/NapLink/NapGram/stargazers"><img src="https://img.shields.io/github/stars/NapLink/NapGram?style=social" alt="Stars" /></a>
  <a href="https://github.com/NapLink/NapGram/network/members"><img src="https://img.shields.io/github/forks/NapLink/NapGram?style=social" alt="Forks" /></a>
</p>

## ✨ Features

- 🚀 **Modern architecture**: NapCat (QQ) + mtcute (Telegram), Fastify-based backend
- 💬 **Full message support**: text, images, videos, audio, files, stickers, replies/forwards
- 🛡️ **Stability & monitoring**: reconnect, recall sync, stats & latency metrics
- 🐳 **Docker ready**: built-in Web Dashboard served from the container
- **Web Dashboard**:
  - ✅ Built-in in the Docker image (default `8080`, visit `http://<host>:8080/`)
  - 📊 Monitoring & statistics (overview, trends, latency)
  - ⚙️ Admin operations (instances/pairs/settings, logs & message queries)

## 🏗️ Tech Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| **QQ adapter** | [NapCat](https://github.com/NapNeko/NapCatQQ) | WebSocket-based protocol adapter |
| **TG adapter** | [mtcute](https://github.com/mtcute/mtcute) | Native MTProto (no Bot API proxy) |
| **Language** | TypeScript 5.0+ | Strict mode, end-to-end type safety |
| **Frontend** | React 19 + Vite | Tailwind CSS 4, Shadcn UI, Recharts |
| **Runtime** | Node.js 25 (ESM) | Modern module system |
| **Persistence** | PostgreSQL + Prisma 7 | Typed ORM, schema & migrations |
| **Testing** | Vitest | Unit tests |

## 🚀 Quick Start

### Prerequisites

- Node.js 25+
- PostgreSQL 14+
- **NapCat (required)**: deploy [NapCatQQ](https://napneko.github.io/) and enable WebSocket
- Network access from NapGram to NapCat

### Docker (Recommended)

**Note**: NapGram requires connection to a deployed NapCat instance. Please ensure NapCat is running first.

```bash
# Clone the repository
git clone https://github.com/NapLink/NapGram.git
cd NapGram

# Copy and edit Docker Compose
cp compose.example.yaml docker-compose.yml
## Edit docker-compose.yml -> services.napgram.environment (required: TG_API_ID / TG_API_HASH / TG_BOT_TOKEN)

docker-compose pull
docker-compose up -d
```

**NapCat Configuration**:
- Ensure NapCat has WebSocket or HTTP interface enabled
- Configure `NAPCAT_WS_URL` in `docker-compose.yml`
- NapCat and NapGram must be in the same network or accessible to each other

### Manual Installation

```bash
# Install dependencies
pnpm install

# Build
pnpm --filter=@napgram/app run build

# Start
pnpm --filter=@napgram/app start
```

## 📖 Documentation

- GitHub Wiki: https://github.com/NapLink/NapGram/wiki
- Changelog: https://github.com/NapLink/NapGram/wiki/Changelog
- Plugins: https://github.com/NapLink/NapGram/wiki/Operations-Plugins
- Upgrade & Migration (FAQ): https://github.com/NapLink/NapGram/wiki/Operations-Upgrade
- Commands: https://github.com/NapLink/NapGram/wiki/Guide-Commands

## 📅 Changelog

📝 **[View Changelog](https://github.com/NapLink/NapGram/wiki/Changelog)**

## 🧩 Feature Modules

### 📨 Message Handling
- **ForwardFeature**: Core forwarding logic with deduplication and advanced strategies
- **RecallFeature**: Bidirectional recall synchronization (QQ <-> Telegram)
- **MediaFeature**: Unified media download and transcoding (Silk/Ogg/Images/Videos/Files)
- **ModeFilter**: Message mode filter (Group/Private/Allowlist/Blocklist)

### 👥 Group & Interaction
- **GroupManagement**: Group management (Member changes, Invite/Kick handling)
- **QQInteraction**: QQ interaction handling (Friend/Group requests via TG buttons)
- **RequestManagement**: Centralized request management system

### 📊 System & Monitoring
- **Monitoring**: Real-time system monitoring (CPU/Memory/Event Loop Latency)
- **Statistics**: Message statistics and data analysis
- **PingPong**: Latency check and connectivity testing
- **Notifications**: Offline/Reconnect notifications (NapCat disconnect alerts)

### 🛠️ Admin Suite (Web Console)
- **WebConsole**: Full-featured Web Dashboard (built-in)
  - **Instance Management**: Multi-instance management
  - **Pair Management**: Visual forwarding binding management
  - **Plugin Management**: Plugin enable/disable/config
  - **Permission Management**: Role-Based Access Control (RBAC)
  - **System Settings**: Global system configuration
  - **Logs & Database**: Log viewer and database browser
  - ⚠️ The UI source lives in the `napgram-ui-dist` repository; this repository only ships the built `web/dist` artifacts.

### 🚀 Advanced
- **Gateway**: API Gateway (External access support)
- **Commands**: Powerful command system (send `/help` for full list)
- **Flags**: Feature toggles and flags management

### Commands

See Wiki: https://github.com/NapLink/NapGram/wiki/Guide-Commands

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Development mode
pnpm --filter=@napgram/app run dev

# Type checking
pnpm --filter=@napgram/app run type-check

# Build
pnpm --filter=@napgram/app run build
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📖 Repository Layout

The Web Console source is maintained in the `napgram-ui-dist` repository. This repository only keeps the built `web/dist` artifacts, and CI checks out that repository into `./web` before building and publishing.

## 🙏 Credits

- Powered by [NapCat](https://github.com/NapNeko/NapCatQQ) and [mtcute](https://github.com/mtcute/mtcute)
- Inspired by [q2tg](https://github.com/Clansty/Q2TG)
- NapCat TypeScript SDK reference: [node-napcat-ts](https://github.com/HkTeamX/node-napcat-ts)

## ⚠️ Disclaimer

This project is for educational and personal use only. Please comply with the Terms of Service of QQ and Telegram.

## ⭐ Star History

[![Star History Chart](https://starchart.cc/NapLink/NapGram.svg)](https://starchart.cc/NapLink/NapGram)

---

## 📧 Contact

- GitHub Issues: [Report a bug](https://github.com/NapLink/NapGram/issues)
- Telegram: [Join the group](https://t.me/+NR2QaQ4dlEgxYmNl)

---

Made with ❤️ by [magisk317](https://github.com/magisk317)
