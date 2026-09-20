#!/usr/bin/env bash
# deploy_finnav.sh – 交互式一键部署脚本
# 通过 Docker Compose 拉取 GHCR 镜像部署（前后端双容器 + 可选 Nginx HTTPS）
# -------------------------------------------------
# 必须以 root 执行
if [ "$(id -u)" -ne 0 ]; then
    echo "❌ 权限不足：请使用 sudo 或以 root 身份运行本脚本。" >&2
    exit 1
fi
set -euo pipefail

# ---------- 0. 通用工具函数 ----------
rand_secret() {
    # 生成 50 字符随机密钥
    tr -dc 'A-Za-z0-9!@#$%^&*()_+-=' </dev/urandom | head -c 50
}

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        echo "❌ 无法检测操作系统，退出。" >&2
        exit 1
    fi
    case "$OS" in
        ubuntu|debian)
            PKG_UPDATE="apt-get update -y"
            PKG_INSTALL="apt-get install -y"
            DOCKER_PKG="docker.io docker-compose-plugin"
            NGINX_PKG="nginx certbot python3-certbot-nginx"
            ;;
        centos|rhel)
            PKG_UPDATE="yum makecache"
            PKG_INSTALL="yum install -y"
            DOCKER_PKG="docker-ce docker-ce-cli containerd.io docker-compose-plugin"
            NGINX_PKG="nginx certbot python3-certbot-nginx"
            ;;
        fedora)
            PKG_UPDATE="dnf makecache"
            PKG_INSTALL="dnf install -y"
            DOCKER_PKG="docker-ce docker-ce-cli containerd.io docker-compose-plugin"
            NGINX_PKG="nginx certbot python3-certbot-nginx"
            ;;
        arch)
            PKG_UPDATE="true"
            PKG_INSTALL="pacman -Sy --noconfirm"
            DOCKER_PKG="docker docker-compose"
            NGINX_PKG="nginx certbot python-certbot-nginx"
            ;;
        *)
            echo "❌ 不支持的发行版 $OS" >&2
            exit 1
            ;;
    esac
}

install_docker() {
    echo "📦 安装 Docker Engine + Compose v2…"
    case "$OS" in
        ubuntu|debian)
            $PKG_UPDATE
            $PKG_INSTALL ca-certificates curl gnupg lsb-release
            install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable" \
                > /etc/apt/sources.list.d/docker.list
            $PKG_UPDATE
            $PKG_INSTALL $DOCKER_PKG
            ;;
        centos|rhel)
            $PKG_INSTALL yum-utils
            yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            $PKG_INSTALL $DOCKER_PKG
            ;;
        fedora)
            $PKG_INSTALL dnf-plugins-core
            dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
            $PKG_INSTALL $DOCKER_PKG
            ;;
        arch)
            $PKG_INSTALL $DOCKER_PKG
            ;;
    esac
    systemctl enable --now docker
    echo "✅ Docker $(docker --version) / Compose $(docker compose version) 已就绪"
}

# ---------- 1. 交互获取配置 ----------
echo "=== FinNav Docker Compose 部署向导 ==="

# ----- HTTPS / 域名 -----
echo
echo "是否配置 HTTPS（需已解析域名到本机）？"
select USE_HTTPS in "Yes" "No"; do
    case $USE_HTTPS in
        Yes) USE_HTTPS=true; break ;;
        No)  USE_HTTPS=false; break ;;
    esac
done

if $USE_HTTPS; then
    read -p "域名 (例: fn.example.com): " DOMAIN
    while [ -z "$DOMAIN" ]; do
        read -p "域名不能为空，请重新输入: " DOMAIN
    done
    read -p "Certbot 注册邮箱 (默认: admin@$DOMAIN): " CERTBOT_EMAIL
    CERTBOT_EMAIL=${CERTBOT_EMAIL:-admin@$DOMAIN}
    SEO_ORIGIN="https://$DOMAIN"
