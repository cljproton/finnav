#!/usr/bin/env bash
# 停止 Django 后端（根据 PID 文件，平滑关闭）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.run/backend.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "后端未在运行（无 PID 文件）"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if ! kill -0 "$PID" 2>/dev/null; then
  echo "后端已停止 (PID $PID 不存在)"
  rm -f "$PID_FILE"
  exit 0
fi

echo "正在停止后端 (PID $PID)..."
kill "$PID" 2>/dev/null || true
for _ in $(seq 1 20); do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "后端已停止"
    exit 0
  fi
  sleep 0.3
done

echo "后端未响应，强制终止 (PID $PID)" >&2
kill -9 "$PID" 2>/dev/null || true
rm -f "$PID_FILE"