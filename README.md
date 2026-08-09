| |
|:---:|
| ![finnav logo](docs/screenshots/icon.png) |

# finnav





金融 / Web3 网站导航应用。一套前端代码打包 Web / Android / iOS，后端 Django 管理后台可自由添加分类与站点。

- 界面支持**中英文切换**：前端右上角悬浮「中 / EN」一键切换；后端 API 错误与校验消息按客户端语言返回翻译（默认中文）。
- **English**：见 [README.en.md](README.en.md)。

## 截图

![首页](docs/screenshots/index.png)
![搜索](docs/screenshots/search.png)
![收藏](docs/screenshots/favorite.png)
![我的](docs/screenshots/me.png)

## 功能

- 首页：分类筛选 + 站点卡片（logo / 名称 / 描述 / 标签），点击进入站点详情，下拉刷新
- 站点详情页：文字教程、视频教程、代办申请（如黄鱼）链接（每种可多条），APP 下载（含版本号）、访问官网
- 一键转发：详情页分享站点名称/描述/链接（原生系统分享 / Web `navigator.share`）
- 打星评分：邮箱注册用户可对站点打星（最低 0 星、最高 5 星），评论可选；每个站点汇总平均星级与评分人数，一人>一票
- 访问统计：打开站点详情页计一次访问
- 搜索：按名称/描述/标签实时搜索
- 收藏：本地持久化（AsyncStorage）；登录后自动与服务器同步，支持跨设备保持一致
- 账号：邮箱验证码注册（Resend，本地无密钥时验证码打印到后端日志）、登录、忘记密码；「我的」页可退出登录；搜索历史、收藏
随账号同步保持个性化
- 界面：Ant Design (蚂蚁) 主题外观，靛蓝金融配色，深色/浅色模式跟随系统；底部 Tab、搜索、卡片、弹窗等均为 AntD 组件（子>路径引用）
- 管理后台：Simpleui 主题。概览页分类统计各站点访问情况，并按「访问量 + 平均星级 + 评分数」综合排序 TOP10；自由增删改分>类与站点，上传 logo 与 APP 安装包，维护教程/视频/代办链接

## 项目结构

```
finnav/
├── backend/     # Django + DRF 后端（API + 管理后台）
├── frontend/    # Expo (React Native) 跨端前端
├── scripts/     # 前后端开发服务的启动/停止/状态脚本
├── docs/
│   ├── api.md   # 前后端 API 契约
│   └── screenshots/  # 截图
├── docker/      # Docker Compose 部署（单端口对外，包含后端、前端、Nginx 反向代理）
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
- 前端 API 地址默认 `http://localhost:8000`，可用 `EXPO_PUBLIC_API_BASE_URL` 覆盖
- 各子脚本也可单独调用：`./scripts/start_backend.sh`、`./scripts/stop_backend.sh`、`./scripts/start_frontend.sh`、`./scripts/stop_frontend.sh`、`./scripts/status.sh`

## 技术栈

- 前端：Expo SDK 57 (React Native 0.86) + expo-router + TanStack Query + AsyncStorage + @ant-design/react-native（Ant Design 主题）+ i18next / react-i18next / expo-localization
  - 注意：必须用子路径引入 AntD 组件（如 `@ant-design/react-native/es/button`），不可 `from "@ant-design/react-native"`——该 barrel 入口在 RNGH v3 下无法打包（依赖已移除的 `DrawerLayout`）
- 后端：Django 5.2 LTS（含 `gettext` 国际化） + Django REST Framework + djangorestframework-simplejwt + django-simpleui + django-cors-headers + Pillow

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
npm run android    # Android（Expo Go 或模拟器）
npm run ios        # iOS（Expo Go 或模拟器）
```

- API 地址默认：web/iOS 用 `http://localhost:8000`，Android 模拟器用 `http://10.0.2.2:8000`；可用环境变量 `EXPO_PUBLIC_API_BASE_URL` 覆盖（如指向局域网 IP 供真机联调）
- 真机联调：后端需 `runserver 0.0.0.0:8000`，前端设置 `EXPO_PUBLIC_API_BASE_URL=http://<局域网IP>:8000`
- 运行：`./scripts/start_frontend.sh`（或 `npm run web`）
- 校验：`npx tsc --noEmit`、`npx expo export --platform web`
- 注意：`react` 与 `react-dom` 必须保持完全相同的版本（当前为 19.2.3，与 Expo SDK 57 对齐）；如需调整请用 `npx expo install react react-dom` 而非直接改 package.json

## 一键部署脚本（适用于主流 Linux）

FinNav 提供了 `deploy_finnav.sh` 脚本，可在 Ubuntu/Debian、CentOS/RHEL、Fedora、Arch 等常见 Linux 发行版上一键完成以下工作：

