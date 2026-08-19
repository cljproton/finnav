"""图形验证码：生成 PNG 图像与答案哈希，供注册 / 登录接口校验。

验证码只存令牌（token）及其答案哈希，图像按需重新渲染，不落盘。
单次有效，5 分钟内有效，最多尝试 5 次，成功后标记已用。
"""
import hashlib
import io
import secrets

from django.utils import timezone

# 排除易混淆字符（0/O、1/I/L）
_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
_CODE_LEN = 4
_TTL_SECONDS = 5 * 60


def _hash(text):
    return hashlib.sha256(text.encode()).hexdigest()


def _load_font(size):
    """加载用于渲染的字体；找不到系统字体时退回 Pillow 内置位图字体。"""
    from PIL import ImageFont

    candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:  # noqa: BLE001
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _render_png(code):
    """把验证码字符串渲染为 PNG 字节（带干扰线与噪点）。"""
    from PIL import Image, ImageDraw

    width, height = 148, 48
    image = Image.new('RGB', (width, height), '#f3f4f6')
    draw = ImageDraw.Draw(image)

    for _ in range(5):
        x0 = secrets.randbelow(width)
        y0 = secrets.randbelow(height)
        x1 = secrets.randbelow(width)
        y1 = secrets.randbelow(height)
        draw.line((x0, y0, x1, y1), fill='#c7ced9', width=1)

    font = _load_font(30)
    total = sum(draw.textlength(ch, font=font) for ch in code)
    gap = (width - total) / (len(code) + 1)
    x = gap
    for ch in code:
        y = secrets.randbelow(max(1, height // 6)) - height // 12
        draw.text((x, y + 8), ch, fill='#374151', font=font)
        x += draw.textlength(ch, font=font) + gap

    for _ in range(120):  # 随机噪点
        px, py = secrets.randbelow(width), secrets.randbelow(height)
        draw.point((px, py), fill='#9ca3af')

    buf = io.BytesIO()
    image.save(buf, format='PNG')
    return buf.getvalue()


def create_captcha(model_cls):
    """创建一条验证码记录，返回 (token, png_bytes)。

    创建时顺手清理 1 天前的过期记录，配合接口限流避免表无限膨胀。
    """
    code = ''.join(secrets.choice(_CHARS) for _ in range(_CODE_LEN))
    token = secrets.token_urlsafe(24)
    model_cls.objects.filter(
        expires_at__lt=timezone.now() - timezone.timedelta(days=1)
    ).delete()
    record = model_cls(
        token=token,
        answer_hash=_hash(code),
        expires_at=timezone.now() + timezone.timedelta(seconds=_TTL_SECONDS),
    )
    record.save()
    return token, _render_png(code)


def verify_captcha(model_cls, token, answer):
    """校验令牌与答案。成功后标记已用并返回 True。"""
    record = model_cls.objects.filter(token=token).first()
    if record is None:
        return False
    if record.used:
        return False
    if timezone.now() >= record.expires_at:
        record.delete()
        return False
    if record.attempts >= model_cls.MAX_ATTEMPTS:
        record.delete()
        return False
    if not secrets.compare_digest(record.answer_hash, _hash(answer or '')):
        record.attempts += 1
        record.save(update_fields=['attempts'])
        return False
    record.used = True
    record.save(update_fields=['used', 'attempts'])
    return True