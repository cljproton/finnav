from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext as _

import hashlib
import secrets
import uuid


class EmailCooldownError(Exception):
    """验证码重发间隔未过（防刷邮件）。

    :param wait_seconds: 还需等待的秒数。
    """

    def __init__(self, wait_seconds=0):
        self.wait_seconds = max(wait_seconds, 0)
        super().__init__(_('发送太频繁，请 %s 秒后再试') % self.wait_seconds)


class Category(models.Model):
    """站点分类，如 DeFi / 交易所 / 钱包 / 行情资讯。"""

    name = models.CharField(max_length=50, verbose_name='分类名称')
    slug = models.SlugField(max_length=50, unique=True, verbose_name='Slug')
    icon = models.CharField(max_length=16, blank=True, null=True, verbose_name='图标(emoji)')
    sort_order = models.PositiveIntegerField(default=0, verbose_name='排序')
    is_active = models.BooleanField(default=True, verbose_name='是否启用')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        ordering = ['sort_order']
        verbose_name = '分类'
        verbose_name_plural = '分类'

    def __str__(self):
        return self.name


class Tag(models.Model):
    """站点标签（可复用）。"""

    name = models.CharField(max_length=50, unique=True, verbose_name='标签名')
    sort_order = models.PositiveIntegerField(default=0, verbose_name='排序')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = '标签'
        verbose_name_plural = '标签'

    def __str__(self):
        return self.name


class Site(models.Model):
    """导航站点。"""

    name = models.CharField(max_length=100, verbose_name='站点名称')
    description = models.TextField(verbose_name='站点描述')
    url = models.URLField(verbose_name='网址')
    logo = models.ImageField(upload_to='logos/', blank=True, null=True, verbose_name='Logo')
    logo_fetched_at = models.DateTimeField(
        blank=True, null=True, verbose_name='Logo 自动获取时间'
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='sites',
        verbose_name='分类',
    )
    tags = models.ManyToManyField(
        'Tag',
        related_name='sites',
        blank=True,
        verbose_name='标签',
    )
    app_android_url = models.URLField(
        blank=True, default='', verbose_name='安卓 APP 下载链接(原始)'
    )
    app_ios_url = models.URLField(
        blank=True, default='', verbose_name='iOS App Store 链接'
    )
    app_google_play_url = models.URLField(
        blank=True, default='', verbose_name='Google Play 链接'
    )
    app_android_file = models.FileField(
        upload_to='app_cache/', blank=True, null=True, verbose_name='安卓 APP 本地缓存'
    )
    app_android_size = models.PositiveBigIntegerField(
        blank=True, null=True, verbose_name='安卓 APP 缓存大小(字节)'
    )
    app_android_cached_at = models.DateTimeField(
        blank=True, null=True, verbose_name='安卓 APP 缓存时间'
    )
    app_android_sha256 = models.CharField(
        max_length=64, blank=True, default='', verbose_name='安卓 APP 缓存 SHA-256'
    )
    app_android_verified_at = models.DateTimeField(
        blank=True, null=True, verbose_name='安卓 APP 完整性最后校验时间'
    )
    app_android_integrity_ok = models.BooleanField(
        blank=True, null=True, verbose_name='安卓 APP 完整性校验结果'
    )
    invite_code = models.CharField(
        max_length=64, blank=True, default='', verbose_name='邀请码(可填)'
    )
    invite_link = models.URLField(
        max_length=500, blank=True, default='', verbose_name='邀请链接(可填)'
    )
    sort_order = models.PositiveIntegerField(default=0, verbose_name='排序')
    is_active = models.BooleanField(default=True, verbose_name='是否启用')
    visit_count = models.PositiveIntegerField(default=0, verbose_name='访问次数')
    download_count = models.PositiveIntegerField(
        default=0, verbose_name='下载次数(本站分发)'
    )
    rating_count = models.PositiveIntegerField(default=0, verbose_name='评分人数')
    rating_avg = models.FloatField(default=0.0, verbose_name='平均评分(0-5)')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        ordering = ['sort_order']
        verbose_name = '站点'
        verbose_name_plural = '站点'

    def __str__(self):
        return self.name

    def download_android(self):
        """从 app_android_url 流式下载并缓存到专用目录，记录大小与时间。

        重复调用即为刷新（覆盖本地缓存）。iOS 仅外链到应用商店，不缓存。
        """
        from django.core.exceptions import ValidationError

        from .services import AppPullError, stream_app_to_site

        try:
            return stream_app_to_site(self)
        except AppPullError as exc:
            raise ValidationError(str(exc)) from exc

    def _refresh_rating_aggregates(self):
        """基于该站点全部评分重新计算 rating_count / rating_avg。"""
        stats = self.ratings.aggregate(
            count=models.Count('id'),
            avg=models.Avg('score'),
        )
        self.rating_count = stats['count'] or 0
        self.rating_avg = round(stats['avg'] or 0.0, 1)
        self.save(update_fields=['rating_count', 'rating_avg', 'updated_at'])