- 安装系统依赖（git、curl、编译工具、Python、Node.js 20 LTS）
- 创建专用系统用户并设置适当的文件权限
- 克隆仓库、创建 Python virtualenv、安装后端依赖
- 自动完成数据库迁移、收集静态文件、可选导入演示数据 (`seed_demo`)
- 通过 systemd 启动 Gunicorn，提供 **systemd** 管理
- 可选配置 Nginx + Let’s Encrypt HTTPS（自动获取证书）
- 自动打开防火墙所需端口

### 使用方法

```bash
# 若仓库中已存在此脚本，直接赋予执行权限
chmod +x deploy_finnav.sh
# 以 root 身份运行（交互式配置，默认导入 demo 数据）
sudo ./deploy_finnav.sh
```

### 常用参数（可在交互式提示时直接输入）

| 参数 | 说明 |
|------|------|
| `--https` | 开启 HTTPS 并自动配置 Nginx + Certbot |
| `--cert-email <email>` | Certbot 注册使用的邮箱 |
| `--db-type <sqlite|postgres|mysql>` | 选择数据库后端 |
| `--db-host <host>` | 数据库主机（非 SQLite 必填） |
| `--db-port <port>` | 数据库端口 |
| `--db-name <name>` | 数据库名称 |
| `--db-user <user>` | 数据库用户名 |
| `--db-pass <pwd>` | 数据库密码 |
| `--run-user <user>` | 运行服务的系统用户（默认 `finnav`） |
| `--install-dir <path>` | 项目安装路径（默认 `/opt/finnav`） |
| `--workers <n>` | 手动指定 Gunicorn workers（默认自动检测 `$(nproc)`） |
| `--no-demo` | 跳过 `seed_demo` 导入 |

> **提示**：脚本会在交互过程中显示每个选项的默认值，直接回车即可接受默认。

## Docker 部署教程

项目提供了基于 Docker Compose 的一键部署方案，适用于生产或快速演示环境。以下为核心步骤：

1. **准备**  
   - 确保机器已安装 Docker Engine（>= 20.10）和 Docker Compose v2。  
   - 若需要自定义端口或环境变量，请编辑 `docker/.env.example` 并将其复制为 `docker/.env`。

2. **启动**  
   ```bash
   cd docker
   cp .env.example .env   # 首次部署，按需修改（密钥、端口等）
   docker compose up -d --build
   ```

3. **访问入口**（默认端口 80，可在 `.env` 中的 `PORT` 覆盖）  

   | 入口 | 地址 |
   |------|------|
   | 前端 Web | http://localhost/ |
   | 管理后台 | http://localhost/admin/ |
   | API | http://localhost/api/ |

4. **常用运维命令**  

   ```bash
   # 查看容器状态
   docker compose ps
   # 查看日志
   docker compose logs -f backend   # 后端日志（验证码等）
   docker compose logs -f frontend  # 前端日志
   # 停止并保留数据卷
   docker compose down
   # 停止并删除数据卷（彻底清理）
   docker compose down -v
   ```

5. **数据持久化**  
   - 数据库存储在 `docker/data/` 目录（SQLite 文件 `db.sqlite3` 与 `media/`）。该目录通过卷挂载在容器内，容器重启后数据仍然保留。  
   - 如需使用 MySQL/PostgreSQL，请在 `.env` 中将 `DB_ENGINE` 改为 `mysql` 或 `postgres`，并填写相应的 `DB_*` 环境变量；容器本身不提供数据库服务，需自行连接外部数据库实例。

6. **备份/恢复**（使用后端管理页面或命令行）  

   ```bash
   # 打包备份（自动生成 zip 包）
   docker compose exec backend python manage.py backup -o backup.zip
   # 恢复备份（会清空并覆盖当前数据）
   docker compose exec backend python manage.py restore backup.zip
   ```

> **提示**：若想在生产环境使用 HTTPS，请在外部 Nginx/Traefik 中为 `http://localhost` 代理实现 TLS 终端。

## 免责声明

本项目纯属个人开发研究，可能存在缺陷或不完善之处。请在使用时遵守当地法律法规，如因使用本项目代码导致的任何法律纠纷或损失，均由使用者自行承担责任。

## 捐助

如果本项目对您有帮助，欢迎通过以下方式进行捐助：
- USDT（ERC20）地址：`0xAdf7CBcF1afC6a0692aEb6a0deE13110cc65C0EF`
- USDC（ERC20）地址：`0xAdf7CBcF1afC6a0692aEb6a0deE13110cc65C0EF`

感谢您的支持与鼓励！如果您不便捐助，也欢迎提交 Issue 或 Pull Request 共同改进项目。



本项目基于 **MIT 许可证**，详见根目录 `LICENSE` 文件。

