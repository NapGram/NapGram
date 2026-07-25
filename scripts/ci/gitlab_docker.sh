#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 build-arch <amd64|arm64> | publish-manifests | list-images" >&2
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "${name} is required" >&2
    exit 2
  fi
}

registry_image() {
  require_env CI_REGISTRY_IMAGE
  printf '%s\n' "$CI_REGISTRY_IMAGE"
}

dockerhub_enabled() {
  [[ "${NAPGRAM_DOCKERHUB_PUBLISH:-false}" == "true" ]]
}

dockerhub_image() {
  dockerhub_enabled || return 1
  require_env DOCKERHUB_USERNAME
  require_env DOCKERHUB_TOKEN
  printf '%s\n' "${DOCKERHUB_IMAGE:-docker.io/${DOCKERHUB_USERNAME}/napgram}"
}

dependency_proxy_prefix() {
  local prefix="${CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX:-}"
  [[ -n "$prefix" ]] || return 1
  prefix="${prefix#http://}"
  prefix="${prefix#https://}"
  [[ "$prefix" != *'"'* && "$prefix" != *$'\n'* ]] || return 1
  printf '%s\n' "$prefix"
}

dependency_proxy_enabled() {
  [[ "${NAPGRAM_DOCKER_USE_DEPENDENCY_PROXY:-false}" == "true" ]]
}

docker_node_image() {
  if [[ -n "${NAPGRAM_DOCKER_NODE_IMAGE:-}" ]]; then
    printf '%s\n' "$NAPGRAM_DOCKER_NODE_IMAGE"
    return
  fi
  local proxy_prefix
  if dependency_proxy_enabled && proxy_prefix="$(dependency_proxy_prefix)"; then
    printf '%s/library/node@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66\n' "$proxy_prefix"
    return
  fi
  printf '%s\n' 'node@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66'
}

lottie_image() {
  if [[ -n "${NAPGRAM_LOTTIE_IMAGE:-}" ]]; then
    printf '%s\n' "$NAPGRAM_LOTTIE_IMAGE"
    return
  fi
  local proxy_prefix
  if dependency_proxy_enabled && proxy_prefix="$(dependency_proxy_prefix)"; then
    printf '%s/edasriyan/lottie-to-gif@sha256:0eb24cf4f38c6c62b66f37bfba463fff4de4f64cb9a6127df0b9543fc4b9c649\n' "$proxy_prefix"
    return
  fi
  printf '%s\n' 'edasriyan/lottie-to-gif@sha256:0eb24cf4f38c6c62b66f37bfba463fff4de4f64cb9a6127df0b9543fc4b9c649'
}

login_registries() {
  require_env CI_REGISTRY
  require_env CI_REGISTRY_USER
  require_env CI_REGISTRY_PASSWORD

  printf '%s' "$CI_REGISTRY_PASSWORD" \
    | docker login "$CI_REGISTRY" --username "$CI_REGISTRY_USER" --password-stdin

  if dockerhub_enabled; then
    require_env DOCKERHUB_USERNAME
    require_env DOCKERHUB_TOKEN
    printf '%s' "$DOCKERHUB_TOKEN" \
      | docker login docker.io --username "$DOCKERHUB_USERNAME" --password-stdin
  fi

  if [[ -n "${CI_DEPENDENCY_PROXY_SERVER:-}" && -n "${CI_DEPENDENCY_PROXY_USER:-}" && -n "${CI_DEPENDENCY_PROXY_PASSWORD:-}" ]]; then
    printf '%s' "$CI_DEPENDENCY_PROXY_PASSWORD" \
      | docker login "$CI_DEPENDENCY_PROXY_SERVER" \
          --username "$CI_DEPENDENCY_PROXY_USER" \
          --password-stdin
  fi
}

image_targets() {
  local gitlab_image
  gitlab_image="$(registry_image)"
  printf '%s\n' "$gitlab_image"
  dockerhub_image || true
}

