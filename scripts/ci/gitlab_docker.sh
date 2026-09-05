#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 build-arch <amd64|arm64> | publish-manifests | list-images" >&2
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOLKIT_DIR="${MAGISK_CI_TOOLKIT_DIR:-$(cd "$REPO_ROOT" && bash scripts/resolve_ci_toolkit.sh)}"
source "$TOOLKIT_DIR/ci/optional_registry.sh"

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

dockerhub_image() {
  printf '%s\n' "${DOCKERHUB_IMAGE:-docker.io/${DOCKERHUB_USERNAME:-unknown}/napgram}"
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

append_proxy_build_arg() {
  local -n args_ref=$1
  local build_arg_name=$2
  shift 2

  local env_name value
  for env_name in "$@"; do
    value="${!env_name:-}"
    if [[ -n "$value" ]]; then
      args_ref+=(--build-arg "${build_arg_name}=${value}")
      return 0
    fi
  done
}

network_use_mirror() {
  [[ "${MAGISK_LINUX_USE_MIRROR:-${NAPGRAM_DOCKER_USE_MIRROR:-true}}" == "true" ]]
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

login_primary_registries() {
  require_env CI_REGISTRY
  require_env CI_REGISTRY_USER
  require_env CI_REGISTRY_PASSWORD

  printf '%s' "$CI_REGISTRY_PASSWORD" \
    | docker login "$CI_REGISTRY" --username "$CI_REGISTRY_USER" --password-stdin

  if [[ -n "${CI_DEPENDENCY_PROXY_SERVER:-}" && -n "${CI_DEPENDENCY_PROXY_USER:-}" && -n "${CI_DEPENDENCY_PROXY_PASSWORD:-}" ]]; then
    printf '%s' "$CI_DEPENDENCY_PROXY_PASSWORD" \
      | docker login "$CI_DEPENDENCY_PROXY_SERVER" \
          --username "$CI_DEPENDENCY_PROXY_USER" \
          --password-stdin
  fi
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

build_target() {
  local image=$1
  local arch=$2
  shift 2
  local build_args=("$@")
  local tag_args=()
  while IFS= read -r tag; do
    [[ -n "$tag" ]] || continue
    tag_args+=(--tag "${image}:${tag}-${arch}")
  done < <(release_tags)

  docker buildx build \
    --platform "linux/${arch}" \
    --file Dockerfile \
    --push \
    --provenance=false \
    "${build_args[@]}" \
    "${tag_args[@]}" \
    .
}

build_arch() {
  local arch="${1:-}"
  case "$arch" in
    amd64|arm64) ;;
    *) usage; exit 2 ;;
  esac

  login_primary_registries
  docker buildx version
  select_builder

  local registry
  registry="$(registry_image)"

  local use_mirror=false
  local bun_registry=https://registry.npmjs.org
  if network_use_mirror; then
    use_mirror=true
    bun_registry="${BUN_CONFIG_REGISTRY:-https://registry.npmmirror.com}"
  fi

  local build_args=(
    --cache-from "type=registry,ref=${registry}:buildcache-${arch}"
    --cache-to "type=registry,ref=${registry}:buildcache-${arch},mode=max,ignore-error=true"
    --build-arg "REPO=${CI_PROJECT_PATH:-NapGram/NapGram}"
    --build-arg "REF=${CI_COMMIT_REF_NAME:-unknown}"
    --build-arg "COMMIT=${CI_COMMIT_SHA:-unknown}"
    --build-arg "USE_MIRROR=${use_mirror}"
    --build-arg "LOTTIE_IMAGE=$(lottie_image)"
    --build-arg "BUN_CONFIG_REGISTRY=${bun_registry}"
  )
  append_proxy_build_arg build_args HTTP_PROXY NAPGRAM_BUILD_HTTP_PROXY HTTP_PROXY CI_HTTP_PROXY
  append_proxy_build_arg build_args HTTPS_PROXY NAPGRAM_BUILD_HTTPS_PROXY HTTPS_PROXY CI_HTTPS_PROXY
  append_proxy_build_arg build_args ALL_PROXY NAPGRAM_BUILD_ALL_PROXY ALL_PROXY CI_ALL_PROXY
  append_proxy_build_arg build_args NO_PROXY NAPGRAM_BUILD_NO_PROXY NO_PROXY CI_NO_PROXY
  append_proxy_build_arg build_args http_proxy NAPGRAM_BUILD_HTTP_PROXY http_proxy HTTP_PROXY CI_HTTP_PROXY
  append_proxy_build_arg build_args https_proxy NAPGRAM_BUILD_HTTPS_PROXY https_proxy HTTPS_PROXY CI_HTTPS_PROXY
  append_proxy_build_arg build_args all_proxy NAPGRAM_BUILD_ALL_PROXY all_proxy ALL_PROXY CI_ALL_PROXY
  append_proxy_build_arg build_args no_proxy NAPGRAM_BUILD_NO_PROXY no_proxy NO_PROXY CI_NO_PROXY

  build_target "$registry" "$arch" "${build_args[@]}"
  magisk_publish_optional_registry \
    "${NAPGRAM_DOCKERHUB_PUBLISH:-true}" \
    "Docker Hub" \
    docker.io \
    "${DOCKERHUB_USERNAME:-}" \
    "${DOCKERHUB_TOKEN:-}" \
    build_target "$(dockerhub_image)" "$arch" "${build_args[@]}"
}

publish_image_manifests() {
  local image=$1
  local tag
  while IFS= read -r tag; do
    [[ -n "$tag" ]] || continue
    docker buildx imagetools create \
      --tag "${image}:${tag}" \
      "${image}:${tag}-amd64" \
      "${image}:${tag}-arm64" || return 1
    docker buildx imagetools inspect "${image}:${tag}" || return 1
  done < <(release_tags)
}

publish_manifests() {
  login_primary_registries
  docker buildx version

  publish_image_manifests "$(registry_image)"
  magisk_publish_optional_registry \
    "${NAPGRAM_DOCKERHUB_PUBLISH:-true}" \
    "Docker Hub" \
    docker.io \
    "${DOCKERHUB_USERNAME:-}" \
    "${DOCKERHUB_TOKEN:-}" \
    publish_image_manifests "$(dockerhub_image)"

  # Signal successful publish for Telegram image-list notify (dotenv).
  local signal_file="${MAGISK_TELEGRAM_IMAGE_PUBLISH_ENV_FILE:-telegram_images.env}"
  printf 'MAGISK_TELEGRAM_IMAGE_PUBLISH_OK=1\nNAPGRAM_DOCKERHUB_PUBLISH_OK=%s\n' \
    "$MAGISK_OPTIONAL_REGISTRY_PUBLISH_OK" >"$signal_file"
  echo "Wrote publish success signal: $signal_file"
}


list_images() {
  local tag
  while IFS= read -r tag; do
    [[ -n "$tag" ]] || continue
    printf '%s:%s\n' "$(registry_image)" "$tag"
    if [[ "${NAPGRAM_DOCKERHUB_PUBLISH_OK:-0}" == "1" ]]; then
      printf '%s:%s\n' "$(dockerhub_image)" "$tag"
    fi
  done < <(release_tags)
}

case "${1:-}" in
  build-arch) build_arch "${2:-}" ;;
  publish-manifests) publish_manifests ;;
  list-images) list_images ;;
  *) usage; exit 2 ;;
esac
