FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# curl 供 healthcheck 使用
RUN apt-get update && apt-get install -y --no-install-recommends curl gettext\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/backend

COPY backend/requirements.txt /srv/backend/requirements.txt
RUN pip install --no-cache-dir -r /srv/backend/requirements.txt

COPY backend/ /srv/backend/
COPY docker/backend/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# 编译后的静态文件目录（collectstatic 写入），运行时用命名卷挂载到 /srv/media
VOLUME /srv/media

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
