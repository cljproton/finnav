#!/usr/bin/env bash
# 查看后端 / 前端服务运行状态。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.run"
LOG_DIR="$ROOT/logs"

BE_PORT="${BACKEND_PORT:-8000}"
FE_PORT="${FRONTEND_PORT:-8081}"

check() {
  local name="$1" pid_file="$2" port="$3" health_url="$4"
  local pid=""
  [ -f "$pid_file" ] && pid="$(cat "$pid_file")"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    if curl -sf "$health_url" >/dev/null 2>&1; then
      printf '%-10s正在运行  PID %-8s端口 %-5s\n' "$name" "$pid" "$port"
    else
      printf '%-10s进程存在但未就绪  PID %s\n' "$name" "$pid"
    fi
  else
    printf '%-10s未运行\n' "$name"
  fi
}

check "后端" "$PID_DIR/backend.pid" "$BE_PORT"  "http://localhost:$BE_PORT/api/health/"
check "前端" "$PID_DIR/frontend.pid" "$FE_PORT" "http://localhost:$FE_PORT/"

echo
echo "日志目录: $LOG_DIR"
echo "PID 目录: $PID_DIR"