release_tags() {
  if [[ -n "${CI_COMMIT_TAG:-}" ]]; then
    printf '%s\n' latest "$CI_COMMIT_TAG"
    return
  fi

  # Integration branch is beta; image channel tags remain dev-* for compatibility.
  if [[ "${CI_COMMIT_BRANCH:-}" == "${CI_DEFAULT_BRANCH:-beta}" || "${CI_COMMIT_BRANCH:-}" == beta ]]; then
    local build_date
    build_date="$(date -u -d "${CI_PIPELINE_CREATED_AT:-now}" +%Y%m%d 2>/dev/null || date -u +%Y%m%d)"
    printf 'dev-latest\ndev-%s\n' "$build_date"
    return
  fi

  echo "Unsupported ref: ${CI_COMMIT_REF_NAME:-unknown}" >&2
  exit 1
}

select_builder() {
  docker buildx use default
  docker buildx inspect default
}

build_arch() {
  local arch="${1:-}"
  case "$arch" in
    amd64|arm64) ;;
    *) usage; exit 2 ;;
  esac

  login_registries
  docker buildx version
  select_builder

  local registry
  registry="$(registry_image)"
  local tag_args=()
  while IFS= read -r tag; do
    [[ -n "$tag" ]] || continue
    while IFS= read -r image; do
      [[ -n "$image" ]] || continue
      tag_args+=(--tag "${image}:${tag}-${arch}")
    done < <(image_targets)
  done < <(release_tags)

  docker buildx build \
    --platform "linux/${arch}" \
    --file Dockerfile \
    --push \
    --provenance=false \
    --cache-from "type=registry,ref=${registry}:buildcache-${arch}" \
    --cache-to "type=registry,ref=${registry}:buildcache-${arch},mode=max" \
    --build-arg "REPO=${CI_PROJECT_PATH:-NapGram/NapGram}" \
    --build-arg "REF=${CI_COMMIT_REF_NAME:-unknown}" \
    --build-arg "COMMIT=${CI_COMMIT_SHA:-unknown}" \
    --build-arg "USE_MIRROR=${NAPGRAM_DOCKER_USE_MIRROR:-false}" \
    --build-arg "LOTTIE_IMAGE=$(lottie_image)" \
    --build-arg "NODE_IMAGE=$(docker_node_image)" \
    --build-arg "PNPM_VERSION=${NAPGRAM_PNPM_VERSION:-11.8.0}" \
    --build-arg "PNPM_CONFIG_REGISTRY=${PNPM_CONFIG_REGISTRY:-https://registry.npmjs.org}" \
    "${tag_args[@]}" \
    .
}

publish_manifests() {
  login_registries
  docker buildx version

  while IFS= read -r tag; do
    [[ -n "$tag" ]] || continue
    while IFS= read -r image; do
      [[ -n "$image" ]] || continue
      docker buildx imagetools create \
        --tag "${image}:${tag}" \
        "${image}:${tag}-amd64"
      docker buildx imagetools inspect "${image}:${tag}"
    done < <(image_targets)
  done < <(release_tags)

  # Signal successful publish for Telegram image-list notify (dotenv).
  local signal_file="${MAGISK_TELEGRAM_IMAGE_PUBLISH_ENV_FILE:-telegram_images.env}"
  printf 'MAGISK_TELEGRAM_IMAGE_PUBLISH_OK=1\n' >"$signal_file"
  echo "Wrote publish success signal: $signal_file"
}


list_images() {
  local tag image
  while IFS= read -r tag; do
    [[ -n "$tag" ]] || continue
    while IFS= read -r image; do
      [[ -n "$image" ]] || continue
      printf '%s:%s\n' "$image" "$tag"
    done < <(image_targets)
  done < <(release_tags)
}

case "${1:-}" in
  build-arch) build_arch "${2:-}" ;;
  publish-manifests) publish_manifests ;;
  list-images) list_images ;;
  *) usage; exit 2 ;;
esac
