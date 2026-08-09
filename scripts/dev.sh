#!/usr/bin/env bash
# 启动并管理前后端开发服务（统一封装）。
#
# 用法:
#   ./scripts/dev.sh start         启动后端 + 前端
#   ./scripts/dev.sh start backend 仅启动后端
#   ./scripts/dev.sh start frontend 仅启动前端
#   ./scripts/dev.sh stop          停止全部
#   ./scripts/dev.sh stop backend  停止后端
#   ./scripts/dev.sh stop frontend 停止前端
#   ./scripts/dev.sh status        查看状态
#   ./scripts/dev.sh restart       重启全部
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

start_backend() {
  "$ROOT/scripts/start_backend.sh"
}

stop_backend() {
  "$ROOT/scripts/stop_backend.sh"
}

start_frontend() {
  "$ROOT/scripts/start_frontend.sh"
}

stop_frontend() {
  "$ROOT/scripts/stop_frontend.sh"
}

show_status() {
  "$ROOT/scripts/status.sh"
}

do_start() {
  case "${1:-all}" in
    backend)  start_backend ;;
    frontend) start_frontend ;;
    all)      start_backend; start_frontend ;;
    *)        echo "未知目标: $1"; exit 1 ;;
  esac
}

do_stop() {
  case "${1:-all}" in
    backend)  stop_backend ;;
    frontend) stop_frontend ;;
    all)      stop_frontend; stop_backend ;;
    *)        echo "未知目标: $1"; exit 1 ;;
  esac
}

case "${1:-}" in
  start)
    do_start "${2:-all}"
    ;;
  stop)
    do_stop "${2:-all}"
    ;;
  restart)
    do_stop "${2:-all}"
    do_start "${2:-all}"
    ;;
  status)
    show_status
    ;;
  *)
    echo "用法: $0 {start|stop|restart|status} [backend|frontend|all]"
    exit 1
    ;;
esac