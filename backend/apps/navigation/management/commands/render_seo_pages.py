"""渲染整站静态 SEO 页面（首页 / 搜索页 / 每个站点详情页）。

搜索引擎无法执行前端 JS，SPA 的 dist/index.html 只有一行「You need to enable
JavaScript…」，标题/描述/链接都看不到。本命令用 Django 模板渲染出带完整
<title>、<meta description>、<canonical>、<h1> 和真实内链的纯静态 HTML，
输出到可被前端 nginx 直接服务的目录（默认 repo_root/docker/data/web-seo，
docker-compose 中已 bind-mount 到 nginx 的 /seo-generated 只读目录）。

用法：
  python manage.py render_seo_pages
  WEB_SEO_OUTPUT_DIR=/tmp/web-seo python manage.py render_seo_pages

输出结构：
  home.html                 ->  /
  search.html               ->  /search
  site/{site_id}/index.html ->  /site/{site_id}   （及 reviews/tutorials/experiences 内链）
"""
import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Count, F
from django.template.loader import render_to_string

from ...models import AppSetting, Category, Experience, Site, SiteTutorial


class Command(BaseCommand):
    help = '渲染整站静态 SEO 页面到 web-seo 输出目录'

    def add_arguments(self, parser):
        parser.add_argument(
            '--output',
            default=None,
            help='输出目录；默认取 WEB_SEO_OUTPUT_DIR 环境变量或仓库 docker/data/web-seo',
        )

    def handle(self, *args, **options):
        output = options['output'] or os.environ.get('WEB_SEO_OUTPUT_DIR')
        if output:
            out_root = Path(output)
        else:
            # 优先 repo 根目录下的 docker/data/web-seo（docker-compose 命名卷挂载点）
            repo_root = Path(settings.BASE_DIR).resolve().parent
            out_root = repo_root / 'docker' / 'data' / 'web-seo'
        out_root.mkdir(parents=True, exist_ok=True)

        setting = AppSetting.get()
        site_base_url = (setting.share_base_url or 'https://finnav.app').rstrip('/')
        brand = setting.site_title or 'FinNav'

        categories = list(
            Category.objects.filter(is_active=True).order_by('sort_order', 'name')
        )
        active = Site.objects.filter(is_active=True)
        sites_ordered = active.annotate(
            score=F('visit_count') + F('download_count') + F('rating_count')
        ).order_by('-score', '-sort_order', '-updated_at')

        site_count = active.count()
        top_sites = list(sites_ordered[:12])

        # 教程/经验按站点聚合一次，避免逐站回查
        tutorial_counts = dict(
            SiteTutorial.objects.filter(status=SiteTutorial.STATUS_APPROVED)
            .values('site_id')
            .annotate(c=Count('id'))
            .values_list('site_id', 'c')
        )
        experience_counts = dict(
            Experience.objects.filter(is_active=True)
            .values('site_id')
            .annotate(c=Count('id'))
            .values_list('site_id', 'c')
        )

        common = {
            'setting': setting,
            'base_url': site_base_url,
            'brand': brand,
            'site_count': site_count,
            'categories': categories,
            'top_sites': top_sites,
        }

        # home
        home_title = (setting.seo_title or setting.site_title or 'FinNav').strip()
        home_desc = (
            setting.seo_description
            or f'{brand}:一个金融与 Web3 站点导航（{site_count} 个优质网站与 APP）。'
        ).strip()
        home_html = render_to_string(
            'seo/home.html',
            {
                **common,
                'seo_title': home_title,
                'seo_description': home_desc,
            },
        )
        (out_root / 'home.html').write_text(home_html, encoding='utf-8')

        # search
        search_title = f'搜索 - {brand}'
        search_desc = (
            f'在 {brand} 中按名称、描述或标签搜索 {site_count} 个金融与 Web3 '
            f'站点，快速进入官网、APP 下载页与用户评价。'
        )
        search_html = render_to_string(
            'seo/search.html',
            {
                **common,
                'seo_title': search_title,
                'seo_description': search_desc,
            },
        )
        (out_root / 'search.html').write_text(search_html, encoding='utf-8')

        # per-site
        written = 0
        for site in sites_ordered:
            has_android = bool(site.app_android_url or site.app_android_file)
            has_ios = bool(site.app_ios_url or site.app_google_play_url)
            platforms = []
            if has_android:
                platforms.append('安卓')
            if has_ios:
                platforms.append('iOS')

            tags = list(site.tags.all().order_by('name')[:8])
            tutorial_count = tutorial_counts.get(site.pk, 0)
            experience_count = experience_counts.get(site.pk, 0)

            related_sites = list(
                Site.objects.filter(
                    is_active=True, category_id=site.category_id
                )
                .exclude(pk=site.pk)
                .annotate(
                    score=F('visit_count') + F('download_count') + F('rating_count')
                )
                .order_by('-score', '-updated_at')[:6]
            )

            site_title = (
                f'{site.name}官网 - APP下载、新手教程、用户评价 - {brand}'
            )
            site_desc_parts = [
                site.description.strip(),
                f'汇总官网入口与{("、".join(platforms) if platforms else "各平台")}下载渠道',
            ]
            if tutorial_count:
                site_desc_parts.append(f'以及 {tutorial_count} 篇用户教程')
            if experience_count:
                site_desc_parts.append(f'{experience_count} 条实战经验')
            if site.rating_count:
                site_desc_parts.append(f'与 {site.rating_count} 条用户评价')
            site_desc_parts.append(f'信息由 {brand} 整理维护。')
            site_desc = '，'.join(site_desc_parts)

            ctx = {
                **common,
                'seo_title': site_title,
                'seo_description': site_desc,
                'site': site,
                'tags': [tag.name for tag in tags],
                'related_sites': related_sites,
                'has_android': has_android,
                'has_ios': has_ios,
                'platforms': '、'.join(platforms),
                'tutorial_count': tutorial_count,
                'experience_count': experience_count,
            }
            site_html = render_to_string('seo/site.html', ctx)
            site_dir = out_root / 'site' / str(site.pk)
            site_dir.mkdir(parents=True, exist_ok=True)
            (site_dir / 'index.html').write_text(site_html, encoding='utf-8')
            written += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'SEO 页面渲染完成：home/search + {written} 个站点，'
                f'输出到 {out_root}'
            )
        )