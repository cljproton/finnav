#!/usr/bin/env bash
# 启动前端 (Expo web, Metro) — 后台运行，PID + 日志管理。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT/frontend"
LOG_DIR="$ROOT/logs"
PID_DIR="$ROOT/.run"
PID_FILE="$PID_DIR/frontend.pid"
PORT="${FRONTEND_PORT:-8081}"
# 后端地址默认不注入，交给 config.ts 按页面访问主机动态推导（window.location.hostname）：
# 用 localhost 打开→localhost:8000，用局域网 IP 打开→同一 IP:8000，手机同理。
# 仅当用户显式设置 EXPO_PUBLIC_API_BASE_URL 时才覆盖。
API="${EXPO_PUBLIC_API_BASE_URL:-}"

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

echo "启动前端 (Metro, 端口 $PORT, API=${API:-<按访问主机动态推导>})"
cd "$FRONTEND_DIR"
if [ -n "$API" ]; then
  export EXPO_PUBLIC_API_BASE_URL="$API"
else
  unset EXPO_PUBLIC_API_BASE_URL
fi
# 固定的 web 端口，避免默认随机挑选 8081/8082
nohup npx expo start --web --port "$PORT" >"$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$PID_FILE"

# 等待 Metro 就绪（web 页面返回 200 即视为就绪）
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; then
    echo "前端启动成功: http://localhost:$PORT  (PID $(cat "$PID_FILE"))"
    echo "日志: $LOG_DIR/frontend.log"
    exit 0
  fi
  sleep 0.5
done

echo "前端启动超时，请检查日志: $LOG_DIR/frontend.log" >&2
exit 1