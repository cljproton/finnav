#!/usr/bin/env bash
# 启动前端 (Next.js) — 后台运行，PID + 日志管理。
#
# API 代理：Next 的 rewrites 会把同源 /api、/media 转发到后端
# （BACKEND_ORIGIN，默认 http://127.0.0.1:8000），因此浏览器无需跨域。
# 如需让浏览器直连后端，可显式设置 NEXT_PUBLIC_API_BASE_URL。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT/frontend"
LOG_DIR="$ROOT/logs"
PID_DIR="$ROOT/.run"
PID_FILE="$PID_DIR/frontend.pid"
HOST="${FRONTEND_HOST:-0.0.0.0}"
PORT="${FRONTEND_PORT:-3000}"
MODE="${FRONTEND_MODE:-dev}"
# 后端来源，Next rewrites 转发目标；留空则用 next.config.mjs 默认值。
BACKEND_ORIGIN="${BACKEND_ORIGIN:-}"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "前端依赖未安装 (frontend/node_modules 不存在)"
  echo "请先执行: cd frontend && npm install"
  exit 1
fi

mkdir -p "$LOG_DIR" "$PID_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "前端已在运行 (PID $(cat "$PID_FILE"), 端口 $PORT)"
  exit 0
fi
rm -f "$PID_FILE"

echo "启动前端 (Next.js $MODE, 端口 $PORT, 后端代理=${BACKEND_ORIGIN:-<默认 127.0.0.1:8000>})"
cd "$FRONTEND_DIR"
if [ -n "${NEXT_PUBLIC_API_BASE_URL:-}" ]; then
  export NEXT_PUBLIC_API_BASE_URL
else
  unset NEXT_PUBLIC_API_BASE_URL
fi
if [ -n "$BACKEND_ORIGIN" ]; then
  export BACKEND_ORIGIN
fi
if [ "$MODE" = "prod" ]; then
  npm run build
  nohup npx next start -H "$HOST" -p "$PORT" >"$LOG_DIR/frontend.log" 2>&1 &
else
  nohup npx next dev -H "$HOST" -p "$PORT" >"$LOG_DIR/frontend.log" 2>&1 &
fi
echo $! > "$PID_FILE"

# 等待 Next 就绪（首页返回 200 即视为就绪）
for _ in $(seq 1 120); do
  if curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; then
    echo "前端启动成功: http://localhost:$PORT  (PID $(cat "$PID_FILE"))"
    echo "日志: $LOG_DIR/frontend.log"
    exit 0
  fi
  sleep 0.5
done

echo "前端启动超时，请检查日志: $LOG_DIR/frontend.log" >&2
exit 1