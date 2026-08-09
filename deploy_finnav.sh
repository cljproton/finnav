#!/usr/bin/env bash
# deploy_finnav.sh – 交互式一键部署脚本
# -------------------------------------------------
# 必须以 root 执行
if [ "$(id -u)" -ne 0 ]; then
    echo "❌ 权限不足：请使用 sudo 或以 root 身份运行本脚本。" >&2
    exit 1
fi
set -euo pipefail

# ---------- 1. 交互获取配置 ----------
# ----- HTTPS -----
echo "是否开启 HTTPS？"
select USE_HTTPS in "Yes" "No"; do
    case $USE_HTTPS in
        Yes) USE_HTTPS=true; break ;;
        No)  USE_HTTPS=false; break ;;
    esac
done
if $USE_HTTPS; then
    read -p "域名 (默认: example.com): " DOMAIN
    DOMAIN=${DOMAIN:-example.com}
    read -p "Certbot 注册邮箱 (默认: admin@example.com): " CERTBOT_EMAIL
    CERTBOT_EMAIL=${CERTBOT_EMAIL:-admin@example.com}
fi

# ----- 数据库 -----
echo "请选择数据库类型："
select DB_TYPE in "SQLite" "PostgreSQL" "MySQL"; do
    case $DB_TYPE in
        SQLite) DB_TYPE=sqlite; break ;;
        PostgreSQL) DB_TYPE=postgres; break ;;
        MySQL) DB_TYPE=mysql; break ;;
    esac
done
if [[ "$DB_TYPE" != "sqlite" ]]; then
    read -p "数据库主机 (默认: localhost): " DB_HOST
    DB_HOST=${DB_HOST:-localhost}
    if [[ "$DB_TYPE" == "postgres" ]]; then
        read -p "数据库端口 (默认: 5432): " DB_PORT
        DB_PORT=${DB_PORT:-5432}
    else
        read -p "数据库端口 (默认: 3306): " DB_PORT
        DB_PORT=${DB_PORT:-3306}
    fi
    read -p "数据库名 (默认: finnav): " DB_NAME
    DB_NAME=${DB_NAME:-finnnav}
    read -p "数据库用户名 (默认: finnav): " DB_USER
    DB_USER=${DB_USER:-finnnav}
    read -s -p "数据库密码 (必填): " DB_PASSWORD
    echo
fi

# ----- 系统运行用户 -----
read -p "系统运行用户 (默认: finnav): " RUN_USER
RUN_USER=${RUN_USER:-finnnav}

# ----- 项目安装目录 -----
read -p "项目安装目录 (默认: /opt/finnav): " PROJECT_DIR
PROJECT_DIR=${PROJECT_DIR:-/opt/finnav}

# ----- 防火墙 -----
echo "是否自动打开防火墙端口？"
select OPEN_FIREWALL in "Yes" "No"; do
    case $OPEN_FIREWALL in
        Yes) OPEN_FIREWALL=true; break ;;
        No)  OPEN_FIREWALL=false; break ;;
    esac
done

# ----- Gunicorn workers -----
echo "是否根据 CPU 核心数自动计算 Gunicorn workers？"
select AUTO_WORKERS in "Yes" "No"; do
    case $AUTO_WORKERS in
        Yes) AUTO_WORKERS=true; break ;;
        No)  AUTO_WORKERS=false; break ;;
    esac
done
if $AUTO_WORKERS; then
    GUNICORN_WORKERS=$(nproc)
else
    read -p "请输入 workers 数量 (默认: 4): " GUNICORN_WORKERS
    GUNICORN_WORKERS=${GUNICORN_WORKERS:-4}
fi

# ----- Demo 数据导入 -----
echo "是否导入演示数据（seed_demo）？ (默认 Yes)"
select IMPORT_DEMO in "Yes" "No"; do
    case $IMPORT_DEMO in
        Yes) IMPORT_DEMO=true; break ;;
        No)  IMPORT_DEMO=false; break ;;
    esac
done

# ---------- 2. 环境变量准备 ----------
case "$DB_TYPE" in
    sqlite)
        DATABASE_URL="sqlite:///${PROJECT_DIR}/db.sqlite3"
        ;;
    postgres)
        DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
        ;;
    mysql)
        DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
        ;;
    *)
        echo "未知的数据库类型 $DB_TYPE" >&2
        exit 1
        ;;
esac
export DATABASE_URL

# ---------- 3. 发行版检测 ----------
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        echo "无法检测操作系统，退出。" >&2
        exit 1
    fi
    case "$OS" in
        ubuntu|debian)
            PKG_UPDATE="apt-get update -y"
            PKG_INSTALL="apt-get install -y"
            ;;
        centos|rhel)
            PKG_UPDATE="yum makecache"
            PKG_INSTALL="yum install -y"
            ;;
        fedora)
            PKG_UPDATE="dnf makecache"
            PKG_INSTALL="dnf install -y"
            ;;
        arch)
            PKG_UPDATE="true"
            PKG_INSTALL="pacman -Sy --noconfirm"
            ;;
        *)
            echo "不支持的发行版 $OS" >&2
            exit 1
            ;;
    esac
}