class EmailVerification(models.Model):
    """邮箱验证码（注册 / 找回密码）。验证码只存哈希，邮件中才发明文。

    - purpose='register'：注册时给待验证邮箱发码，验证通过后创建用户
    - purpose='reset'：找回密码，验证通过后重置密码
    - TTL 10 分钟；最多尝试 5 次；成功后删除记录
    """

    PURPOSE_REGISTER = 'register'
    PURPOSE_RESET = 'reset'
    PURPOSE_CHOICES = ((PURPOSE_REGISTER, '注册'), (PURPOSE_RESET, '找回密码'))

    email = models.EmailField(verbose_name='邮箱')
    purpose = models.CharField(max_length=16, choices=PURPOSE_CHOICES, verbose_name='用途')
    code_hash = models.CharField(max_length=64, verbose_name='验证码哈希(SHA-256)')
    attempts = models.PositiveIntegerField(default=0, verbose_name='尝试次数')
    expires_at = models.DateTimeField(verbose_name='过期时间')
    referral_code = models.CharField(
        max_length=12, blank=True, default='', verbose_name='推广码(注册时可选)'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='最后发送时间')

    CODE_TTL_SECONDS = 10 * 60
    MAX_ATTEMPTS = 5
    RESEND_COOLDOWN_SECONDS = 60

    class Meta:
        verbose_name = '邮箱验证码'
        verbose_name_plural = '邮箱验证码'
        constraints = [
            models.UniqueConstraint(
                fields=['email', 'purpose'],
                name='unique_email_purpose',
            ),
        ]

    def __str__(self):
        return f'{self.email} ({self.purpose})'

    @staticmethod
    def _hash(code):
        return hashlib.sha256(code.encode()).hexdigest()

    @classmethod
    def generate(cls, email, purpose, referral_code=''):
        """生成 6 位随机码并保存（覆盖同 email+purpose 旧码）。返回明文码。

        若同一邮箱在 RESEND_COOLDOWN_SECONDS 内重复索取，抛出 EmailCooldownError
        （不发送新码），用于防止恶意刷爆邮件发送量。
        referral_code 为注册时可选填的推广码，随记录暂存，验证通过创建用户时再处理。
        """
        from django.utils import timezone

        now = timezone.now()
        # 顺手清理 1 天前的过期记录，防止表无限膨胀
        cls.objects.filter(
            expires_at__lt=now - timezone.timedelta(days=1)
        ).delete()

        existing = cls.objects.filter(email=email, purpose=purpose).first()
        if existing is not None:
            elapsed = (timezone.now() - existing.updated_at).total_seconds()
            if elapsed < cls.RESEND_COOLDOWN_SECONDS:
                raise EmailCooldownError(
                    cls.RESEND_COOLDOWN_SECONDS - int(elapsed)
                )

        code = f'{secrets.randbelow(1000000):06d}'
        expires = timezone.now() + timezone.timedelta(seconds=cls.CODE_TTL_SECONDS)
        obj, _ = cls.objects.update_or_create(
            email=email,
            purpose=purpose,
            defaults={
                'code_hash': cls._hash(code),
                'attempts': 0,
                'expires_at': expires,
                'referral_code': (referral_code or '').strip(),
            },
        )
        return code, obj

    def verify(self, code):
        """校验明文码。成功返回 True 并删除记录，失败则计数并返回 False。"""
        from django.utils import timezone

        if timezone.now() >= self.expires_at:
            self.delete()
            return False
        if self.attempts >= self.MAX_ATTEMPTS:
            self.delete()
            return False
        if not secrets.compare_digest(self.code_hash, self._hash(code)):
            self.attempts += 1
            self.save(update_fields=['attempts'])
            return False
        self.delete()
        return True


class Rating(models.Model):
    """用户对站点的打星评分（0-10，半星递进），评论可选。"""

    site = models.ForeignKey(
        Site,
        on_delete=models.CASCADE,
        related_name='ratings',
        verbose_name='站点',
    )
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='ratings',
        verbose_name='用户',
    )
    score = models.FloatField(verbose_name='评分(0-5)')
    comment = models.TextField(blank=True, default='', verbose_name='评论(可选)')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        ordering = ['-created_at']
        verbose_name = '站点评分'
        verbose_name_plural = '站点评分'
        constraints = [
            models.UniqueConstraint(
                fields=['site', 'user'], name='unique_site_user_rating'
            ),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        score = self.score
        if score < 0 or score > 5:
            raise ValidationError({'score': '评分必须在 0 到 5 之间。'})
        if not self._is_valid_step(score):
            raise ValidationError({'score': '评分必须为 0.5 的倍数。'})

    @staticmethod
    def _is_valid_step(score):
        return abs((score * 2) - round(score * 2)) < 1e-6

    def save(self, *args, **kwargs):
        self.score = round(self.score, 1)
        if not 0 <= self.score <= 5 or not self._is_valid_step(self.score):
            from django.core.exceptions import ValidationError

            raise ValidationError({'score': '评分必须为 0.5 的倍数且在 0-5 之间。'})
        super().save(*args, **kwargs)
        self.site._refresh_rating_aggregates()

    def delete(self, *args, **kwargs):
        site = self.site
        super().delete(*args, **kwargs)
        site._refresh_rating_aggregates()

    def __str__(self):
        return f'{self.user} -> {self.site}: {self.score}'


class SiteVisit(models.Model):
    """站点访问记录（打开详情页一次记一条，带时间戳，用于访问趋势统计）。

    仅记录事件本身；累计计数仍由 Site.visit_count 维护（列表展示用）。
    """

    site = models.ForeignKey(
        Site,
        on_delete=models.CASCADE,
        related_name='visits',
        verbose_name='站点',
    )
    visited_at = models.DateTimeField(
        default=timezone.now, db_index=True, verbose_name='访问时间'
    )

    class Meta:
        ordering = ['-visited_at']
        indexes = [
            models.Index(fields=['visited_at']),
            models.Index(fields=['site', 'visited_at']),
        ]
        verbose_name = '站点访问记录'
        verbose_name_plural = '站点访问记录'

    def __str__(self):
        return f'{self.site_id} @ {self.visited_at.isoformat()}'


class UserFavorite(models.Model):
    """用户收藏站点（个人化同步）。与本地收藏合并去重。"""
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='favorite_sites',
        verbose_name='用户',
    )
    site = models.ForeignKey(
        Site,
        on_delete=models.CASCADE,
        related_name='favorited_by',
        verbose_name='站点',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='收藏时间')

    class Meta:
        verbose_name = '用户收藏'
        verbose_name_plural = '用户收藏'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'site'], name='unique_user_site_favorite'
            ),
        ]

    def __str__(self):
        return f'{self.user} -> {self.site}'


