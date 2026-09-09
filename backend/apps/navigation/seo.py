"""SEO 相关视图：robots.txt / sitemap.xml。

站点是纯前端 SPA（Expo Web），搜索引擎抓取的是静态产物，因此这里提供
可在后端动态生成的 robots.txt 与 sitemap.xml，配合前端 nginx 单独反代。
sitemap 的基础域名优先取全局设置 share_base_url（前端可访问的地址），
留空时回退为请求的 Host（用于本地开发/直连后端调试）。
"""
from django.db.models import F
from django.http import HttpResponse

from .models import AppSetting, Site


def _site_base_url(request) -> str:
    """返回 sitemap 使用的基础 URL（不带结尾斜杠）。

    优先取全局设置 share_base_url（前端可访问的官方域名/地址）；
    留空时回退为请求的 Host（本地开发/直连后端调试），并以 X-Forwarded-Proto
    作为协议（部署在 HTTPS 反代后时由 nginx 注入）。
    """
    setting = AppSetting.get()
    if setting.share_base_url:
        return setting.share_base_url
    scheme = request.headers.get('X-Forwarded-Proto') or request.scheme
    host = request.get_host()
    return f'{scheme}://{host}'


def robots_txt(request):
    """GET /seo/robots.txt  搜索引擎抓取指引。

    API 与后台管理不应对搜索引擎开放；同时允许爬虫跟踪内部链接
    （noindex 页面的链接仍会被跟踪，保证整站抓取连通性）。
    """
    base = _site_base_url(request)
    lines = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /admin/',
        f'Sitemap: {base}/sitemap.xml',
    ]
    return HttpResponse('\n'.join(lines) + '\n', content_type='text/plain')


def sitemap_xml(request):
    """GET /seo/sitemap.xml  站点地图。

    首页 + 搜索页 + 全部启用站点详情页与其子页，lastmod 取站点更新时间，
    优先按活跃度排序。
    """
    base = _site_base_url(request)
    setting = AppSetting.get()

    urls = [
        (
            f'{base}/',
            setting.updated_at.strftime('%Y-%m-%d') if setting.updated_at else '',
            '1.0',
        ),
        (
            f'{base}/search',
            setting.updated_at.strftime('%Y-%m-%d') if setting.updated_at else '',
            '0.8',
        ),
    ]
    sites = (
        Site.objects.filter(is_active=True)
        .annotate(score=F('visit_count') + F('download_count') + F('rating_count'))
        .order_by('-score', '-updated_at')
    )
    for site in sites:
        lastmod = site.updated_at.strftime('%Y-%m-%d') if site.updated_at else ''
        urls.append((f'{base}/site/{site.pk}', lastmod, '0.8'))
        urls.append((f'{base}/site/{site.pk}/reviews', lastmod, '0.6'))
        urls.append((f'{base}/site/{site.pk}/tutorials', lastmod, '0.6'))
        urls.append((f'{base}/site/{site.pk}/experiences', lastmod, '0.6'))

    # XML 转义（url/date 本身安全，防御性处理）
    from xml.sax.saxutils import escape

    items = []
    for loc, lastmod, priority in urls:
        item = f'  <url>\n    <loc>{escape(loc)}</loc>\n'
        if lastmod:
            item += f'    <lastmod>{escape(lastmod)}</lastmod>\n'
        item += f'    <changefreq>daily</changefreq>\n    <priority>{priority}</priority>\n  </url>'
        items.append(item)

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(items)
        + '\n</urlset>\n'
    )
    return HttpResponse(xml, content_type='application/xml')