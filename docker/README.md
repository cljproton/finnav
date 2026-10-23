# Docker 部署（docker/）

采用**前后端一体化部署**：整个站点只暴露一个端口（默认 80），前端、后台、API 均由该端口提供，后端不对外发布。
资源受限的服务器建议直接用第三节「服务器零构建部署」——CI/开发机构建镜像推送到 GHCR，服务器只 `docker compose pull`。

部署使用 `docker/.env`（从 `docker/.env.example` 复制），构建上下文是仓库根目录。

## 一、前置条件

- Docker 及 Docker Compose v2 已安装

```bash
cd docker
cp .env.example .env     # 首次部署，按需修改（密钥/端口等）
```

## 二、前后端一体化（单端口对外）

整个站点只暴露**一个端口（默认 80）**，前端、后台、API 均经该端口访问，后端不对外发布。

```bash
docker compose up -d --build
```

> 首次启动/从旧版本升级前，先把数据目录属主改成容器运行用户（默认 UID 1000），
> 否则非 root 容器写不了 SQLite：`sudo chown -R 1000:1000 data`（详见第九节）。

启动后所有入口都在同一端口（默认 80）：

| 入口 | 地址 |
| --- | --- |
| 前端 Web | http://localhost/ |
| 管理后台 | http://localhost/admin/ |
| API | http://localhost/api/ |

> 对外端口用 `docker/.env` 中的 `PORT` 覆盖（默认 80）。

> 外层再接入域名/HTTPS 的 nginx 时，直接把该域名反代到本端口即可
> （Web 前端以相对路径 `/api` 请求，自动走同一域名，不会硬拼其他端口）。

> **移动端 App 直连**：Android / iOS App 只需调用后端 API，打包时设
> 前端构建为 Next.js 静态站点，通过 nginx 服务。
> iOS 直连 HTTP 可用——项目已开 ATS 明文例外；Android release 包需 HTTPS 或
> `ANDROID_ALLOW_CLEARTEXT=1`，详见根目录 README「移动端 App 直连后端」。

## 三、服务器零构建部署（镜像仓库，资源受限推荐）

服务器只做 `pull`，**不本地构建**。镜像由 GitHub Actions（或开发机脚本）构建后推送到 **GHCR**，服务器直接拉取运行。

### 构建侧（开发机 / CI）

- **自动**：推送代码到 `main` 后，`.github/workflows/build-backend-image.yml`、
  `.github/workflows/build-frontend-image.yml` 分别构建并推送前后端镜像
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

- 升级：再执行一次 `docker compose pull && docker compose up -d` 即可（compose 文件里有
  `pull_policy: missing`，缺镜像时只拉取、绝不本地构建）。
- 服务器只需 Docker + Compose v2 与 `curl`，**无需构建工具链**。

## 四、常用命令

```bash
docker compose up -d --build                # 一体化：构建并后台启动（开发机）
docker compose pull && docker compose up -d # 一体化：拉取镜像并启动（服务器零构建）
docker compose ps                           # 查看状态
docker compose down                         # 停止并保留数据（保留数据卷）
docker compose down -v                      # 停止并删除数据卷（数据不保留）
```

## 五、数据管理

- 数据保存在 **`docker/data/` 目录**（与 compose 文件同级）：SQLite 数据库 `db.sqlite3` + 上传媒体 `media/`，仅后端挂载。
- **属主**：容器以非 root（默认 UID 1000）运行，`docker/data` 必须归同一 UID 所有，否则写入失败：
  `sudo chown -R 1000:1000 data`（UID 由 `docker/.env` 的 `APP_UID/APP_GID` 决定）。
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

## 六、首次初始化用户

```bash
docker compose exec backend python manage.py createsuperuser
# 可选：写入演示分类与站点
docker compose exec backend python manage.py seed_demo
```

## 七、邮箱验证码

- 未设置 `RESEND_API_KEY`：验证码打印到后端日志（`docker compose logs -f backend`）。
- 设置 `RESEND_API_KEY`：通过 Resend 发送邮件。

## 八、架构与反向代理

- **frontend**（Next.js standalone，对外 :80）：
  - Next.js standalone 服务器直接托管 Web 前端（`output: 'standalone'`，非静态导出）；
  - `rewrites` 把 `/api/`、`/admin/`、`/static/`、`/media/` 反代到 `http://backend:8000`；
- **backend**：Python 3.12 + Django + DRF，`gunicorn` 内网监听 8000（不对外发布），
  WhiteNoise 提供静态文件；媒体 `/media/` 在生产环境也由 Django 提供（`urls.py` 挂载 `serve`）；
  健康检查 `GET /api/health/`。
- **前端调用方式**：Web 端以相对路径 `/api` 请求，经 Next.js rewrites 反代后端，
  实现同源访问（不硬拼 `:8000` 端口，天然兼容外层域名/HTTPS）。
