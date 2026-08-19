from django.db import migrations

DEFAULT_RULES = [
    {
        'code': 'site_approved',
        'name': '提交站点审核通过',
        'points': 20,
        'enabled': True,
        'daily_limit': 10,
        'total_limit': 0,
        'description': '用户提交的新站点经管理员审核通过后发放。',
    },
    {
        'code': 'tutorial_approved',
        'name': '分享教程审核通过',
        'points': 10,
        'enabled': True,
        'daily_limit': 20,
        'total_limit': 0,
        'description': '用户分享的教程经管理员审核通过后发放。',
    },
    {
        'code': 'app_link_approved',
        'name': 'APP 链接审核通过',
        'points': 10,
        'enabled': True,
        'daily_limit': 20,
        'total_limit': 0,
        'description': '用户提交的 APP 下载链接经管理员审核通过后发放。',
    },
    {
        'code': 'referral_inviter',
        'name': '邀请好友注册',
        'points': 30,
        'enabled': True,
        'daily_limit': 20,
        'total_limit': 0,
        'description': '通过我的推广链接注册的新用户（邮箱验证后）达标，邀请人获得积分。',
    },
    {
        'code': 'referral_referee',
        'name': '好友邀请注册奖励',
        'points': 10,
        'enabled': True,
        'daily_limit': 1,
        'total_limit': 1,
        'description': '通过好友推广链接注册的新用户获得的注册奖励（每人仅一次）。',
    },
    # 预留的「提交即发」规则，默认关闭（积分为 0），需要时后台开启。
    {
        'code': 'site_submit',
        'name': '提交站点（预留）',
        'points': 0,
        'enabled': False,
        'daily_limit': 10,
        'total_limit': 0,
        'description': '预留：提交新站点即发放（默认关闭，防止垃圾提交刷分）。',
    },
    {
        'code': 'tutorial_submit',
        'name': '分享教程（预留）',
        'points': 0,
        'enabled': False,
        'daily_limit': 20,
        'total_limit': 0,
        'description': '预留：分享教程即发放（默认关闭）。',
    },
    {
        'code': 'app_link_submit',
        'name': '提交 APP 链接（预留）',
        'points': 0,
        'enabled': False,
        'daily_limit': 20,
        'total_limit': 0,
        'description': '预留：提交 APP 下载链接即发放（默认关闭）。',
    },
]


def seed_rules(apps, schema_editor):
    PointRule = apps.get_model('navigation', 'PointRule')
    for item in DEFAULT_RULES:
        PointRule.objects.update_or_create(
            code=item['code'],
            defaults={
                'name': item['name'],
                'points': item['points'],
                'enabled': item['enabled'],
                'daily_limit': item['daily_limit'],
                'total_limit': item['total_limit'],
                'description': item['description'],
            },
        )


def remove_rules(apps, schema_editor):
    PointRule = apps.get_model('navigation', 'PointRule')
    PointRule.objects.filter(code__in=[r['code'] for r in DEFAULT_RULES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('navigation', '0029_pointrule_emailverification_referral_code_referral_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_rules, remove_rules),
    ]
