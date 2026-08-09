#!/usr/bin/env bash
set -e

echo "==> 执行迁移"
python manage.py migrate --noinput

echo "==> 编译 i18n 翻译消息"
python manage.py compilemessages --ignore='*/migrations/*'

echo "==> 收集静态文件"
python manage.py collectstatic --noinput

echo "==> 启动 gunicorn"
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers ${GUNICORN_WORKERS:-3} \
  --threads ${GUNICORN_THREADS:-2} \
  --timeout ${GUNICORN_TIMEOUT:-300} \
  --access-logfile - \
  --error-logfile -