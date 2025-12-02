# NapGram

> A modern QQ-Telegram message bridge powered by NapCat and mtcute

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

## ✨ Features

- 🚀 **Modern Tech Stack**: Built on NapCat (QQ) and mtcute (Telegram)
- 💬 **Bidirectional Forwarding**: Seamless message sync between QQ and Telegram
- 📎 **Rich Media Support**: Images, videos, audio, files, and stickers
- ⚡ **High Performance**: Optimized with Stream API for large files
- 🔒 **Type Safe**: Full TypeScript with strict type checking
- 🐳 **Docker Ready**: Easy deployment with Docker Compose
- 🎯 **Feature Rich**: Commands, media forwarding, group management

## 🏗️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **QQ Client** | [NapCat](https://github.com/NapNeko/NapCatQQ) + [node-napcat-ts](https://github.com/HkTeamX/node-napcat-ts) |
| **Telegram Client** | [mtcute](https://github.com/mtcute/mtcute) |
| **Language** | TypeScript (ESM) |
| **Runtime** | Node.js 18+ |
| **Database** | PostgreSQL |
| **Build Tool** | esbuild |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL
- QQ account
- Telegram account

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/magisk317/NapGram.git
cd NapGram

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start with Docker Compose
docker-compose up -d
```

### Manual Installation

```bash
# Install dependencies
cd main
npm install

# Build
npm run build

# Start
npm start
```

## 📖 Documentation

- [Deployment Guide](./docs/deployment.md)
- [Configuration](./docs/integration.md)
- [Changelog](./docs/changelog.md)

## 🎯 Features

### Message Forwarding
- ✅ Text messages with formatting
- ✅ Images and photos
- ✅ Videos and animations
- ✅ Audio and voice messages
- ✅ Files and documents
- ✅ Stickers and emojis
- ✅ Forward messages
- ✅ Reply messages

### Commands
- `/bind` - Bind QQ group to Telegram chat
- `/unbind` - Unbind QQ group from Telegram chat
- `/mode` - Configure forwarding mode
- `/help` - Show help message

### Advanced Features
- 📊 Message statistics
- 🔄 Auto-reconnect
- 🎨 Rich message formatting
- 👥 Group member management
- 🔔 Notification control

## 🛠️ Development

```bash
# Install dependencies
cd main
npm install

# Development mode
npm run dev

# Type checking
npm run type-check

# Build
npm run build
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Credits

- Inspired by [q2tg](https://github.com/clansty/Q2TG) - Original QQ-Telegram bridge
- Powered by [NapCat](https://github.com/NapNeko/NapCatQQ) - Modern QQ bot framework
- Powered by [mtcute](https://github.com/mtcute/mtcute) - Modern Telegram client library

## ⚠️ Disclaimer

This project is for educational and personal use only. Please comply with the Terms of Service of QQ and Telegram.

## 📧 Contact

- GitHub Issues: [Report a bug](https://github.com/magisk317/NapGram/issues)
- Telegram: [Join discussion](https://t.me/napgram) (if available)

---

Made with ❤️ by [magisk317](https://github.com/magisk317)
