ARG INSTALL_PG_CLIENT=true
ARG LOTTIE_IMAGE=edasriyan/lottie-to-gif@sha256:0eb24cf4f38c6c62b66f37bfba463fff4de4f64cb9a6127df0b9543fc4b9c649
# renovate: datasource=github-tags depName=oven-sh/bun extractVersion=^bun-v(?<version>.+)$
ARG BUN_VERSION=1.4.0
ARG BUN_IMAGE=oven/bun:${BUN_VERSION}-alpine
ARG BUN_CONFIG_REGISTRY=https://registry.npmmirror.com

# Extract TGS conversion tools
FROM ${LOTTIE_IMAGE} AS lottie

# Base runtime image
FROM ${BUN_IMAGE} AS base
ARG USE_MIRROR=true
ARG INSTALL_PG_CLIENT=true

# Base Alpine packages. Keep APKINDEX files until triggers finish; postgresql-common
# reads them during post-install and can turn transient index fetches into failures.
RUN set -eux; \
    if [ "$USE_MIRROR" = "true" ]; then \
      sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories; \
    fi; \
    packages="curl wget bash font-wqy-zenhei pixman cairo pango giflib libjpeg-turbo libpng librsvg vips ffmpeg yt-dlp"; \
    if [ "$INSTALL_PG_CLIENT" = "true" ]; then \
      packages="$packages postgresql-client"; \
    fi; \
    for attempt in 1 2 3; do \
      rm -rf /var/cache/apk/*; \
      if apk update && apk upgrade && apk add $packages; then \
        break; \
      fi; \
      if [ "$attempt" -eq 3 ]; then \
        exit 1; \
      fi; \
      sleep "$((attempt * 5))"; \
    done; \
    rm -rf /var/cache/apk/*

# Copy TGS conversion tools
COPY --from=lottie /usr/bin/lottie_to_png /usr/bin/
COPY --from=lottie /usr/bin/gifski /usr/bin/

# Compat layer for Debian-built binaries
RUN set -eux; \
    for attempt in 1 2 3; do \
      rm -rf /var/cache/apk/*; \
      if apk update && apk add gcompat; then \
        break; \
      fi; \
      if [ "$attempt" -eq 3 ]; then \
        exit 1; \
      fi; \
      sleep "$((attempt * 5))"; \
    done; \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Turbo pruner stage: create a trimmed-down subset of the monorepo for the app
FROM base AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.11 prune @napgram/app --docker

# Workspace build image
FROM base AS workspace
ARG USE_MIRROR=true
ARG BUN_CONFIG_REGISTRY
ENV BUN_INSTALL_CACHE_DIR=/bun-cache \
    BUN_CONFIG_REGISTRY=${BUN_CONFIG_REGISTRY} \
    CI=true

# Build dependencies
RUN set -eux; \
    for attempt in 1 2 3; do \
      rm -rf /var/cache/apk/*; \
      if apk update && apk add \
        python3 make g++ pkgconfig \
        pixman-dev cairo-dev pango-dev giflib-dev libjpeg-turbo-dev libpng-dev librsvg-dev vips-dev; then \
        break; \
      fi; \
      if [ "$attempt" -eq 3 ]; then \
        exit 1; \
      fi; \
      sleep "$((attempt * 5))"; \
    done; \
    rm -rf /var/cache/apk/*

# First install only dependencies (cached by package.json / lockfile changes only)
COPY --from=pruner /app/out/json/ /app/
COPY --from=pruner /app/out/bun.lock /app/bun.lock

RUN --mount=type=cache,target=/bun-cache \
    printf '@naplink:registry=https://gitlab.com/api/v4/projects/84834294/packages/npm/\n' > /app/.npmrc && \
    (bun install --frozen-lockfile --cache-dir /bun-cache || \
      BUN_CONFIG_REGISTRY=https://registry.npmjs.org bun install --frozen-lockfile --cache-dir /bun-cache) && \
    rm -f /app/.npmrc

# Copy source code and build
COPY --from=pruner /app/out/full/ /app/
COPY tsconfig.base.json tsconfig.json /app/
COPY packages/tsconfig.base.json /app/packages/tsconfig.base.json

# Build workspace packages and main app using turbo
RUN --mount=type=cache,target=/bun-cache \
    bun run build && \
    cd main && \
    bun run check:bundle

# `web/dist` is populated by the external UI checkout in CI; only the built assets are copied here.
COPY web/dist/ /app/web/dist/

# Keep production dependencies only
FROM workspace AS build
RUN --mount=type=cache,target=/bun-cache \
    find . -type d -name node_modules -prune -exec rm -rf {} + && \
    bun install --production --frozen-lockfile --force --cache-dir /bun-cache

# Release image
FROM base AS release
ARG REPO=Local Build
ARG REF=Local Build
ARG COMMIT=Local Build

COPY --from=build --chown=bun:bun /app/node_modules /app/node_modules
# Preserve Bun's per-workspace dependency links.
COPY --from=build --chown=bun:bun /app/main/node_modules /app/main/node_modules
COPY --from=workspace --chown=bun:bun /app/main/build /app/main/build
COPY --from=workspace --chown=bun:bun /app/main/tools/drizzle.config.cjs /app/main/tools/drizzle.config.cjs
COPY --from=workspace --chown=bun:bun /app/main/tools/drizzle /app/main/tools/drizzle
COPY --from=workspace --chown=bun:bun /app/main/tools/run-drizzle-migrations.sh /app/main/tools/run-drizzle-migrations.sh
COPY --from=workspace --chown=bun:bun /app/packages/clients/database/dist/schema /app/main/tools/runtime-schemas/database
COPY --from=workspace --chown=bun:bun /app/packages/plugins/admin/permission-management/dist/database /app/main/tools/runtime-schemas/permission-management
# Hand the prebuilt UI bundle into the runtime image.
COPY --from=workspace --chown=bun:bun /app/web/dist /app/public

# Prepare runtime directories
RUN rm -rf /app/node_modules/@napgram && \
    mkdir -p /app/data /app/.config/QQ && \
    chown -R bun:bun /app/data /app/.config/QQ

# External plugins import the public SDK at runtime. Keep only that API surface
# and its runtime dependencies; the application bundles the other workspaces.
COPY --from=workspace --chown=bun:bun /app/packages/sdk/package.json /app/node_modules/@napgram/sdk/package.json
COPY --from=workspace --chown=bun:bun /app/packages/sdk/dist /app/node_modules/@napgram/sdk/dist
COPY --from=workspace --chown=bun:bun /app/packages/sdk-core/package.json /app/node_modules/@napgram/sdk-core/package.json
COPY --from=workspace --chown=bun:bun /app/packages/sdk-core/dist /app/node_modules/@napgram/sdk-core/dist
COPY --from=workspace --chown=bun:bun /app/packages/sdk-utils/package.json /app/node_modules/@napgram/sdk-utils/package.json
COPY --from=workspace --chown=bun:bun /app/packages/sdk-utils/dist /app/node_modules/@napgram/sdk-utils/dist

COPY --chown=bun:bun docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/main/tools/run-drizzle-migrations.sh && \
    bun -e "await import('@napgram/sdk')"

ENV DATA_DIR=/app/data \
    CACHE_DIR=/app/.config/QQ/NapCat/temp \
    UI_PATH=/app/public \
    REPO=${REPO} \
    REF=${REF} \
    COMMIT=${COMMIT}

EXPOSE 8080
USER bun
CMD ["/app/entrypoint.sh"]
