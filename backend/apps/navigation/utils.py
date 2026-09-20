"""通用工具函数。"""

from typing import Optional


def get_public_base_url(request) -> str:
    """返回公开可访问的基础 URL（不带结尾斜杠）。

    优先使用 AppSetting.share_base_url（全局设置的前端官方域名）；
    留空时回退为请求的 Host + X-Forwarded-Proto（用于本地开发/直连后端调试）。
    """
    from .models import AppSetting

    setting = AppSetting.get()
    if setting.share_base_url:
        return setting.share_base_url
    scheme = request.headers.get('X-Forwarded-Proto') or request.scheme
    host = request.get_host()
    return f'{scheme}://{host}'


def build_public_media_url(request, media_field) -> Optional[str]:
    """将媒体字段（FileField/ImageField）转换为公开可访问的绝对 URL。

    Args:
        request: DRF request 对象（来自 serializer context）
        media_field: 模型的 FileField/ImageField 实例（如 obj.logo, obj.image）

    Returns:
        公开 URL 字符串，或 None（当字段为空时）
    """
    if not media_field:
        return None
    base_url = get_public_base_url(request)
    return f'{base_url}{media_field.url}'


def build_public_media_url_or_none(request, media_field) -> Optional[str]:
    """同 build_public_media_url，但兼容 media_field 为 None 的情况。"""
    if media_field is None:
        return None
    if not media_field:
        return None
    base_url = get_public_base_url(request)
    return f'{base_url}{media_field.url}'