else
    DOMAIN=""
    CERTBOT_EMAIL=""
    read -p "HTTP 访问域名或 IP (默认: 服务器公网 IP): " SEO_ORIGIN_INPUT
    if [ -n "$SEO_ORIGIN_INPUT" ]; then
        SEO_ORIGIN="http://$SEO_ORIGIN_INPUT"
    else
        # 尝试获取公网 IP
        PUB_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "localhost")
        SEO_ORIGIN="http://$PUB_IP"
    fi
fi

# SEO 标题/描述（前端构建时已烘焙，运行时仅作兜底显示）
read -p "站点标题 (默认: 金融与 Web3 站点导航 | FinNav): " SEO_TITLE
SEO_TITLE=${SEO_TITLE:-"金融与 Web3 站点导航 | FinNav"}
read -p "站点描述 (默认: FinNav：一个金融与 Web3 站点导航…): " SEO_DESCRIPTION
SEO_DESCRIPTION=${SEO_DESCRIPTION:-"FinNav：一个金融与 Web3 站点导航，收录官网入口、APP 下载、新手教程与用户评价。"}

# ----- 数据库 -----
echo
echo "请选择数据库类型："
select DB_TYPE in "SQLite (本地文件，零配置)" "PostgreSQL (外部实例)" "MySQL (外部实例)"; do
    case $DB_TYPE in
        "SQLite (本地文件，零配置)") DB_ENGINE=sqlite; break ;;
        "PostgreSQL (外部实例)") DB_ENGINE=postgres; break ;;
        "MySQL (外部实例)") DB_ENGINE=mysql; break ;;
    esac
done

DB_HOST=""
DB_PORT=""
DB_NAME=""
DB_USER=""
DB_PASSWORD=""

if [ "$DB_ENGINE" != "sqlite" ]; then
    read -p "数据库主机 (默认: localhost): " DB_HOST
    DB_HOST=${DB_HOST:-localhost}
    if [ "$DB_ENGINE" = "postgres" ]; then
        read -p "数据库端口 (默认: 5432): " DB_PORT
        DB_PORT=${DB_PORT:-5432}
    else
        read -p "数据库端口 (默认: 3306): " DB_PORT
        DB_PORT=${DB_PORT:-3306}
    fi
    read -p "数据库名 (默认: finnav): " DB_NAME
    DB_NAME=${DB_NAME:-finnav}
    read -p "数据库用户名 (默认: finnav): " DB_USER
    DB_USER=${DB_USER:-finnav}
    read -s -p "数据库密码 (必填): " DB_PASSWORD
    echo
    while [ -z "$DB_PASSWORD" ]; do
        read -s -p "密码不能为空，请重新输入: " DB_PASSWORD
        echo
    done
fi

# ----- 端口 -----
read -p "对外端口 (默认: 80): " PORT
PORT=${PORT:-80}

# ----- 镜像仓库 -----
read -p "GHCR 仓库所有者/组织 (默认: cljproton): " GHCR_OWNER
GHCR_OWNER=${GHCR_OWNER:-cljproton}
BACKEND_IMAGE="ghcr.io/$GHCR_OWNER/finnav-backend"
FRONTEND_IMAGE="ghcr.io/$GHCR_OWNER/finnav-frontend"

# ----- Email (Resend) -----
echo
echo "配置邮件发送 (Resend)？留空则验证码仅打印到后端日志。"
read -p "RESEND_API_KEY (可选): " RESEND_API_KEY
read -p "发件邮箱 (默认: onboarding@resend.dev): " DEFAULT_FROM_EMAIL
DEFAULT_FROM_EMAIL=${DEFAULT_FROM_EMAIL:-onboarding@resend.dev}

# ----- 项目目录 -----
read -p "部署目录 (默认: /opt/finnav): " PROJECT_DIR
PROJECT_DIR=${PROJECT_DIR:-/opt/finnav}

