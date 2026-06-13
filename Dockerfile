# syntax=docker/dockerfile:1
ARG INSTALL_PG_CLIENT=true

# Extract TGS conversion tools
FROM edasriyan/lottie-to-gif:latest AS lottie

# Base runtime image
FROM node:26-alpine3.24 AS base
ARG USE_MIRROR=true
ARG INSTALL_PG_CLIENT=true

# Base Alpine packages
RUN if [ "$USE_MIRROR" = "true" ]; then \
      sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories; \
    fi && \
    apk upgrade --no-cache && \
    apk add --no-cache \
    curl wget bash \
    font-wqy-zenhei \
    pixman cairo pango giflib libjpeg-turbo libpng librsvg vips ffmpeg yt-dlp \
    $(if [ "$INSTALL_PG_CLIENT" = "true" ]; then echo postgresql-client; fi)

# Copy TGS conversion tools
COPY --from=lottie /usr/bin/lottie_to_png /usr/bin/
COPY --from=lottie /usr/bin/gifski /usr/bin/

# Compat layer for Debian-built binaries
RUN apk add --no-cache gcompat

RUN npm install -g pnpm@latest && npm install -g npm@latest
WORKDIR /app

# Workspace build image
FROM base AS workspace
ARG USE_MIRROR=true
ENV PNPM_STORE_PATH=/pnpm-store \
    CI=true

# Build dependencies
RUN apk add --no-cache \
    python3 make g++ pkgconfig \
    pixman-dev cairo-dev pango-dev giflib-dev libjpeg-turbo-dev libpng-dev librsvg-dev vips-dev

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json* tsconfig.base.json /app/
COPY main/package.json /app/main/
COPY packages/ /app/packages/

# Install dependencies
RUN --mount=type=cache,target=/pnpm-store \
    --mount=type=secret,id=npmrc \
    if [ -f /run/secrets/npmrc ]; then \
        echo "@napgram:registry=https://npm.pkg.github.com" > /app/.npmrc; \
        cat /run/secrets/npmrc >> /app/.npmrc; \
    fi && \
    pnpm install --frozen-lockfile --shamefully-hoist && \
    rm -f /app/.npmrc

# Build workspace packages first
RUN pnpm -r --filter "./packages/**" run build

# Build the main app
COPY main/ /app/main/
RUN pnpm --filter ./main run build

# Copy prebuilt web assets
COPY web/dist/ /app/web/dist/

# Keep production dependencies only
FROM workspace AS build
RUN pnpm prune --prod

# Release image
FROM base AS release
ARG REPO=Local Build
ARG REF=Local Build
ARG COMMIT=Local Build

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
# Preserve main's pnpm symlink graph
COPY --from=workspace --chown=node:node /app/main/node_modules /app/main/node_modules
COPY --from=workspace --chown=node:node /app/main/build /app/main/build
COPY --from=workspace --chown=node:node /app/main/tools/drizzle.config.cjs /app/main/tools/drizzle.config.cjs
COPY --from=workspace --chown=node:node /app/main/tools/drizzle /app/main/tools/drizzle
COPY --from=workspace --chown=node:node /app/main/tools/run-drizzle-migrations.sh /app/main/tools/run-drizzle-migrations.sh
COPY --from=workspace --chown=node:node /app/packages/clients/database/dist/schema /app/main/tools/runtime-schemas/database
COPY --from=workspace --chown=node:node /app/packages/plugins/admin/permission-management/dist/database /app/main/tools/runtime-schemas/permission-management
COPY --from=workspace --chown=node:node /app/web/dist /app/public

# Prepare runtime directories
RUN rm -rf /app/node_modules/@napgram && \
    mkdir -p /app/data /app/.config/QQ && \
    chown -R node:node /app/data /app/.config/QQ

COPY --chown=node:node docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/main/tools/run-drizzle-migrations.sh

ENV DATA_DIR=/app/data \
    CACHE_DIR=/app/.config/QQ/NapCat/temp \
    UI_PATH=/app/public \
    REPO=${REPO} \
    REF=${REF} \
    COMMIT=${COMMIT}

EXPOSE 8080
USER node
CMD ["/app/entrypoint.sh"]
