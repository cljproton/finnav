# 一键启动前后端（Docker · 单端口）

用 Docker Compose 一键构建并部署「后端 Django + 管理后台」与「前端 Expo Web」。
整个站点只暴露**一个端口(默认 80)**，前端、后台、API 均经该端口访问，后端不对外发布。

## 前置条件

- Docker 及 Docker Compose v2 已安装

## 快速开始

```bash
cd docker
cp .env.example .env     # 首次部署，按需修改（密钥/端口等）
docker compose up -d --build
```

启动后所有入口都在同一端口（默认 80）：

| 入口 | 地址 |
| --- | --- |
| 前端 Web | http://localhost/ |
| 管理后台 | http://localhost/admin/ |
| API | http://localhost/api/ |

> 对外端口用 `docker/.env` 中的 `PORT` 覆盖（默认 80）。

## 常用命令

```bash
docker compose up -d --build   # 构建并后台启动
docker compose logs -f backend  # 跟踪后端日志（验证码等）
docker compose logs -f frontend
docker compose ps              # 查看状态
docker compose down            # 停止并保留数据（保留数据卷）
docker compose down -v         # 停止并删除数据卷（数据不保留）
```

## 数据管理

- 数据保存在 **`docker/data/` 目录**（与 `docker-compose.yml` 同级），由后端与前端 nginx
  双向挂载共享：后端经环境变量把 SQLite 与媒体指向 `/srv/data`（`db.sqlite3` + `media/`），
  前端挂到 `/srv/data` 用于直读 `/media/`。
- 数据库引擎：默认 SQLite。如需 MySQL / PostgreSQL，在 `docker/.env` 中设置
  `DB_ENGINE=mysql` 或 `postgres` 并填写 `DB_NAME / DB_USER / DB_PASSWORD / DB_HOST / DB_PORT`，
  使用**外部数据库实例**（不内置 DB 容器，`docker/data` 仅存 `media/` 与 SQLite）。
- 备份/迁移：直接复制/备份整个 `docker/data/` 目录即可。
- 后台入口：登录 `/admin/` 后，侧边栏「运维 → 备份与恢复」可在线打包下载全部业务数据+媒体（zip），
  并支持上传 zip 恢复（会清空并覆盖现有数据）。
- 命令行：`docker compose exec backend python manage.py backup -o backup.zip`、
  `docker compose exec backend python manage.py restore backup.zip`。
- 清空重来：`docker compose down -v && rm -rf data && mkdir -p data`。
- 数据目录已在 `.dockerignore` 中排除，不会打进镜像构建上下文。

## 首次初始化用户

```bash
docker compose exec backend python manage.py createsuperuser
# 可选：写入演示分类与站点
docker compose exec backend python manage.py seed_demo
```

## 邮箱验证码

- 未设置 `RESEND_API_KEY`：验证码打印到后端日志（`docker compose logs -f backend`）。
- 设置 `RESEND_API_KEY`：通过 Resend 发送邮件。

## 架构与反向代理

- **frontend**（nginx，对外 :80，唯一入口）：
  - 托管 Expo Web 静态站（SPA 路由回退到 `index.html`）；
  - `location /api/`、`/admin/`、`/static/` → 反代到内网 `backend:8000`；
  - `location /media/` → 直读共享 `data/` 目录（后端 DEBUG 关闭时 Django 不提供 `/media/`）。
- **backend**：Python 3.12 + Django + DRF，`gunicorn` 内网监听 8000（不对外发布），
  WhiteNoise 提供静态文件；健康检查 `GET /api/health/`。
- **前端调用方式**：构建期 `EXPO_PUBLIC_API_BASE_URL=""` + `config.ts` 的 `??` 逻辑，
  Web 端以相对路径 `/api` 请求，经 nginx 反代后端，实现同源访问。
- 后端各路径的绝对地址（如 logo/APP 下载链接）由 `request.build_absolute_uri` 借助
  nginx 透传的 `Host`/`X-Forwarded-Proto` 生成，自动落到同一个对外端口。