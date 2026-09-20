| |
|:---:|
| ![finnav logo](docs/screenshots/icon.png) |

# finnav


金融 / Web3 网站导航应用：前端基于 Next.js 构建的静态站点，自带 Django 管理后台。它不仅是站点导航站，更内置了一套 **用户贡献 + 积分激励 + 实战经验付费** 的内容生态——用户提交站点、分享教程、上传 APP 链接，经管理员审核后自动上架并获得积分；积分可在站内解锁经验、转赠好友、生成兑换码。

- 界面支持**中英文切换**：前端右上角悬浮「中 / EN」一键切换；后端 API 错误与校验消息按客户端语言返回翻译（默认中文）。
- **English**：见 [README.en.md](README.en.md)。

## 项目特点

- **前端技术栈**：Next.js 构建的优化生产静态站点；Ant Design 靛蓝金融主题，深色/浅色模式跟随系统
- **积分激励闭环**：注册、邀请好友、提交站点 / 教程 / APP 链接审核通过即可赚积分；积分可解锁实战经验、转赠好友、生成兑换码；规则、分值与发放上限后台可配
- **UGC + 审核流**：用户提交的站点、教程、APP 链接统一走管理员审核，通过后自动上架并发积分，管理员在审核中心集中处理
- **实战经验付费市场**：用户可发布以积分定价的经验帖（5–500 分），一次购买永久解锁，支持点赞与配图，作者实时到账等额积分
- **账号安全完备**：图形验证码、邮箱验证码注册（防刷冷却、仅存哈希）、密码找回、用户 2FA 与管理后台 2FA（TOTP）
- **APP 分发与核验**：安卓 APK 可缓存至本站分发，附 SHA-256 完整性校验，校验失败自动暂停本站下载

## 截图

![首页](docs/screenshots/index.png)
![搜索](docs/screenshots/search.png)
![收藏](docs/screenshots/favorite.png)
![我的](docs/screenshots/me.png)

## 功能

### 站点浏览

- 首页：分类筛选 + 站点卡片（logo / 名称 / 描述 / 标签），点击进入站点详情，下拉刷新；顶部公告栏内容可在后台配置
- 搜索：按名称 / 描述 / 标签实时搜索，搜索历史随账号同步
- 收藏：本地持久化（AsyncStorage）；登录后自动与服务器同步，跨设备保持一致

### 站点详情

- 教程区：文字教程 / 视频教程 / 辅助代办（如黄鱼）三种类型，由用户分享、管理员审核后展示，支持查看热门 TOP10
- 打星评分：登录用户可打星（0–5 星、半星递进），评论可选；每个站点汇总平均星级与评分人数，一人一票；评价列表独立页展示
- 访问统计：打开站点详情页计一次访问，带时间戳可供后台生成访问趋势
- 一键转发：分享站点名称 / 描述 / 链接（原生分享 / Web `navigator.share`）；分享链接格式由后台「转发来源域名」控制——配置后为「该地址/site/站点ID」（未装 App 的用户可打开网页版），留空则为 `finnav:///site/xx` 深链接
- 我的邀请码：每个站点可配置个人专属邀请码 / 邀请链接，转发时自动附带

### 账号与安全

- 注册 / 登录 / 找回密码：邮箱验证码（Resend，本地无密钥时验证码打印到后端日志），带 60 秒防刷冷却，验证码仅存哈希、10 分钟有效、最多 5 次尝试
- 图形验证码：注册 / 登录接口附带图形验证码，动态渲染、单次有效
- 双因素认证（2FA）：用户端 TOTP 配置页 + 登录二次校验；管理后台 2FA 可独立启用（全局开关 + 管理员自设）
- 「我的」页：退出登录、查看积分、邀请好友、搜索历史与收藏管理

### 用户贡献（UGC）

