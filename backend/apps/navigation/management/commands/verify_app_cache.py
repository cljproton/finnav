"""校验所有本站缓存的安卓 APP 完整性（SHA-256）。

用法:
    python manage.py verify_app_cache

对每个配置了本地缓存的站点：检查文件是否存在、重新计算 SHA-256 并与存储值比对，
不一致则视为已被篡改。更新 app_android_integrity_ok / app_android_verified_at。
命令可重复执行。
"""
from django.core.management.base import BaseCommand

from apps.navigation.models import Site
from apps.navigation.services import _sha256_file


class Command(BaseCommand):
    help = '校验站点缓存安卓 APP 的 SHA-256 完整性'

    def handle(self, *args, **options):
        from django.utils import timezone

        sites = Site.objects.exclude(app_android_file='').exclude(
            app_android_file__isnull=True
        )
        ok = bad = unverified = 0
        now = timezone.now()

        for site in sites:
            file = site.app_android_file
            if not site.app_android_sha256:
                # 无哈希基准：无法判定，保持“未核验”
                site.app_android_integrity_ok = None
                site.app_android_verified_at = now
                site.save(update_fields=[
                    'app_android_integrity_ok', 'app_android_verified_at', 'updated_at',
                ])
                unverified += 1
                continue

            good = False
            try:
                if file.storage.exists(file.name):
                    good = _sha256_file(file.path).lower() == site.app_android_sha256.lower()
            except Exception:
                good = False

            site.app_android_integrity_ok = good
            site.app_android_verified_at = now
            site.save(update_fields=[
                'app_android_integrity_ok', 'app_android_verified_at', 'updated_at',
            ])
            if good:
                ok += 1
            else:
                bad += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'校验完成：通过 {ok} 个，失败(篡改/文件异常) {bad} 个，'
                f'未核验(无哈希基准) {unverified} 个'
            )
        )