- **SSR 取数**：Next 服务端渲染时直连 `http://backend:8000/api`，请求 Host 为 `backend`，
  compose 会自动往 `ALLOWED_HOSTS` 末尾追加 `backend`（`.env` 不必手写）。
- 后端各路径的绝对地址（如 logo/APP 下载链接）由 `request.build_absolute_uri` 借助
  反代透传的 `Host`/`X-Forwarded-Proto` 生成，自动落到同一个对外端口。

## 九、安全加固

容器按「最小权限」运行，默认配置已包含：

| 项 | 配置 | 说明 |
| --- | --- | --- |
| 非 root | 镜像内 `USER app` / `USER node`（UID 1000） | 进程被攻破也只有普通用户权限 |
| 只读根文件系统 | `read_only: true` | 运行期仅 `/srv/data`、`/tmp`、`/app/.next/cache` 可写 |
| 能力裁剪 | `cap_drop: [ALL]` + `no-new-privileges` | 无 setuid 提权、无 raw socket/chown 等能力 |
| 资源上限 | `mem_limit` / `cpus` / `pids_limit` | 防 OOM 与 fork bomb 拖垮宿主机 |
| 日志轮转 | `json-file`，`10m × 3` | 防日志打满磁盘 |
| 端口收敛 | 仅绑定 `127.0.0.1:${PORT}` | 外部必须经宿主机 Nginx（HTTPS）进入 |
| 配置必填 | `SECRET_KEY` / `ALLOWED_HOSTS` 无默认值 | 漏配时 `docker compose` 直接报错，而非静默用不安全默认值 |

可调项见 `docker/.env`：`APP_UID/APP_GID`、`BACKEND_MEM_LIMIT/BACKEND_CPUS`、
`FRONTEND_MEM_LIMIT/FRONTEND_CPUS`、`LOG_MAX_SIZE/LOG_MAX_FILE`。

> 在线备份/恢复会把 zip 读进内存（已排除可重建的 `app_cache/`），若上传媒体体积较大，
> 请调高 `BACKEND_MEM_LIMIT`（如 `1g`），否则可能被 OOM kill。

### 从旧版本升级（必做）

旧容器以 root 运行，`docker/data` 属主是 root；切到非 root 后必须先改属主，否则启动报
`unable to open database file`：

```bash
sudo chown -R 1000:1000 data          # 与 docker/.env 的 APP_UID/APP_GID 保持一致
docker compose up -d --build          # 或 docker compose pull && docker compose up -d
```

升级后自检：

```bash
docker compose exec backend id                                  # 应为 uid=1000(app)
docker compose exec backend touch /srv/backend/x                # 应报 Read-only file system
docker compose exec backend sh -c 'ls -l /srv/data'             # 属主 app
```

### 调试提示

只读根文件系统下若需临时排查，用 override 文件放开（不要改主 compose）：

```bash
docker compose run --rm --no-deps -e DEBUG=True --entrypoint bash backend
```

### 其他建议

- 宿主机只暴露 80/443，`PORT` 保持绑定 `127.0.0.1`；
- `docker/.env` 权限保持 `600`（`deploy_finnav.sh` 已自动设置），不要提交进 git；
- 数据目录只给 `APP_UID` 可写：`chmod 750 data`；
- 定期 `docker compose pull && docker compose up -d` 获取带安全补丁的新镜像。

### 排障：容器显示 unhealthy 但站点访问正常

健康检查探测的是**容器内回环地址**，与外部访问路径不同，先看探测记录：

```bash
docker inspect docker-backend-1  --format '{{json .State.Health.Log}}' | tail -c 600
docker inspect docker-frontend-1 --format '{{json .State.Health.Log}}' | tail -c 600
```

两个已知坑：

1. **frontend**：Next.js standalone 用 `HOSTNAME` 环境变量作为 bind 地址，Docker 默认注入
   `HOSTNAME=<容器ID>`，会只监听容器 IP（`172.x.x.x:3000`），容器内 `127.0.0.1:3000`
   探测失败 → unhealthy，但外部经端口映射访问正常。
   镜像与 compose 均已设 `HOSTNAME=0.0.0.0`，若仍是旧镜像请 `docker compose pull`。
2. **backend**：探测请求的 `Host` 头是 `127.0.0.1:8000`，若不在 `ALLOWED_HOSTS` 内，
   Django 直接返回 400 → unhealthy。`config/settings.py` 会自动追加
   `localhost / 127.0.0.1 / [::1]`，旧镜像需升级。

临时验证探测本身是否通：

```bash
docker exec docker-frontend-1 node -e "fetch('http://127.0.0.1:3000/').then(r=>console.log(r.status)).catch(e=>console.log('ERR',e.message))"
docker exec docker-backend-1 python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/api/health/',timeout=4).status)"
```