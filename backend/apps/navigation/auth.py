"""邮箱注册 + JWT 认证（simplejwt）+ 邮箱验证码（注册/找回密码）。

- POST /api/auth/register/            ->  {detail: "验证码已发送"}
- POST /api/auth/verify/              ->  {access, refresh}（验证码通过后创建用户）
- POST /api/auth/password-reset/request/ -> {detail: "验证码已发送"}
- POST /api/auth/password-reset/confirm/ -> {detail: "密码已重置"}
- POST /api/auth/token/               ->  {access, refresh}（登录，用 email + password）
- POST /api/auth/token/refresh/       ->  {access}
"""
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_str
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import EmailCooldownError, EmailVerification


class EmailCodeRateThrottle(SimpleRateThrottle):
    """验证码邮件接口的按 IP 限流（scope='email_code'）。

    防注册/找回密码接口被刷爆邮件发送量。注意：限流基于 Django cache，
    默认 LocMemCache 仅进程内生效；多进程部署时应配置共享 CACHES（如 Redis）。
    """

    scope = 'email_code'

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}

    def throttled(self, request, wait):
        from rest_framework.exceptions import Throttled

        raise Throttled(detail=_('操作过于频繁，请稍后再试'), wait=wait)


class CaptchaImageRateThrottle(SimpleRateThrottle):
    """图形验证码接口按 IP 限流（scope='captcha_image'），防止刷库。"""

    scope = 'captcha_image'
    rate = '30/min'

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class EmailVerifyRateThrottle(SimpleRateThrottle):
    """邮箱验证码校验接口（注册验证 / 找回密码确认）按 IP 限流。"""

    scope = 'email_verify'
    rate = '20/min'

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


def _send_code_email(email, purpose, code):
    """发送验证码邮件。本地（无 RESEND_API_KEY）走 console backend 打印明文。"""
    subject_map = {
        EmailVerification.PURPOSE_REGISTER: '注册验证码',
        EmailVerification.PURPOSE_RESET: '找回密码验证码',
    }
    body_map = {
        EmailVerification.PURPOSE_REGISTER: (
            f'您的注册验证码是：{code}\n'
            f'10 分钟内有效，请勿泄露给他人。'
        ),
        EmailVerification.PURPOSE_RESET: (
            f'您正在重置密码，验证码是：{code}\n'
            f'10 分钟内有效，请勿泄露给他人。'
        ),
    }
    send_mail(
        subject=subject_map[purpose],
        message=body_map[purpose],
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'onboarding@resend.dev'),
        recipient_list=[email],
    )


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """以 email 作为登录账号（Django User.username 存的就是 email）。"""

    username_field = 'email'

    def validate(self, attrs):
        # 用 email 查询，但以 username 传给 Django ModelBackend 认证
        authenticate_kwargs = {
            'username': attrs['email'],
            'password': attrs['password'],
        }
        try:
            authenticate_kwargs['request'] = self.context['request']
        except KeyError:
            pass
        self.user = authenticate(**authenticate_kwargs)
        if self.user is None or not self.user.is_active:
            raise AuthenticationFailed(
                self.error_messages['no_active_account'], 'no_active_account'
            )
        refresh = self.get_token(self.user)
        return {'refresh': str(refresh), 'access': str(refresh.access_token)}


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """POST /api/auth/token/ 登录（含图形验证码；启用 2FA 的用户追加二次验证）。

    请求体：{email, password, captcha_token, captcha_answer}
    若密码正确但用户已开启 2FA：返回 401 {code:'TOTP_REQUIRED', totp_token}，
    前端用 totp_token + 动态码调 /api/auth/twofa/challenge/ 换取正式 JWT。
    """
    from .models import AppSetting
    from .twofa import user_has_2fa, TOTPChallenge

    _validate_captcha(
        request.data.get('captcha_token'), request.data.get('captcha_answer')
    )
    serializer = EmailTokenObtainPairSerializer(
        data=request.data, context={'request': request}
    )
    serializer.is_valid(raise_exception=True)
    user = serializer.user
    if AppSetting.get().twofa_enabled and user_has_2fa(user):
        challenge = TOTPChallenge.create(user)
        return Response(
            {'detail': _('需要二次验证。'), 'code': 'TOTP_REQUIRED', 'totp_token': challenge.token},
            status=status.HTTP_200_OK,
        )
    return Response(serializer.validated_data, status=status.HTTP_200_OK)


def _validate_captcha(token, answer):
    """校验图形验证码，失败抛出 DRF ValidationError。"""
    from .captcha import verify_captcha
    from .models import Captcha

    if not token or not answer:
        raise serializers.ValidationError({'captcha': _('请完成图形验证码。')})
    if not verify_captcha(Captcha, token, answer):
        raise serializers.ValidationError({'captcha': _('验证码错误或已失效，请刷新后重试。')})


class EmailRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=6, max_length=128, write_only=True)
    captcha_token = serializers.CharField(required=False, allow_blank=True)
    captcha_answer = serializers.CharField(required=False, allow_blank=True)
    referral_code = serializers.CharField(required=False, allow_blank=True, max_length=12)

    def validate_email(self, value):
        value = force_str(value).strip().lower()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(_('该邮箱已被注册。'))
        return value

    def validate(self, attrs):
        _validate_captcha(attrs.get('captcha_token'), attrs.get('captcha_answer'))
        return attrs

    def save(self):
        email = self.validated_data['email']
        referral_code = self.validated_data.get('referral_code') or ''
        # 后台可关闭邮箱验证：关闭时直接创建用户（无需邮件验证码）
        from .models import AppSetting
        from .points import process_registration

        if not AppSetting.get().require_email_verification:
            user = User.objects.create_user(
                username=email,
                email=email,
                password=self.validated_data['password'],
            )
            process_registration(user, referral_code)
            refresh = RefreshToken.for_user(user)
            return {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }
        try:
            code, _cooldown = EmailVerification.generate(
                email, EmailVerification.PURPOSE_REGISTER, referral_code
            )
        except EmailCooldownError as exc:
            raise serializers.ValidationError({'email': str(exc)})
        _send_code_email(email, EmailVerification.PURPOSE_REGISTER, code)
        return {'needs_verification': True}


class EmailVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)
    password = serializers.CharField(min_length=6, max_length=128, write_only=True)
    referral_code = serializers.CharField(required=False, allow_blank=True, max_length=12)

    def validate(self, attrs):
        email = force_str(attrs['email']).strip().lower()
        attrs['email'] = email
        if User.objects.filter(username__iexact=email).exists():
            raise serializers.ValidationError({'email': _('该邮箱已注册，请直接登录。')})
        record = EmailVerification.objects.filter(
            email=email, purpose=EmailVerification.PURPOSE_REGISTER
        ).first()
        if record is None:
            raise serializers.ValidationError({'code': _('验证码不存在或已失效，请重新获取。')})
        # verify() 成功后即删除记录，需先取出暂存的推广码
        referral_code = (record.referral_code or attrs.get('referral_code') or '').strip()
        if not record.verify(attrs['code']):
            raise serializers.ValidationError({'code': _('验证码错误或已过期，请重新获取。')})
        attrs['referral_code'] = referral_code
        return attrs

    @transaction.atomic
    def save(self):
        from .points import process_registration

        email = self.validated_data['email']
        user = User.objects.create_user(
            username=email,
            email=email,
            password=self.validated_data['password'],
        )
        process_registration(user, self.validated_data.get('referral_code'))
        refresh = RefreshToken.for_user(user)
        return {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def save(self):
        email = force_str(self.validated_data['email']).strip().lower()
        user = User.objects.filter(username__iexact=email).first()
        # 不存在的邮箱也返回成功，避免暴露邮箱是否已注册（用户枚举防护）
        if user is None:
            return None
        try:
            code, _cooldown = EmailVerification.generate(
                email, EmailVerification.PURPOSE_RESET
            )
        except EmailCooldownError as exc:
            raise serializers.ValidationError({'email': str(exc)})
        _send_code_email(email, EmailVerification.PURPOSE_RESET, code)
        return None


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)
    password = serializers.CharField(min_length=6, max_length=128, write_only=True)

    def validate(self, attrs):
        email = force_str(attrs['email']).strip().lower()
        attrs['email'] = email
        user = User.objects.filter(username__iexact=email).first()
        if user is None:
            raise serializers.ValidationError({'email': _('该邮箱未注册。')})
        record = EmailVerification.objects.filter(
            email=email, purpose=EmailVerification.PURPOSE_RESET
        ).first()
        if record is None:
            raise serializers.ValidationError({'code': _('验证码不存在或已失效，请重新获取。')})
        if not record.verify(attrs['code']):
            raise serializers.ValidationError({'code': _('验证码错误或已过期，请重新获取。')})
        attrs['user'] = user
        return attrs

    def save(self):
        user = self.validated_data['user']
        user.set_password(self.validated_data['password'])
        user.save(update_fields=['password'])


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([CaptchaImageRateThrottle])
def captcha_image(request):
    """GET /api/auth/captcha/ -> {token, image: "data:image/png;base64,..."}"""
    from base64 import b64encode

    from .captcha import create_captcha
    from .models import Captcha

    token, png = create_captcha(Captcha)
    return Response(
        {
            'token': token,
            'image': 'data:image/png;base64,' + b64encode(png).decode('ascii'),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([EmailCodeRateThrottle])
def register(request):
    serializer = EmailRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    result = serializer.save()
    if result.get('access'):
        return Response(result, status=status.HTTP_201_CREATED)
    return Response(
        {'detail': _('验证码已发送到邮箱，请查收。')},
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([EmailVerifyRateThrottle])
def verify(request):
    serializer = EmailVerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(serializer.save(), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([EmailCodeRateThrottle])
def password_reset_request(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(
        {'detail': _('验证码已发送，请查收邮件。')},
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([EmailVerifyRateThrottle])
def password_reset_confirm(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(
        {'detail': _('密码已重置，请使用新密码登录。')},
        status=status.HTTP_200_OK,
    )