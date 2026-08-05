ARG INSTALL_PG_CLIENT=true
ARG LOTTIE_IMAGE=edasriyan/lottie-to-gif@sha256:0eb24cf4f38c6c62b66f37bfba463fff4de4f64cb9a6127df0b9543fc4b9c649
ARG NODE_IMAGE=node:26-alpine@sha256:a4fb14143ee24c038c851864fe85fd90f9121abc8fdca3092798bcc02e06b1d8
# renovate: datasource=npm depName=pnpm
ARG PNPM_VERSION=11.19.0
ARG PNPM_CONFIG_REGISTRY=https://registry.npmmirror.com

# Extract TGS conversion tools
FROM ${LOTTIE_IMAGE} AS lottie

# Base runtime image
FROM ${NODE_IMAGE} AS base
ARG USE_MIRROR=true
ARG INSTALL_PG_CLIENT=true
ARG PNPM_VERSION
ARG PNPM_CONFIG_REGISTRY

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

RUN npm install --global --registry="${PNPM_CONFIG_REGISTRY}" "pnpm@${PNPM_VERSION}" || \
    npm install --global --registry="https://registry.npmjs.org" "pnpm@${PNPM_VERSION}"
WORKDIR /app

# Workspace build image
FROM base AS workspace
ARG USE_MIRROR=true
ARG PNPM_CONFIG_REGISTRY
ENV PNPM_CONFIG_STORE_DIR=/pnpm-store \
    PNPM_CONFIG_REGISTRY=${PNPM_CONFIG_REGISTRY} \
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

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json* tsconfig.base.json /app/
COPY main/package.json /app/main/
COPY packages/ /app/packages/

# Install dependencies
RUN --mount=type=cache,target=/pnpm-store \
    --mount=type=secret,id=npmrc \
    printf '@naplink:registry=https://gitlab.com/api/v4/projects/84834294/packages/npm/\n' > /app/.npmrc && \
    if [ -f /run/secrets/npmrc ]; then \
        echo "@napgram:registry=https://npm.pkg.github.com" >> /app/.npmrc; \
        cat /run/secrets/npmrc >> /app/.npmrc; \
    fi && \
    (pnpm install --frozen-lockfile --shamefully-hoist || \
      PNPM_CONFIG_REGISTRY=https://registry.npmjs.org pnpm install --frozen-lockfile --shamefully-hoist) && \
    rm -f /app/.npmrc

# Build workspace packages first
RUN --mount=type=cache,target=/pnpm-store \
    pnpm -r --filter "./packages/**" run build

# Build the main app
COPY main/ /app/main/
RUN pnpm --filter ./main run build && \
    pnpm --filter ./main run check:bundle

# `web/dist` is populated by the external UI checkout in CI; only the built assets are copied here.
COPY web/dist/ /app/web/dist/

# Keep production dependencies only
FROM workspace AS build
RUN --mount=type=cache,target=/pnpm-store \
    pnpm prune --prod

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
# Hand the prebuilt UI bundle into the runtime image.
COPY --from=workspace --chown=node:node /app/web/dist /app/public

# Prepare runtime directories
RUN rm -rf /app/node_modules/@napgram && \
    mkdir -p /app/data /app/.config/QQ && \
    chown -R node:node /app/data /app/.config/QQ

# External plugins import the public SDK at runtime. Keep only that API surface
# and its runtime dependencies; the application bundles the other workspaces.
COPY --from=workspace --chown=node:node /app/packages/sdk/package.json /app/node_modules/@napgram/sdk/package.json
COPY --from=workspace --chown=node:node /app/packages/sdk/dist /app/node_modules/@napgram/sdk/dist
COPY --from=workspace --chown=node:node /app/packages/sdk-core/package.json /app/node_modules/@napgram/sdk-core/package.json
COPY --from=workspace --chown=node:node /app/packages/sdk-core/dist /app/node_modules/@napgram/sdk-core/dist
COPY --from=workspace --chown=node:node /app/packages/sdk-utils/package.json /app/node_modules/@napgram/sdk-utils/package.json
COPY --from=workspace --chown=node:node /app/packages/sdk-utils/dist /app/node_modules/@napgram/sdk-utils/dist

COPY --chown=node:node docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/main/tools/run-drizzle-migrations.sh && \
    node -e "import('@napgram/sdk')"

ENV DATA_DIR=/app/data \
    CACHE_DIR=/app/.config/QQ/NapCat/temp \
    UI_PATH=/app/public \
    REPO=${REPO} \
    REF=${REF} \
    COMMIT=${COMMIT}

EXPOSE 8080
USER node
CMD ["/app/entrypoint.sh"]
