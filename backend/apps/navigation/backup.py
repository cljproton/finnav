"""数据备份与恢复。

备份 = 数据库业务数据（dumpdata JSON）+ 上传的媒体文件（media/），打包为单个 zip：
    backup-<timestamp>.zip
     ├── data.json          # 业务数据（navigation 应用全部模型 + auth 用户/组）
     └── media/             # 全部上传文件（logos/、app_cache/ 等）

用法（管理命令与会话管理后台页面均调用本模块）：
    build_backup_archive()  -> BytesIO（zip 内容，含 data.json + media/）
    restore_archive(file)   -> 校验并恢复；返回统计 dict
"""
import datetime
import io
import os
import zipfile

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import transaction

# 备份包含的应用：navigation 业务数据 + 认证用户/组（评分/收藏/搜索历史外键依赖用户）
BACKUP_APPS = ['auth', 'navigation']
# 不打包的媒体子目录：app_cache 是从网络拉取的可重建缓存（体积可达数百 MB）
SKIP_MEDIA_DIRS = ['app_cache']


def _timestamp():
    return datetime.datetime.now().strftime('%Y%m%d-%H%M%S')


def _dump_json():
    buf = io.StringIO()
    call_command(
        'dumpdata',
        '--all',
        *BACKUP_APPS,
        '--natural-primary',
        '--natural-foreign',
        '--exclude', 'contenttypes',
        stdout=buf,
    )
    return buf.getvalue()


def _media_items():
    """遍历 MEDIA_ROOT，产出 (zip相对路径, 磁盘绝对路径)。跳过可重建的 app_cache。"""
    root = str(settings.MEDIA_ROOT)
    if not os.path.isdir(root):
        return
    for dirpath, _dirs, files in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root).replace(os.sep, '/')
        if any(part in SKIP_MEDIA_DIRS for part in rel_dir.split('/')):
            continue
        for fname in files:
            src = os.path.join(dirpath, fname)
            rel = os.path.relpath(src, root)
            # 统一用正斜杠存入 zip
            yield rel.replace(os.sep, '/'), src


def build_backup_archive():
    """生成备份 zip 的字节内容，返回 BytesIO（游标已归零）。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('data.json', _dump_json())
        for rel, src in _media_items():
            zf.write(src, f'media/{rel}')
    buf.seek(0)
    return buf


def restore_archive(fileobj):
    """校验并恢复一个备份 zip。

    - 先做基本校验（含 data.json、不解析 DB），通过后清理现有业务数据，
      再 loaddata 恢复数据库、解压媒体文件。
    - 返回统计 dict：{'data_file': 'data.json', 'media_files': n, 'data_bytes': n}
    """
    try:
        zf = zipfile.ZipFile(fileobj)
    except zipfile.BadZipFile:
        raise CommandError('不是有效的备份文件（无法解压为 zip）。')
    names = set(zf.namelist())
    if 'data.json' not in names:
        raise CommandError('备份文件缺少 data.json，无法恢复。')

    media_files = [n for n in names if n.startswith('media/') and not n.endswith('/')]
    data_bytes = zf.getinfo('data.json').file_size
    data_content = zf.read('data.json')

    # loaddata 需要真实文件路径（不支持 zip 内路径），先解到临时目录
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        fixture_path = os.path.join(tmpdir, 'data.json')
        with open(fixture_path, 'wb') as fh:
            fh.write(data_content)
        with transaction.atomic():
            _clear_business_data()
            call_command(
                'loaddata',
                fixture_path,
                '--verbosity', '0',
                skip_checks=True,
            )
            # 解压媒体文件到 MEDIA_ROOT
            media_root = str(settings.MEDIA_ROOT)
            os.makedirs(media_root, exist_ok=True)
            restored = 0
            for name in media_files:
                rel = name[len('media/'):]
                dest = os.path.join(media_root, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with zf.open(name) as src, open(dest, 'wb') as out:
                    out.write(src.read())
                restored += 1
    zf.close()
    return {
        'data_file': 'data.json',
        'data_bytes': data_bytes,
        'media_files': restored,
    }


def _clear_business_data():
    """删除业务数据，使恢复可幂等。媒体文件物理删除由解压覆盖。

    只清 BACKUP_APPS 相关的表：navigation 全部 + auth 用户/组。
    contenttypes / 权限由 Django 自动重建，不手动清理。
    """
    from django.apps import apps

    for app_label in BACKUP_APPS:
        for model in apps.get_app_config(app_label).get_models():
            model.objects.all().delete()
    # 清理 users 的 auth 相关中间表（groups/user_permissions 随用户删除级联清空）


def latest_backup_stats():
    """供后台页面展示：返回当前各核心表行数概览。"""
    from .models import AppSetting, Category, Site, Tag

    return {
        'categories': Category.objects.count(),
        'sites': Site.objects.count(),
        'tags': Tag.objects.count(),
        'settings': AppSetting.objects.count(),
    }
