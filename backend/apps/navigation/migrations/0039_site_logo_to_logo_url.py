"""Site.logo（本站存放的图片文件）改为 Site.logo_url（仅存第三方图标链接）。

站点 Logo 因涉及第三方商标，不再在本站存放文件：只保存图标链接，由浏览器热链渲染。
存量值是本站 media 下的文件名（如 logos/logo-69.png），语义已失效，需清空；
清空后由 services.resolve_site_logo_url 或 management command resolve_logo_urls 重新解析。
"""

from django.db import migrations, models


def clear_stored_logo_files(apps, schema_editor):
    """清空存量 Logo 文件名与抓取时间，避免把 'logos/logo-69.png' 当成链接返回。"""
    Site = apps.get_model('navigation', 'Site')
    Site.objects.all().update(logo_url=None, logo_resolved_at=None)


class Migration(migrations.Migration):

    dependencies = [
        ('navigation', '0038_remove_appsetting_head_scripts_and_more'),
    ]

    operations = [
        migrations.RenameField(
            model_name='site',
            old_name='logo_fetched_at',
            new_name='logo_resolved_at',
        ),
        migrations.AlterField(
            model_name='site',
            name='logo_resolved_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Logo 链接解析时间'),
        ),
        migrations.RenameField(
            model_name='site',
            old_name='logo',
            new_name='logo_url',
        ),
        migrations.AlterField(
            model_name='site',
            name='logo_url',
            field=models.URLField(blank=True, max_length=500, null=True, verbose_name='Logo 链接'),
        ),
        migrations.RunPython(clear_stored_logo_files, migrations.RunPython.noop),
    ]
