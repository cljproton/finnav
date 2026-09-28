"""批量解析站点 Logo 图标链接，写入 Site.logo_url。

背景：第三方站点 Logo 属其商标资产，本站不再存放图片文件，只保存链接。
本命令把站点的 Logo 链接解析出来（读页面 <link rel="icon">，不下载图片），
供存量数据回填与日常补全使用。

用法:
    python manage.py resolve_logo_urls                 # 仅解析尚无链接的站点
    python manage.py resolve_logo_urls --all           # 解析全部站点（跳过已有链接）
    python manage.py resolve_logo_urls --force         # 全部重新解析，覆盖已有链接
    python manage.py resolve_logo_urls --ids 1,2,3     # 指定站点
    python manage.py resolve_logo_urls --workers 8     # 并发数（默认 4）
    python manage.py resolve_logo_urls --quiet         # 只输出汇总

命令可重复执行，不会写入任何图片文件。
"""
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from apps.navigation.models import Site
from apps.navigation.services import resolve_site_logo_url


class Command(BaseCommand):
    help = '批量解析站点 Logo 图标链接（只存链接，不下载/存放图片）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--all', action='store_true',
            help='解析全部站点（默认：仅解析 logo_url 为空的站点）',
        )
        parser.add_argument(
            '--force', action='store_true',
            help='覆盖已有链接，全部重新解析',
        )
        parser.add_argument(
            '--ids', type=str, default='',
            help='仅处理指定站点 ID，逗号分隔，如 1,2,3',
        )
        parser.add_argument(
            '--workers', type=int, default=4,
            help='并发解析线程数（默认 4）',
        )
        parser.add_argument(
            '--quiet', action='store_true', help='只输出汇总统计',
        )

    def handle(self, *args, **options):
        from django.db.models import Q

        force = options['force']
        ids = [i.strip() for i in options['ids'].split(',') if i.strip().isdigit()]

        if ids:
            queryset = Site.objects.filter(pk__in=[int(i) for i in ids])
        elif force or options['all']:
            queryset = Site.objects.all()
        else:
            queryset = Site.objects.filter(Q(logo_url__isnull=True) | Q(logo_url=''))

        sites = list(queryset.only('id', 'name', 'url', 'logo_url', 'logo_resolved_at'))
        if not sites:
            self.stdout.write(self.style.WARNING('没有需要解析的站点'))
            return

        workers = max(1, min(options['workers'], 16))
        self.stdout.write(
            f'开始解析 {len(sites)} 个站点的 Logo 链接（并发 {workers}，force={force}）'
        )

        done = 0
        ok = failed = skipped = 0
        errors = []

        def run(pk):
            close_old_connections()
            try:
                site = Site.objects.get(pk=pk)
                url = resolve_site_logo_url(site, force=force)
                return site.name, url, None
            except Exception as exc:  # noqa: BLE001
                return pk, None, str(exc)
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(run, s.pk): s for s in sites}
            for future in as_completed(futures):
                site = futures[future]
                name, url, err = future.result()
                done += 1
                if err:
                    failed += 1
                    if len(errors) < 10:
                        errors.append(f'{name}: {err}')
                elif url:
                    ok += 1
                    if not options['quiet']:
                        self.stdout.write(f'  [{done}/{len(sites)}] {name} -> {url}')
                else:
                    skipped += 1
                if done % 20 == 0 and not options['quiet']:
                    self.stdout.write(f'  ... 已处理 {done}/{len(sites)}')

        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(f'完成：成功 {ok}，失败 {failed}，跳过 {skipped}，'
                               f'共 {len(sites)}')
        )
        if errors:
            self.stdout.write(self.style.WARNING('失败示例：'))
            for line in errors:
                self.stdout.write(f'  - {line}')
        self.stdout.write(
            '提示：本命令不写入任何图片文件，本站不再存放站点 Logo。'
        )