detect_os

# ---------- 4. 安装系统依赖 ----------
install_system_deps() {
    $PKG_UPDATE
    $PKG_INSTALL git curl
    # 编译工具链
    case "$OS" in
        ubuntu|debian)
            $PKG_INSTALL build-essential libssl-dev libffi-dev python3-dev
            ;;
        centos|rhel|fedora)
            $PKG_INSTALL gcc gcc-c++ make openssl-devel libffi-devel python3-devel
            ;;
        arch)
            $PKG_INSTALL base-devel openssl libffi python
            ;;
    esac
    # Python & pip & venv
    $PKG_INSTALL python3 python3-pip python3-venv
}
install_system_deps

# ---------- 5. 安装 Node.js 20 LTS ----------
install_nodejs() {
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    $PKG_INSTALL nodejs
}
install_nodejs

# ---------- 6. 可选安装 Nginx & Certbot ----------
if $USE_HTTPS; then
    echo "安装 Nginx 与 Certbot…"
    case "$OS" in
        ubuntu|debian)
            $PKG_INSTALL nginx certbot python3-certbot-nginx
            ;;
        centos|rhel)
            $PKG_INSTALL epel-release
            $PKG_INSTALL nginx certbot python3-certbot-nginx
            ;;
        fedora)
            $PKG_INSTALL nginx certbot python3-certbot-nginx
            ;;
        arch)
            $PKG_INSTALL nginx certbot python-certbot-nginx
            ;;
    esac
fi

# ---------- 7. 创建运行用户 ----------
if ! id -u "$RUN_USER" >/dev/null 2>&1; then
    useradd -m -s /bin/bash "$RUN_USER"
fi
mkdir -p "$PROJECT_DIR"
chown -R "$RUN_USER:$RUN_USER" "$PROJECT_DIR"

# ---------- 8. 克隆项目 ----------
if [ ! -d "${PROJECT_DIR}/.git" ]; then
    git clone https://github.com/cljproton/finnav.git "$PROJECT_DIR"
fi

# ---------- 9. 设置 Python virtualenv ----------
cd "${PROJECT_DIR}/backend"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

deactivate

# ---------- 10. Django 迁移 & 静态文件 ----------
source "${PROJECT_DIR}/backend/.venv/bin/activate"
python manage.py migrate --noinput
python manage.py collectstatic --noinput

# ---------- 11. Demo 数据导入 ----------
if $IMPORT_DEMO; then
    echo "导入演示数据…"
    python manage.py seed_demo
fi

deactivate

# ---------- 12. 创建 systemd 服务 ----------
cat > /etc/systemd/system/finnav-gunicorn.service <<EOF
[Unit]
Description=FinNav Gunicorn Service
After=network.target

[Service]
User=${RUN_USER}
Group=${RUN_USER}
WorkingDirectory=${PROJECT_DIR}/backend
Environment="PATH=${PROJECT_DIR}/backend/.venv/bin"
ExecStart=${PROJECT_DIR}/backend/.venv/bin/gunicorn finnav.wsgi:application \
          --bind 0.0.0.0:${HTTP_PORT:-8000} \
          --workers ${GUNICORN_WORKERS} \
          --access-logfile - \
          --error-logfile -
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now finnav-gunicorn

# ---------- 13. Nginx 与 HTTPS ----------
if $USE_HTTPS; then
    # Nginx 反向代理配置
    cat > /etc/nginx/sites-available/finnav <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${HTTP_PORT:-8000};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
    ln -sf /etc/nginx/sites-available/finnav /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
    echo "使用 Certbot 获取证书…"
    certbot --nginx -d "${DOMAIN}" -m "${CERTBOT_EMAIL}" --agree-tos --no-eff-email
fi

# ---------- 14. 防火墙端口放行 ----------
if $OPEN_FIREWALL; then
    if command -v ufw >/dev/null; then
        ufw allow ${HTTP_PORT:-8000}/tcp
        $USE_HTTPS && { ufw allow 80/tcp; ufw allow 443/tcp; }
    elif command -v firewall-cmd >/dev/null; then
        firewall-cmd --add-port=${HTTP_PORT:-8000}/tcp --permanent
        $USE_HTTPS && {
            firewall-cmd --add-service=http --permanent
            firewall-cmd --add-service=https --permanent
        }
        firewall-cmd --reload
    else
        echo "⚠️ 未检测到 ufw 或 firewalld，需手动打开端口。"
    fi
fi

# ---------- 15. 完成提示 ----------
cat <<EOF

✅ 部署完成
• Service      : finnav-gunicorn
• Listening on : ${HTTP_PORT:-8000}
• Run as user  : ${RUN_USER}
• Database    : ${DB_TYPE}
$( $USE_HTTPS && echo "• HTTPS      : https://${DOMAIN}" )
查看日志: journalctl -u finnav-gunicorn -f
管理服务: systemctl {status|restart|stop} finnav-gunicorn
EOF
