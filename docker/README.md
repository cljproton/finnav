# Docker 部署（docker/）

提供三种部署方式：**前后端一体化（单端口）**、**后端独立**、**前端独立**。默认一体化；需要把前后端拆开部署（如不同主机）时用后两种。
资源受限的服务器建议直接用第五节「服务器零构建部署」——CI/开发机构建镜像推送到 GHCR，服务器只 `docker compose pull`。

所有模式共用 `docker/.env`（从 `docker/.env.example` 复制），构建上下文都是仓库根目录。

## 一、前置条件

- Docker 及 Docker Compose v2 已安装

```bash
cd docker
cp .env.example .env     # 首次部署，按需修改（密钥/端口/独立部署地址等）
```

## 二、前后端一体化（默认，单端口对外）

整个站点只暴露**一个端口（默认 80）**，前端、后台、API 均经该端口访问，后端不对外发布。

```bash
docker compose up -d --build
```

启动后所有入口都在同一端口（默认 80）：

| 入口 | 地址 |
| --- | --- |
| 前端 Web | http://localhost/ |
| 管理后台 | http://localhost/admin/ |
| API | http://localhost/api/ |

> 对外端口用 `docker/.env` 中的 `PORT` 覆盖（默认 80）。

## 三、后端独立部署

只部署后端，对外提供 API / 管理后台 / 静态文件 / 媒体上传，端口用 `BACKEND_PORT`（默认 8000）。

```bash
# docker/.env 中设置 BACKEND_PORT（可选，默认 8000）
docker compose -f docker-compose.backend.yml up -d --build
```

启动后入口：

| 入口 | 地址 |
| --- | --- |
| API | http://localhost:8000/api/ |
| 管理后台 | http://localhost:8000/admin/ |

适合：后端单独跑在一台服务器（或数据库/媒体集中管理），前端再独立部署或由 App 直接连该地址。

> 移动端 App 直连：Android / iOS App 只需调用后端 API，打包时设
> `EXPO_PUBLIC_API_BASE_URL=http://<本机IP>:8000` 即可使用（iOS 直连 HTTP 可用——项目已开
> ATS 明文例外；Android release 包需 HTTPS 或 `ANDROID_ALLOW_CLEARTEXT=1`，详见根目录 README「移动端 App 直连后端」）。

## 四、前端独立部署

只部署前端（SPA + Nginx），把 `/api/`、`/admin/`、`/static/`、`/media/` 反代到任意后端地址（可跨主机、无需共享数据目录）。

```bash
# docker/.env 中必填 BACKEND_URL，例如后端独立部署在 192.168.1.10:8000：
#   BACKEND_URL=http://192.168.1.10:8000
docker compose -f docker-compose.frontend.yml up -d --build
```

启动后：

| 入口 | 地址 |
| --- | --- |
| 前端 Web | http://localhost/ |
| 管理后台 | http://localhost/admin/（经反代到后端） |

> 若后端 `DEBUG=False` 且域名固定，请把后端 `ALLOWED_HOSTS` 设为实际域名/IP，否则后端会拒绝非白名单 Host。

## 五、服务器零构建部署（镜像仓库，资源受限推荐）

服务器只做 `pull`，**不本地构建**。镜像由 GitHub Actions（或开发机脚本）构建后推送到 **GHCR**，服务器直接拉取运行。

### 构建侧（开发机 / CI）

- **自动**：推送代码到 `main` 后，`.github/workflows/build-images.yml` 自动构建并推送
  `ghcr.io/<owner>/finnav-{backend,frontend}:latest`（另带 `sha-xxxx` 短哈希标签）。
  > 首次使用需在 GitHub 仓库 Settings → Actions → General → Workflow permissions 开启
  > **Read and write** 权限。
- **手动**：开发机上执行 `docker/build-push.sh`（需 buildx）。

### 服务器侧（只拉取，不构建）

```bash
cd docker
# docker/.env 中已预设（默认 ghcr.io/cljproton/finnav-*）：
#   BACKEND_IMAGE=ghcr.io/cljproton/finnav-backend
#   FRONTEND_IMAGE=ghcr.io/cljproton/finnav-frontend
docker login ghcr.io          # 私有镜像需 PAT（read:packages）；公共镜像可跳过
docker compose pull           # 拉取最新镜像
docker compose up -d          # 注意：勿加 --build
```

- 独立后端：`docker compose -f docker-compose.backend.yml pull && docker compose -f docker-compose.backend.yml up -d`
- 独立前端：`docker compose -f docker-compose.frontend.yml pull && docker compose -f docker-compose.frontend.yml up -d`
- 升级：再执行一次 `docker compose pull && docker compose up -d` 即可（compose 文件里有
  `pull_policy: missing`，缺镜像时只拉取、绝不本地构建）。
- 服务器只需 Docker + Compose v2 与 `curl`，**无需构建工具链**。

## 常用命令

```bash
docker compose up -d --build                # 一体化：构建并后台启动（开发机）
docker compose pull && docker compose up -d # 一体化：拉取镜像并启动（服务器零构建）
docker compose -f docker-compose.backend.yml logs -f backend   # 独立后端日志
docker compose -f docker-compose.frontend.yml logs -f frontend # 独立前端日志
docker compose ps                           # 查看状态
docker compose down                         # 停止并保留数据（保留数据卷）
docker compose down -v                      # 停止并删除数据卷（数据不保留）
```

## 数据管理

- 数据保存在 **`docker/data/` 目录**（与 compose 文件同级）：SQLite 数据库 `db.sqlite3` + 上传媒体 `media/`，仅后端挂载（一体化时前端不再共享该目录）。
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

> 独立后端部署时用 `docker compose -f docker-compose.backend.yml exec backend ...`。

## 邮箱验证码

- 未设置 `RESEND_API_KEY`：验证码打印到后端日志（`docker compose logs -f backend`）。
- 设置 `RESEND_API_KEY`：通过 Resend 发送邮件。

## 架构与反向代理

- **frontend**（nginx，对外 :80）：
  - 托管 Expo Web 静态站（SPA 路由回退到 `index.html`）；
  - `location /api/`、`/admin/`、`/static/`、`/media/` → 反代到 `${BACKEND_URL}`
    （一体化时 `http://backend:8000`，独立部署时指向远端后端，见 `docker-compose.frontend.yml`）；
  - nginx 模板经官方镜像 envsubst 渲染，`NGINX_ENVSUBST_FILTER=BACKEND_URL` 只替换该变量，
    避免误改 `$host`/`$uri` 等内置变量。
- **backend**：Python 3.12 + Django + DRF，`gunicorn` 内网监听 8000（一体化时不对外发布），
  WhiteNoise 提供静态文件；媒体 `/media/` 在生产环境也由 Django 提供
  （`urls.py` 挂载 `serve`，供前端独立部署反代）；健康检查 `GET /api/health/`。
- **前端调用方式**：构建期 `EXPO_PUBLIC_API_BASE_URL=""` + `config.ts` 的 `??` 逻辑，
  Web 端以相对路径 `/api` 请求，经 nginx 反代后端，实现同源访问。
- 后端各路径的绝对地址（如 logo/APP 下载链接）由 `request.build_absolute_uri` 借助
  nginx 透传的 `Host`/`X-Forwarded-Proto` 生成，自动落到同一个对外端口。