# ----- 防火墙 -----
echo
echo "是否自动放行防火墙端口 (80/443)？"
select OPEN_FIREWALL in "Yes" "No"; do
    case $OPEN_FIREWALL in
        Yes) OPEN_FIREWALL=true; break ;;
        No)  OPEN_FIREWALL=false; break ;;
    esac
done

# ---------- 2. 系统准备 ----------
detect_os

# 安装 Docker
if ! command -v docker >/dev/null 2>&1; then
    install_docker
else
    echo "✅ Docker 已安装: $(docker --version)"
fi

# 安装 Nginx + Certbot (仅 HTTPS 时)
if $USE_HTTPS; then
    if ! command -v nginx >/dev/null 2>&1; then
        echo "📦 安装 Nginx + Certbot…"
        $PKG_UPDATE
        $PKG_INSTALL $NGINX_PKG
    else
        echo "✅ Nginx 已安装"
    fi
fi

# ---------- 3. 项目目录与代码 ----------
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

if [ ! -d ".git" ]; then
    echo "📥 克隆仓库…"
    git clone https://github.com/$GHCR_OWNER/finnav.git .
else
    echo "📂 仓库已存在，拉取最新代码…"
    git pull
fi

# ---------- 4. 生成 docker/.env ----------
DOCKER_ENV="$PROJECT_DIR/docker/.env"
mkdir -p "$PROJECT_DIR/docker"

# 生成随机 SECRET_KEY
SECRET_KEY=$(rand_secret)

# 构建 ALLOWED_HOSTS
if $USE_HTTPS; then
    ALLOWED_HOSTS="$DOMAIN,localhost,127.0.0.1"
    CSRF_TRUSTED_ORIGINS="https://$DOMAIN"
else
    ALLOWED_HOSTS="localhost,127.0.0.1,$(echo $SEO_ORIGIN | sed 's|http://||')"
    CSRF_TRUSTED_ORIGINS=""
fi

# 数据库配置
case "$DB_ENGINE" in
    sqlite)
        DB_NAME="/srv/data/db.sqlite3"
        DB_USER=""
        DB_PASSWORD=""
        DB_HOST=""
        DB_PORT=""
        DB_CHARSET="utf8mb4"
        DB_CONN_MAX_AGE="60"
        ;;
    postgres)
        DB_NAME="$DB_NAME"
        DB_USER="$DB_USER"
        DB_PASSWORD="$DB_PASSWORD"
        DB_HOST="$DB_HOST"
        DB_PORT="$DB_PORT"
        DB_CHARSET="utf8mb4"
        DB_CONN_MAX_AGE="60"
        ;;
    mysql)
        DB_NAME="$DB_NAME"
        DB_USER="$DB_USER"
        DB_PASSWORD="$DB_PASSWORD"
        DB_HOST="$DB_HOST"
        DB_PORT="$DB_PORT"
        DB_CHARSET="utf8mb4"
        DB_CONN_MAX_AGE="60"
        ;;
esac

cat > "$DOCKER_ENV" <<EOF
# ===== FinNav Docker 部署配置 (由 deploy_finnav.sh 自动生成) =====
# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')

# Django 核心
DEBUG=False
SECRET_KEY=$SECRET_KEY
ALLOWED_HOSTS=$ALLOWED_HOSTS
CSRF_TRUSTED_ORIGINS=$CSRF_TRUSTED_ORIGINS

# Email (Resend)
RESEND_API_KEY=$RESEND_API_KEY
DEFAULT_FROM_EMAIL=$DEFAULT_FROM_EMAIL

# 数据库
DB_ENGINE=$DB_ENGINE
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_CHARSET=$DB_CHARSET
DB_CONN_MAX_AGE=$DB_CONN_MAX_AGE

# 对外端口
PORT=$PORT

# 镜像仓库
BACKEND_IMAGE=$BACKEND_IMAGE
FRONTEND_IMAGE=$FRONTEND_IMAGE

