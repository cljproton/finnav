from django.db import migrations, models


def migrate_tags_to_m2m(apps, schema_editor):
    """把旧 JSONField 中的标签字符串迁移为 Tag 记录并挂到 M2M。"""
    Tag = apps.get_model('navigation', 'Tag')
    Site = apps.get_model('navigation', 'Site')
    for site in Site.objects.exclude(tags_legacy=[]).exclude(tags_legacy=None):
        for name in site.tags_legacy:
            if not name or not str(name).strip():
                continue
            tag, _ = Tag.objects.get_or_create(name=str(name).strip())
            site.tags.add(tag)


def migrate_tags_back_to_json(apps, schema_editor):
    """反向：把 M2M 上的标签名收集回旧 JSONField。"""
    Site = apps.get_model('navigation', 'Site')
    for site in Site.objects.all():
        site.tags_legacy = list(site.tags.values_list('name', flat=True))
        site.save(update_fields=['tags_legacy'])


class Migration(migrations.Migration):

    dependencies = [
        ('navigation', '0018_sitevisit'),
    ]

    operations = [
        migrations.CreateModel(
            name='Tag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=50, unique=True, verbose_name='标签名')),
                ('sort_order', models.PositiveIntegerField(default=0, verbose_name='排序')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '标签',
                'verbose_name_plural': '标签',
                'ordering': ['sort_order', 'name'],
            },
        ),
        migrations.RenameField(
            model_name='site',
            old_name='tags',
            new_name='tags_legacy',
        ),
        migrations.AddField(
            model_name='site',
            name='tags',
            field=models.ManyToManyField(
                blank=True,
                related_name='sites',
                to='navigation.tag',
                verbose_name='标签',
            ),
        ),
        migrations.RunPython(
            migrate_tags_to_m2m,
            migrate_tags_back_to_json,
        ),
        migrations.RemoveField(
            model_name='site',
            name='tags_legacy',
        ),
    ]