class UserSiteInvite(models.Model):
    """用户在某站点上配置的专属邀请码/邀请链接（个人化，转发时附带）。

    每个 (user, site) 唯一。invite_code 与 invite_link 至少填其一即可。
    """

    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='site_invites',
        verbose_name='用户',
    )
    site = models.ForeignKey(
        Site,
        on_delete=models.CASCADE,
        related_name='user_invites',
        verbose_name='站点',
    )
    invite_code = models.CharField(
        max_length=64, blank=True, default='', verbose_name='邀请码(可选)'
    )
    invite_link = models.URLField(
        blank=True, default='', verbose_name='邀请链接(可选)'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        verbose_name = '用户站点邀请'
        verbose_name_plural = '用户站点邀请'
        ordering = ['-updated_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'site'], name='unique_user_site_invite'
            ),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        if not (self.invite_code or self.invite_link):
            raise ValidationError('邀请码与邀请链接至少填一项。')

    def __str__(self):
        return f'{self.user} -> {self.site}: {self.invite_code or self.invite_link}'


class UserSearchHistory(models.Model):
    """用户搜索历史（个人化同步，去重后保留最近搜索词）。"""

    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='search_history',
        verbose_name='用户',
    )
    term = models.CharField(max_length=100, verbose_name='搜索词')
    searched_at = models.DateTimeField(
        default=timezone.now, verbose_name='搜索时间'
    )

    MAX_ITEMS = 30

    class Meta:
        verbose_name = '搜索历史'
        verbose_name_plural = '搜索历史'
        ordering = ['-searched_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'term'], name='unique_user_term_history'
            ),
        ]

    def __str__(self):
        return f'{self.user}: {self.term}'

    @classmethod
    def set_terms(cls, user, terms):
        """用给定词列表整体替换该用户搜索历史，保留最近 MAX_ITEMS 条。

        传入列表视为“最近在前”，显式写入 searched_at 以保证读取顺序稳定。
        """
        cleaned = [str(t).strip() for t in terms if str(t).strip()]
        cleaned = list(dict.fromkeys(cleaned))[: cls.MAX_ITEMS]
        cls.objects.filter(user=user).delete()
        now = timezone.now()
        cls.objects.bulk_create(
            [
                cls(
                    user=user,
                    term=t,
                    searched_at=now - timezone.timedelta(seconds=idx),
                )
                for idx, t in enumerate(cleaned)
            ]
        )
        return cleaned


class Captcha(models.Model):
    """图形验证码（注册 / 登录）。只存答案哈希，图像动态渲染，单次有效。"""

    token = models.CharField(max_length=64, unique=True, verbose_name='令牌')
    answer_hash = models.CharField(max_length=64, verbose_name='答案哈希(SHA-256)')
    attempts = models.PositiveIntegerField(default=0, verbose_name='尝试次数')
    used = models.BooleanField(default=False, verbose_name='是否已使用')
    expires_at = models.DateTimeField(verbose_name='过期时间')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    MAX_ATTEMPTS = 5

    class Meta:
        verbose_name = '图形验证码'
        verbose_name_plural = '图形验证码'

    def __str__(self):
        return f'{self.token[:8]}… ({self.expires_at:%H:%M})'


