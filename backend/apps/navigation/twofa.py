"""TOTP 双因素认证（2FA）实现。

流程：
- GET  /api/auth/twofa/status/    当前用户是否已启用（供前端展示开关状态）
- GET  /api/auth/twofa/setup/     生成密钥 + otpauth URL + 二维码(base64 PNG)（未启用前可多次调用）
- POST /api/auth/twofa/confirm/   body{code} 校验动态码后启用
- POST /api/auth/twofa/disable/   body{code} 校验动态码后停用
- POST /api/auth/twofa/challenge/ body{totp_token, code} 登录二次验证，校验后签发 JWT
"""
import base64
import io

import pyotp
import qrcode
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def twofa_status(request):
    """GET /api/auth/twofa/status/ -> {enabled}"""
    row = TwoFactor.objects.filter(user=request.user).first()
    return Response({'enabled': bool(row and row.enabled)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def twofa_setup(request):
    """GET /api/auth/twofa/setup/ -> {secret, otpauth_url, qr}"""
    row = twofa_secret(request.user)
    if row.enabled:
        return Response({'enabled': True}, status=status.HTTP_200_OK)
    url = _otpauth_url(request.user, row)
    return Response(
        {
            'enabled': False,
            'secret': row.secret,
            'otpauth_url': url,
            'qr': _qr_datauri(url),
        }
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def twofa_confirm(request):
    """POST /api/auth/twofa/confirm/ {code} 启用 2FA（校验动态码后落库）。"""
    session_row = twofa_secret(request.user)
    code = (request.data.get('code') or '').strip()
    if not code:
        return Response({'code': _('请输入 6 位动态码。')}, status=status.HTTP_400_BAD_REQUEST)
    totp = _verify_secret(session_row.secret, code)
    if not totp:
        return Response({'code': _('动态码错误，请重试。')}, status=status.HTTP_400_BAD_REQUEST)
    session_row.enabled = True
    if not session_row.confirmed_at:
        session_row.confirmed_at = timezone.now()
    session_row.save(update_fields=['enabled', 'confirmed_at'])
    return Response({'enabled': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def twofa_disable(request):
    """POST /api/auth/twofa/disable/ {code} 校验当前动态码后停用 2FA。"""
    row = TwoFactor.objects.filter(user=request.user).first()
    if row is None:
        return Response({'enabled': False}, status=status.HTTP_200_OK)
    code = (request.data.get('code') or '').strip()
    if not code or not _verify_secret(row.secret, code):
        return Response({'code': _('动态码错误，请重试。')}, status=status.HTTP_400_BAD_REQUEST)
    row.enabled = False
    row.confirmed_at = None
    row.save(update_fields=['enabled', 'confirmed_at'])
    return Response({'enabled': False})


@api_view(['POST'])
@permission_classes([AllowAny])
def twofa_challenge(request):
    """POST /api/auth/twofa/challenge/ {totp_token, code} 登录二次校验。

    密码第一步已签发 totp_token；这里校验 2FA 动态码后返回正式 JWT。
    """
    from .auth import EmailTokenObtainPairSerializer

    token = (request.data.get('totp_token') or '').strip()
    code = (request.data.get('code') or '').strip()
    if not token or not code:
        return Response(
            {'detail': _('缺少挑战令牌或验证码。')}, status=status.HTTP_400_BAD_REQUEST
        )
    challenge = TOTPChallenge.objects.filter(token=token, used=False).first()
    if challenge is None or timezone.now() >= challenge.expires_at:
        return Response(
            {'detail': _('登录凭据已过期，请重新登录。')}, status=status.HTTP_401_UNAUTHORIZED
        )
    row = TwoFactor.objects.filter(user=challenge.user, enabled=True).first()
    if row is None or not _verify_code(row, code):
        return Response(
            {'code': _('动态码错误，请重试。')}, status=status.HTTP_400_BAD_REQUEST
        )
    challenge.used = True
    challenge.save(update_fields=['used'])
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(challenge.user)
    return Response(
        {'access': str(refresh.access_token), 'refresh': str(refresh)}
    )