- 提交站点：用户提交新站点，管理员审核通过后自动创建站点并发放积分（默认 +20）
- 分享教程：粘贴链接即分享，标题自动抓取；审核通过后公开并发放积分（默认 +10）；支持作者申请删除、管理员复核
- 实战经验：用户发布以积分定价的付费经验，一次购买永久解锁，支持最多 5 张配图、点赞与销量统计，作者实时到账等额积分

### 积分体系

- 赚取：注册奖励（+20）、邀请好友（邀请人 +30 / 被邀请人 +10）、站点 / 教程 / APP 链接审核通过（+20 / +10 / +10）
- 消费：解锁实战经验、积分转赠（按邮箱、免手续费）、生成兑换码（生成时从创建者余额扣除，他人核销到账）
- 管理：规则、分值、每日 / 累计发放上限后台可配置；积分流水不可篡改（含余额快照），审核奖励、转赠、兑换码均有台账

### 管理后台（Simpleui 主题）

- 数据看板：分类统计各站点访问，综合「访问量 + 平均星级 + 评分数」排序 TOP10；访问趋势图、下载概览页
- 审核中心：站点提交 / 教程分享 / APP 链接提交的统一审核
- 备份 / 恢复：页面一键打包备份，命令行 `backup` / `restore`（zip）
- 站点与分类管理：自由增删改，上传 logo 与 APP 安装包；Logo 支持 PNG / JPG / WebP / SVG，SVG 自动转 PNG（cairosvg，失败则回退保存原文件）
- 全局设置：网站标题 / 副标题 / 图标、SEO、公告栏、页脚版权、`<head>` 注入脚本、每页条数、注册邮箱验证开关、2FA 开关、转发来源域名（分享链接前缀）
- 升级说明页：记录版本变更与升级注意事项

### 界面与国际化

- Ant Design (蚂蚁) 主题外观，靛蓝金融配色，深色 / 浅色模式跟随系统；底部 Tab、搜索、卡片、弹窗等均为 AntD 组件（子路径引用）
- 中英文一键切换；后端 API 错误与校验消息按客户端语言返回（默认中文）

## 项目结构

```
finnav/
├── backend/     # Django + DRF 后端（API + 管理后台）
├── frontend/    # Next.js 前端
├── scripts/     # 开发服务脚本（start/stop）
├── .github/
│   └── workflows/  # CI/CD 工作流（镜像构建推送 GHCR）
├── docs/
│   ├── api.md   # 前后端 API 契约
│   └── screenshots/  # 截图
├── docker/      # Docker Compose 部署（单端口对外，后端+前端双容器，可选 Nginx HTTPS）
└── deploy_finnav.sh  # 一键部署脚本（Docker Compose + GHCR 镜像）
```

## 开发服务管理（scripts/）

一键启动 / 停止 / 重启 / 查看前后端开发服务：

```bash
./scripts/dev.sh start           # 启动后端(8000) + 前端(8081)
./scripts/dev.sh start backend   # 仅后端
./scripts/dev.sh start frontend  # 仅前端
./scripts/dev.sh status          # 查看运行状态
./scripts/dev.sh restart         # 重启全部
./scripts/dev.sh stop            # 停止全部
./scripts/dev.sh stop backend    # 仅停止后端
```

- 均后台运行，日志写入 `logs/`，PID 写入 `.run/`
- 端口可用环境变量覆盖：`BACKEND_PORT`、`FRONTEND_PORT`
- 前端 API 地址：Web 生产构建下使用相对路径 `/api`（通过 nginx 反向代理到后端）
- 各子脚本也可单独调用：`./scripts/start_backend.sh`、`./scripts/stop_backend.sh`、`./scripts/start_frontend.sh`、`./scripts/stop_frontend.sh`、`./scripts/status.sh`

## 技术栈

- 前端：Next.js + React 19 + Ant Design + TanStack Query + i18next / react-i18next
  - 注意：必须用子路径引入 AntD 组件（如 `@ant-design/react-native/es/button`），不可 `from "@ant-design/react-native"`——该 barrel 入口在 RNGH v3 下无法打包（依赖已移除的 `DrawerLayout`）
