# ---- 构建阶段：依赖 / i18n 编译 / 静态文件收集 ----
# 固定补丁版本，构建可复现；升级时同步改两处 FROM
FROM python:3.12.15-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# gettext 只在构建期用于 compilemessages，不进入运行镜像
RUN apt-get update && apt-get install -y --no-install-recommends \
    gettext \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/backend

# 依赖装进独立 venv，运行时整体复制（运行镜像不含 pip 缓存与编译工具）
COPY backend/requirements.txt /srv/backend/requirements.txt
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /srv/backend/requirements.txt

COPY backend/ /srv/backend/

# 静态文件与翻译在构建期生成：运行期根文件系统只读，无需再写镜像层
RUN /opt/venv/bin/python manage.py compilemessages --ignore='*/migrations/*' \
    && /opt/venv/bin/python manage.py collectstatic --noinput

# ---- 运行阶段：最小依赖 + 非 root ----
FROM python:3.12.15-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:${PATH}"

# 仅运行期共享库（cairosvg 的 SVG→PNG）；不含 curl/gettext 等工具，缩小攻击面
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libffi8 \
    && rm -rf /var/lib/apt/lists/*

# 非 root 运行：UID/GID 与宿主机数据目录保持一致（部署时 chown 同一 UID）
ARG APP_UID=1000
ARG APP_GID=1000

RUN groupadd -g "${APP_GID}" app \
    && useradd -u "${APP_UID}" -g app -m -s /usr/sbin/nologin app

WORKDIR /srv/backend

COPY --from=builder --chown=app:app /opt/venv /opt/venv
COPY --from=builder --chown=app:app /srv/backend /srv/backend
COPY --chown=app:app docker/backend/entrypoint.sh /usr/local/bin/entrypoint.sh

# 数据目录（compose 用 ./data 覆盖挂载）；无 VOLUME 声明，避免匿名卷残留
RUN mkdir -p /srv/data && chown app:app /srv/data \
    && chmod +x /usr/local/bin/entrypoint.sh

USER app

EXPOSE 8000

# healthcheck 不依赖 curl（镜像内不装）
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=4).status == 200 else 1)"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
