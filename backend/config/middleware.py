"""自定义国际化中间件：根据 Accept-Language 归一化语言协商。"""


class LanguageNegotiationMiddleware:
    """简化语言协商策略：

    - 客户端语言以 zh 开头 -> 使用 zh-hans（中文）
    - 客户端语言以 en 开头 -> 使用 en（英文）
    - 未提供 Accept-Language -> 保持默认（zh-hans，见 settings.LANGUAGE_CODE）
    - 其它未匹配语言（fr 等）-> 回退为英文 en

    做法：改写 Accept-Language 头，让 Django 的 LocaleMiddleware 按统一规则协商。
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        header = request.META.get("HTTP_ACCEPT_LANGUAGE", "").lower()
        if not header:
            return self.get_response(request)
        primary = header.split(",")[0].strip().split(";")[0].strip()
        if primary.startswith("zh"):
            normalized = "zh-Hans"
        else:
            normalized = "en"
        request.META["HTTP_ACCEPT_LANGUAGE"] = normalized
        return self.get_response(request)