class AppSetting(models.Model):
    """站点全局设置（单例）。站点标题/简介/图标/GA/公告/状态等可在管理后台配置。"""

    id = models.PositiveIntegerField(primary_key=True, default=1, verbose_name='ID')

    # 网站品牌
    site_title = models.CharField(
        max_length=100, default='FinNav', verbose_name='网站标题'
    )
    site_subtitle = models.CharField(
        max_length=200, blank=True, default='', verbose_name='网站副标题'
    )
    logo = models.ImageField(
        upload_to='logos/', blank=True, null=True, verbose_name='网站图标/Logo'
    )

    # SEO
    seo_title = models.CharField(
        max_length=120, blank=True, default='FinNav',
        verbose_name='SEO 标题',
        help_text='浏览器标签页与搜索引擎显示的标题；留空则使用网站标题。',
    )
    seo_description = models.CharField(
        max_length=300, blank=True, default='FinNav一个金融导航应用',
        verbose_name='SEO 描述',
        help_text='搜索引擎结果页中的站点摘要，建议 50–150 字。',
    )
    seo_keywords = models.CharField(
        max_length=200, blank=True, default='金融，银行，券商，web3',
        verbose_name='SEO 关键词',
        help_text='用中英文逗号分隔多个关键词。',
    )

    # 公告
    announcement = models.TextField(
        blank=True,
        default='欢迎来到FinNav！请自觉遵守相关法律法规，合法使用。',
        verbose_name='公告内容',
        help_text='展示在站点顶部；可支持换行与常见标点。',
    )
    announcement_enabled = models.BooleanField(
        default=True, verbose_name='显示公告'
    )

    # 页脚
    footer_copyright = models.CharField(
        max_length=200, blank=True, default='Copyright © 2026 FinNav.',
        verbose_name='底部版权信息',
        help_text='显示在页面底部，例如「Copyright © 2026 FinNav.」。',
    )

    # 账号与安全
    require_email_verification = models.BooleanField(
        default=False,
        verbose_name='注册需验证邮箱',
        help_text='开启后注册需邮件验证码确认邮箱真实性；关闭则填写邮箱+密码即可直接注册。',
    )
    twofa_enabled = models.BooleanField(
        default=False, verbose_name='启用双因素认证(2FA)'
    )

    # 自定义头脚本（注入前端 <head>，例如统计脚本 / GA / CNAME 等）
    head_scripts = models.TextField(
        blank=True, default='', verbose_name='前端 <head> 自定义脚本'
    )

    # 站点列表分页：前端首页/搜索每次加载的条数（后台可调）
    sites_per_page = models.PositiveIntegerField(
        default=20, verbose_name='站点每页数量'
    )

    # 转发来源域名/地址：App 分享站点详情时用「该地址/site/站点ID」，
    # 留空则保持 finnav:///site/xx 深链接格式。
    share_base_url = models.CharField(
        max_length=200, blank=True, default='',
        verbose_name='转发来源域名/地址',
        help_text='如 https://finnav.app 或 http://192.168.1.70:8000（须为网页版前端可访问的地址，'
                  '而非后端 API 地址）；填写后 App 分享的站点链接为「该地址/site/站点ID」，留空保持 finnav:///site/xx 格式。',
    )

    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        verbose_name = '全局设置'
        verbose_name_plural = '全局设置'

    def __str__(self):
        return self.site_title or '全局设置'

    @classmethod
    def get(cls):
        """返回单例设置对象，不存在则创建。"""
        obj, _ = cls.objects.get_or_create(id=1)
        return obj

    def clean(self):
        """表单校验：share_base_url 非空时需带 http(s):// 前缀，并去掉结尾斜杠。"""
        import re

        url = (self.share_base_url or '').strip()
        if url:
            if not re.match(r'^https?://', url):
                raise ValidationError('转发来源域名需以 http:// 或 https:// 开头。')
            self.share_base_url = url.rstrip('/')
        else:
            self.share_base_url = ''


class TwoFactor(models.Model):
    """用户 TOTP 双因素认证配置（OneToOne User，惰性创建）。"""

    user = models.OneToOneField(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='two_factor',
        verbose_name='用户',
    )
    secret = models.CharField(
        max_length=64, blank=True, default='', verbose_name='TOTP 密钥(base32)'
    )
    enabled = models.BooleanField(default=False, verbose_name='是否启用')
    confirmed_at = models.DateTimeField(
        blank=True, null=True, verbose_name='启用时间'
    )

    class Meta:
        verbose_name = '双因素认证'
        verbose_name_plural = '双因素认证'

    def __str__(self):
        return f'{self.user} 2FA: {"开" if self.enabled else "关"}'


class TOTPChallenge(models.Model):
    """2FA 登录二次验证的一次性票据：密码通过后签发，校验动态码后换正式 JWT。"""

    token = models.CharField(max_length=64, unique=True, verbose_name='令牌')
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='totp_challenges',
        verbose_name='用户',
    )
    used = models.BooleanField(default=False, verbose_name='是否已使用')
    attempts = models.PositiveIntegerField(default=0, verbose_name='校验失败次数')
    expires_at = models.DateTimeField(verbose_name='过期时间')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    TTL_SECONDS = 5 * 60
    MAX_ATTEMPTS = 5

    class Meta:
        verbose_name = '2FA 挑战'
        verbose_name_plural = '2FA 挑战'

    def __str__(self):
        return f'{self.token[:8]}… -> {self.user}'

    @classmethod
    def create(cls, user):
        from django.utils import timezone

        now = timezone.now()
        # 顺手清理该用户的过期挑战，避免表无限膨胀
        cls.objects.filter(
            user=user, expires_at__lt=now - timezone.timedelta(days=1)
        ).delete()
        return cls.objects.create(
            token=uuid.uuid4().hex,
            user=user,
            expires_at=now + timezone.timedelta(seconds=cls.TTL_SECONDS),
        )


