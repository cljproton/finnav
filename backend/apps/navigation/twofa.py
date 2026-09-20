"""TOTP 双因素认证（2FA）核心工具函数。

后台管理员登录与自助配置页面依赖以下函数：
- user_has_2fa(user)          判断用户是否启用了 2FA
- verify_user_code(user, code)  校验用户动态码（用于 admin 登录）
- twofa_secret(user)           获取/创建用户 TwoFactor 记录（admin 页面展示二维码用）
- _otpauth_url, _qr_datauri    生成 otpauth URL 与二维码（admin 页面用）
- _verify_secret               底层 TOTP 校验
"""
import base64
import io

import pyotp
import qrcode
from django.utils import timezone
from django.utils.translation import gettext as _

from .models import TOTPChallenge, TwoFactor


def twofa_secret(user):
    """返回用户 TwoFactor 记录（惰性创建，未启用时自动生成密钥并存库）。"""
    row = TwoFactor.objects.filter(user=user).first()
    if row is None:
        row = TwoFactor.objects.create(
            user=user, secret=pyotp.random_base32(), enabled=False
        )
    return row


def user_has_2fa(user):
    row = TwoFactor.objects.filter(user=user, enabled=True).first()
    return bool(row)


def verify_user_code(user, code):
    """校验指定用户当前的 TOTP 动态码（用于后台管理员登录等场景）。

    用户未启用 2FA 时视为通过（返回 True）。
    """
    row = TwoFactor.objects.filter(user=user, enabled=True).first()
    if row is None:
        return True
    return _verify_secret(row.secret, (code or '').strip())


def _totp(row):
    return pyotp.TOTP(row.secret)


def _otpauth_url(user, row):
    return _totp(row).provisioning_uri(name=user.email, issuer_name='FinNav')


def _qr_datauri(url):
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def _verify_code(row, code):
    if not row or not row.enabled:
        return False
    return _verify_secret(row.secret, code)


def _verify_secret(secret, code):
    return pyotp.TOTP(secret).verify(code)