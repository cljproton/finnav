"""数据备份：把数据库业务数据 + 媒体文件打包为 zip。

用法:
    python manage.py backup [-o backup.zip]
    python manage.py backup -o /path/to/backup-20260807.zip

不带 -o 时，输出文件名为当前目录下的 backup-<时间戳>.zip。
"""
import os

from django.core.management.base import BaseCommand, CommandError

from apps.navigation.backup import build_backup_archive, _timestamp


class Command(BaseCommand):
    help = '备份数据库业务数据与媒体文件为 zip 归档'

    def add_arguments(self, parser):
        parser.add_argument(
            '-o', '--output',
            dest='output',
            default=None,
            help='输出文件路径（默认当前目录 backup-<时间戳>.zip）',
        )

    def handle(self, *args, **options):
        output = options.get('output') or f'backup-{_timestamp()}.zip'
        try:
            archive = build_backup_archive()
        except Exception as exc:  # noqa: BLE001
            raise CommandError(f'备份失败：{exc}') from exc
        with open(output, 'wb') as fh:
            fh.write(archive.read())
        size = os.path.getsize(output)
        self.stdout.write(self.style.SUCCESS(f'备份完成：{output}（{size} 字节）'))