class UserProfile(models.Model):
    """用户积分与推广资料（OneToOne User，惰性创建）。

    points_balance / points_lifetime 为缓存值，以 PointTransaction 台账为准；
    所有积分变动都必须走 points.py 服务，保证原子与一致。
    预留位：未来对接加密货币/真实资金时在此追加钱包地址、结算配置等字段。
    """

    REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

    user = models.OneToOneField(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name='用户',
    )
    referral_code = models.CharField(
        max_length=12, unique=True, blank=True, default='', verbose_name='推广码'
    )
    points_balance = models.PositiveIntegerField(default=0, verbose_name='积分余额')
    points_lifetime = models.PositiveIntegerField(default=0, verbose_name='累计获得积分')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        verbose_name = '用户资料'
        verbose_name_plural = '用户资料'

    def __str__(self):
        return f'{self.user} ({self.referral_code or "-"})'

    def ensure_referral_code(self):
        """惰性生成唯一推广码（8 位，去歧义字符）。"""
        if self.referral_code:
            return self.referral_code
        for _ in range(50):
            code = ''.join(
                secrets.choice(self.REFERRAL_ALPHABET) for _ in range(8)
            )
            if not UserProfile.objects.filter(referral_code=code).exists():
                self.referral_code = code
                self.save(update_fields=['referral_code', 'updated_at'])
                return code
        raise RuntimeError('无法生成唯一推广码')


class PointRule(models.Model):
    """积分规则（后台可配置）。code 为程序内部唯一键，points 可为负。"""

    code = models.CharField(max_length=40, unique=True, verbose_name='规则代码')
    name = models.CharField(max_length=50, verbose_name='规则名称')
    points = models.IntegerField(default=0, verbose_name='积分值(可为负)')
    enabled = models.BooleanField(default=True, verbose_name='是否启用')
    daily_limit = models.PositiveIntegerField(
        default=0, verbose_name='每日发放次数上限(0=不限)'
    )
    total_limit = models.PositiveIntegerField(
        default=0, verbose_name='累计发放次数上限(0=不限)'
    )
    description = models.TextField(blank=True, default='', verbose_name='说明')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        ordering = ['id']
        verbose_name = '积分规则'
        verbose_name_plural = '积分规则'

    def __str__(self):
        return f'{self.name} ({self.code})'


class PointTransaction(models.Model):
    """积分台账（只追加不可修改）。

    每次积分变动记录一条，balance_after 为变动后余额快照，用于审计与对账。
    ref_type + ref_id 关联触发对象；唯一约束 (user, rule, ref_type, ref_id)
    保证同一事件重复处理（如重复点审核通过）不重复发放。
    """

    REF_TYPE_CHOICES = (
        ('site_submission', '站点提交'),
        ('site_tutorial', '教程分享'),
        ('app_link_submission', 'APP 链接提交'),
        ('referral', '邀请推广'),
        ('registration', '注册奖励'),
        ('experience_purchase', '经验购买'),
        ('experience_sale', '经验售卖'),
        ('experience_edit_fee', '编辑经验扣费'),
        ('experience_delete_fee', '删除经验扣费'),
        ('points_gift_out', '积分转赠(转出)'),
        ('points_gift_in', '积分转赠(收到)'),
        ('points_voucher_create', '兑换码生成'),
        ('points_voucher_redeem', '兑换码核销'),
        ('manual', '管理员调整'),
    )

    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='point_transactions',
        verbose_name='用户',
    )
    rule = models.ForeignKey(
        PointRule,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='transactions',
        verbose_name='规则',
    )
    amount = models.IntegerField(verbose_name='积分变动(可为负)')
    balance_after = models.PositiveIntegerField(verbose_name='变动后余额')
    ref_type = models.CharField(
        max_length=32, blank=True, default='', choices=REF_TYPE_CHOICES, verbose_name='来源类型'
    )
    ref_id = models.PositiveIntegerField(blank=True, null=True, verbose_name='来源对象ID')
    description = models.TextField(blank=True, default='', verbose_name='说明')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['ref_type', 'ref_id']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'rule', 'ref_type', 'ref_id'],
                condition=Q(ref_id__isnull=False),
                name='unique_user_rule_ref',
            ),
        ]
        verbose_name = '积分流水'
        verbose_name_plural = '积分流水'

    def __str__(self):
        return f'{self.user} {self.amount:+d} -> {self.balance_after}'


class Referral(models.Model):
    """一级邀请记录：被邀请人注册即达标（qualified），邀请人获得积分。

    一人只能被邀请一次（referee OneToOne）；预留 revoked 状态供未来
    封禁/回收积分时标记。
    """

    STATUS_QUALIFIED = 'qualified'
    STATUS_REVOKED = 'revoked'
    STATUS_CHOICES = (
        (STATUS_QUALIFIED, '已达标'),
        (STATUS_REVOKED, '已作废'),
    )

    inviter = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='referrals_sent',
        verbose_name='邀请人',
    )
    referee = models.OneToOneField(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='referral_invited_by',
        verbose_name='被邀请人',
    )
    code = models.CharField(max_length=12, verbose_name='使用的推广码')
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_QUALIFIED, verbose_name='状态'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        ordering = ['-created_at']
        verbose_name = '邀请记录'
        verbose_name_plural = '邀请记录'

    def __str__(self):
        return f'{self.inviter} -> {self.referee}'


