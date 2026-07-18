#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 build-arch <amd64|arm64> | publish-manifests" >&2
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

dockerhub_image() {
  [[ -n "${DOCKERHUB_USERNAME:-}" && -n "${DOCKERHUB_TOKEN:-}" ]] || return 1
  printf '%s\n' "${DOCKERHUB_IMAGE:-docker.io/${DOCKERHUB_USERNAME}/napgram}"
}

login_registries() {
  require_env CI_REGISTRY
  require_env CI_REGISTRY_USER
  require_env CI_REGISTRY_PASSWORD

  printf '%s' "$CI_REGISTRY_PASSWORD" \
    | docker login "$CI_REGISTRY" --username "$CI_REGISTRY_USER" --password-stdin

  if [[ -n "${DOCKERHUB_USERNAME:-}" || -n "${DOCKERHUB_TOKEN:-}" ]]; then
    if [[ -z "${DOCKERHUB_USERNAME:-}" || -z "${DOCKERHUB_TOKEN:-}" ]]; then
      echo "Both DOCKERHUB_USERNAME and DOCKERHUB_TOKEN are required to enable Docker Hub publishing" >&2
      exit 2
    fi
    printf '%s' "$DOCKERHUB_TOKEN" \
      | docker login docker.io --username "$DOCKERHUB_USERNAME" --password-stdin
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

  if [[ "${CI_COMMIT_BRANCH:-}" == dev ]]; then
    local build_date
    build_date="$(date -u -d "${CI_PIPELINE_CREATED_AT:-now}" +%Y%m%d 2>/dev/null || date -u +%Y%m%d)"
    printf 'dev-latest\ndev-%s\n' "$build_date"
    return
  fi

  echo "Unsupported ref: ${CI_COMMIT_REF_NAME:-unknown}" >&2
  exit 1
}

create_builder() {
  BUILDX_BUILDER="napgram-${CI_JOB_ID:-$$}"
  docker buildx create --name "$BUILDX_BUILDER" --use
  trap 'docker buildx rm "$BUILDX_BUILDER" >/dev/null 2>&1 || true' EXIT
}

build_arch() {
  local arch="${1:-}"
  case "$arch" in
    amd64|arm64) ;;
    *) usage; exit 2 ;;
  esac

  login_registries
  docker buildx version
  create_builder

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
        "${image}:${tag}-amd64" \
        "${image}:${tag}-arm64"
      docker buildx imagetools inspect "${image}:${tag}"
    done < <(image_targets)
  done < <(release_tags)
}

case "${1:-}" in
  build-arch) build_arch "${2:-}" ;;
  publish-manifests) publish_manifests ;;
  *) usage; exit 2 ;;
esac
