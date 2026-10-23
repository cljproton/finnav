#!/usr/bin/env bash
set -euo pipefail

# 静态文件与 i18n 已在镜像构建期生成（见 docker/backend/Dockerfile），
# 运行期只做数据库迁移，根文件系统可保持只读。
echo "==> 执行迁移"
python manage.py migrate --noinput

echo "==> 启动 gunicorn"
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "${GUNICORN_WORKERS:-3}" \
  --threads "${GUNICORN_THREADS:-2}" \
  --timeout "${GUNICORN_TIMEOUT:-300}" \
  --access-logfile - \
  --error-logfile -