class PointsGift(models.Model):
    """积分转赠记录：按邮箱直接转给指定账号（免手续费，见 points.gift_points）。"""

    sender = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='points_gifts_sent',
        verbose_name='转赠人',
    )
    recipient = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='points_gifts_received',
        verbose_name='接收人',
    )
    amount = models.PositiveIntegerField(verbose_name='转赠积分')
    message = models.CharField(max_length=200, blank=True, default='', verbose_name='留言(可选)')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='转赠时间')

    class Meta:
        ordering = ['-created_at']
        verbose_name = '积分转赠'
        verbose_name_plural = '积分转赠'

    def __str__(self):
        return f'{self.sender} -> {self.recipient} +{self.amount}'


class PointsVoucher(models.Model):
    """积分兑换码：生成时从创建者余额扣除（平台回收，不退还），他人凭码核销到账。

    - active 待核销 / used 已核销 / revoked 已作废（当前仅后台可作废，不退款）
    - 禁止核销自己生成的码；expires_at 过期后不可核销
    """

    STATUS_ACTIVE = 'active'
    STATUS_USED = 'used'
    STATUS_REVOKED = 'revoked'
    STATUS_CHOICES = (
        (STATUS_ACTIVE, '待核销'),
        (STATUS_USED, '已核销'),
        (STATUS_REVOKED, '已作废'),
    )

    code = models.CharField(max_length=24, unique=True, verbose_name='兑换码')
    creator = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='points_vouchers',
        verbose_name='生成人',
    )
    amount = models.PositiveIntegerField(verbose_name='面额(积分)')
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE, verbose_name='状态'
    )
    redeemed_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='points_vouchers_redeemed',
        verbose_name='核销人',
    )
    redeemed_at = models.DateTimeField(blank=True, null=True, verbose_name='核销时间')
    expires_at = models.DateTimeField(blank=True, null=True, verbose_name='过期时间')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='生成时间')

    class Meta:
        ordering = ['-created_at']
        verbose_name = '积分兑换码'
        verbose_name_plural = '积分兑换码'

    def __str__(self):
        return f'{self.code} (+{self.amount}) {self.status}'

    @property
    def is_expired(self):
        from django.utils import timezone

        return bool(self.expires_at and self.expires_at < timezone.now())


class SiteSubmission(models.Model):
    """用户提交的新站点（待管理员审核）。"""

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = (
        (STATUS_PENDING, '待审核'),
        (STATUS_APPROVED, '已通过'),
        (STATUS_REJECTED, '已驳回'),
    )

    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='site_submissions',
        verbose_name='提交人',
    )
    name = models.CharField(max_length=100, verbose_name='站点名称')
    url = models.URLField(verbose_name='网址')
    description = models.TextField(blank=True, default='', verbose_name='站点描述(可选)')
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name='submissions', verbose_name='分类'
    )
    tags = models.ManyToManyField(
        'Tag', blank=True, related_name='submissions', verbose_name='标签(可选)'
    )
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, verbose_name='状态'
    )
    admin_note = models.TextField(blank=True, default='', verbose_name='审核意见')
    approved_site = models.ForeignKey(
        Site,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='source_submission',
        verbose_name='通过后创建的站点',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='提交时间')
    reviewed_at = models.DateTimeField(blank=True, null=True, verbose_name='审核时间')

    class Meta:
        ordering = ['-created_at']
        verbose_name = '站点提交/审核'
        verbose_name_plural = '站点提交/审核'

    def __str__(self):
        return f'{self.name} ({self.get_status_display()})'

    def build_site(self):
        """审核通过：创建 Site 并关联回本提交。"""
        from django.utils import timezone

        max_sort = Site.objects.aggregate(m=models.Max('sort_order'))['m'] or 0
        site = Site.objects.create(
            name=self.name,
            url=self.url,
            description=self.description,
            category=self.category,
            sort_order=max_sort + 1,
            is_active=True,
        )
        site.tags.set(self.tags.all())
        self.status = self.STATUS_APPROVED
        self.approved_site = site
        self.reviewed_at = timezone.now()
        self.save(update_fields=['status', 'approved_site', 'reviewed_at'])
        from .points import award_points

        award_points(
            self.user,
            'site_approved',
            'site_submission',
            self.pk,
            description=f'站点提交审核通过：{site.name}',
        )
        return site