- 后端：Django 5.2 LTS（含 `gettext` 国际化） + Django REST Framework + djangorestframework-simplejwt + django-simpleui + django-cors-headers + Pillow + cairosvg（SVG 图标转 PNG）

## 后端（backend/）

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo      # 可选：插入演示分类与站点
.venv/bin/python manage.py createsuperuser  # 管理后台账号
.venv/bin/python manage.py runserver 0.0.0.0:8000
```

- API 文档/契约：`docs/api.md`；根路径 `/api/`，健康检查 `GET /api/health/`
- 管理后台：http://localhost:8000/admin/ （添加/编辑分类、站点，上传 logo）
- 配置覆盖：复制 `.env.example` 为 `.env`，可覆盖 `DEBUG` / `SECRET_KEY` / `ALLOWED_HOSTS` 及数据库选项；真实环境变量优先于 `.env`
- 数据库：默认 SQLite（零配置）。可用 `DB_ENGINE=mysql|postgres` 切换，详见 `backend/.env.example` 中的 `DB_*` 变量说明
- 测试：`.venv/bin/python manage.py test`
- 运行：`./scripts/start_backend.sh`（或 `.venv/bin/python manage.py runserver 0.0.0.0:8000`)
- **国际化**：后端 API 错误消息按 `Accept-Language` 头协商语言（zh→中文，en→英文，其它→英文）；默认中文。建模校验消息用 `_()`/`gettext_lazy()` 包裹，翻译源在 `backend/apps/navigation/locale/`；改完 `.po` 后执行 `.venv/bin/python manage.py compilemessages`。Docker 部署时 `docker/backend/entrypoint.sh` 会自动编译。

## 前端（frontend/）

```bash
cd frontend
npm install
npm run web        # Web（浏览器访问）
```

- 运行：`./scripts/start_frontend.sh`（或 `npm run web`）
- 校验：`npx tsc --noEmit`、`npm run build`

## 一键部署脚本（适用于主流 Linux）

FinNav 提供了 `deploy_finnav.sh` 脚本，可在 Ubuntu/Debian、CentOS/RHEL、Fedora、Arch 等常见 Linux 发行版上一键完成以下工作：

- 安装 Docker Engine + Docker Compose v2
- 可选安装 Nginx + Certbot（HTTPS 自动证书）
- 交互式生成 `docker/.env` 配置（密钥、域名、数据库、镜像仓库等）
- 从 GHCR 拉取预构建镜像（`finnav-backend`、`finnav-frontend`）
- 通过 Docker Compose 启动双容器服务
- 自动配置 Nginx 反向代理 + HTTPS（如启用）

### 使用方法

```bash
# 赋予执行权限
chmod +x deploy_finnav.sh
# 以 root 身份运行（交互式配置）
sudo ./deploy_finnav.sh
```

### 交互式配置项

| 项目 | 说明 |
|------|------|
| HTTPS / 域名 | 是否启用 HTTPS、域名、Certbot 邮箱 |
| SEO 信息 | 站点标题、描述（前端构建时已烘焙，运行时兜底） |
| 数据库 | SQLite（本地文件） / PostgreSQL / MySQL（外部实例） |
| 对外端口 | 默认 80 |
| GHCR 仓库所有者 | 镜像来源组织/用户名（默认 `cljproton`） |
| 邮件发送 | Resend API Key（可选，留空则验证码打印日志） |
| 部署目录 | 默认 `/opt/finnav` |
| 防火墙 | 自动放行 80/443 |

> **提示**：脚本会在交互过程中显示每个选项的默认值，直接回车即可接受默认。

## Docker 部署教程（手动模式）

项目提供了基于 Docker Compose 的部署方案，适用于生产或快速演示环境。以下为核心步骤：

### 1. 准备
- 确保机器已安装 Docker Engine（>= 20.10）和 Docker Compose v2。
- 若需自定义配置，编辑 `docker/.env.example` 并复制为 `docker/.env`。

### 2. 启动（本地构建模式）
```bash
cd docker
cp .env.example .env   # 首次部署，按需修改（密钥、端口等）
docker compose up -d --build
```

### 3. 启动（生产拉取镜像模式，推荐）
```bash
cd docker
cp .env.example .env   # 配置 BACKEND_IMAGE / FRONTEND_IMAGE 指向 GHCR
docker compose pull
docker compose up -d
```

> **生产推荐**：使用 `deploy_finnav.sh` 自动完成上述流程，或配合 GitHub Actions 将镜像推送到 GHCR，服务器仅执行 `docker compose pull && docker compose up -d`。

### 4. 访问入口（默认端口 80，可在 `.env` 中的 `PORT` 覆盖）

| 入口 | 地址 |
|------|------|
| 前端 Web | http://localhost/ |
| 管理后台 | http://localhost/admin/ |
| API | http://localhost/api/ |

### 5. 常用运维命令

```bash
# 查看容器状态
docker compose ps
# 查看日志
docker compose logs -f backend   # 后端日志（验证码等）
docker compose logs -f frontend  # 前端日志
# 更新镜像并重启
docker compose pull && docker compose up -d
# 停止并保留数据卷
docker compose down
# 停止并删除数据卷（彻底清理，⚠️ 数据丢失）
docker compose down -v
```

### 6. 数据持久化
- 数据库存储在 `docker/data/` 目录（SQLite 文件 `db.sqlite3` 与 `media/`）。该目录通过卷挂载在容器内，容器重启后数据仍然保留。
- 如需使用 MySQL/PostgreSQL，请在 `.env` 中将 `DB_ENGINE` 改为 `mysql` 或 `postgres`，并填写相应的 `DB_*` 环境变量；容器本身不提供数据库服务，需自行连接外部数据库实例。

### 7. 备份/恢复（使用后端管理页面或命令行）

```bash
# 打包备份（自动生成 zip 包）
docker compose exec backend python manage.py backup -o backup.zip
# 恢复备份（会清空并覆盖当前数据）
docker compose exec backend python manage.py restore backup.zip
```

### 8. GitHub Actions 镜像构建

项目包含两个独立的手动触发工作流（`.github/workflows/`）：

| 工作流 | 触发 | 产物 |
|--------|------|------|
| `build-backend-image.yml` | `workflow_dispatch` | `ghcr.io/<owner>/finnav-backend:latest` + `:sha` |
| `build-frontend-image.yml` | `workflow_dispatch` (含 SEO 参数) | `ghcr.io/<owner>/finnav-frontend:latest` + `:sha` |

**使用方式**：
1. 进入 GitHub 仓库 → Actions → 选择对应工作流 → `Run workflow`
2. 前端构建可填写 `seo_origin`、`seo_title`、`seo_description`（会作为 build args 烘焙进镜像）
3. 构建完成后，镜像自动推送到 GHCR，服务器执行 `docker compose pull && docker compose up -d` 即可更新

> 镜像标签包含 `:latest` 与 `:<short-sha>`，便于回滚与追溯。

---

## 免责声明

本项目纯属个人开发研究，可能存在缺陷或不完善之处。请在使用时遵守当地法律法规，如因使用本项目代码导致的任何法律纠纷或损失，均由使用者自行承担责任。

## 捐助

如果本项目对您有帮助，欢迎通过以下方式进行捐助：
- USDT（ERC20）地址：`0xAdf7CBcF1afC6a0692aEb6a0deE13110cc65C0EF`
- USDC（ERC20）地址：`0xAdf7CBcF1afC6a0692aEb6a0deE13110cc65C0EF`

感谢您的支持与鼓励！如果您不便捐助，也欢迎提交 Issue 或 Pull Request 共同改进项目。


本项目基于 **MIT 许可证**，详见根目录 `LICENSE` 文件。