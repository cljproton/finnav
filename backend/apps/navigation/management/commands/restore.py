"""数据恢复：从备份 zip 恢复数据库业务数据 + 媒体文件。

用法:
    python manage.py restore backup-20260807.zip

注意：会清空并重建 navigation 业务数据与 auth 用户/组，
媒体文件覆盖到 MEDIA_ROOT。请确保备份文件可信。
"""
from django.core.management.base import BaseCommand, CommandError

from apps.navigation.backup import restore_archive


class Command(BaseCommand):
    help = '从备份 zip 恢复数据库与媒体文件（会清空现有业务数据）'

    def add_arguments(self, parser):
        parser.add_argument('archive', help='备份 zip 文件路径')

    def handle(self, *args, **options):
        archive_path = options['archive']
        try:
            with open(archive_path, 'rb') as fh:
                stats = restore_archive(fh)
        except CommandError as exc:
            raise CommandError(str(exc)) from exc
        except OSError as exc:
            raise CommandError(f'无法读取备份文件：{exc}') from exc
        self.stdout.write(self.style.SUCCESS(
            f'恢复完成：{stats["data_file"]}（{stats["data_bytes"]} 字节），'
            f'媒体文件 {stats["media_files"]} 个。'
        ))