class SiteTutorial(models.Model):
    """用户分享的站点教程（文字教程 / 视频教程 / 辅助代办）。

    分享时只需提供链接，标题由后端自动抓取（fetch_page_title）。
    status：新分享默认 pending，需管理员审核通过（approved）后才公开；
            驳回（rejected）不公开，作者可看到并申请删除。
    delete_pending：作者申请删除后置位，教程保持公开，由管理员审核
            （通过=删除，驳回=清位）。
    view_count 用于详情页展示「访问量前 10」。
    """

    TYPE_TEXT = 'text'
    TYPE_VIDEO = 'video'
    TYPE_AGENT = 'agent'
    TYPE_CHOICES = (
        (TYPE_TEXT, '文字教程'),
        (TYPE_VIDEO, '视频教程'),
        (TYPE_AGENT, '辅助/代办'),
    )

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = (
        (STATUS_PENDING, '待审核'),
        (STATUS_APPROVED, '已通过'),
        (STATUS_REJECTED, '已驳回'),
    )

    site = models.ForeignKey(
        Site,
        on_delete=models.CASCADE,
        related_name='tutorials',
        verbose_name='站点',
    )
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='site_tutorials',
        verbose_name='分享者',
    )
    type = models.CharField(max_length=16, choices=TYPE_CHOICES, verbose_name='类型')
    url = models.URLField(max_length=500, verbose_name='链接')
    title = models.CharField(max_length=200, verbose_name='标题(自动获取)')
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, verbose_name='发布状态'
    )
    view_count = models.PositiveIntegerField(default=0, verbose_name='访问量')
    delete_pending = models.BooleanField(default=False, verbose_name='待管理员删除审核')
    delete_requested_at = models.DateTimeField(
        blank=True, null=True, verbose_name='删除申请时间'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        ordering = ['-view_count', '-created_at']
        indexes = [
            models.Index(fields=['site', 'type', 'view_count']),
            models.Index(fields=['site', 'type', 'delete_pending']),
            models.Index(fields=['site', 'status', 'view_count']),
        ]
        verbose_name = '用户教程'
        verbose_name_plural = '用户教程'

    def __str__(self):
        return f'{self.title} ({self.get_type_display()})'


class AppLinkSubmission(models.Model):
    """用户提交的 APP 下载链接（安卓 / Google Play / iOS），需管理员审核。

    审核通过（approve()）：
      - android:     写入 Site.app_android_url 并后台自动拉取 APK 缓存到本站
      - google_play: 写入 Site.app_google_play_url
      - ios:         写入 Site.app_ios_url
    """

    PLATFORM_ANDROID = 'android'
    PLATFORM_GOOGLE_PLAY = 'google_play'
    PLATFORM_IOS = 'ios'
    PLATFORM_CHOICES = (
        (PLATFORM_ANDROID, '安卓 APP'),
        (PLATFORM_GOOGLE_PLAY, 'Google Play'),
        (PLATFORM_IOS, 'iOS App Store'),
    )

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = (
        (STATUS_PENDING, '待审核'),
        (STATUS_APPROVED, '已通过'),
        (STATUS_REJECTED, '已驳回'),
    )

    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='app_link_submissions',
        verbose_name='提交人',
    )
    site = models.ForeignKey(
        Site,
        on_delete=models.CASCADE,
        related_name='app_link_submissions',
        verbose_name='站点',
    )
    platform = models.CharField(max_length=16, choices=PLATFORM_CHOICES, verbose_name='平台')
    url = models.URLField(max_length=500, verbose_name='链接')
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, verbose_name='状态'
    )
    admin_note = models.TextField(blank=True, default='', verbose_name='审核意见')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='提交时间')
    reviewed_at = models.DateTimeField(blank=True, null=True, verbose_name='审核时间')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'APP 链接提交/审核'
        verbose_name_plural = 'APP 链接提交/审核'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'site', 'platform'],
                condition=models.Q(status='pending'),
                name='unique_pending_app_link_submission',
            ),
        ]

    def __str__(self):
        return f'{self.site} {self.get_platform_display()} ({self.get_status_display()})'

    def approve(self):
        """审核通过：将链接写入站点对应字段，安卓额外触发后台拉取。"""
        from django.utils import timezone

        from .services import start_pull

        site = self.site
        if self.platform == self.PLATFORM_ANDROID:
            site.app_android_url = self.url
            site.save(update_fields=['app_android_url', 'updated_at'])
            start_pull(site.pk)
        elif self.platform == self.PLATFORM_GOOGLE_PLAY:
            site.app_google_play_url = self.url
            site.save(update_fields=['app_google_play_url', 'updated_at'])
        elif self.platform == self.PLATFORM_IOS:
            site.app_ios_url = self.url
            site.save(update_fields=['app_ios_url', 'updated_at'])
        self.status = self.STATUS_APPROVED
        self.reviewed_at = timezone.now()
        self.save(update_fields=['status', 'reviewed_at'])
        from .points import award_points

        award_points(
            self.user,
            'app_link_approved',
            'app_link_submission',
            self.pk,
            description=f'APP 链接审核通过：{site} · {self.get_platform_display()}',
        )
        return site


