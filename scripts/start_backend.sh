#!/usr/bin/env bash
# 启动 Django 后端服务（后台运行，PID + 日志管理）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
LOG_DIR="$ROOT/logs"
PID_DIR="$ROOT/.run"
PID_FILE="$PID_DIR/backend.pid"
HOST="${BACKEND_HOST:-0.0.0.0}"
PORT="${BACKEND_PORT:-8000}"
PYTHON="$BACKEND_DIR/.venv/bin/python"

if [ ! -x "$PYTHON" ]; then
  echo "找不到 Python 虚拟环境: $PYTHON"
  echo "请先执行: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

mkdir -p "$LOG_DIR" "$PID_DIR"

# 若已在运行则提示退出
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "后端已在运行 (PID $(cat "$PID_FILE"), http://localhost:$PORT)"
  exit 0
fi
rm -f "$PID_FILE"

echo "启动后端 (http://$HOST:$PORT) ..."
cd "$BACKEND_DIR"
nohup "$PYTHON" manage.py runserver "$HOST:$PORT" >"$LOG_DIR/backend.log" 2>&1 &
echo $! > "$PID_FILE"

# 等待端口就绪
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/api/health/" >/dev/null 2>&1; then
    echo "后端启动成功: http://localhost:$PORT  (PID $(cat "$PID_FILE"))"
    echo "日志: $LOG_DIR/backend.log"
    exit 0
  fi
  sleep 0.5
done

echo "后端启动超时，请检查日志: $LOG_DIR/backend.log" >&2
exit 1