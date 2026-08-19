"""
Django settings for the finnav backend (金融导航).

Loads optional overrides from backend/.env (no external dependency needed).
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file():
    """Parse a simple KEY=VALUE .env file into os.environ (never overrides
    variables already set in the real environment)."""
    env_file = BASE_DIR / '.env'
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


_load_env_file()

# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
# 开发环境默认密钥。生产环境必须通过 .env / 环境变量覆盖为随机长字符串。
SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-dev-only-key-3d81c1f8-9f0a-4a2b-8f4e-5f1a2b3c4d5e',
)

# DEBUG 默认开启（开发用），生产环境务必设为 False。
DEBUG = os.environ.get('DEBUG', 'True').strip().lower() in ('1', 'true', 'yes', 'on')

# 开发环境允许所有 Host；生产环境应改为具体域名。
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

# ---------------------------------------------------------------------------
# Email（注册/找回密码验证码）
# - 设置 RESEND_API_KEY 时通过 Resend 发送；
# - 未设置（本地/测试）时降级为 console backend，验证码明文直接打印到控制台。
# ---------------------------------------------------------------------------
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '').strip()
if RESEND_API_KEY:
    EMAIL_BACKEND = 'anymail.backends.resend.EmailBackend'
    ANYMAIL = {'RESEND_API_KEY': RESEND_API_KEY}
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'onboarding@resend.dev')

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    # SimpleUI 管理后台主题（必须在 django.contrib.admin 之前）
    'simpleui',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # 第三方
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'anymail',
    # 业务应用
    'apps.navigation',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'config.middleware.LanguageNegotiationMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [
            BASE_DIR / 'apps' / 'navigation' / 'templates',
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
# 通过环境变量 / backend/.env 选择数据库引擎，默认 SQLite（本地开发零配置）。
#   DB_ENGINE   = sqlite | mysql | postgres
#   DB_NAME / DB_USER / DB_PASSWORD / DB_HOST / DB_PORT
#   DB_CHARSET            MySQL 字符集（默认 utf8mb4，支持分类名等 emoji）
#   DB_CONN_MAX_AGE       连接复用秒数（mysql/postgres 默认 60）
def _build_database_config():
    engine = os.environ.get('DB_ENGINE', 'sqlite').strip().lower()
    engine = {'sqlite3': 'sqlite', 'postgresql': 'postgres'}.get(engine, engine)

    if engine == 'sqlite':
        return {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.environ.get('DB_NAME', str(BASE_DIR / 'db.sqlite3')),
            'CONN_MAX_AGE': int(os.environ.get('DB_CONN_MAX_AGE', '0')),
        }

    if engine == 'mysql':
        from django.core.exceptions import ImproperlyConfigured

        try:
            import pymysql
            pymysql.install_as_MySQLdb()
        except ImportError:
            raise ImproperlyConfigured(
                '检测到 DB_ENGINE=mysql 但未安装 pymysql，请执行 '
                'pip install -r requirements.txt 安装驱动。'
            )
        config = {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': os.environ.get('DB_NAME', 'finnav'),
            'USER': os.environ.get('DB_USER', 'finnav'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', '127.0.0.1'),
            'PORT': os.environ.get('DB_PORT', ''),
            'OPTIONS': {
                'charset': os.environ.get('DB_CHARSET', 'utf8mb4'),
            },
            'CONN_MAX_AGE': int(os.environ.get('DB_CONN_MAX_AGE', '0')),
            'TEST': {'NAME': os.environ.get('DB_TEST_NAME', 'test_finnav')},
        }
        return config

    if engine == 'postgres':
        config = {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'finnav'),
            'USER': os.environ.get('DB_USER', 'finnav'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', '127.0.0.1'),
            'PORT': os.environ.get('DB_PORT', ''),
            'CONN_MAX_AGE': int(os.environ.get('DB_CONN_MAX_AGE', '0')),
            'TEST': {'NAME': os.environ.get('DB_TEST_NAME', 'test_finnav_db')},
        }
        return config

    from django.core.exceptions import ImproperlyConfigured

    raise ImproperlyConfigured(
        '未知的 DB_ENGINE=%r，仅支持 sqlite / mysql / postgres。' % engine
    )


DATABASES = {'default': _build_database_config()}

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    # 允许不太复杂的密码：仅保留最小长度校验（与注册接口 min_length 一致）
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 6}},
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = 'zh-hans'
TIME_ZONE = 'Asia/Shanghai'
USE_I18N = True
USE_TZ = True

LANGUAGES = [
    ('zh-hans', '简体中文'),
    ('en', 'English'),
]

# 各应用自带 locale 目录（apps/navigation/locale）
LOCALE_PATHS = [
    BASE_DIR / 'apps' / 'navigation' / 'locale',
]

# ---------------------------------------------------------------------------
# Static & media
# ---------------------------------------------------------------------------
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# 生产环境（容器）用 WhiteNoise 提供静态文件
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
# 媒体文件根目录：可用环境变量覆盖（容器部署时指向共享数据目录）
MEDIA_ROOT = Path(os.environ.get('MEDIA_ROOT', str(BASE_DIR / 'media')))

# 安卓 APP 专用缓存目录（每站点/平台分离）
APP_CACHE_ROOT = MEDIA_ROOT / 'app_cache'
APP_CACHE_URL = '/media/app_cache/'
# 下载缓存时单次 APP 包大小上限
APP_CACHE_MAX_BYTES = 500 * 1024 * 1024
# 并行分片下载的并发连接数（源需支持 HTTP Range）
APP_CACHE_PARALLEL = 6
# 动态区块大小：文件按此字节数切块入队，worker 空闲即取块。越小越均衡，越大请求头开销越少。
APP_CACHE_BLOCK_SIZE = 1024 * 1024  # 1MB
# 下载请求头：模拟真实浏览器，缓解 CDN 对非浏览器 UA 的限速/防盗链
APP_CACHE_USER_AGENT = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)
# 是否携带来源站点 Referer（对部分防盗链源有效）
APP_CACHE_ENABLE_REFERER = True

# 站点图标（logo）第三方公共兜底服务。站点自身 favicon 获取失败时，
# 依次尝试这些 {domain} 占位符 URL；置空列表则完全禁用第三方兜底。
SITE_LOGO_PROVIDERS = [
    'https://www.google.com/s2/favicons?domain={domain}&sz=64',
    'https://icons.duckduckgo.com/ip3/{domain}.ico',
]

# ---------------------------------------------------------------------------
# CORS（开发环境放开所有来源）
# ---------------------------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = True

# ---------------------------------------------------------------------------
# DRF
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'DEFAULT_THROTTLE_RATES': {
        # 注册/找回密码验证码邮件接口：按 IP 每 10 分钟 10 次
        'email_code': '10/min',
    },
}

# simplejwt 访问令牌有效期（开发用，可按需缩短/加长）
from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=7),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
}

# ---------------------------------------------------------------------------
# SimpleUI 管理后台主题
# ---------------------------------------------------------------------------
# 首页：独立看板页（iframe 方式承载），避免与 SimpleUI 的 Vue 单页外壳冲突
SIMPLEUI_HOME_PAGE = '/admin/overview/'
SIMPLEUI_HOME_TITLE = '数据看板'
SIMPLEUI_HOME_ICON = 'fas fa-chart-line'
# 隐藏 SimpleUI 官方信息卡片与快捷导航卡片
SIMPLEUI_HOME_INFO = False
SIMPLEUI_HOME_QUICK = False
# 默认深色科技风主题（后台设置里仍可随时换肤）
SIMPLEUI_DEFAULT_THEME = 'e-black-pro.css'
# 侧边菜单模型图标（按 模型名 或 app_label 映射）
SIMPLEUI_ICON = {
    'Category': 'fas fa-layer-group',
    'Site': 'fas fa-globe',
    'SiteVisit': 'fas fa-eye',
    'Tag': 'fas fa-tags',
    'SiteTutorial': 'fas fa-book-open',
    'AppLinkSubmission': 'fas fa-link',
}

# 侧边菜单：完整自定义（含系统模型 + 备份恢复，避免 auto 生成的重复模块）
SIMPLEUI_CONFIG = {
    'system_keep': False,
    'menus': [
        {
            'name': '认证和授权',
            'icon': 'fas fa-shield-alt',
            'models': [
                {'name': '用户', 'icon': 'far fa-user', 'url': '/admin/auth/user/'},
                {'name': '组', 'icon': 'fas fa-users-cog', 'url': '/admin/auth/group/'},
            ],
        },
        {
            'name': '金融导航',
            'icon': 'fas fa-compass',
            'models': [
                {'name': '全局设置', 'icon': 'fas fa-cog', 'url': '/admin/navigation/appsetting/'},
                {'name': '分类', 'icon': 'fas fa-layer-group', 'url': '/admin/navigation/category/'},
                {'name': '标签', 'icon': 'fas fa-tags', 'url': '/admin/navigation/tag/'},
                {'name': '用户站点邀请', 'icon': 'fas fa-envelope-open-text', 'url': '/admin/navigation/usersiteinvite/'},
                {'name': '站点提交/审核', 'icon': 'fas fa-paper-plane', 'url': '/admin/navigation/sitesubmission/'},
                {'name': '用户教程/审核', 'icon': 'fas fa-book-open', 'url': '/admin/navigation/sitetutorial/'},
                {'name': 'APP 链接提交/审核', 'icon': 'fas fa-link', 'url': '/admin/navigation/applinksubmission/'},
                {'name': 'APP 下载记录', 'icon': 'fas fa-download', 'url': '/admin/navigation/appdownload/'},
                {'name': '站点', 'icon': 'fas fa-globe', 'url': '/admin/navigation/site/'},
                {'name': '站点评分', 'icon': 'fas fa-star', 'url': '/admin/navigation/rating/'},
                {'name': '备份与恢复', 'icon': 'fas fa-database', 'url': '/admin/backup/'},
                {'name': '模板维护说明', 'icon': 'fas fa-code-branch', 'url': '/admin/upgrade-notes/'},
            ],
        },
    ],
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