class Experience(models.Model):
    """用户发布的实战经验（付费内容）。

    发布即公开（无需审核），未购买者看不到正文与图片。
    购买价格为发布者自定（PRICE_MIN ~ PRICE_MAX），购买时从买方扣积分，
    等额积分转入作者（transfer_points，见 points.py）。
    like_count / sales_count 为缓存值，由点赞/购买接口原子更新。
    作者删除走软删（is_active=False），保留购买与点赞记录。
    """

    PRICE_MIN = 5
    PRICE_MAX = 500

    site = models.ForeignKey(
        Site,
        on_delete=models.CASCADE,
        related_name='experiences',
        verbose_name='站点',
    )
    author = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='experiences',
        verbose_name='作者',
    )
    title = models.CharField(max_length=80, verbose_name='标题')
    content = models.TextField(verbose_name='正文(付费可见)')
    price = models.PositiveIntegerField(default=10, verbose_name='价格(积分)')
    like_count = models.PositiveIntegerField(default=0, verbose_name='点赞数')
    sales_count = models.PositiveIntegerField(default=0, verbose_name='销量')
    is_active = models.BooleanField(default=True, verbose_name='是否可见(作者删除后隐藏)')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        ordering = ['-like_count', '-created_at']
        indexes = [
            models.Index(fields=['site', 'is_active', '-like_count']),
            models.Index(fields=['site', 'is_active', '-created_at']),
            models.Index(fields=['site', '-sales_count']),
        ]
        verbose_name = '实战经验'
        verbose_name_plural = '实战经验'

    def __str__(self):
        return f'{self.title} ({self.price}分)'


class ExperienceImage(models.Model):
    """经验的配图（上传后按 id 顺序展示，上限 MAX_IMAGES 张）。

    uploaded_by 记录上传者，供发布时校验归属与清理未关联的孤儿图片。
    """

    MAX_IMAGES = 5

    experience = models.ForeignKey(
        Experience,
        on_delete=models.CASCADE,
        related_name='images',
        blank=True,
        null=True,
        verbose_name='经验',
    )
    uploaded_by = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='experience_images',
        verbose_name='上传者',
    )
    image = models.ImageField(upload_to='experiences/', verbose_name='图片')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        ordering = ['id']
        verbose_name = '经验配图'
        verbose_name_plural = '经验配图'

    def __str__(self):
        return f'{self.experience_id} 图#{self.pk}'


class ExperiencePurchase(models.Model):
    """经验的购买记录（一次购买永久解锁）。

    UniqueConstraint(experience, user) 保证同一用户只能购买一次，
    配合 points.transfer_points 的锁内校验实现并发安全。
    """

    experience = models.ForeignKey(
        Experience,
        on_delete=models.CASCADE,
        related_name='purchases',
        verbose_name='经验',
    )
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='experience_purchases',
        verbose_name='购买者',
    )
    price = models.PositiveIntegerField(verbose_name='购买价格(积分快照)')
    purchased_at = models.DateTimeField(auto_now_add=True, verbose_name='购买时间')

    class Meta:
        ordering = ['-purchased_at']
        constraints = [
            models.UniqueConstraint(
                fields=['experience', 'user'], name='unique_experience_user_purchase'
            ),
        ]
        verbose_name = '经验购买记录'
        verbose_name_plural = '经验购买记录'

    def __str__(self):
        return f'{self.user} -> {self.experience_id} ({self.price}分)'


class ExperienceLike(models.Model):
    """经验点赞（仅已购买者或作者本人可点赞/取消点赞）。

    UniqueConstraint(experience, user) 保证每人最多一条点赞记录。
    """

    experience = models.ForeignKey(
        Experience,
        on_delete=models.CASCADE,
        related_name='likes',
        verbose_name='经验',
    )
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='experience_likes',
        verbose_name='点赞者',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='点赞时间')

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['experience', 'user'], name='unique_experience_user_like'
            ),
        ]
        verbose_name = '经验点赞'
        verbose_name_plural = '经验点赞'

    def __str__(self):
        return f'{self.user} -> {self.experience_id}'


class AppDownload(models.Model):
    """通过本站任一入口触发的下载记录（看板统计用）。

    platform 语义：
      - android_cache:      本站缓存的安卓 APK 直接分发
      - android_original:   跳转安卓原始下载链接
      - google_play:        跳转 Google Play
      - ios:                跳转 iOS App Store
    """

    PLATFORM_ANDROID_CACHE = 'android_cache'
    PLATFORM_ANDROID_ORIGINAL = 'android_original'
    PLATFORM_GOOGLE_PLAY = 'google_play'
    PLATFORM_IOS = 'ios'
    PLATFORM_CHOICES = (
        (PLATFORM_ANDROID_CACHE, '安卓(本站缓存)'),
        (PLATFORM_ANDROID_ORIGINAL, '安卓(原始链接)'),
        (PLATFORM_GOOGLE_PLAY, 'Google Play'),
        (PLATFORM_IOS, 'iOS App Store'),
    )

    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name='downloads', verbose_name='站点')
    platform = models.CharField(max_length=24, choices=PLATFORM_CHOICES, verbose_name='平台/入口')
    user = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, blank=True, null=True, verbose_name='用户(可选)'
    )
    downloaded_at = models.DateTimeField(default=timezone.now, verbose_name='下载时间')

    class Meta:
        ordering = ['-downloaded_at']
        indexes = [
            models.Index(fields=['downloaded_at']),
        ]
        verbose_name = 'APP 下载记录'
        verbose_name_plural = 'APP 下载记录'

    def __str__(self):
        return f'{self.site_id} {self.platform} @ {self.downloaded_at.isoformat()}'
