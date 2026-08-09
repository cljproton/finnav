#!/usr/bin/env bash
# 停止前端 (Expo/Metro) — 报告父进程与可能的绑定端口进程，全部回收。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.run/frontend.pid"

# 1) 依据 PID 文件停止 npx/expo 父进程
if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    echo "正在停止前端 (PID $PID)..."
    kill "$PID" 2>/dev/null || true
    # 等待退出，超时强杀
    for _ in $(seq 1 20); do
      if ! kill -0 "$PID" 2>/dev/null; then
        break
      fi
      sleep 0.3
    done
    kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# 2) 兜底：杀掉仍占用前端端口（含 Metro 子进程）的进程
PORT="${FRONTEND_PORT:-8081}"
PIDS="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
if [ -z "$PIDS" ]; then
  echo "前端已停止"
  exit 0
fi
for p in $PIDS; do
  echo "回收占用端口 $PORT 的进程 (PID $p)"
  kill "$p" 2>/dev/null || true
done
sleep 1
# 仍在占用则强杀
PIDS="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
for p in $PIDS; do
  kill -9 "$p" 2>/dev/null || true
done

echo "前端已停止"