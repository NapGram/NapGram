# Docker Compose 部署示例

本文档提供两种部署方案的完整配置示例。

---

## 方案一：使用 Cloudflare Tunnel

适合需要公网访问但没有公网 IP 的场景。

### docker-compose.yaml

```yaml
version: "3.8"

volumes:
  postgresql:
  q2tg:
  cache:
  napcat-data:
  napcat-config:

services:
  # 如果有现成的 Postgresql 实例，可以删除这一小节
  postgres:
    image: postgres:14-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: db_name
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - postgresql:/var/lib/postgresql/data

  tunnel:
    container_name: cloudflared-tunnel
    image: cloudflare/cloudflared
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN= # 此处填入设定 Cloudflare Tunnel 时产生的指令的 --token 后面那一串密钥

  napcat:
    image: mlikiowa/napcat-docker:latest
    environment:
      - ACCOUNT=要登录的 QQ 号
      - WS_ENABLE=true
      - NAPCAT_GID=1000
      - NAPCAT_UID=1000
    ports:
      - 6099:6099
    mac_address: 02:42:12:34:56:78 # 请修改为一个固定的 MAC 地址，但是不要和其他容器或你的主机重复
    restart: unless-stopped
    volumes:
      - napcat-data:/app/.config/QQ
      - napcat-config:/app/napcat/config
      - cache:/app/.config/QQ/NapCat/temp

  q2tg:
    image: ghcr.io/clansty/q2tg:sleepyfox
    restart: unless-stopped
    depends_on:
      - postgres
      - napcat
    ports:
      # 如果要使用 RICH_HEADER 需要将端口发布到公网
      - 8080:8080
    volumes:
      - q2tg:/app/data
      - cache:/app/.config/QQ/NapCat/temp
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - TG_API_ID=
      - TG_API_HASH=
      - TG_BOT_TOKEN=
      - DATABASE_URL=postgres://user:password@postgres/db_name
      - NAPCAT_WS_URL=ws://napcat:3001
      - TG_CONNECTION=tcp # 连接 Telegram 的方式，也可以改成 websocket
      # 如果你需要使用 /flags set RICH_HEADER 来显示头像，或者正确显示合并转发的消息记录，则需将 q2tg 8080 端口发布到公网，可以使用 cloudflare tunnel
      # 请尽量配置这个服务
      - WEB_ENDPOINT= # https://yourichheader.com 填写你发布到公网的域名
      #- CRV_VIEWER_APP=
      # DEPRECATED: 请使用 WEB_ENDPOINT
      #- CRV_API=
      #- CRV_KEY=
      # 要关闭文件上传提示，请取消注释以下变量 https://github.com/clansty/Q2TG/issues/153
      #- DISABLE_FILE_UPLOAD_TIP=1
      # 如果需要通过代理联网，那么设置下面两个变量
      #- PROXY_IP=
      #- PROXY_PORT=
      # 代理联网认证，有需要请修改下面两个变量
      #- PROXY_USERNAME=
      #- PROXY_PASSWORD=
```

### 配置步骤

1. 在 Cloudflare 创建 Tunnel，获取 Token
2. 修改 `TUNNEL_TOKEN` 为你的 Token
3. 修改 NapCat 的 `ACCOUNT` 和 `mac_address`
4. 配置 Q2TG 的环境变量（API ID、Hash、Bot Token 等）
5. 设置 `WEB_ENDPOINT` 为你的 Tunnel 域名

---

## 方案二：使用 Nginx + Certbot

适合有公网 IP 和域名的场景。

### docker-compose.yaml

```yaml
version: "3.8"

volumes:
  postgresql:
  q2tg:
  cache:
  napcat-data:
  napcat-config:
  certbot-etc:
  certbot-var:

services:
  # 如果有现成的 Postgresql 实例，可以删除这一小节
  postgres:
    image: postgres:14-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: db_name
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - postgresql:/var/lib/postgresql/data

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - certbot-etc:/etc/letsencrypt
      - certbot-var:/var/lib/letsencrypt
    depends_on:
      - q2tg

  certbot:
    image: certbot/certbot
    volumes:
      - certbot-etc:/etc/letsencrypt
      - certbot-var:/var/lib/letsencrypt
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

  napcat:
    image: mlikiowa/napcat-docker:latest
    environment:
      - ACCOUNT=要登录的 QQ 号
      - WS_ENABLE=true
      - NAPCAT_GID=1000
      - NAPCAT_UID=1000
    ports:
      - 6099:6099
    mac_address: 02:42:12:34:56:78 # 请修改为一个固定的 MAC 地址
    restart: unless-stopped
    volumes:
      - napcat-data:/app/.config/QQ
      - napcat-config:/app/napcat/config
      - cache:/app/.config/QQ/NapCat/temp

  q2tg:
    image: ghcr.io/clansty/q2tg:sleepyfox
    restart: unless-stopped
    depends_on:
      - postgres
      - napcat
    expose:
      - "8080"
    volumes:
      - q2tg:/app/data
      - cache:/app/.config/QQ/NapCat/temp
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - TG_API_ID=
      - TG_API_HASH=
      - TG_BOT_TOKEN=
      - DATABASE_URL=postgres://user:password@postgres/db_name
      - NAPCAT_WS_URL=ws://napcat:3001
      - TG_CONNECTION=tcp
      - WEB_ENDPOINT= # https://your-domain.com
```

### nginx.conf

```nginx
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name your-domain.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl;
        server_name your-domain.com;

        ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

        location / {
            proxy_pass http://q2tg:8080;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### 配置步骤

1. 将 `your-domain.com` 替换为你的域名
2. 修改 NapCat 的 `ACCOUNT` 和 `mac_address`
3. 配置 Q2TG 的环境变量
4. 首次运行前，先获取 SSL 证书：
   ```bash
   docker-compose run --rm certbot certonly --webroot -w /var/www/certbot -d your-domain.com
   ```
5. 启动服务：
   ```bash
   docker-compose up -d
   ```

---

## 环境变量说明

### 必需配置

- `TG_API_ID`: Telegram API ID（从 https://my.telegram.org 获取）
- `TG_API_HASH`: Telegram API Hash
- `TG_BOT_TOKEN`: Telegram Bot Token（从 @BotFather 获取）
- `DATABASE_URL`: PostgreSQL 连接字符串
- `NAPCAT_WS_URL`: NapCat WebSocket 地址
- `WEB_ENDPOINT`: 公网访问地址（用于 Rich Header 功能）

### 可选配置

- `TG_CONNECTION`: Telegram 连接方式（tcp 或 websocket）
- `DISABLE_FILE_UPLOAD_TIP`: 禁用文件上传提示（设为 1）
- `PROXY_IP` / `PROXY_PORT`: 代理服务器配置
- `PROXY_USERNAME` / `PROXY_PASSWORD`: 代理认证

---

## 注意事项

1. **NapCat 服务**: 必须自行准备和配置
2. **MAC 地址**: 每个 NapCat 实例需要唯一的 MAC 地址
3. **Rich Header**: 需要公网访问才能正常显示头像和合并转发
4. **数据持久化**: 使用 Docker volumes 保存数据
5. **安全性**: 生产环境请修改默认密码

---

**最后更新**: 2025-11-30  
**适用版本**: refactor 分支
