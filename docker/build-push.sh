#!/usr/bin/env bash
# 手动构建并推送镜像到 GHCR（无 CI 时的备用方案）。
# 用法:
#   ./build-push.sh [backend|frontend|all]   # 默认 all
# 多架构构建需要 buildx（docker buildx 可用即可）。
set -euo pipefail

cd "$(dirname "$0")/.."

REGISTRY="${REGISTRY:-ghcr.io}"
BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/cljproton/finnav-backend}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-ghcr.io/cljproton/finnav-frontend}"
PLATFORMS="${PLATFORMS:-linux/amd64}"
TARGET="${1:-all}"

# 确保 buildx 支持 multi-arch（服务器无需执行，此脚本只在开发机/CI 跑）
docker buildx version >/dev/null 2>&1 || { echo "需要 Docker Buildx（docker buildx version 可运行）" >&2; exit 1; }

# 若未登录且需要推送则提示
docker info 2>/dev/null | grep -q ghcr.io || echo "提示：若尚未登录，请先 docker login ${REGISTRY}" >&2

build_push() {
  local name="$1" dockerfile="$2"
  echo "==> 构建并推送 ${name} (${PLATFORMS})"
  docker buildx build \
    --platform "${PLATFORMS}" \
    --push \
    -f "${dockerfile}" \
    -t "${name}:latest" \
    .
}

if [[ "$TARGET" == "backend" || "$TARGET" == "all" ]]; then
  build_push "${BACKEND_IMAGE}" docker/backend/Dockerfile
fi
if [[ "$TARGET" == "frontend" || "$TARGET" == "all" ]]; then
  build_push "${FRONTEND_IMAGE}" docker/frontend/Dockerfile
fi

echo "完成。服务器部署：docker compose pull && docker compose up -d（勿加 --build）"