# SEO (运行时兜底，构建时已烘焙进前端镜像)
SEO_ORIGIN=$SEO_ORIGIN
SEO_TITLE=$SEO_TITLE
SEO_DESCRIPTION=$SEO_DESCRIPTION
EOF

echo "✅ 已生成 $DOCKER_ENV"

# ---------- 5. Nginx 反向代理配置 (仅 HTTPS) ----------
if $USE_HTTPS; then
    echo "🔧 配置 Nginx 反向代理…"
    cat > /etc/nginx/sites-available/finnav <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    # ACME 挑战目录 (Certbot)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # 其余流量重定向到 HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL 证书路径 (Certbot 会自动填充)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 前端容器 (Docker 网络内服务名: frontend:3000)
    # 媒体文件直接代理到后端（确保 logo 等媒体可通过公网域名访问）
    location /media/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX

    ln -sf /etc/nginx/sites-available/finnav /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx

    echo "🔐 申请 SSL 证书…"
    certbot --nginx -d "$DOMAIN" -m "$CERTBOT_EMAIL" --agree-tos --no-eff-email --redirect

    # 设置自动续期
    systemctl enable --now certbot.timer
fi

# ---------- 6. 启动 Docker Compose ----------
echo "🚀 拉取镜像并启动服务…"
cd "$PROJECT_DIR/docker"
docker compose pull
docker compose up -d

# 等待健康检查
echo "⏳ 等待后端健康检查通过…"
for i in {1..30}; do
    if docker compose exec -T backend curl -fsS http://localhost:8000/api/health/ >/dev/null 2>&1; then
        echo "✅ 后端健康检查通过"
        break
    fi
    sleep 2
    if [ $i -eq 30 ]; then
        echo "⚠️ 后端健康检查超时，请检查日志: docker compose logs backend"
    fi
done

# ---------- 7. 防火墙 ----------
if $OPEN_FIREWALL; then
    echo "🔓 配置防火墙…"
    if command -v ufw >/dev/null; then
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw --force enable
    elif command -v firewall-cmd >/dev/null; then
        firewall-cmd --add-service=http --permanent
        firewall-cmd --add-service=https --permanent
        firewall-cmd --reload
    else
        echo "⚠️ 未检测到 ufw 或 firewalld，请手动放行 80/443 端口"
    fi
fi

# ---------- 8. 完成提示 ----------
cat <<EOF

============================================================
✅ FinNav 部署完成！
============================================================

📁 部署目录: $PROJECT_DIR
🐳 运行模式: Docker Compose (GHCR 镜像)
   • 后端:  $BACKEND_IMAGE
   • 前端:  $FRONTEND_IMAGE

🌐 访问地址:
EOF

if $USE_HTTPS; then
    echo "   • 前端:  https://$DOMAIN"
    echo "   • 后台:  https://$DOMAIN/admin/"
    echo "   • API:   https://$DOMAIN/api/"
else
    echo "   • 前端:  $SEO_ORIGIN"
    echo "   • 后台:  $SEO_ORIGIN/admin/"
    echo "   • API:   $SEO_ORIGIN/api/"
fi

cat <<EOF

🔧 常用运维命令:
   cd $PROJECT_DIR/docker
   docker compose ps                    # 查看容器状态
   docker compose logs -f backend       # 后端日志
   docker compose logs -f frontend      # 前端日志
   docker compose pull && docker compose up -d  # 更新镜像并重启
   docker compose down                  # 停止并移除容器
   docker compose down -v               # 停止并删除数据卷 (⚠️ 数据丢失)

📊 后台管理:
   账号: admin (需自行创建: docker compose exec backend python manage.py createsuperuser)
   或使用测试账号: testadmin / Test@2026 (仅本地 SQLite)

📝 配置文件: $DOCKER_ENV
   修改后需重启: docker compose up -d

============================================================
EOF