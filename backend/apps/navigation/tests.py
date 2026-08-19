import os
import re
import shutil
import tempfile
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework import serializers
from rest_framework.test import APIClient

from .models import (
    AppDownload,
    AppLinkSubmission,
    Category,
    PointRule,
    PointTransaction,
    Rating,
    Referral,
    Site,
    SiteSubmission,
    SiteTutorial,
    Tag,
    TOTPChallenge,
    TwoFactor,
    UserProfile,
)
from .services import LogoFetchError, fetch_page_title_info


def _tags(*names):
    """返回按名字 get_or_create 的 Tag 对象列表（供站点 M2M 使用）。"""
    return [Tag.objects.get_or_create(name=n)[0] for n in names]


class HealthTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health(self):
        resp = self.client.get('/api/health/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'status': 'ok'})


class CategoriesTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.defi = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )
        self.wallet = Category.objects.create(
            name='钱包', slug='wallet', icon='👛', sort_order=2
        )
        self.site = Site.objects.create(
            name='Uniswap',
            description='去中心化交易所',
            url='https://uniswap.org',
            category=self.defi,
            sort_order=1,
        )
        self.site.tags.set(_tags('dex', 'swap'))

    def test_categories_returns_no_nested_sites(self):
        resp = self.client.get('/api/categories/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)

        first = data[0]
        self.assertEqual(first['name'], 'DeFi')
        self.assertEqual(first['slug'], 'defi')
        self.assertEqual(first['icon'], '🦄')
        self.assertEqual(first['sort_order'], 1)

        # 分类不再嵌套站点（站点走 /api/sites/ 分页）
        self.assertNotIn('sites', first)

    def test_categories_ordered_by_sort_order(self):
        resp = self.client.get('/api/categories/')
        slugs = [c['slug'] for c in resp.json()]
        self.assertEqual(slugs, ['defi', 'wallet'])


class SitesTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.defi = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )
        self.exchange = Category.objects.create(
            name='交易所', slug='exchange', icon='🏦', sort_order=2
        )
        self.uniswap = Site.objects.create(
            name='Uniswap',
            description='去中心化交易所',
            url='https://uniswap.org',
            category=self.defi,
            sort_order=2,
        )
        self.uniswap.tags.set(_tags('dex', 'swap'))
        self.aave = Site.objects.create(
            name='Aave',
            description='去中心化借贷协议',
            url='https://aave.com',
            category=self.defi,
            sort_order=1,
        )
        self.aave.tags.set(_tags('lending'))
        self.binance = Site.objects.create(
            name='Binance',
            description='中心化交易所',
            url='https://www.binance.com',
            category=self.exchange,
            sort_order=1,
        )
        self.binance.tags.set(_tags('cex'))

    def test_sites_default_ordering_by_sort_order(self):
        resp = self.client.get('/api/sites/')
        names = [s['name'] for s in resp.json()['results']]
        self.assertEqual(names, ['Aave', 'Binance', 'Uniswap'])

    def test_sites_q_search_by_name(self):
        resp = self.client.get('/api/sites/', {'q': 'uniswap'})
        names = [s['name'] for s in resp.json()['results']]
        self.assertEqual(names, ['Uniswap'])

    def test_sites_q_search_by_description(self):
        resp = self.client.get('/api/sites/', {'q': '借贷'})
        names = [s['name'] for s in resp.json()['results']]
        self.assertEqual(names, ['Aave'])

    def test_sites_q_search_by_tags(self):
        resp = self.client.get('/api/sites/', {'q': 'dex'})
        names = [s['name'] for s in resp.json()['results']]
        self.assertEqual(names, ['Uniswap'])

    def test_sites_filter_by_category_slug(self):
        resp = self.client.get('/api/sites/', {'category': 'defi'})
        names = [s['name'] for s in resp.json()['results']]
        self.assertEqual(names, ['Aave', 'Uniswap'])

    def test_sites_ordering_by_name(self):
        resp = self.client.get('/api/sites/', {'ordering': 'name'})
        names = [s['name'] for s in resp.json()['results']]
        self.assertEqual(names, ['Aave', 'Binance', 'Uniswap'])

    def test_sites_ordering_desc(self):
        resp = self.client.get('/api/sites/', {'ordering': '-sort_order'})
        names = [s['name'] for s in resp.json()['results']]
        self.assertEqual(names, ['Uniswap', 'Aave', 'Binance'])

    def test_sites_paginated_shape(self):
        resp = self.client.get('/api/sites/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('count', data)
        self.assertIn('next', data)
        self.assertIn('previous', data)
        self.assertIn('results', data)
        self.assertEqual(data['count'], 3)
        self.assertIsNone(data['next'])
        self.assertIsNone(data['previous'])
        self.assertEqual(len(data['results']), 3)

    def test_sites_page_size_from_appsetting(self):
        from .models import AppSetting

        setting = AppSetting.get()
        setting.sites_per_page = 2
        setting.save(update_fields=['sites_per_page', 'updated_at'])
        try:
            resp = self.client.get('/api/sites/')
            data = resp.json()
            self.assertEqual(data['count'], 3)
            self.assertEqual(len(data['results']), 2)
            self.assertIsNotNone(data['next'])
            # 第二页返回剩余一条
            resp2 = self.client.get('/api/sites/', {'page': 2})
            data2 = resp2.json()
            self.assertEqual(len(data2['results']), 1)
            self.assertIsNone(data2['next'])
            self.assertIsNotNone(data2['previous'])
        finally:
            reset = AppSetting.get()
            reset.sites_per_page = 20
            reset.save(update_fields=['sites_per_page', 'updated_at'])

    def test_sites_ids_endpoint(self):
        resp = self.client.get('/api/sites/ids/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(
            set(data['ids']),
            {self.uniswap.id, self.aave.id, self.binance.id},
        )

    def test_site_detail(self):
        with mock.patch(
            'apps.navigation.services.fetch_and_cache_logo'
        ) as fetch:
            fetch.side_effect = LogoFetchError("mock offline")
            resp = self.client.get(f'/api/sites/{self.uniswap.id}/')
            self.assertEqual(resp.status_code, 200)
            site = resp.json()
            self.assertEqual(site['name'], 'Uniswap')
            self.assertEqual(site['category_name'], 'DeFi')
            self.assertIn('logo', site)
            self.assertIn('tags', site)
            # 未缓存的站点首次返回 logo=null（图标由后台线程异步补拉，不阻塞请求）
            self.assertIsNone(site['logo'])


class SiteExtendedFieldsTestCase(TestCase):
    """覆盖新增的教程/代办/APP 字段。"""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )

    def test_extended_fields_serialized_shape(self):
        site = Site.objects.create(
            name='Uniswap',
            description='去中心化交易所',
            url='https://uniswap.org',
            category=self.category,
            sort_order=1,
            app_android_url='https://example.com/finnav.apk',
            app_ios_url='https://apps.apple.com/app/id123',
        )
        site.tags.set(_tags('dex'))
        with mock.patch(
            'apps.navigation.services.fetch_and_cache_logo'
        ) as fetch:
            fetch.side_effect = LogoFetchError("mock offline")
            resp = self.client.get(f'/api/sites/{site.id}/')
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
        # 双平台原始链接直出
        self.assertEqual(data['app_android_url'], 'https://example.com/finnav.apk')
        self.assertEqual(data['app_ios_url'], 'https://apps.apple.com/app/id123')
        # 未缓存时 cache_url 为 null
        self.assertIsNone(data['app_android_cache_url'])
        self.assertIsNone(data['app_android_size'])
        self.assertIsNone(data['app_android_cached_at'])

    def test_app_android_cache_url_after_download(self):
        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = Site.objects.create(
                    name='Binance',
                    description='交易所',
                    url='https://www.binance.com',
                    category=self.category,
                    sort_order=1,
                    app_android_url='https://example.com/finnav.apk',
                )
                site.tags.set(_tags('cex'))
                # 模拟本地缓存已就位（download_android 的产物）
                from django.utils import timezone

                cache_dir = os.path.join(media_root, 'app_cache', str(site.id), 'android')
                os.makedirs(cache_dir, exist_ok=True)
                with open(os.path.join(cache_dir, 'finnav.apk'), 'wb') as f:
                    f.write(b'fake-apk')
                site.app_android_file.name = f'app_cache/{site.id}/android/finnav.apk'
                site.app_android_size = 8
                site.app_android_cached_at = timezone.now()
                site.save(update_fields=['app_android_file', 'app_android_size',
                                         'app_android_cached_at'])

                # 本站缓存真实地址仅登录用户可见
                self.client.force_authenticate(
                    User.objects.create_user(
                        username='me@example.com', email='me@example.com', password='x'
                    )
                )
                with mock.patch(
                    'apps.navigation.services.fetch_and_cache_logo'
                ) as fetch:
                    fetch.side_effect = LogoFetchError("mock offline")
                    resp = self.client.get(f'/api/sites/{site.id}/')
                    data = resp.json()
                self.assertTrue(data['app_android_has_cache'])
                self.assertEqual(
                    data['app_android_cache_url'],
                    f'http://testserver/media/app_cache/{site.id}/android/finnav.apk',
                )
                self.assertEqual(data['app_android_size'], 8)
                self.assertIsNotNone(data['app_android_cached_at'])
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_app_android_cache_url_requires_login(self):
        """本站缓存的 APK 地址仅登录用户可见；匿名只见 has_cache 入口，拿不到真实地址。"""
        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = Site.objects.create(
                    name='Binance',
                    description='交易所',
                    url='https://www.binance.com',
                    category=self.category,
                    sort_order=1,
                    app_android_url='https://example.com/finnav.apk',
                )
                site.tags.set(_tags('cex'))
                from django.utils import timezone

                cache_dir = os.path.join(media_root, 'app_cache', str(site.id), 'android')
                os.makedirs(cache_dir, exist_ok=True)
                with open(os.path.join(cache_dir, 'finnav.apk'), 'wb') as f:
                    f.write(b'fake-apk')
                site.app_android_file.name = f'app_cache/{site.id}/android/finnav.apk'
                site.app_android_size = 8
                site.app_android_cached_at = timezone.now()
                site.save(update_fields=['app_android_file', 'app_android_size',
                                         'app_android_cached_at'])

                with mock.patch(
                    'apps.navigation.services.fetch_and_cache_logo'
                ) as fetch:
                    fetch.side_effect = LogoFetchError("mock offline")
                    # 匿名：能看到有缓存入口，但拿不到真实下载地址
                    resp = self.client.get(f'/api/sites/{site.id}/')
                    data = resp.json()
                self.assertTrue(data['app_android_has_cache'])
                self.assertIsNone(data['app_android_cache_url'])
                # 真实原始外链仍公开
                self.assertEqual(data['app_android_url'], 'https://example.com/finnav.apk')

                # 登录后可拿到本站缓存真实地址
                user = User.objects.create_user(
                    username='me@example.com', email='me@example.com', password='x'
                )
                self.client.force_authenticate(user)
                with mock.patch(
                    'apps.navigation.services.fetch_and_cache_logo'
                ) as fetch:
                    fetch.side_effect = LogoFetchError("mock offline")
                    resp2 = self.client.get(f'/api/sites/{site.id}/')
                    data2 = resp2.json()
                self.assertTrue(data2['app_android_has_cache'])
                self.assertEqual(
                    data2['app_android_cache_url'],
                    f'http://testserver/media/app_cache/{site.id}/android/finnav.apk',
                )
        finally:
            shutil.rmtree(media_root, ignore_errors=True)


def _make_site(name='Uniswap', category=None, **kwargs):
    from .models import Category
    cat = category or Category.objects.create(
        name='DeFi', slug='defi', icon='🦄', sort_order=1
    )
    defaults = {'url': 'https://uniswap.org', 'description': '去中心化交易所'}
    defaults.update(kwargs)
    return Site.objects.create(name=name, category=cat, **defaults)


class AuthRegisterTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.email = 'user@example.com'
        self.password = 'secret123'
        # 清空 DRF 限流缓存（LocMemCache 进程内共享，避免测试方法间互相触发 429）
        cache.clear()
        # 默认配置为「不验证邮箱」，此处显式开启以便测试邮件验证码流程
        from .models import AppSetting

        AppSetting.objects.update_or_create(id=1, defaults={'require_email_verification': True})

    def _captcha_token(self, answer='ABCD'):
        """写入一条已知答案的图形验证码，返回其 token。"""
        from django.utils import timezone

        from .captcha import _hash
        from .models import Captcha

        obj = Captcha.objects.create(
            token='tok-%s-%d' % (answer, Captcha.objects.count()),
            answer_hash=_hash(answer),
            expires_at=timezone.now() + timezone.timedelta(minutes=5),
        )
        return obj.token

    def _register(self, email=None):
        from unittest import mock

        with mock.patch(
            'apps.navigation.auth.send_mail', return_value=1
        ) as send:
            resp = self.client.post(
                '/api/auth/register/',
                {
                    'email': email or self.email,
                    'password': self.password,
                    'captcha_token': self._captcha_token(),
                    'captcha_answer': 'ABCD',
                },
                format='json',
            )
        return resp, send

    def _register_code(self, email=None):
        """完成注册并返回明文验证码（locmem backend 捕获邮件）。"""
        import re as _re

        from django.core import mail

        email = email or self.email
        with self.settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            resp = self.client.post(
                '/api/auth/register/',
                {
                    'email': email,
                    'password': self.password,
                    'captcha_token': self._captcha_token(),
                    'captcha_answer': 'ABCD',
                },
                format='json',
            )
            self.assertEqual(resp.status_code, 200)
            body = mail.outbox[-1].body
        code = _re.search(r'验证码是：(\d{6})', body).group(1)
        return code

    def _login(self, email=None, password=None, **extra):
        """携带图形验证码调用登录接口。"""
        return self.client.post(
            '/api/auth/token/',
            {
                'email': email or self.email,
                'password': password or self.password,
                'captcha_token': self._captcha_token('EFGH'),
                'captcha_answer': 'EFGH',
                **extra,
            },
            format='json',
        )

    def test_register_sends_code_and_creates_no_user(self):
        from .models import EmailVerification

        resp, send = self._register()
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn('access', resp.json())
        self.assertEqual(send.call_count, 1)
        # 注册阶段不创建用户
        self.assertFalse(User.objects.filter(username=self.email).exists())
        # 生成了一条 register 验证码
        self.assertTrue(
            EmailVerification.objects.filter(
                email=self.email, purpose=EmailVerification.PURPOSE_REGISTER
            ).exists()
        )

    def test_verify_with_code_creates_user_and_returns_tokens(self):
        code = self._register_code()
        resp = self.client.post(
            '/api/auth/verify/',
            {'email': self.email, 'code': code, 'password': self.password},
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertTrue(User.objects.filter(username=self.email).exists())
        # 验证通过后验证码记录已删除
        from .models import EmailVerification

        self.assertFalse(
            EmailVerification.objects.filter(
                email=self.email, purpose=EmailVerification.PURPOSE_REGISTER
            ).exists()
        )

    def test_verify_wrong_code_rejected(self):
        self._register_code()
        resp = self.client.post(
            '/api/auth/verify/',
            {'email': self.email, 'code': '000000', 'password': self.password},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(User.objects.filter(username=self.email).exists())

    def test_verify_without_request_rejected(self):
        resp = self.client.post(
            '/api/auth/verify/',
            {'email': self.email, 'code': '123456', 'password': self.password},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(User.objects.filter(username=self.email).exists())

    def test_verify_then_login(self):
        code = self._register_code()
        self.client.post(
            '/api/auth/verify/',
            {'email': self.email, 'code': code, 'password': self.password},
            format='json',
        )
        resp = self._login()
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.json())

    def test_register_duplicate_email(self):
        User.objects.create_user(
            username=self.email, email=self.email, password='x'
        )
        resp, _ = self._register()
        self.assertEqual(resp.status_code, 400)
        self.assertIn('email', resp.json())

    def test_login_returns_tokens(self):
        User.objects.create_user(
            username=self.email, email=self.email, password=self.password
        )
        resp = self._login()
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.json())

    def test_login_wrong_password(self):
        User.objects.create_user(
            username=self.email, email=self.email, password=self.password
        )
        resp = self._login(password='wrong')
        self.assertEqual(resp.status_code, 401)

    def test_password_reset_request_sends_code_for_existing_email(self):
        from django.core import mail

        from .models import EmailVerification

        User.objects.create_user(
            username=self.email, email=self.email, password=self.password
        )
        with self.settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            resp = self.client.post(
                '/api/auth/password-reset/request/',
                {'email': self.email},
                format='json',
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(
            EmailVerification.objects.filter(
                email=self.email, purpose=EmailVerification.PURPOSE_RESET
            ).exists()
        )

    def test_password_reset_request_unregistered_email_not_revealed(self):
        # 用户枚举防护：未注册邮箱也返回同样的成功响应，不暴露邮箱存在性
        from django.core import mail

        with self.settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            resp = self.client.post(
                '/api/auth/password-reset/request/',
                {'email': 'nobody@example.com'},
                format='json',
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def _reset_code(self, email=None):
        import re as _re

        from django.core import mail

        email = email or self.email
        User.objects.create_user(
            username=email, email=email, password=self.password
        )
        with self.settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            self.client.post(
                '/api/auth/password-reset/request/',
                {'email': email},
                format='json',
            )
            body = mail.outbox[-1].body
        return _re.search(r'验证码是：(\d{6})', body).group(1)

    def test_password_reset_confirm_resets_password(self):
        code = self._reset_code()
        resp = self.client.post(
            '/api/auth/password-reset/confirm/',
            {'email': self.email, 'code': code, 'password': 'newpass123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        # 旧密码失效
        old = self._login(password=self.password)
        self.assertEqual(old.status_code, 401)
        # 新密码可登录
        new = self._login(password='newpass123')
        self.assertEqual(new.status_code, 200)

    def test_password_reset_confirm_wrong_code_rejected(self):
        self._reset_code()
        resp = self.client.post(
            '/api/auth/password-reset/confirm/',
            {'email': self.email, 'code': '000000', 'password': 'newpass123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_password_reset_confirm_unregistered_email_rejected(self):
        resp = self.client.post(
            '/api/auth/password-reset/confirm/',
            {'email': 'nobody@example.com', 'code': '123456', 'password': 'newpass123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_code_hashed_in_db(self):
        from .models import EmailVerification

        code = self._register_code()
        record = EmailVerification.objects.get(
            email=self.email, purpose=EmailVerification.PURPOSE_REGISTER
        )
        self.assertNotEqual(record.code_hash, code)
        self.assertEqual(len(record.code_hash), 64)

    def test_register_throttled_per_ip(self):
        """同一 IP 高频注册被 429 限流（email_code scope: 10/min）。"""
        with mock.patch(
            'apps.navigation.auth.send_mail', return_value=1
        ) as send:
            statuses = []
            for i in range(11):
                resp = self.client.post(
                    '/api/auth/register/',
                    {
                        'email': f'user{i}@example.com',
                        'password': self.password,
                        'captcha_token': self._captcha_token(),
                        'captcha_answer': 'ABCD',
                    },
                    format='json',
                )
                statuses.append(resp.status_code)
        self.assertEqual(statuses[:10], [200] * 10)
        self.assertEqual(statuses[10], 429)
        # 第 11 次被限流，未发出邮件
        self.assertEqual(send.call_count, 10)

    def test_register_resend_cooldown(self):
        """同一邮箱 60 秒内重复索取验证码被拒，不发新邮件。"""
        from django.utils import timezone

        from .models import EmailVerification

        email = 'cooldown@example.com'
        with mock.patch(
            'apps.navigation.auth.send_mail', return_value=1
        ) as send:
            first = self.client.post(
                '/api/auth/register/',
                {
                    'email': email,
                    'password': self.password,
                    'captcha_token': self._captcha_token(),
                    'captcha_answer': 'ABCD',
                },
                format='json',
            )
            self.assertEqual(first.status_code, 200)

            second = self.client.post(
                '/api/auth/register/',
                {
                    'email': email,
                    'password': self.password,
                    'captcha_token': self._captcha_token(),
                    'captcha_answer': 'ABCD',
                },
                format='json',
            )
            self.assertEqual(second.status_code, 400)
            self.assertIn('太频繁', str(second.json()))
            self.assertEqual(send.call_count, 1)

            # 冷却期过后可再次索取
            EmailVerification.objects.filter(email=email).update(
                updated_at=timezone.now() - timezone.timedelta(seconds=61)
            )
            third = self.client.post(
                '/api/auth/register/',
                {
                    'email': email,
                    'password': self.password,
                    'captcha_token': self._captcha_token(),
                    'captcha_answer': 'ABCD',
                },
                format='json',
            )
            self.assertEqual(third.status_code, 200)
            self.assertEqual(send.call_count, 2)

    def test_password_reset_request_cooldown(self):
        """找回密码同样受同一邮箱冷却保护。"""
        from django.utils import timezone

        from .models import EmailVerification

        User.objects.create_user(
            username=self.email, email=self.email, password=self.password
        )
        with mock.patch(
            'apps.navigation.auth.send_mail', return_value=1
        ) as send:
            first = self.client.post(
                '/api/auth/password-reset/request/',
                {'email': self.email},
                format='json',
            )
            self.assertEqual(first.status_code, 200)

            second = self.client.post(
                '/api/auth/password-reset/request/',
                {'email': self.email},
                format='json',
            )
            self.assertEqual(second.status_code, 400)
            self.assertIn('太频繁', str(second.json()))
            self.assertEqual(send.call_count, 1)

            EmailVerification.objects.filter(email=self.email).update(
                updated_at=timezone.now() - timezone.timedelta(seconds=61)
            )
            third = self.client.post(
                '/api/auth/password-reset/request/',
                {'email': self.email},
                format='json',
            )
            self.assertEqual(third.status_code, 200)
            self.assertEqual(send.call_count, 2)


class RatingTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.site = _make_site()
        self.user = User.objects.create_user(
            username='rater@example.com', email='rater@example.com', password='pass123'
        )

    def _auth(self):
        self.client.force_authenticate(self.user)

    def test_rate_get_returns_empty_when_unrated(self):
        self._auth()
        resp = self.client.get(f'/api/sites/{self.site.id}/rate/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'score': None, 'comment': ''})

    def test_rate_get_returns_own_rating(self):
        self._auth()
        self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 4.0, 'comment': '很赞'},
            format='json',
        )
        resp = self.client.get(f'/api/sites/{self.site.id}/rate/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'score': 4.0, 'comment': '很赞'})

    def test_site_includes_aggregates(self):
        resp = self.client.get(f'/api/sites/{self.site.id}/')
        data = resp.json()
        self.assertEqual(data['visit_count'], 0)
        self.assertEqual(data['rating_count'], 0)
        self.assertEqual(data['rating_avg'], 0.0)

    def test_rate_requires_auth(self):
        resp = self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 4.0},
            format='json',
        )
        self.assertEqual(resp.status_code, 401)

    def test_rate_creates_and_updates(self):
        self._auth()
        resp = self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 4.0, 'comment': '好用'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['score'], 4.0)
        self.assertEqual(data['comment'], '好用')
        self.assertEqual(data['rating_count'], 1)
        self.assertEqual(data['rating_avg'], 4.0)

        # 再次打分视为更新（一人一票），改为 4.5
        resp = self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 4.5},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['rating_count'], 1)
        self.assertEqual(resp.json()['rating_avg'], 4.5)
        self.assertEqual(Rating.objects.filter(site=self.site).count(), 1)

    def test_rate_rejects_out_of_range(self):
        self._auth()
        resp = self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 5.5},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_rate_rejects_non_half_step(self):
        self._auth()
        resp = self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 3.3},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_rate_aggregates_multiple_users(self):
        user2 = User.objects.create_user(
            username='rater2@example.com', email='rater2@example.com', password='pass123'
        )
        self._auth()
        self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 4.0},
            format='json',
        )
        self.client.force_authenticate(user2)
        self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 3.0},
            format='json',
        )
        self.site.refresh_from_db()
        self.assertEqual(self.site.rating_count, 2)
        self.assertEqual(self.site.rating_avg, 3.5)

    def test_rate_delete_updates_aggregates(self):
        self._auth()
        self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 4.0},
            format='json',
        )
        resp = self.client.delete(f'/api/sites/{self.site.id}/rate/')
        self.assertEqual(resp.status_code, 204)
        self.site.refresh_from_db()
        self.assertEqual(self.site.rating_count, 0)
        self.assertEqual(self.site.rating_avg, 0.0)


class I18nNegotiationTestCase(TestCase):
    """语言协商 + API 消息国际化端到端验证。

    - zh* -> 中文（zh-hans，原文即译文）
    - en* -> 英文（走 backend/apps/navigation/locale/en 的 .mo）
    - 未匹配语言（fr / 无头）-> 回退英文
    """

    def setUp(self):
        self.client = APIClient()
        self.site = _make_site()
        self.user = User.objects.create_user(
            username='rater@example.com', email='rater@example.com', password='pass123'
        )
        self.client.force_authenticate(self.user)

    def _err(self, lang=None):
        kwargs = {'HTTP_ACCEPT_LANGUAGE': lang} if lang is not None else {}
        return self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': 3.3},
            format='json',
            **kwargs,
        )

    def test_zh_returns_chinese(self):
        data = self._err('zh-CN').json()
        self.assertEqual(data['score'][0], '评分必须为 0.5 的倍数（0-10）。')

    def test_zh_hans_returns_chinese(self):
        data = self._err('zh-Hans').json()
        self.assertEqual(data['score'][0], '评分必须为 0.5 的倍数（0-10）。')

    def test_en_returns_english(self):
        data = self._err('en-US').json()
        self.assertEqual(data['score'][0], 'Rating must be a multiple of 0.5 (0-10).')

    def test_en_plain_returns_english(self):
        data = self._err('en').json()
        self.assertEqual(data['score'][0], 'Rating must be a multiple of 0.5 (0-10).')

    def test_unmatched_language_falls_back_to_english(self):
        data = self._err('fr').json()
        self.assertEqual(data['score'][0], 'Rating must be a multiple of 0.5 (0-10).')

    def test_missing_header_uses_default_chinese(self):
        data = self._err(None).json()
        self.assertEqual(data['score'][0], '评分必须为 0.5 的倍数（0-10）。')


class RatingsListTestCase(TestCase):
    """站点其它用户评价列表（仅登录可见，用户名脱敏，排除本人）。"""

    def setUp(self):
        self.client = APIClient()
        self.site = _make_site()
        self.me = User.objects.create_user(
            username='me@example.com', email='me@example.com', password='pass123'
        )

    def _rate(self, user, score, comment):
        self.client.force_authenticate(user)
        resp = self.client.post(
            f'/api/sites/{self.site.id}/rate/',
            {'score': score, 'comment': comment},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)

    def _list(self):
        return self.client.get(f'/api/sites/{self.site.id}/ratings/')

    def test_ratings_anonymous_visible_without_comment(self):
        from .serializers import mask_username

        user2 = User.objects.create_user(
            username='zhangsan@example.com',
            email='zhangsan@example.com',
            password='pass123',
        )
        self._rate(user2, 5.0, '很不错')
        self.client.force_authenticate(user=None)  # 恢复匿名
        # 匿名：可访问，看到脱敏用户名 + 评星，评论文本为 null
        resp = self._list()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['count'], 1)
        item = data['results'][0]
        self.assertEqual(item['score'], 5.0)
        self.assertEqual(item['username_masked'], 'z***@example.com')
        self.assertIsNone(item['comment'])

    def test_ratings_excludes_self_and_masks_names(self):
        from .serializers import mask_username

        user2 = User.objects.create_user(
            username='zhangsan@example.com',
            email='zhangsan@example.com',
            password='pass123',
        )
        self._rate(self.me, 4.0, '我自己的评价')
        self._rate(user2, 5.0, '很不错')
        self.client.force_authenticate(self.me)
        resp = self._list()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['count'], 1)
        results = data['results']
        # 排除本人
        self.assertEqual(len(results), 1)
        item = results[0]
        self.assertEqual(item['score'], 5.0)
        self.assertEqual(item['comment'], '很不错')
        self.assertEqual(item['username_masked'], 'z***@example.com')
        # 不暴露完整用户名 / user id
        self.assertNotIn('user', item)
        self.assertNotIn('zhangsan', item['username_masked'])

    def test_ratings_ordered_by_created_desc(self):
        a = User.objects.create_user(username='a@example.com', email='a@example.com', password='p')
        b = User.objects.create_user(username='b@example.com', email='b@example.com', password='p')
        self._rate(a, 3.0, '早')
        self._rate(b, 5.0, '晚')
        self.client.force_authenticate(self.me)
        data = self._list().json()
        results = data['results']
        self.assertEqual(len(results), 2)
        self.assertEqual([i['comment'] for i in results], ['晚', '早'])

    def test_ratings_empty_list_when_no_other_users(self):
        self._rate(self.me, 4.0, '只有我自己')
        self.client.force_authenticate(self.me)
        resp = self._list()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['count'], 0)
        self.assertEqual(data['results'], [])

    def test_ratings_paginated(self):
        users = [
            User.objects.create_user(
                username=f'user{i}@example.com',
                email=f'user{i}@example.com',
                password='p',
            )
            for i in range(12)
        ]
        for idx, user in enumerate(users):
            self._rate(user, 4.0, f'评价{idx}')
        self.client.force_authenticate(self.me)
        data = self._list().json()
        self.assertEqual(data['count'], 12)
        self.assertEqual(len(data['results']), 10)
        self.assertEqual(data['results'][0]['comment'], '评价11')
        self.assertIsNotNone(data['next'])

        resp2 = self.client.get(data['next'].replace('http://testserver', ''))
        data2 = resp2.json()
        self.assertEqual(len(data2['results']), 2)
        self.assertEqual(data2['results'][-1]['comment'], '评价0')
        self.assertIsNone(data2['next'])

    def test_mask_username_variants(self):
        from .serializers import mask_username

        self.assertEqual(mask_username('zhangsan@example.com'), 'z***@example.com')
        self.assertEqual(mask_username('a@b.com'), 'a***@b.com')
        self.assertEqual(mask_username('noat'), 'n***')
        self.assertEqual(mask_username(''), '***')
        self.assertEqual(mask_username(None), '***')


class UserSiteInviteTestCase(TestCase):
    """用户站点邀请：登录用户可为站点配置专属邀请码/邀请链接，转发时附带。"""

    def setUp(self):
        self.client = APIClient()
        self.site = _make_site()
        self.user = User.objects.create_user(
            username='inviter@example.com',
            email='inviter@example.com',
            password='pass123',
        )

    def _auth(self):
        self.client.force_authenticate(self.user)

    def test_invite_requires_auth(self):
        resp = self.client.put(
            f'/api/sites/{self.site.id}/invite/', {'invite_code': 'ABC'}, format='json'
        )
        self.assertEqual(resp.status_code, 401)

    def test_invite_empty_when_unset(self):
        self._auth()
        resp = self.client.get(f'/api/sites/{self.site.id}/invite/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(), {'invite_code': '', 'invite_link': ''}
        )

    def test_invite_create_update_and_get(self):
        from .models import UserSiteInvite

        self._auth()
        resp = self.client.put(
            f'/api/sites/{self.site.id}/invite/',
            {'invite_code': 'INVITE-1', 'invite_link': 'https://t.me/+abc'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['invite_code'], 'INVITE-1')
        self.assertEqual(resp.json()['invite_link'], 'https://t.me/+abc')

        invite = UserSiteInvite.objects.get(user=self.user, site=self.site)
        self.assertEqual(invite.invite_code, 'INVITE-1')

        resp = self.client.get(f'/api/sites/{self.site.id}/invite/')
        self.assertEqual(resp.json()['invite_code'], 'INVITE-1')
        self.assertEqual(resp.json()['invite_link'], 'https://t.me/+abc')

        resp = self.client.put(
            f'/api/sites/{self.site.id}/invite/',
            {'invite_link': 'https://t.me/+updated'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        invite.refresh_from_db()
        self.assertEqual(invite.invite_code, '')
        self.assertEqual(invite.invite_link, 'https://t.me/+updated')

    def test_invite_rejects_both_empty(self):
        self._auth()
        resp = self.client.put(
            f'/api/sites/{self.site.id}/invite/', {}, format='json'
        )
        self.assertEqual(resp.status_code, 400)

    def test_invite_isolation_between_users(self):
        from .models import UserSiteInvite

        self._auth()
        self.client.put(
            f'/api/sites/{self.site.id}/invite/',
            {'invite_code': 'USER1'},
            format='json',
        )
        user2 = User.objects.create_user(
            username='inviter2@example.com',
            email='inviter2@example.com',
            password='pass123',
        )
        self.client.force_authenticate(user2)
        resp = self.client.get(f'/api/sites/{self.site.id}/invite/')
        self.assertEqual(
            resp.json(), {'invite_code': '', 'invite_link': ''}
        )
        self.client.put(
            f'/api/sites/{self.site.id}/invite/',
            {'invite_code': 'USER2'},
            format='json',
        )
        self.assertEqual(UserSiteInvite.objects.count(), 2)

    def test_invite_delete(self):
        self._auth()
        self.client.put(
            f'/api/sites/{self.site.id}/invite/', {'invite_code': 'X'}, format='json'
        )
        resp = self.client.delete(f'/api/sites/{self.site.id}/invite/')
        self.assertEqual(resp.status_code, 204)
        resp = self.client.get(f'/api/sites/{self.site.id}/invite/')
        self.assertEqual(
            resp.json(), {'invite_code': '', 'invite_link': ''}
        )

    def test_site_detail_exposes_admin_invite_fields_only(self):
        """站点详情应下发管理员配置的邀请字段（站点级），而非任何用户的私人邀请数据。"""
        self.site.invite_code = 'ADMININVITE'
        self.site.invite_link = 'https://invite.example.com/site'
        self.site.save(update_fields=['invite_code', 'invite_link', 'updated_at'])
        self._auth()
        self.client.put(
            f'/api/sites/{self.site.id}/invite/',
            {'invite_code': 'PRIVATEUSER'},
            format='json',
        )
        resp = self.client.get(f'/api/sites/{self.site.id}/')
        data = resp.json()
        self.assertEqual(data['invite_code'], 'ADMININVITE')
        self.assertEqual(data['invite_link'], 'https://invite.example.com/site')
        self.assertNotEqual(data['invite_code'], 'PRIVATEUSER')


class VisitTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.site = _make_site()

    def test_visit_increments(self):
        resp = self.client.post(f'/api/sites/{self.site.id}/visit/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['visit_count'], 1)
        self.site.refresh_from_db()
        self.assertEqual(self.site.visit_count, 1)

    def test_visit_stacks(self):
        for _ in range(3):
            self.client.post(f'/api/sites/{self.site.id}/visit/')
        self.site.refresh_from_db()
        self.assertEqual(self.site.visit_count, 3)

    def test_visit_writes_timestamped_record(self):
        from .models import SiteVisit

        self.client.post(f'/api/sites/{self.site.id}/visit/')
        visit = SiteVisit.objects.get(site_id=self.site.id)
        self.assertIsNotNone(visit.visited_at)
        self.assertEqual(SiteVisit.objects.count(), 1)


class VisitTrendsTagTestCase(TestCase):
    """后台看板访问趋势标签：按分类堆叠、缺失补 0、时间窗口。"""

    def setUp(self):
        self.cat1 = Category.objects.create(name='DeFi', slug='defi')
        self.cat2 = Category.objects.create(name='交易所', slug='exchange')
        self.site1 = Site.objects.create(name='A', url='https://a.com', category=self.cat1)
        self.site2 = Site.objects.create(name='B', url='https://b.com', category=self.cat2)

    def test_visit_trends_aggregates_by_category_with_zero_fill(self):
        from datetime import timedelta

        from django.utils import timezone

        from .models import SiteVisit
        from .templatetags.dashboard_lte import visit_trends

        now = timezone.now()
        SiteVisit.objects.create(site=self.site1, visited_at=now)
        SiteVisit.objects.create(site=self.site1, visited_at=now)
        SiteVisit.objects.create(site=self.site2, visited_at=now)
        SiteVisit.objects.create(site=self.site2, visited_at=now - timedelta(days=40))

        data = visit_trends({})['visit_trends']

        self.assertEqual(len(data['daily']['labels']), 30)
        self.assertEqual(len(data['weekly']['labels']), 12)
        self.assertEqual(len(data['monthly']['labels']), 12)

        daily_by_name = {s['name']: s['data'] for s in data['daily']['series']}
        self.assertEqual(set(daily_by_name), {'DeFi', '交易所'})
        today_label = timezone.localtime(now).strftime('%m-%d')
        today_idx = data['daily']['labels'].index(today_label)
        # 今天的访问按分类计数
        self.assertEqual(daily_by_name['DeFi'][today_idx], 2)
        self.assertEqual(daily_by_name['交易所'][today_idx], 1)
        # 每日窗口首日（today-29）应为 0（40 天前数据已出窗，且会被补 0）
        self.assertEqual(daily_by_name['DeFi'][0], 0)
        self.assertEqual(daily_by_name['交易所'][0], 0)

        # 周窗口覆盖 40 天前数据，全部计入（合计 4）
        weekly_by_name = {s['name']: s['data'] for s in data['weekly']['series']}
        self.assertEqual(sum(weekly_by_name['DeFi']) + sum(weekly_by_name['交易所']), 4)


class SettingsTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_settings_returns_defaults(self):
        resp = self.client.get('/api/settings/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['site_title'], 'FinNav')
        self.assertEqual(data['seo_title'], 'FinNav')
        self.assertEqual(data['seo_description'], 'FinNav一个金融导航应用')
        self.assertEqual(data['seo_keywords'], '金融，银行，券商，web3')
        self.assertEqual(
            data['announcement'], '欢迎来到FinNav！请自觉遵守相关法律法规，合法使用。'
        )
        self.assertEqual(data['announcement_enabled'], True)
        self.assertEqual(data['footer_copyright'], 'Copyright © 2026 FinNav.')
        self.assertEqual(data['require_email_verification'], False)
        self.assertNotIn('home_title', data)
        self.assertNotIn('home_subtitle', data)
        # logo 未上传时为 None
        self.assertIsNone(data['logo'])

    def test_settings_reflects_custom_values(self):
        from .models import AppSetting

        AppSetting.get()
        AppSetting.objects.filter(id=1).update(
            site_title='我的网站',
            seo_title='我的 SEO 标题',
            announcement='重要公告',
            announcement_enabled=True,
            footer_copyright='© 2026 MySite',
        )
        resp = self.client.get('/api/settings/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['site_title'], '我的网站')
        self.assertEqual(data['announcement'], '重要公告')
        self.assertEqual(data['footer_copyright'], '© 2026 MySite')

    def test_settings_exposes_share_base_url_default_empty(self):
        resp = self.client.get('/api/settings/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['share_base_url'], '')

    def test_settings_reflects_share_base_url(self):
        from .models import AppSetting

        AppSetting.get()
        AppSetting.objects.filter(id=1).update(
            share_base_url='https://finnav.app',
        )
        resp = self.client.get('/api/settings/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['share_base_url'], 'https://finnav.app')

    def test_share_base_url_clean_normalizes(self):
        from django.core.exceptions import ValidationError

        from .models import AppSetting

        setting = AppSetting.get()
        setting.share_base_url = 'https://finnav.app/'
        setting.full_clean()
        self.assertEqual(setting.share_base_url, 'https://finnav.app')

        setting.share_base_url = 'http://192.168.1.70:8000//'
        setting.full_clean()
        self.assertEqual(setting.share_base_url, 'http://192.168.1.70:8000')

        setting.share_base_url = '  '
        setting.full_clean()
        self.assertEqual(setting.share_base_url, '')

        setting.share_base_url = 'finnav.app'
        with self.assertRaises(ValidationError):
            setting.full_clean()


class AppDownloadTestCase(TestCase):
    """安卓 APP 拉取缓存（专用目录、刷新覆盖）+ 序列化字段。"""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )

    def _site(self, **kwargs):
        defaults = {
            'name': 'Binance',
            'description': '交易所',
            'url': 'https://www.binance.com',
            'category': self.category,
            'sort_order': 1,
        }
        defaults.update(kwargs)
        return Site.objects.create(**defaults)

    def test_download_android_missing_url_rejected(self):
        from django.core.exceptions import ValidationError

        site = self._site()
        with self.assertRaises(ValidationError):
            site.download_android()

    def test_download_android_non_http_rejected(self):
        from django.core.exceptions import ValidationError

        site = self._site(app_android_url='ftp://example.com/finnav.apk')
        with self.assertRaises(ValidationError):
            site.download_android()

    def test_download_android_saves_to_dedicated_dir(self):
        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = self._site(app_android_url='https://example.com/finnav.apk')
                with self.mock_urlopen(b'fake-apk-bytes') as (_urlopen_mock, _ssrf_mock):
                    site.download_android()
                site.refresh_from_db()
                self.assertEqual(site.app_android_size, 14)
                self.assertIsNotNone(site.app_android_cached_at)
                expected_rel = f'app_cache/{site.id}/android/finnav.apk'
                self.assertEqual(site.app_android_file.name, expected_rel)
                # 专用目录路径正确
                disk_path = os.path.join(media_root, 'app_cache', str(site.id), 'android', 'finnav.apk')
                self.assertTrue(os.path.exists(disk_path))
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_download_android_refresh_overwrites(self):
        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = self._site(app_android_url='https://example.com/finnav.apk')
                with self.mock_urlopen(b'first-version') as (_urlopen_mock, _ssrf_mock):
                    site.download_android()
                first = site.app_android_file.name
                # 重复调用 = 刷新覆盖
                with self.mock_urlopen(b'second-version-newer') as (_urlopen_mock2, _ssrf_mock2):
                    site.download_android()
                site.refresh_from_db()
                self.assertEqual(site.app_android_size, 20)
                self.assertEqual(site.app_android_file.name, first)
                disk_path = os.path.join(media_root, 'app_cache', str(site.id), 'android', 'finnav.apk')
                with open(disk_path, 'rb') as f:
                    self.assertEqual(f.read(), b'second-version-newer')
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_serializer_exposes_android_ios_fields(self):
        site = self._site(
            app_android_url='https://example.com/finnav.apk',
            app_ios_url='https://apps.apple.com/app/id123',
        )
        resp = self.client.get(f'/api/sites/{site.id}/')
        data = resp.json()
        self.assertEqual(data['app_android_url'], 'https://example.com/finnav.apk')
        self.assertEqual(data['app_ios_url'], 'https://apps.apple.com/app/id123')
        self.assertIsNone(data['app_android_cache_url'])

    def test_download_android_records_sha256(self):
        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = self._site(app_android_url='https://example.com/finnav.apk')
                with self.mock_urlopen(b'fake-apk-bytes') as (_urlopen_mock, _ssrf_mock):
                    site.download_android()
                site.refresh_from_db()
                import hashlib

                self.assertEqual(
                    site.app_android_sha256,
                    hashlib.sha256(b'fake-apk-bytes').hexdigest(),
                )
                self.assertIsNotNone(site.app_android_verified_at)
                self.assertTrue(site.app_android_integrity_ok)
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_serializer_sha256_public(self):
        import hashlib

        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = self._site(app_android_url='https://example.com/finnav.apk')
                with self.mock_urlopen(b'fake-apk-bytes') as (_urlopen_mock, _ssrf_mock):
                    site.download_android()
                site.refresh_from_db()
                expect_sha = hashlib.sha256(b'fake-apk-bytes').hexdigest()

                # 匿名：可见完整性状态与校验值（真实性核验公开）
                anon = self.client.get(f'/api/sites/{site.id}/').json()
                self.assertTrue(anon['app_android_has_cache'])
                self.assertTrue(anon['app_android_integrity_ok'])
                self.assertEqual(anon['app_android_sha256'], expect_sha)

                # 登录：同样可见 SHA-256
                self.client.force_authenticate(
                    User.objects.create_user(
                        username='me@example.com', email='me@example.com', password='x'
                    )
                )
                logged = self.client.get(f'/api/sites/{site.id}/').json()
                self.assertEqual(logged['app_android_sha256'], expect_sha)
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_verify_app_cache_command(self):
        import hashlib
        from django.core.management import call_command
        from io import StringIO

        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = self._site(app_android_url='https://example.com/finnav.apk')
                with self.mock_urlopen(b'genuine-apk') as (_urlopen_mock, _ssrf_mock):
                    site.download_android()
                site.refresh_from_db()
                disk_path = os.path.join(
                    media_root, 'app_cache', str(site.id), 'android', 'finnav.apk'
                )

                # 1) 完整未被篡改 → 校验通过
                out = StringIO()
                call_command('verify_app_cache', stdout=out)
                site.refresh_from_db()
                self.assertTrue(site.app_android_integrity_ok)
                self.assertIsNotNone(site.app_android_verified_at)

                # 2) 篡改文件内容 → 校验失败
                with open(disk_path, 'wb') as f:
                    f.write(b'tampered-apk!')
                call_command('verify_app_cache', stdout=out)
                site.refresh_from_db()
                self.assertFalse(site.app_android_integrity_ok)

                # 3) 文件缺失 → 校验失败
                os.remove(disk_path)
                call_command('verify_app_cache', stdout=out)
                site.refresh_from_db()
                self.assertFalse(site.app_android_integrity_ok)

                # 4) 无哈希基准 → 保持未核验
                site.app_android_sha256 = ''
                site.save(update_fields=['app_android_sha256'])
                call_command('verify_app_cache', stdout=out)
                site.refresh_from_db()
                self.assertIsNone(site.app_android_integrity_ok)
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    @staticmethod
    @contextmanager
    def mock_urlopen(payload):
        """以 bytes 响应替换传输层，并放行 SSRF 校验，用于下载测试。"""
        import io

        from unittest import mock

        from . import services

        class FakeResp(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return None

            def __del__(self):
                pass

        with mock.patch.object(
            services._safe_opener, 'open', return_value=FakeResp(payload)
        ) as opener_mock, mock.patch.object(
            services, '_ensure_public_host'
        ) as ssrf_mock:
            yield opener_mock, ssrf_mock


class SiteAdminPageTestCase(TestCase):
    """后台站点变更页渲染（含拉取按钮）。"""

    def setUp(self):
        from . import services

        services.reset_pull_states()
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            username='admin', email='admin@example.com', password='adminpass'
        )
        self.category = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )
        self.site = Site.objects.create(
            name='Binance',
            description='交易所',
            url='https://www.binance.com',
            category=self.category,
            sort_order=1,
            app_android_url='https://example.com/finnav.apk',
            app_ios_url='https://apps.apple.com/app/id123',
        )

    def test_change_page_renders_with_pull_button(self):
        self.client.force_login(self.admin_user)
        resp = self.client.get(f'/admin/navigation/site/{self.site.id}/change/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, '拉取安卓 APP 并保存到本站')
        self.assertContains(resp, 'app_android_url')
        self.assertContains(resp, 'app_ios_url')

    def test_pull_views_require_login(self):
        resp = self.client.get(f'/admin/navigation/site/{self.site.id}/app-pull/status/')
        self.assertIn(resp.status_code, (302, 403))

    def test_pull_status_and_start(self):
        from unittest import mock

        self.client.force_login(self.admin_user)
        url = f'/admin/navigation/site/{self.site.id}/app-pull/'
        resp = self.client.get(url + 'status/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {})  # 尚未拉取

        # 替换下载器，避免后台线程触发真实网络/占用测试库
        with mock.patch(
            'apps.navigation.services.stream_app_to_site', return_value='ok'
        ):
            resp = self.client.post(url + 'start/', content_type='application/json')
            self.assertEqual(resp.status_code, 200)
            state = resp.json()
            self.assertEqual(state['status'], 'queued')
            self.assertEqual(state['percent'], 0)

        # POST 之外的 method 拒绝
        resp = self.client.get(url + 'start/')
        self.assertEqual(resp.status_code, 405)

    def test_status_terminal_is_read_once_then_cleared(self):
        from . import services

        self.client.force_login(self.admin_user)
        # 模拟已完成的任务进入终态
        services._update_state(self.site.id, {'status': 'done', 'percent': 100})
        status_url = f'/admin/navigation/site/{self.site.id}/app-pull/status/'
        r1 = self.client.get(status_url)
        self.assertEqual(r1.json()['status'], 'done')
        # 第二次读取应为空，否则页面会不停刷新
        r2 = self.client.get(status_url)
        self.assertEqual(r2.json(), {})

    def test_pull_start_saves_url_from_body_and_rejects_bad_url(self):
        from unittest import mock

        self.client.force_login(self.admin_user)
        url = f'/admin/navigation/site/{self.site.id}/app-pull/start/'
        # 后台线程会调 stream_app_to_site，测试里替换为快速返回
        with mock.patch(
            'apps.navigation.services.stream_app_to_site', return_value='ok'
        ):
            resp = self.client.post(
                url,
                data={'url': 'ftp://bad.example/a.apk'},
                content_type='application/json',
            )
            self.assertEqual(resp.status_code, 400)

            new_url = 'https://trustwallet.com/download/apk'
            resp = self.client.post(
                url,
                data={'url': new_url},
                content_type='application/json',
            )
            self.assertEqual(resp.status_code, 200)
            self.site.refresh_from_db()
            self.assertEqual(self.site.app_android_url, new_url)

    def test_change_page_resolves_pull_urls_siblings_not_under_change(self):
        """拉取端点解析在 change/ 的兄弟路径，而非其子路径。"""
        self.client.force_login(self.admin_user)
        page = self.client.get(
            f'/admin/navigation/site/{self.site.id}/change/'
        ).content.decode()
        self.assertIn(
            f"'/admin/navigation/site/{self.site.id}/app-pull/status/'", page
        )
        self.assertNotIn('/change/app-pull/', page)


class CategoryAdminTestCase(TestCase):
    """后台分类页仅管理站点归属（添加/移除/恢复），不改站点信息。"""

    def setUp(self):
        from . import services

        services.reset_pull_states()
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            username='admin', email='admin@example.com', password='adminpass'
        )
        self.category = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )
        self.other = Category.objects.create(
            name='交易所', slug='exchange', icon='🏦', sort_order=2
        )
        self.site_in = Site.objects.create(
            name='Uniswap', description='DEX', url='https://uniswap.org',
            category=self.category, sort_order=1,
        )
        self.site_out = Site.objects.create(
            name='Binance', description='交易所', url='https://www.binance.com',
            category=self.other, sort_order=1,
        )
        self.site_hidden = Site.objects.create(
            name='旧站', description='停用', url='https://example.com',
            category=self.category, sort_order=2, is_active=False,
        )

    def test_change_page_shows_membership_panel(self):
        self.client.force_login(self.admin_user)
        page = self.client.get(
            f'/admin/navigation/category/{self.category.id}/change/'
        ).content.decode()
        self.assertIn('分类下的站点', page)
        self.assertIn('加入该分类', page)
        self.assertIn('移除（停用）', page)
        self.assertIn('恢复显示', page)
        # 已存在的站点出现，且不在下拉候选里
        self.assertIn('Uniswap', page)
        self.assertIn('Binance', page)

    def test_change_page_does_not_render_site_edit_fields(self):
        """分类页不再内联编辑站点信息。"""
        self.client.force_login(self.admin_user)
        page = self.client.get(
            f'/admin/navigation/category/{self.category.id}/change/'
        ).content.decode()
        self.assertNotIn('id_sites-TOTAL_FORMS', page)

    def test_add_moves_existing_site_into_category_and_activates(self):
        self.client.force_login(self.admin_user)
        resp = self.client.post(
            f'/admin/navigation/category/{self.category.id}/site-add/',
            data={'site_id': self.site_out.id},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        self.site_out.refresh_from_db()
        self.assertEqual(self.site_out.category_id, self.category.id)
        self.assertTrue(self.site_out.is_active)

    def test_add_unknown_site_returns_404(self):
        self.client.force_login(self.admin_user)
        resp = self.client.post(
            f'/admin/navigation/category/{self.category.id}/site-add/',
            data={'site_id': 999999},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 404)

    def test_remove_hides_site_but_keeps_category(self):
        self.client.force_login(self.admin_user)
        resp = self.client.post(
            f'/admin/navigation/category/{self.category.id}/site-remove/',
            data={'site_id': self.site_in.id},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        self.site_in.refresh_from_db()
        self.assertFalse(self.site_in.is_active)
        self.assertEqual(self.site_in.category_id, self.category.id)

    def test_remove_site_from_other_category_rejected(self):
        self.client.force_login(self.admin_user)
        resp = self.client.post(
            f'/admin/navigation/category/{self.category.id}/site-remove/',
            data={'site_id': self.site_out.id},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_restore_reactivates_hidden_site(self):
        self.client.force_login(self.admin_user)
        resp = self.client.post(
            f'/admin/navigation/category/{self.category.id}/site-restore/',
            data={'site_id': self.site_hidden.id},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        self.site_hidden.refresh_from_db()
        self.assertTrue(self.site_hidden.is_active)

    def test_membership_views_require_login(self):
        resp = self.client.post(
            f'/admin/navigation/category/{self.category.id}/site-add/',
            data={'site_id': self.site_out.id},
            content_type='application/json',
        )
        self.assertIn(resp.status_code, (302, 403))
        self.site_out.refresh_from_db()
        self.assertEqual(self.site_out.category_id, self.other.id)


class AppPullServiceTestCase(TestCase):
    """流式下载进度回调与中断取消。"""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )

    def _site(self, **kwargs):
        defaults = {
            'name': 'Binance',
            'description': '交易所',
            'url': 'https://www.binance.com',
            'category': self.category,
            'sort_order': 1,
        }
        defaults.update(kwargs)
        return Site.objects.create(**defaults)

    def test_progress_callback_reports_bytes(self):
        from .services import stream_app_to_site

        media_root = tempfile.mkdtemp()
        payload = b'x' * (200 * 1024)  # > 单块
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = self._site(app_android_url='https://example.com/finnav.apk')
                seen = []
                with AppDownloadTestCase.mock_urlopen(payload) as (_urlopen_mock, _ssrf_mock):
                    stream_app_to_site(site, on_progress=lambda d, t: seen.append((d, t)))
                self.assertTrue(seen)
                # 最后一次回调等于已写大小
                self.assertEqual(seen[-1][0], len(payload))
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_cancel_stops_and_cleans_part(self):
        from .services import CancelRequested, stream_app_to_site

        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = self._site(app_android_url='https://example.com/finnav.apk')
                with AppDownloadTestCase.mock_urlopen(b'fake-apk') as (_urlopen_mock, _ssrf_mock):
                    with self.assertRaises(CancelRequested):
                        stream_app_to_site(site, should_cancel=lambda: True)
                # 中止后不残留 .part
                cache_dir = os.path.join(media_root, 'app_cache', str(site.id), 'android')
                leftovers = [f for f in os.listdir(cache_dir) if f.endswith('.part')]
                self.assertEqual(leftovers, [])
                site.refresh_from_db()
                self.assertIsNone(site.app_android_cached_at)
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_pull_state_defaults_and_cancel_idle(self):
        from . import services

        site = self._site()
        self.assertEqual(services.get_pull_state(site.id), {})
        # 空闲时取消返回 False
        self.assertFalse(services.cancel_pull(site.id))


class ParallelDownloadTestCase(TestCase):
    """Range 并行分片下载的正确性、取消清理与降级。"""

    class _Handler(BaseHTTPRequestHandler):
        payload = b''

        def do_GET(self):
            data = self.payload
            total = len(data)
            rng = self.headers.get('Range')
            m = re.match(r'bytes=(\d+)-(\d*)', rng) if rng else None
            if m:
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else total - 1
                part = data[start:end + 1]
                self.send_response(206)
                self.send_header('Content-Range', f'bytes {start}-{end}/{total}')
                self.send_header('Content-Length', str(len(part)))
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                self.wfile.write(part)
                return
            self.send_response(200)
            self.send_header('Content-Length', str(total))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format, *args):
            pass

    @classmethod
    def _server(cls, payload):
        cls._Handler.payload = payload
        server = ThreadingHTTPServer(('127.0.0.1', 0), cls._Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server

    def setUp(self):
        # 本地回环测试服务器绕过 SSRF 校验
        self._ssrf_patcher = mock.patch(
            'apps.navigation.services._ensure_public_host', return_value=None
        )
        self._ssrf_patcher.start()
        self.addCleanup(self._ssrf_patcher.stop)
        self.category = Category.objects.create(name='DeFi', slug='defi')
        self.media_root = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.media_root, ignore_errors=True)

    def _site(self, url):
        return Site.objects.create(
            name='Binance', url=url, category=self.category, sort_order=1,
            app_android_url=url,
        )

    def test_parallel_download_reassembles_identical_bytes(self):
        from .services import stream_app_to_site

        payload = os.urandom(3 * 1024 * 1024)
        server = self._server(payload)
        try:
            with override_settings(MEDIA_ROOT=self.media_root):
                site = self._site(
                    f'http://127.0.0.1:{server.server_port}/BNApp64.apk'
                )
                seen = []
                stream_app_to_site(site, on_progress=lambda d, t: seen.append((d, t)))
                site.refresh_from_db()
                self.assertEqual(site.app_android_size, len(payload))
                with open(site.app_android_file.path, 'rb') as f:
                    self.assertEqual(f.read(), payload)
            self.assertTrue(seen)
            self.assertEqual(seen[-1][0], len(payload))
        finally:
            server.shutdown()

    def test_parallel_cancel_cleans_parts(self):
        from .services import CancelRequested, stream_app_to_site

        server = self._server(os.urandom(3 * 1024 * 1024))
        try:
            with override_settings(MEDIA_ROOT=self.media_root):
                site = self._site(
                    f'http://127.0.0.1:{server.server_port}/BNApp64.apk'
                )
                with self.assertRaises(CancelRequested):
                    stream_app_to_site(site, should_cancel=lambda: True)
            cache_dir = os.path.join(
                self.media_root, 'app_cache', str(site.id), 'android'
            )
            leftovers = [
                f for f in os.listdir(cache_dir)
                if f.endswith('.part') or f.endswith('.final')
            ]
            self.assertEqual(leftovers, [])
            site.refresh_from_db()
            self.assertIsNone(site.app_android_cached_at)
        finally:
            server.shutdown()


class ResumeDownloadTestCase(TestCase):
    """真实浏览器请求头 + 跨次断点续传。"""

    class _Handler(BaseHTTPRequestHandler):
        payload = b''
        served = []
        seen_headers = []

        def do_GET(self):
            data = self.payload
            total = len(data)
            rng = self.headers.get('Range')
            self.seen_headers.append({
                'ua': self.headers.get('User-Agent'),
                'referer': self.headers.get('Referer'),
                'accept_encoding': self.headers.get('Accept-Encoding'),
                'range': rng,
            })
            if rng:
                m = re.match(r'bytes=(\d+)-(\d*)', rng)
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else total - 1
                part = data[start:end + 1]
                self.served.append(len(part))
                self.send_response(206)
                self.send_header('Content-Range', f'bytes {start}-{end}/{total}')
                self.send_header('Content-Length', str(len(part)))
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                self.wfile.write(part)
                return
            self.served.append(len(data))
            self.send_response(200)
            self.send_header('Content-Length', str(total))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format, *args):
            pass

    @classmethod
    def _server(cls, payload):
        cls._Handler.payload = payload
        cls._Handler.served = []
        cls._Handler.seen_headers = []
        server = ThreadingHTTPServer(('127.0.0.1', 0), cls._Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server

    def setUp(self):
        # 本地回环测试服务器绕过 SSRF 校验
        self._ssrf_patcher = mock.patch(
            'apps.navigation.services._ensure_public_host', return_value=None
        )
        self._ssrf_patcher.start()
        self.addCleanup(self._ssrf_patcher.stop)
        self.category = Category.objects.create(name='DeFi', slug='defi')
        self.media_root = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.media_root, ignore_errors=True)

    def _site(self, url):
        return Site.objects.create(
            name='Binance', url='https://www.binance.com', category=self.category,
            sort_order=1, app_android_url=url,
        )

    def test_headers_are_browser_like(self):
        from .services import _download_headers

        with override_settings(
            APP_CACHE_USER_AGENT='Mozilla/5.0 (Linux; Android 13) TestChrome',
        ):
            headers = _download_headers(referer='https://www.binance.com')
        self.assertTrue(headers['User-Agent'].startswith('Mozilla/5.0'))
        self.assertEqual(headers['Accept-Encoding'], 'identity')
        self.assertEqual(headers['Referer'], 'https://www.binance.com')

        with override_settings(APP_CACHE_ENABLE_REFERER=False):
            headers2 = _download_headers(referer='https://www.binance.com')
        self.assertNotIn('Referer', headers2)

    def test_resume_continues_from_manifest(self):
        import json

        import hashlib

        from apps.navigation import services

        payload = os.urandom(4 * 1024 * 1024)  # 4MB -> 动态并行，块大小 1MB
        server = self._server(payload)
        try:
            url = f'http://127.0.0.1:{server.server_port}/BNApp64.apk'
            with override_settings(MEDIA_ROOT=self.media_root):
                site = self._site(url)
                # 第一次完整下载
                services.stream_app_to_site(site)
                site.refresh_from_db()
                self.assertEqual(
                    site.app_android_sha256, hashlib.sha256(payload).hexdigest()
                )
                dest = site.app_android_file.path

                # 模拟一次中断：抹掉最后一个区块数据，并写一份标记该区块未完成的清单
                block_size = 1024 * 1024
                last_start = 3 * block_size
                with open(dest, 'r+b') as fh:
                    fh.seek(last_start)
                    fh.write(b'\x00' * block_size)
                manifest = {
                    'url': url,
                    'total': len(payload),
                    'blocks': [
                        {'start': i * block_size, 'end': (i + 1) * block_size,
                         'done': block_size}
                        for i in range(4)
                    ],
                }
                manifest['blocks'][3]['done'] = 0
                with open(dest + '.resume.json', 'w') as f:
                    json.dump(manifest, f)

                self._Handler.served = []
                self._Handler.seen_headers = []

                # 第二次：只补最后一个区块，不再重拉前面已完成的区块
                services.stream_app_to_site(site)
                site.refresh_from_db()
                with open(dest, 'rb') as f:
                    self.assertEqual(f.read(), payload)
                self.assertFalse(os.path.exists(dest + '.resume.json'))
                # 请求头仍为浏览器样式
                self.assertTrue(
                    self._Handler.seen_headers[0]['ua'].startswith('Mozilla')
                )
                self.assertEqual(
                    self._Handler.seen_headers[0]['accept_encoding'], 'identity'
                )
                # 只发起了探测与最后一个区块的下载，绝不回退到前面的区块
                range_starts = [
                    int(re.match(r'bytes=(\d+)-', h['range']).group(1))
                    for h in self._Handler.seen_headers
                    if h['range'] and h['range'] != 'bytes=0-0'
                ]
                self.assertTrue(range_starts)
                self.assertTrue(all(s >= last_start for s in range_starts))
        finally:
            server.shutdown()

    def test_cancel_persists_manifest_and_resumes(self):
        import hashlib

        from apps.navigation import services
        from .services import CancelRequested

        payload = os.urandom(4 * 1024 * 1024)  # 4MB -> 动态并行
        server = self._server(payload)
        try:
            url = f'http://127.0.0.1:{server.server_port}/BNApp64.apk'
            with override_settings(MEDIA_ROOT=self.media_root):
                site = self._site(url)
                cancel = [False]
                dest = os.path.join(
                    self.media_root, 'app_cache', str(site.id),
                    'android', 'BNApp64.apk',
                )
                resume_json = dest + '.resume.json'

                # 第一次：收到进度后立即取消 -> 保留部分文件 + 断点清单
                with self.assertRaises(CancelRequested):
                    services.stream_app_to_site(
                        site,
                        on_progress=lambda d, t: cancel.__setitem__(0, True),
                        should_cancel=lambda: cancel[0],
                    )
                self.assertTrue(os.path.exists(resume_json))
                site.refresh_from_db()
                self.assertIsNone(site.app_android_cached_at)  # 未完成不入库

                # 第二次：断点续传完成，文件完整且指纹正确
                services.stream_app_to_site(site)
                site.refresh_from_db()
                with open(dest, 'rb') as f:
                    self.assertEqual(f.read(), payload)
                self.assertEqual(
                    site.app_android_sha256,
                    hashlib.sha256(payload).hexdigest(),
                )
                self.assertFalse(os.path.exists(resume_json))
        finally:
            server.shutdown()


class LogoFetchTestCase(TestCase):
    """站点 logo 按需自动获取并缓存到本站。"""

    class _Handler(BaseHTTPRequestHandler):
        payload = b''

        def do_GET(self):
            data = self.payload
            self.send_response(200)
            self.send_header('Content-Type', 'image/x-icon')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format, *args):
            pass

    @classmethod
    def _server(cls, payload):
        cls._Handler.payload = payload
        server = ThreadingHTTPServer(('127.0.0.1', 0), cls._Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server

    def setUp(self):
        # 本地回环测试服务器绕过 SSRF 校验
        self._ssrf_patcher = mock.patch(
            'apps.navigation.services._ensure_public_host', return_value=None
        )
        self._ssrf_patcher.start()
        self.addCleanup(self._ssrf_patcher.stop)
        self.client = APIClient()
        self.category = Category.objects.create(name='DeFi', slug='defi')
        self.media_root = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.media_root, ignore_errors=True)

    def test_detail_triggers_fetch_and_caches_logo(self):
        from io import BytesIO

        from PIL import Image

        from .services import fetch_and_cache_logo

        # 生成一张合法的 PNG
        img = Image.new('RGB', (32, 32), (79, 70, 229))
        buf = BytesIO()
        img.save(buf, format='PNG')
        payload = buf.getvalue()

        base = tempfile.mkdtemp()
        media_root = tempfile.mkdtemp()
        try:
            server = self._server(payload)
            origin = f'http://127.0.0.1:{server.server_port}'
            try:
                with override_settings(MEDIA_ROOT=media_root):
                    site = Site.objects.create(
                        name='Fav', url=origin + '/', category=self.category,
                    )
                    url = fetch_and_cache_logo(site)
                    self.assertTrue(url)
                    site.refresh_from_db()
                    self.assertTrue(bool(site.logo))
                    self.assertIsNotNone(site.logo_fetched_at)
                    # 已缓存后应直接返回，不再触发网络
                    with mock.patch(
                        'apps.navigation.services._fetch_bytes'
                    ) as fb:
                        again = fetch_and_cache_logo(site)
                    self.assertEqual(again, url)
                    fb.assert_not_called()
            finally:
                server.shutdown()
        finally:
            shutil.rmtree(base, ignore_errors=True)
            shutil.rmtree(media_root, ignore_errors=True)

    class _NoIconHandler(BaseHTTPRequestHandler):
        """站点无图标：根路径返回空 HTML，其余一律 404。"""

        def do_GET(self):
            if self.path == '/':
                body = b'<html><body>no favicon</body></html>'
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_response(404)
            self.end_headers()

        def log_message(self, format, *args):
            pass

    class _ProviderHandler(BaseHTTPRequestHandler):
        payload = b''

        def do_GET(self):
            if self.path == '/icon.png':
                self.send_response(200)
                self.send_header('Content-Type', 'image/png')
                self.send_header('Content-Length', str(len(self.payload)))
                self.end_headers()
                self.wfile.write(self.payload)
                return
            self.send_response(404)
            self.end_headers()

        def log_message(self, format, *args):
            pass

    @staticmethod
    def _start(handler_cls, payload=b''):
        handler_cls.payload = payload
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler_cls)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server

    def test_provider_fallback_when_site_has_no_icon(self):
        from io import BytesIO

        from PIL import Image

        from .services import fetch_and_cache_logo

        img = Image.new('RGB', (32, 32), (220, 38, 38))
        buf = BytesIO()
        img.save(buf, format='PNG')
        payload = buf.getvalue()

        media_root = tempfile.mkdtemp()
        site_server = self._start(self._NoIconHandler)
        provider_server = self._start(self._ProviderHandler, payload)
        try:
            with override_settings(
                MEDIA_ROOT=media_root,
                SITE_LOGO_PROVIDERS=[
                    f'http://127.0.0.1:{provider_server.server_port}/icon.png'
                ],
            ):
                site = Site.objects.create(
                    name='NoIcon',
                    url=f'http://127.0.0.1:{site_server.server_port}/',
                    category=self.category,
                )
                url = fetch_and_cache_logo(site)
                self.assertTrue(url)
                site.refresh_from_db()
                self.assertTrue(bool(site.logo))
                self.assertIsNotNone(site.logo_fetched_at)
                # 站点自身无图标，缓存来自第三方兜底
                self.assertIn('/logos/logo-', url)
        finally:
            site_server.shutdown()
            provider_server.shutdown()
            shutil.rmtree(media_root, ignore_errors=True)

    def test_provider_disabled_raises_when_no_site_icon(self):
        from .services import LogoFetchError, fetch_and_cache_logo

        media_root = tempfile.mkdtemp()
        site_server = self._start(self._NoIconHandler)
        try:
            with override_settings(MEDIA_ROOT=media_root, SITE_LOGO_PROVIDERS=[]):
                site = Site.objects.create(
                    name='NoIcon',
                    url=f'http://127.0.0.1:{site_server.server_port}/',
                    category=self.category,
                )
                with self.assertRaises(LogoFetchError):
                    fetch_and_cache_logo(site)
                site.refresh_from_db()
                self.assertFalse(bool(site.logo))
                self.assertIsNone(site.logo_fetched_at)
        finally:
            site_server.shutdown()
            shutil.rmtree(media_root, ignore_errors=True)
        # 页面无 link，兜底 /favicon.ico，再走第三方图标服务
        from .services import _icon_candidates

        site = Site.objects.create(
            name='X', url='https://example.com/', category=self.category,
        )
        cands = _icon_candidates(site, html='<html><body>no icon</body></html>')
        self.assertEqual(
            cands,
            [
                'https://example.com/favicon.ico',
                'https://www.google.com/s2/favicons?domain=example.com&sz=64',
                'https://icons.duckduckgo.com/ip3/example.com.ico',
            ],
        )

    def test_icon_candidates_parse_link_rel(self):
        from .services import _icon_candidates

        site = Site.objects.create(
            name='X', url='https://example.com/', category=self.category,
        )
        html = '<link rel="icon" href="/static/favicon.png">'
        cands = _icon_candidates(site, html=html)
        self.assertEqual(
            cands,
            [
                'https://example.com/static/favicon.png',
                'https://example.com/favicon.ico',
                'https://www.google.com/s2/favicons?domain=example.com&sz=64',
                'https://icons.duckduckgo.com/ip3/example.com.ico',
            ],
        )

    def test_icon_candidates_providers_disabled(self):
        # SITE_LOGO_PROVIDERS=[] 时完全禁用第三方兜底
        from .services import _icon_candidates

        site = Site.objects.create(
            name='X', url='https://example.com/', category=self.category,
        )
        with override_settings(SITE_LOGO_PROVIDERS=[]):
            cands = _icon_candidates(site, html='<html></html>')
        self.assertEqual(cands, ['https://example.com/favicon.ico'])


class UserSyncTestCase(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='sync@example.com', email='sync@example.com', password='pw12345'
        )
        self.cat = Category.objects.create(name='DeFi', slug='defi')
        self.site = Site.objects.create(
            name='Uniswap', description='DEX', url='https://uniswap.org',
            category=self.cat,
        )
        self.client.force_authenticate(self.user)

    def _me(self):
        resp = self.client.get('/api/me/')
        self.assertEqual(resp.status_code, 200)
        return resp.json()

    def test_me_requires_auth(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/me/').status_code, 401)

    def test_me_initial_empty(self):
        data = self._me()
        self.assertEqual(data['email'], 'sync@example.com')
        self.assertEqual(data['favorites'], [])
        self.assertEqual(data['favorite_ids'], [])
        self.assertEqual(data['search_history'], [])

    def test_sync_favorites_replace(self):
        sid = self.site.id
        resp = self.client.put(
            '/api/me/favorites/',
            {'site_ids': [sid, sid, 999]},
            format='json',
        )
        # 999 无效：整体拒绝
        self.assertEqual(resp.status_code, 400)
        resp = self.client.put(
            '/api/me/favorites/', {'site_ids': [sid]}, format='json'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._me()['favorite_ids'], [sid])
        # favorites 应返回完整站点对象，便于新设备直接渲染列表
        me = self._me()
        self.assertEqual(me['favorites'][0]['name'], 'Uniswap')
        # 再次整体替换为空
        self.client.put('/api/me/favorites/', {'site_ids': []}, format='json')
        self.assertEqual(self._me()['favorite_ids'], [])

    def test_sync_search_history_replace_and_dedup(self):
        resp = self.client.put(
            '/api/me/search-history/',
            {'terms': ['钱包', '钱包', ' 交易所 ']},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            self._me()['search_history'], ['钱包', '交易所']
        )

    def test_sync_search_history_delete(self):
        self.client.put(
            '/api/me/search-history/', {'terms': ['a', 'b']}, format='json'
        )
        self.assertEqual(self.client.delete('/api/me/search-history/').status_code, 200)
        self.assertEqual(self._me()['search_history'], [])

    def test_me_isolated_between_users(self):
        other = User.objects.create_user(
            username='other@example.com', email='other@example.com', password='pw12345'
        )
        self.client.put('/api/me/search-history/', {'terms': ['mine']}, format='json')
        self.client.force_authenticate(other)
        self.assertEqual(self._me()['search_history'], [])


class LogoAsyncTestCase(TransactionTestCase):
    """详情页图标后台异步拉取：不阻塞请求、缓存就绪后二次返回、并发防重。

    使用 TransactionTestCase：后台线程走独立 DB 连接，需要数据已提交才能读取。
    """

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name='DeFi', slug='defi')
        self.site = Site.objects.create(
            name='Uniswap', url='https://uniswap.org', category=self.category,
        )

    def test_detail_does_not_block_on_logo_fetch(self):
        fetch_started = threading.Event()
        release = threading.Event()

        def slow_fetch(site):
            fetch_started.set()
            release.wait(5)

        with mock.patch(
            'apps.navigation.services.fetch_and_cache_logo', side_effect=slow_fetch
        ):
            result = {}

            def do_get():
                result['resp'] = self.client.get(f'/api/sites/{self.site.id}/')

            t = threading.Thread(target=do_get)
            t.start()
            # 后台拉取已启动且被阻塞
            self.assertTrue(fetch_started.wait(3), '后台图标拉取未启动')
            # 请求线程应立即返回，不会等待 fetch 完成
            t.join(2)
            self.assertFalse(t.is_alive(), '详情请求被 logo 拉取阻塞')
            self.assertEqual(result['resp'].status_code, 200)
            release.set()
            t.join(5)

    def test_logo_eventually_cached_and_served(self):
        import time

        from io import BytesIO

        from PIL import Image

        img = Image.new('RGB', (32, 32), (79, 70, 229))
        buf = BytesIO()
        img.save(buf, format='PNG')
        payload = buf.getvalue()

        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                # mock 需在后台 worker 调用 _fetch_bytes 期间保持生效，故轮询放在 with 内
                with mock.patch(
                    'apps.navigation.services._fetch_bytes',
                    return_value=(payload, 'image/png'),
                ):
                    resp = self.client.get(f'/api/sites/{self.site.id}/')
                    self.assertEqual(resp.status_code, 200)
                    deadline = time.time() + 5
                    self.site.refresh_from_db()
                    while not self.site.logo_fetched_at and time.time() < deadline:
                        time.sleep(0.05)
                        self.site.refresh_from_db()
                self.assertIsNotNone(self.site.logo_fetched_at)
                self.assertTrue(bool(self.site.logo))
                # 缓存就绪后，详情接口直接返回 logo
                resp2 = self.client.get(f'/api/sites/{self.site.id}/')
                self.assertEqual(resp2.status_code, 200)
                self.assertTrue(resp2.json()['logo'])
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_async_dedups_concurrent_requests(self):
        import time

        calls = []

        def slow_fetch(site):
            calls.append(site.id)
            time.sleep(0.3)

        with mock.patch(
            'apps.navigation.services.fetch_and_cache_logo', side_effect=slow_fetch
        ):
            r1 = self.client.get(f'/api/sites/{self.site.id}/')
            r2 = self.client.get(f'/api/sites/{self.site.id}/')
            self.assertEqual(r1.status_code, 200)
            self.assertEqual(r2.status_code, 200)
            # 等待后台拉取启动
            deadline = time.time() + 2
            while not calls and time.time() < deadline:
                time.sleep(0.05)
        time.sleep(0.5)  # 等后台线程结束
        self.assertEqual(len(calls), 1, '同一站点并发详情只应触发一次后台拉取')


class BackupRestoreTestCase(TestCase):
    """数据备份 / 恢复（backup.py + 管理命令）。"""

    def test_backup_archive_contains_json_and_media(self):
        from io import BytesIO

        from .backup import build_backup_archive

        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                logo_dir = os.path.join(media_root, 'logos')
                os.makedirs(logo_dir, exist_ok=True)
                with open(os.path.join(logo_dir, 'x.png'), 'wb') as fh:
                    fh.write(b'fake-logo')
                archive = build_backup_archive()
                raw = archive.read()
                self.assertGreater(len(raw), 0)
                import zipfile
                zf = zipfile.ZipFile(BytesIO(raw))
                names = zf.namelist()
                self.assertIn('data.json', names)
                self.assertIn('media/logos/x.png', names)
                self.assertEqual(zf.read('media/logos/x.png'), b'fake-logo')
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_restore_roundtrip(self):
        from io import BytesIO

        from .backup import build_backup_archive, restore_archive
        from .models import AppSetting, Category

        Category.objects.create(name='DeFi', slug='defi')
        AppSetting.get()
        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                os.makedirs(os.path.join(media_root, 'logos'), exist_ok=True)
                archive = build_backup_archive()
                raw = archive.read()
                # 破坏现有数据，验证能恢复
                Category.objects.all().delete()
                from .models import AppSetting
                AppSetting.objects.all().delete()
                from django.contrib.auth.models import User
                User.objects.filter(is_superuser=False).delete()

                stats = restore_archive(BytesIO(raw))
                self.assertEqual(stats['media_files'], 0)
                self.assertGreater(stats['data_bytes'], 0)
                self.assertTrue(Category.objects.filter(slug='defi').exists())
                self.assertTrue(AppSetting.objects.exists())
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_restore_rejects_bad_file(self):
        from io import BytesIO

        from django.core.management.base import CommandError

        from .backup import restore_archive

        with self.assertRaises(CommandError):
            restore_archive(BytesIO(b'not-a-zip'))

        bad = BytesIO()
        import zipfile as zf
        with zf.ZipFile(bad, 'w') as z:
            z.writestr('readme.txt', 'hello')
        bad.seek(0)
        with self.assertRaises(CommandError):
            restore_archive(bad)


class CaptchaTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        from .models import AppSetting

        self.setting = AppSetting.objects.create(
            require_email_verification=True, head_scripts='<script>var x=1;</script>'
        )

    def _captcha_token(self, answer='ABC1'):
        """写入一条已知答案的验证码，返回其 token。"""
        from .captcha import _hash
        from .models import Captcha
        from django.utils import timezone

        obj = Captcha.objects.create(
            token='tok-%s' % answer,
            answer_hash=_hash(answer),
            expires_at=timezone.now() + timezone.timedelta(minutes=5),
        )
        return obj.token

    def test_captcha_endpoint_returns_token_and_image(self):
        resp = self.client.get('/api/auth/captcha/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('token', data)
        self.assertTrue(data['image'].startswith('data:image/png;base64,'))

    def test_register_requires_captcha(self):
        resp = self.client.post(
            '/api/auth/register/',
            {'email': 'a@example.com', 'password': 'secret123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('captcha', resp.json())

    def test_register_with_wrong_captcha_rejected(self):
        token = self._captcha_token(answer='ABCD')
        resp = self.client.post(
            '/api/auth/register/',
            {
                'email': 'self@example.com',
                'password': 'secret123',
                'captcha_token': token,
                'captcha_answer': 'XXXX',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('captcha', resp.json())

    def test_register_with_valid_captcha_sends_code(self):
        from unittest import mock

        with mock.patch('apps.navigation.auth.send_mail', return_value=1) as send:
            token = self._captcha_token('WXYZ')
            resp = self.client.post(
                '/api/auth/register/',
                {
                    'email': 'self@example.com',
                    'password': 'secret123',
                    'captcha_token': token,
                    'captcha_answer': 'WXYZ',
                },
                format='json',
            )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(send.called)

    def test_register_when_verification_off_creates_user_directly(self):
        self.setting.require_email_verification = False
        self.setting.save()
        from unittest import mock

        with mock.patch('apps.navigation.auth.send_mail') as send:
            token = self._captcha_token('1234')
            resp = self.client.post(
                '/api/auth/register/',
                {
                    'email': 'direct@example.com',
                    'password': 'secret123',
                    'captcha_token': token,
                    'captcha_answer': '1234',
                },
                format='json',
            )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertIn('access', data)
        self.assertTrue(
            User.objects.filter(username='direct@example.com').exists()
        )
        self.assertFalse(send.called)

    def test_captcha_single_use(self):
        token = self._captcha_token('MNOP')
        body = lambda: self.client.post(  # noqa: E731
            '/api/auth/register/',
            {
                'email': 'once@example.com',
                'password': 'secret123',
                'captcha_token': token,
                'captcha_answer': 'MNOP',
            },
            format='json',
        )
        from unittest import mock

        with mock.patch('apps.navigation.auth.send_mail', return_value=1):
            self.assertEqual(body().status_code, 200)
        # 第二次使用同一验证码应失败
        with mock.patch('apps.navigation.auth.send_mail', return_value=1):
            self.assertEqual(body().status_code, 400)

    def test_login_requires_captcha(self):
        User.objects.create_user(
            username='log@example.com', email='log@example.com', password='secret123'
        )
        resp = self.client.post(
            '/api/auth/token/',
            {'email': 'log@example.com', 'password': 'secret123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('captcha', resp.json())

    def test_login_with_captcha_returns_tokens(self):
        User.objects.create_user(
            username='log@example.com', email='log@example.com', password='secret123'
        )
        token = self._captcha_token('QAZX')
        resp = self.client.post(
            '/api/auth/token/',
            {
                'email': 'log@example.com',
                'password': 'secret123',
                'captcha_token': token,
                'captcha_answer': 'QAZX',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.json())

    def test_settings_expose_new_fields(self):
        resp = self.client.get('/api/settings/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data['require_email_verification'])
        self.assertEqual(
            data['head_scripts'], '<script>var x=1;</script>'
        )


class TwoFactorAPITestCase(TestCase):
    """2FA：setup/confirm/status/disable/challenge + 登录 TOTP_REQUIRED 分支。"""

    def setUp(self):
        self.client = APIClient()
        from .models import AppSetting

        self.setting = AppSetting.objects.create()
        self.user = User.objects.create_user(
            username='tfa@example.com',
            email='tfa@example.com',
            password='secret123',
        )
        self.client.force_authenticate(self.user)

    def _captcha_token(self, answer='TFA1'):
        from .captcha import _hash
        from .models import Captcha
        from django.utils import timezone

        obj = Captcha.objects.create(
            token='tok-%s' % answer,
            answer_hash=_hash(answer),
            expires_at=timezone.now() + timezone.timedelta(minutes=5),
        )
        return obj.token

    def test_status_disabled_by_default(self):
        self.assertEqual(self.client.get('/api/auth/twofa/status/').json(), {'enabled': False})

    def test_setup_returns_secret_and_qr(self):
        data = self.client.get('/api/auth/twofa/setup/').json()
        self.assertFalse(data['enabled'])
        self.assertTrue(data['secret'])
        self.assertTrue(data['otpauth_url'].startswith('otpauth://'))
        self.assertTrue(data['qr'].startswith('data:image/png;base64,'))

    def test_confirm_enables_twofa(self):
        import pyotp

        secret = self.client.get('/api/auth/twofa/setup/').json()['secret']
        code = pyotp.TOTP(secret).now()
        resp = self.client.post(
            '/api/auth/twofa/confirm/', {'code': code}, format='json'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'enabled': True})
        self.assertTrue(TwoFactor.objects.get(user=self.user).enabled)

    def test_confirm_rejects_bad_code(self):
        import pyotp

        secret = self.client.get('/api/auth/twofa/setup/').json()['secret']
        # 使用一个必然错误（与实际差一位）
        real = pyotp.TOTP(secret).now()
        bad = str((int(real) + 1) % 1_000_000).zfill(6)
        resp = self.client.post(
            '/api/auth/twofa/confirm/', {'code': bad}, format='json'
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(TwoFactor.objects.get(user=self.user).enabled)

    def test_disable_requires_valid_code(self):
        import pyotp

        secret = self.client.get('/api/auth/twofa/setup/').json()['secret']
        code = pyotp.TOTP(secret).now()
        self.client.post('/api/auth/twofa/confirm/', {'code': code}, format='json')
        resp = self.client.post(
            '/api/auth/twofa/disable/', {'code': code}, format='json'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'enabled': False})
        self.assertFalse(TwoFactor.objects.get(user=self.user).enabled)

    def test_login_requires_totp_when_enabled(self):
        import pyotp

        # 启用 2FA + 全局开关
        from .models import AppSetting

        secret = self.client.get('/api/auth/twofa/setup/').json()['secret']
        self.client.post(
            '/api/auth/twofa/confirm/', {'code': pyotp.TOTP(secret).now()}, format='json'
        )
        self.setting.twofa_enabled = True
        self.setting.save(update_fields=['twofa_enabled'])

        token = self._captcha_token('ABC1')
        resp = self.client.post(
            '/api/auth/token/',
            {
                'email': 'tfa@example.com',
                'password': 'secret123',
                'captcha_token': token,
                'captcha_answer': 'ABC1',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['code'], 'TOTP_REQUIRED')
        self.assertTrue(data['totp_token'])

        # 用正确动态码换正式 JWT（未携带已登录鉴权，证明挑战端点为公开接口）
        anon = APIClient()
        chal = anon.post(
            '/api/auth/twofa/challenge/',
            {'totp_token': data['totp_token'], 'code': pyotp.TOTP(secret).now()},
            format='json',
        )
        self.assertEqual(chal.status_code, 200)
        self.assertIn('access', chal.json())

    def test_challenge_rejects_wrong_code(self):
        import pyotp

        secret = self.client.get('/api/auth/twofa/setup/').json()['secret']
        self.client.post(
            '/api/auth/twofa/confirm/', {'code': pyotp.TOTP(secret).now()}, format='json'
        )
        self.setting.twofa_enabled = True
        self.setting.save(update_fields=['twofa_enabled'])
        token = self._captcha_token('ABC1')
        login = self.client.post(
            '/api/auth/token/',
            {
                'email': 'tfa@example.com',
                'password': 'secret123',
                'captcha_token': token,
                'captcha_answer': 'ABC1',
            },
            format='json',
        ).json()
        real = pyotp.TOTP(secret).now()
        bad = str((int(real) + 1) % 1_000_000).zfill(6)
        resp = self.client.post(
            '/api/auth/twofa/challenge/',
            {'totp_token': login['totp_token'], 'code': bad},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)


class DownloadCountTestCase(TestCase):
    """POST /api/sites/{id}/download/ 计数 + AppDownload 落库。"""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )
        self.site = Site.objects.create(
            name='Uniswap',
            description='DEX',
            url='https://uniswap.org',
            category=self.category,
            sort_order=1,
            download_count=5,
        )

    def test_download_increments_count_and_logs(self):
        resp = self.client.post(
            f'/api/sites/{self.site.pk}/download/',
            {'platform': 'android_cache'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['download_count'], 6)
        self.site.refresh_from_db()
        self.assertEqual(self.site.download_count, 6)
        self.assertEqual(AppDownload.objects.count(), 1)
        dl = AppDownload.objects.get()
        self.assertEqual(dl.platform, 'android_cache')
        self.assertEqual(dl.site_id, self.site.pk)

    def test_download_unknown_platform_rejected(self):
        resp = self.client.post(
            f'/api/sites/{self.site.pk}/download/',
            {'platform': 'nonsense'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(AppDownload.objects.count(), 0)


class SiteSubmissionAPITestCase(TestCase):
    """用户提交站点 + 审核通过自动建站。"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='sub@example.com',
            email='sub@example.com',
            password='secret123',
        )
        self.category = Category.objects.create(
            name='Tools', slug='tools', icon='🔧', sort_order=1
        )
        self.site = Site.objects.create(
            name='Existing',
            url='https://existing.com',
            category=self.category,
            sort_order=9,
        )

    def test_unauthenticated_cannot_submit(self):
        resp = self.client.post(
            '/api/site-submissions/',
            {'name': 'x', 'url': 'https://x.com', 'category': self.category.pk},
            format='json',
        )
        self.assertEqual(resp.status_code, 401)

    def test_submit_creates_pending(self):
        self.client.force_authenticate(self.user)
        self.site.tags.set(_tags('tools'))
        _tags('tools', 'useful')  # 确保提交用的标签已存在
        resp = self.client.post(
            '/api/site-submissions/',
            {
                'name': 'NewTool',
                'url': 'https://newtool.com',
                'description': 'a tool',
                'category': self.category.pk,
                'tags': ['tools', 'useful'],
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data['status'], 'pending')

        s = SiteSubmission.objects.get()
        self.assertEqual(s.user, self.user)
        self.assertEqual(s.status, 'pending')
        self.assertEqual({t.name for t in s.tags.all()}, {'tools', 'useful'})

    def test_missing_url_rejected(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            '/api/site-submissions/',
            {'name': 'x', 'category': self.category.pk},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_build_site_on_approve(self):
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='NewSite',
            url='https://newsite.com',
            description='new',
            category=self.category,
        )
        sub.tags.set(_tags('alpha', 'beta'))
        site = sub.build_site()
        self.assertTrue(site.is_active)
        self.assertEqual(site.category, self.category)
        self.assertEqual(site.sort_order, 10)
        self.assertEqual({t.name for t in site.tags.all()}, {'alpha', 'beta'})
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'approved')
        self.assertEqual(sub.approved_site, site)

    def test_rejected_submission_can_be_deleted(self):
        self.client.force_authenticate(self.user)
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='RejectedSite',
            url='https://rejected.com',
            category=self.category,
            status=SiteSubmission.STATUS_REJECTED,
        )
        resp = self.client.delete(f'/api/site-submissions/{sub.pk}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(SiteSubmission.objects.filter(pk=sub.pk).exists())

    def test_pending_submission_not_deletable(self):
        self.client.force_authenticate(self.user)
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='PendingSite',
            url='https://pending.com',
            category=self.category,
        )
        resp = self.client.delete(f'/api/site-submissions/{sub.pk}/')
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(SiteSubmission.objects.filter(pk=sub.pk).exists())

    def test_approved_submission_not_deletable(self):
        self.client.force_authenticate(self.user)
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='ApprovedSite',
            url='https://approved.com',
            category=self.category,
            status=SiteSubmission.STATUS_APPROVED,
        )
        resp = self.client.delete(f'/api/site-submissions/{sub.pk}/')
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(SiteSubmission.objects.filter(pk=sub.pk).exists())

    def test_cannot_delete_other_users_submission(self):
        other = User.objects.create_user(
            username='other@example.com',
            email='other@example.com',
            password='secret123',
        )
        self.client.force_authenticate(other)
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='OtherSite',
            url='https://other.com',
            category=self.category,
            status=SiteSubmission.STATUS_REJECTED,
        )
        resp = self.client.delete(f'/api/site-submissions/{sub.pk}/')
        self.assertEqual(resp.status_code, 404)
        self.assertTrue(SiteSubmission.objects.filter(pk=sub.pk).exists())

    def test_rejected_submission_can_be_updated(self):
        from django.utils import timezone

        self.client.force_authenticate(self.user)
        self.site.tags.set(_tags('tools'))
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='RejectedSite',
            url='https://rejected.com',
            description='old',
            category=self.category,
            status=SiteSubmission.STATUS_REJECTED,
            reviewed_at=timezone.now(),
        )
        resp = self.client.put(
            f'/api/site-submissions/{sub.pk}/',
            {
                'name': 'FixedSite',
                'url': 'https://fixed.com',
                'description': 'new',
                'category': self.category.pk,
                'tags': ['tools'],
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['status'], 'pending')
        self.assertEqual(data['name'], 'FixedSite')
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'pending')
        self.assertIsNone(sub.reviewed_at)
        self.assertEqual(list(sub.tags.values_list('name', flat=True)), ['tools'])

    def test_pending_submission_not_editable(self):
        self.client.force_authenticate(self.user)
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='PendingSite',
            url='https://pending.com',
            category=self.category,
        )
        resp = self.client.put(
            f'/api/site-submissions/{sub.pk}/',
            {
                'name': 'Changed',
                'url': 'https://changed.com',
                'category': self.category.pk,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SiteSubmission.STATUS_PENDING)
        self.assertEqual(sub.name, 'PendingSite')


class SiteSubmissionAdminActionsTestCase(TestCase):
    """后台「站点提交/审核」的通过/驳回动作（回归：驳回不得因 update_fields 报错）。"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='secret123',
            is_staff=True,
            is_superuser=True,
        )
        self.category = Category.objects.create(
            name='Tools', slug='tools', icon='🔧', sort_order=1
        )
        self.client.force_login(self.user)

    def test_submit_reject_returns_302_and_saves_status(self):
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='X',
            url='https://x.example.com',
            category=self.category,
        )
        resp = self.client.post(
            f'/admin/navigation/sitesubmission/{sub.pk}/reject/',
            data='{"note":"重复提交"}',
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 302)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SiteSubmission.STATUS_REJECTED)
        self.assertEqual(sub.admin_note, '重复提交')

    def test_submit_approve_builds_site(self):
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='NewSite',
            url='https://newsite.example.com',
            description='new',
            category=self.category,
        )
        resp = self.client.post(
            f'/admin/navigation/sitesubmission/{sub.pk}/approve/',
            data='{}',
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 302)
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'approved')
        self.assertIsNotNone(sub.approved_site)
        self.assertTrue(sub.approved_site.is_active)

    def test_status_field_readonly_in_admin_form(self):
        """状态只能通过通过/驳回按钮修改：普通保存无法直接置为 approved（防绕过 build_site）。"""
        sub = SiteSubmission.objects.create(
            user=self.user,
            name='NotApproved',
            url='https://notapproved.example.com',
            category=self.category,
        )
        resp = self.client.post(
            f'/admin/navigation/sitesubmission/{sub.pk}/change/',
            {
                'user': self.user.pk,
                'name': sub.name,
                'url': sub.url,
                'description': sub.description,
                'category': self.category.pk,
                'status': SiteSubmission.STATUS_APPROVED,
                '_save': '保存',
            },
        )
        self.assertEqual(resp.status_code, 302)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SiteSubmission.STATUS_PENDING)
        self.assertIsNone(sub.approved_site)


class AdminTwoFAConfigTestCase(TestCase):
    """后台管理员 2FA：登录门控 + 右上角自助配置页。"""

    def setUp(self):
        self.client = APIClient()
        from .models import AppSetting

        self.setting = AppSetting.objects.create()
        self.user = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='secret123',
            is_staff=True,
            is_superuser=True,
        )

    def _enable_user_2fa(self):
        import pyotp

        TwoFactor.objects.create(
            user=self.user,
            secret=pyotp.random_base32(),
            enabled=True,
        )
        return TwoFactor.objects.get(user=self.user).secret

    def test_login_without_2fa_when_global_off(self):
        resp = self.client.post(
            '/admin/login/',
            {'username': 'admin', 'password': 'secret123'},
            follow=False,
        )
        # 全局开关未开启 → 直接登录成功并跳转
        self.assertEqual(resp.status_code, 302)

    def test_login_requires_totp_when_2fa_on(self):
        import pyotp

        secret = self._enable_user_2fa()
        self.setting.twofa_enabled = True
        self.setting.save(update_fields=['twofa_enabled'])

        # 不填动态码 → 登录失败，回登录页带错误
        resp = self.client.post(
            '/admin/login/',
            {'username': 'admin', 'password': 'secret123'},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn('动态验证码', resp.content.decode('utf-8'))

        # 填错误动态码 → 失败
        real = pyotp.TOTP(secret).now()
        bad = str((int(real) + 1) % 1_000_000).zfill(6)
        resp = self.client.post(
            '/admin/login/',
            {'username': 'admin', 'password': 'secret123', 'totp_code': bad},
        )
        self.assertEqual(resp.status_code, 200)

        # 填正确动态码 → 登录成功并跳转
        resp = self.client.post(
            '/admin/login/',
            {'username': 'admin', 'password': 'secret123', 'totp_code': real},
        )
        self.assertEqual(resp.status_code, 302)

    def test_login_ignores_totp_when_user_2fa_off(self):
        self.setting.twofa_enabled = True
        self.setting.save(update_fields=['twofa_enabled'])
        # 该管理员未启用 2FA → 即使全局开启也无需动态码
        resp = self.client.post(
            '/admin/login/',
            {'username': 'admin', 'password': 'secret123'},
        )
        self.assertEqual(resp.status_code, 302)

    def test_twofa_page_shows_setup_when_disabled(self):
        self.client.force_login(self.user)
        resp = self.client.get('/admin/twofa/')
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode('utf-8')
        self.assertIn('扫码或输入密钥', html)
        self.assertIn('未启用', html)

    def test_twofa_page_enable_and_login_gate(self):
        import pyotp

        self.client.force_login(self.user)
        # 页面 GET 生成密钥，随即启用
        first = self.client.get('/admin/twofa/')
        self.assertEqual(first.status_code, 200)
        secret = TwoFactor.objects.get(user=self.user).secret
        self.assertNotEqual(secret, '')

        real = pyotp.TOTP(secret).now()
        enable = self.client.post('/admin/twofa/', {'action': 'enable', 'code': real})
        self.assertEqual(enable.status_code, 302)
        self.assertTrue(TwoFactor.objects.get(user=self.user).enabled)

        # 已启用后页面显示停用入口
        shown = self.client.get('/admin/twofa/')
        self.assertIn('停用', shown.content.decode('utf-8'))

        # 全局开关开启 → 登录需要动态码
        self.setting.twofa_enabled = True
        self.setting.save(update_fields=['twofa_enabled'])
        self.client.logout()
        resp = self.client.post(
            '/admin/login/',
            {'username': 'admin', 'password': 'secret123'},
        )
        self.assertEqual(resp.status_code, 200)
        resp = self.client.post(
            '/admin/login/',
            {'username': 'admin', 'password': 'secret123', 'totp_code': pyotp.TOTP(secret).now()},
        )
        self.assertEqual(resp.status_code, 302)

    def test_twofa_page_disable_requires_valid_code(self):
        import pyotp

        secret = self._enable_user_2fa()
        self.client.force_login(self.user)

        bad = str((int(pyotp.TOTP(secret).now()) + 1) % 1_000_000).zfill(6)
        resp = self.client.post('/admin/twofa/', {'action': 'disable', 'code': bad})
        self.assertEqual(resp.status_code, 302)
        self.assertTrue(TwoFactor.objects.get(user=self.user).enabled)

        resp = self.client.post(
            '/admin/twofa/', {'action': 'disable', 'code': pyotp.TOTP(secret).now()}
        )
        self.assertEqual(resp.status_code, 302)
        self.assertFalse(TwoFactor.objects.get(user=self.user).enabled)


class SiteTutorialTestCase(TestCase):
    """用户分享教程：创建自动抓标题、列表/top 排序、点击计数、删除申请审核。"""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )
        self.site = Site.objects.create(
            name='Uniswap',
            description='去中心化交易所',
            url='https://uniswap.org',
            category=self.category,
            sort_order=1,
        )
        self.user = User.objects.create_user(
            username='u1@example.com', email='u1@example.com', password='p'
        )
        self.other = User.objects.create_user(
            username='u2@example.com', email='u2@example.com', password='p'
        )

    def _tutorial(self, tutorial_type, url, view_count=0, user=None, **kwargs):
        kwargs.setdefault('status', SiteTutorial.STATUS_APPROVED)
        return SiteTutorial.objects.create(
            site=self.site,
            user=user or self.user,
            type=tutorial_type,
            url=url,
            title='T',
            view_count=view_count,
            **kwargs,
        )

    def test_create_requires_auth(self):
        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/',
            {'type': 'text', 'url': 'https://example.com/guide'},
            format='json',
        )
        self.assertEqual(resp.status_code, 401)

    def test_create_fetches_title_automatically(self):
        self.client.force_authenticate(self.user)
        with mock.patch(
            'apps.navigation.services.fetch_page_title',
            return_value='从零开始使用 Uniswap',
        ) as fetch:
            resp = self.client.post(
                f'/api/sites/{self.site.id}/tutorials/',
                {'type': 'video', 'url': 'https://example.com/watch?v=1'},
                format='json',
            )
        fetch.assert_called_once_with('https://example.com/watch?v=1')
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data['title'], '从零开始使用 Uniswap')
        self.assertEqual(data['type'], 'video')
        self.assertEqual(data['status'], 'pending')
        self.assertTrue(data['is_mine'])
        self.assertFalse(data['can_delete'])
        self.assertFalse(data['delete_pending'])

    def test_create_uses_manual_title_over_auto(self):
        self.client.force_authenticate(self.user)
        with mock.patch(
            'apps.navigation.services.fetch_page_title',
            return_value='自动抓取的标题',
        ) as fetch:
            resp = self.client.post(
                f'/api/sites/{self.site.id}/tutorials/',
                {
                    'type': 'text',
                    'url': 'https://example.com/manual',
                    'title': '  手动填写的标题  ',
                },
                format='json',
            )
        fetch.assert_not_called()
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()['title'], '手动填写的标题')

    def test_create_ignores_blank_manual_title(self):
        self.client.force_authenticate(self.user)
        with mock.patch(
            'apps.navigation.services.fetch_page_title',
            return_value='自动抓取的标题',
        ) as fetch:
            resp = self.client.post(
                f'/api/sites/{self.site.id}/tutorials/',
                {
                    'type': 'text',
                    'url': 'https://example.com/blank',
                    'title': '   ',
                },
                format='json',
            )
        fetch.assert_called_once_with('https://example.com/blank')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()['title'], '自动抓取的标题')

    def test_title_preview_requires_auth(self):
        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/title/',
            {'url': 'https://example.com/x'},
            format='json',
        )
        self.assertEqual(resp.status_code, 401)

    def test_title_preview_returns_title(self):
        self.client.force_authenticate(self.user)
        with mock.patch(
            'apps.navigation.services.fetch_page_title_info',
            return_value=('抓取到的标题', False),
        ) as fetch:
            resp = self.client.post(
                f'/api/sites/{self.site.id}/tutorials/title/',
                {'url': 'https://example.com/preview'},
                format='json',
            )
        fetch.assert_called_once_with('https://example.com/preview')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['title'], '抓取到的标题')
        self.assertFalse(resp.json()['fallback'])

    def test_title_preview_marks_fallback(self):
        self.client.force_authenticate(self.user)
        with mock.patch(
            'apps.navigation.services.fetch_page_title_info',
            return_value=('example.com', True),
        ):
            resp = self.client.post(
                f'/api/sites/{self.site.id}/tutorials/title/',
                {'url': 'https://example.com/blocked'},
                format='json',
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['title'], 'example.com')
        self.assertTrue(resp.json()['fallback'])

    def test_title_preview_rejects_bad_url(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/title/',
            {'url': 'not-a-url'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_create_rejects_bad_type_and_url(self):
        self.client.force_authenticate(self.user)
        bad_type = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/',
            {'type': 'book', 'url': 'https://example.com/a'},
            format='json',
        )
        self.assertEqual(bad_type.status_code, 400)

        bad_url = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/',
            {'type': 'text', 'url': 'ftp://example.com/a'},
            format='json',
        )
        self.assertEqual(bad_url.status_code, 400)

        missing = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/',
            {'type': 'text', 'url': ''},
            format='json',
        )
        self.assertEqual(missing.status_code, 400)

    def test_list_ordered_by_views_and_filter_by_type(self):
        low = self._tutorial('text', 'https://a.example.com', view_count=1)
        high = self._tutorial('text', 'https://b.example.com', view_count=99)
        video = self._tutorial('video', 'https://c.example.com', view_count=50)

        resp = self.client.get(f'/api/sites/{self.site.id}/tutorials/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['count'], 3)
        ids = [r['id'] for r in data['results']]
        self.assertEqual(ids, [high.id, video.id, low.id])

        resp = self.client.get(
            f'/api/sites/{self.site.id}/tutorials/', {'type': 'video'}
        )
        self.assertEqual(resp.json()['count'], 1)

    def test_list_keeps_delete_pending_visible(self):
        self._tutorial('text', 'https://a.example.com', delete_pending=True)
        self._tutorial('text', 'https://b.example.com')
        resp = self.client.get(f'/api/sites/{self.site.id}/tutorials/')
        self.assertEqual(resp.json()['count'], 2)

    def test_list_excludes_unapproved_and_rejected(self):
        self._tutorial('text', 'https://p.example.com', status=SiteTutorial.STATUS_PENDING)
        self._tutorial('text', 'https://r.example.com', status=SiteTutorial.STATUS_REJECTED)
        self._tutorial('text', 'https://ok.example.com')
        resp = self.client.get(f'/api/sites/{self.site.id}/tutorials/')
        items = resp.json()['results']
        self.assertEqual(len(items), 1)
        self.assertEqual([r['url'] for r in items], ['https://ok.example.com'])

    def test_owner_sees_own_pending_and_rejected(self):
        self._tutorial(
            'text', 'https://p.example.com',
            user=self.user, status=SiteTutorial.STATUS_PENDING,
        )
        self._tutorial(
            'text', 'https://r.example.com',
            user=self.user, status=SiteTutorial.STATUS_REJECTED,
        )
        self.client.force_authenticate(self.user)
        resp = self.client.get(f'/api/sites/{self.site.id}/tutorials/')
        urls = [r['url'] for r in resp.json()['results']]
        self.assertEqual(
            sorted(urls), ['https://p.example.com', 'https://r.example.com']
        )

    def test_other_user_does_not_see_unapproved(self):
        self._tutorial(
            'text', 'https://p.example.com', status=SiteTutorial.STATUS_PENDING
        )
        self.client.force_authenticate(self.other)
        resp = self.client.get(f'/api/sites/{self.site.id}/tutorials/')
        self.assertEqual(resp.json()['count'], 0)

    def test_top_only_includes_approved(self):
        self._tutorial('text', 'https://p.example.com', status=SiteTutorial.STATUS_PENDING)
        self._tutorial('text', 'https://ok.example.com')
        resp = self.client.get(f'/api/sites/{self.site.id}/tutorials/top/')
        self.assertEqual([r['url'] for r in resp.json()['text']], ['https://ok.example.com'])

    def test_top_returns_per_type_top_ten(self):
        for i in range(12):
            self._tutorial('text', f'https://t{i}.example.com', view_count=i)
        self._tutorial('video', 'https://v.example.com', view_count=5)
        resp = self.client.get(f'/api/sites/{self.site.id}/tutorials/top/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data['text']), 10)
        self.assertEqual(len(data['video']), 1)
        self.assertEqual(len(data['agent']), 0)
        # 按访问量倒序
        counts = [r['view_count'] for r in data['text']]
        self.assertEqual(counts, sorted(counts, reverse=True))
        self.assertEqual(counts[0], 11)

    def test_visit_increments_view_count(self):
        t = self._tutorial('text', 'https://a.example.com', view_count=7)
        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/visit/'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['view_count'], 8)
        t.refresh_from_db()
        self.assertEqual(t.view_count, 8)

    def test_delete_request_requires_owner(self):
        t = self._tutorial('text', 'https://a.example.com', user=self.user)
        self.client.force_authenticate(self.other)
        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/delete-request/'
        )
        self.assertEqual(resp.status_code, 403)

    def test_delete_request_rejected_for_pending_publish(self):
        t = self._tutorial(
            'text', 'https://p.example.com', status=SiteTutorial.STATUS_PENDING
        )
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/delete-request/'
        )
        self.assertEqual(resp.status_code, 400)
        t.refresh_from_db()
        self.assertFalse(t.delete_pending)

    def test_rejected_tutorial_can_be_deleted_directly(self):
        t = self._tutorial(
            'text', 'https://r.example.com', status=SiteTutorial.STATUS_REJECTED
        )
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/delete-request/'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()['deleted'])
        self.assertFalse(SiteTutorial.objects.filter(pk=t.pk).exists())

    def test_rejected_tutorial_delete_requires_owner(self):
        t = self._tutorial(
            'text', 'https://r.example.com', status=SiteTutorial.STATUS_REJECTED
        )
        self.client.force_authenticate(self.other)
        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/delete-request/'
        )
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(SiteTutorial.objects.filter(pk=t.pk).exists())

    def test_admin_actions_approve_and_reject_publish(self):
        from django.contrib.messages.storage.fallback import FallbackStorage
        from django.contrib.sessions.backends.db import SessionStore
        from django.http import HttpRequest

        from apps.navigation.admin import SiteTutorialAdmin

        admin = SiteTutorialAdmin(SiteTutorial, None)

        def make_request():
            request = HttpRequest()
            request.META['SERVER_NAME'] = 'testserver'
            request.META['SERVER_PORT'] = '80'
            request.session = SessionStore()
            request._messages = FallbackStorage(request)
            return request

        pending = self._tutorial(
            'text', 'https://p.example.com', status=SiteTutorial.STATUS_PENDING
        )
        admin.approve_publish(make_request(), SiteTutorial.objects.filter(pk=pending.pk))
        pending.refresh_from_db()
        self.assertEqual(pending.status, SiteTutorial.STATUS_APPROVED)

        pending2 = self._tutorial(
            'text', 'https://q.example.com', status=SiteTutorial.STATUS_PENDING
        )
        admin.reject_publish(make_request(), SiteTutorial.objects.filter(pk=pending2.pk))
        pending2.refresh_from_db()
        self.assertEqual(pending2.status, SiteTutorial.STATUS_REJECTED)

    def test_delete_request_keeps_visible_until_review(self):
        t = self._tutorial('text', 'https://a.example.com', user=self.user)
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/delete-request/'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()['delete_pending'])

        t.refresh_from_db()
        self.assertTrue(t.delete_pending)
        listed = self.client.get(f'/api/sites/{self.site.id}/tutorials/')
        self.assertEqual(listed.json()['count'], 1)

        resp = self.client.post(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/delete-cancel/'
        )
        self.assertFalse(resp.json()['delete_pending'])
        t.refresh_from_db()
        self.assertFalse(t.delete_pending)
        listed = self.client.get(f'/api/sites/{self.site.id}/tutorials/')
        self.assertEqual(listed.json()['count'], 1)

    def test_anonymous_reads_mask_username(self):
        t = self._tutorial('text', 'https://a.example.com', user=self.user)
        resp = self.client.get(f'/api/sites/{self.site.id}/tutorials/')
        item = resp.json()['results'][0]
        self.assertEqual(item['id'], t.id)
        self.assertEqual(item['username_masked'], 'u***@example.com')
        self.assertFalse(item['is_mine'])
        self.assertFalse(item['can_delete'])

    def test_rejected_tutorial_can_be_updated(self):
        t = self._tutorial(
            'text',
            'https://a.example.com',
            status=SiteTutorial.STATUS_REJECTED,
        )
        self.client.force_authenticate(self.user)
        resp = self.client.put(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/',
            {'type': 'video', 'url': 'https://example.com/watch?v=2', 'title': '新标题'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['status'], 'pending')
        self.assertEqual(data['type'], 'video')
        self.assertEqual(data['title'], '新标题')
        t.refresh_from_db()
        self.assertEqual(t.status, SiteTutorial.STATUS_PENDING)

    def test_pending_tutorial_not_editable(self):
        t = self._tutorial(
            'text', 'https://a.example.com', status=SiteTutorial.STATUS_PENDING
        )
        self.client.force_authenticate(self.user)
        resp = self.client.put(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/',
            {'type': 'video', 'url': 'https://example.com/watch?v=2', 'title': '新标题'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        t.refresh_from_db()
        self.assertEqual(t.status, SiteTutorial.STATUS_PENDING)

    def test_tutorial_update_requires_owner(self):
        t = self._tutorial(
            'text',
            'https://a.example.com',
            status=SiteTutorial.STATUS_REJECTED,
        )
        self.client.force_authenticate(self.other)
        resp = self.client.put(
            f'/api/sites/{self.site.id}/tutorials/{t.id}/',
            {'type': 'video', 'url': 'https://example.com/watch?v=2', 'title': '新标题'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        t.refresh_from_db()
        self.assertEqual(t.status, SiteTutorial.STATUS_REJECTED)


class FetchPageTitleTestCase(TestCase):
    """fetch_page_title_info：真实解析逻辑（mock 传输层 requests.get）。"""

    @staticmethod
    def _fake_resp(content=b'', status_code=200, headers=None):
        class _FakeResp:
            def __init__(self):
                self.status_code = status_code
                self.headers = headers or {}
                self.content = content

            def iter_content(self, chunk_size):
                for i in range(0, len(self.content), chunk_size):
                    yield self.content[i:i + chunk_size]

            def close(self):
                pass

        return _FakeResp()

    def _fetch(self, url, resp=None, exc=None):
        with mock.patch('apps.navigation.services.requests.get') as get, \
                mock.patch('apps.navigation.services._ensure_public_host'):
            if exc is not None:
                get.side_effect = exc
            elif resp is not None:
                get.return_value = resp
            return fetch_page_title_info(url)

    def test_prefers_html_title(self):
        html = '<html><head><title>从零开始使用 Uniswap</title></head><body></body></html>'
        title, fallback = self._fetch(
            'https://example.com/a', self._fake_resp(html.encode('utf-8'))
        )
        self.assertEqual(title, '从零开始使用 Uniswap')
        self.assertFalse(fallback)

    def test_og_title_attribute_order_independent(self):
        # content 在 property 之前、单引号，旧正则无法匹配的场景
        html = (
            "<html><head>"
            "<meta content='Uniswap 教程' property='og:title'>"
            "</head><body></body></html>"
        )
        title, fallback = self._fetch(
            'https://example.com/b', self._fake_resp(html.encode('utf-8'))
        )
        self.assertEqual(title, 'Uniswap 教程')
        self.assertFalse(fallback)

    def test_og_title_fallback_without_title_tag(self):
        html = (
            '<html><head>'
            '<meta name="twitter:title" content="推特标题">'
            '</head><body></body></html>'
        )
        title, fallback = self._fetch(
            'https://example.com/c', self._fake_resp(html.encode('utf-8'))
        )
        self.assertEqual(title, '推特标题')
        self.assertFalse(fallback)

    def test_gbk_page_decoded_via_header_charset(self):
        html = '<html><head><title>人民币汇率教程</title></head><body></body></html>'
        title, fallback = self._fetch(
            'https://example.com/d',
            self._fake_resp(
                html.encode('gbk'),
                headers={'Content-Type': 'text/html; charset=GBK'},
            ),
        )
        self.assertEqual(title, '人民币汇率教程')
        self.assertFalse(fallback)

    def test_gbk_page_decoded_via_fallback_without_header(self):
        html = '<html><head><title>如何获取标题的教程</title></head><body></body></html>'
        title, fallback = self._fetch(
            'https://example.com/e', self._fake_resp(html.encode('gbk'))
        )
        self.assertEqual(title, '如何获取标题的教程')
        self.assertFalse(fallback)

    def test_h1_fallback_when_no_meta_title(self):
        html = '<html><head></head><body><h1>  一级标题教程  </h1></body></html>'
        title, fallback = self._fetch(
            'https://example.com/f', self._fake_resp(html.encode('utf-8'))
        )
        self.assertEqual(title, '一级标题教程')
        self.assertFalse(fallback)

    def test_connection_error_returns_domain_fallback(self):
        title, fallback = self._fetch(
            'https://example.com/blocked', exc=ConnectionError('refused')
        )
        self.assertEqual(title, 'example.com')
        self.assertTrue(fallback)

    def test_http_error_status_returns_domain_fallback(self):
        title, fallback = self._fetch(
            'https://example.com/404', self._fake_resp(b'', status_code=404)
        )
        self.assertEqual(title, 'example.com')
        self.assertTrue(fallback)

    def test_invalid_scheme_returns_domain_fallback(self):
        title, fallback = self._fetch('ftp://example.com/a')
        self.assertEqual(title, 'example.com')
        self.assertTrue(fallback)

    def test_long_title_truncated(self):
        long_title = '长' * 250
        html = f'<html><head><title>{long_title}</title></head><body></body></html>'
        title, fallback = self._fetch(
            'https://example.com/g', self._fake_resp(html.encode('utf-8'))
        )
        self.assertEqual(len(title), 200)
        self.assertFalse(fallback)

    def test_strips_html_entities(self):
        html = (
            '<html><head>'
            '<title>DeFi &amp; 教程 &lt;入门&gt;</title>'
            '</head><body></body></html>'
        )
        title, fallback = self._fetch(
            'https://example.com/h', self._fake_resp(html.encode('utf-8'))
        )
        self.assertEqual(title, 'DeFi & 教程 <入门>')
        self.assertFalse(fallback)


class AppLinkSubmissionTestCase(TestCase):
    """用户提交 APP 下载链接：鉴权、平台校验、重复 pending、审核通过联动。"""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )
        self.site = Site.objects.create(
            name='Uniswap',
            description='去中心化交易所',
            url='https://uniswap.org',
            category=self.category,
            sort_order=1,
        )
        self.user = User.objects.create_user(
            username='u1@example.com', email='u1@example.com', password='p'
        )

    def _submit(self, platform='android', url='https://dl.example.com/app.apk'):
        return self.client.post(
            f'/api/sites/{self.site.id}/app-links/',
            {'platform': platform, 'url': url},
            format='json',
        )

    def test_post_requires_auth(self):
        resp = self._submit()
        self.assertEqual(resp.status_code, 401)

    def test_create_validates_platform_and_url(self):
        self.client.force_authenticate(self.user)
        bad_platform = self._submit(platform='windows')
        self.assertEqual(bad_platform.status_code, 400)
        bad_url = self._submit(url='not-a-url')
        self.assertEqual(bad_url.status_code, 400)

    def test_create_duplicate_pending_rejected(self):
        self.client.force_authenticate(self.user)
        first = self._submit()
        self.assertEqual(first.status_code, 201)
        dup = self._submit(url='https://dl.example.com/other.apk')
        self.assertEqual(dup.status_code, 400)

    def test_get_returns_own_submissions(self):
        self.client.force_authenticate(self.user)
        self._submit(platform='ios', url='https://apps.apple.com/app/1')
        other = User.objects.create_user(
            username='u2@example.com', email='u2@example.com', password='p'
        )
        self.client.force_authenticate(other)
        self._submit(platform='ios', url='https://apps.apple.com/app/2')

        self.client.force_authenticate(self.user)
        resp = self.client.get(f'/api/sites/{self.site.id}/app-links/')
        data = resp.json()
        self.assertEqual(data['count'], 1)
        self.assertEqual(len(data['results']), 1)
        self.assertEqual(data['results'][0]['status'], 'pending')
        self.assertEqual(data['results'][0]['platform'], 'ios')
        self.assertEqual(
            data['results'][0]['url'], 'https://apps.apple.com/app/1'
        )
        self.assertIn('created_at', data['results'][0])

    def test_get_paginated(self):
        self.client.force_authenticate(self.user)
        for i in range(12):
            # 每次提交需不同平台或先结束上一条 pending
            sub = self._submit(
                platform='android', url=f'https://dl.example.com/app{i}.apk'
            ).json()
            AppLinkSubmission.objects.filter(pk=sub['id']).update(
                status='approved',
                url=f'https://dl.example.com/app{i}.apk',
            )

        resp = self.client.get(f'/api/sites/{self.site.id}/app-links/')
        data = resp.json()
        self.assertEqual(data['count'], 12)
        self.assertEqual(len(data['results']), 10)
        self.assertIsNotNone(data['next'])

        resp2 = self.client.get(data['next'])
        data2 = resp2.json()
        self.assertEqual(data2['count'], 12)
        self.assertEqual(len(data2['results']), 2)
        self.assertIsNone(data2['next'])

    def test_approve_android_updates_site_and_starts_pull(self):
        self.client.force_authenticate(self.user)
        created = self._submit().json()
        submission = AppLinkSubmission.objects.get(pk=created['id'])
        with mock.patch('apps.navigation.services.start_pull') as start_pull:
            submission.approve()
        submission.refresh_from_db()
        self.assertEqual(submission.status, 'approved')
        self.site.refresh_from_db()
        self.assertEqual(
            self.site.app_android_url, 'https://dl.example.com/app.apk'
        )
        start_pull.assert_called_once_with(self.site.pk)

    def test_approve_ios_and_google_play(self):
        self.client.force_authenticate(self.user)
        ios = AppLinkSubmission.objects.get(
            pk=self._submit(platform='ios', url='https://apps.apple.com/app/x').json()['id']
        )
        ios.approve()
        self.site.refresh_from_db()
        self.assertEqual(self.site.app_ios_url, 'https://apps.apple.com/app/x')

        gp = AppLinkSubmission.objects.get(
            pk=self._submit(
                platform='google_play', url='https://play.google.com/store/apps/details?id=x'
            ).json()['id']
        )
        with mock.patch('apps.navigation.services.start_pull') as start_pull:
            gp.approve()
        self.site.refresh_from_db()
        self.assertEqual(
            self.site.app_google_play_url,
            'https://play.google.com/store/apps/details?id=x',
        )
        start_pull.assert_not_called()

    def test_reject_sets_status(self):
        from django.utils import timezone

        self.client.force_authenticate(self.user)
        submission = AppLinkSubmission.objects.get(
            pk=self._submit().json()['id']
        )
        submission.status = 'rejected'
        submission.admin_note = '链接不可用'
        submission.reviewed_at = timezone.now()
        submission.save(update_fields=['status', 'admin_note', 'reviewed_at'])
        submission.refresh_from_db()
        self.assertEqual(submission.status, 'rejected')
        self.assertEqual(submission.admin_note, '链接不可用')

    def test_duplicate_after_rejection_allowed(self):
        self.client.force_authenticate(self.user)
        first = AppLinkSubmission.objects.get(pk=self._submit().json()['id'])
        first.status = 'rejected'
        first.save(update_fields=['status'])
        resp = self._submit(url='https://dl.example.com/v2.apk')
        self.assertEqual(resp.status_code, 201)

    def test_rejected_app_link_can_be_deleted(self):
        self.client.force_authenticate(self.user)
        sub = AppLinkSubmission.objects.get(pk=self._submit().json()['id'])
        sub.status = 'rejected'
        sub.save(update_fields=['status'])
        resp = self.client.delete(
            f'/api/sites/{self.site.id}/app-links/{sub.pk}/'
        )
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(AppLinkSubmission.objects.filter(pk=sub.pk).exists())

    def test_pending_app_link_not_deletable(self):
        self.client.force_authenticate(self.user)
        sub = AppLinkSubmission.objects.get(pk=self._submit().json()['id'])
        resp = self.client.delete(
            f'/api/sites/{self.site.id}/app-links/{sub.pk}/'
        )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(AppLinkSubmission.objects.filter(pk=sub.pk).exists())

    def test_app_link_delete_requires_owner(self):
        other = User.objects.create_user(
            username='u2@example.com', email='u2@example.com', password='p'
        )
        self.client.force_authenticate(self.user)
        sub = AppLinkSubmission.objects.get(pk=self._submit().json()['id'])
        sub.status = 'rejected'
        sub.save(update_fields=['status'])
        self.client.force_authenticate(other)
        resp = self.client.delete(
            f'/api/sites/{self.site.id}/app-links/{sub.pk}/'
        )
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(AppLinkSubmission.objects.filter(pk=sub.pk).exists())

    def test_app_link_delete_requires_auth(self):
        sub = AppLinkSubmission.objects.create(
            user=self.user,
            site=self.site,
            platform='android',
            url='https://dl.example.com/app.apk',
            status='rejected',
        )
        resp = self.client.delete(
            f'/api/sites/{self.site.id}/app-links/{sub.pk}/'
        )
        self.assertEqual(resp.status_code, 401)
        self.assertTrue(AppLinkSubmission.objects.filter(pk=sub.pk).exists())

    def test_rejected_app_link_can_be_updated(self):
        from django.utils import timezone

        self.client.force_authenticate(self.user)
        sub = AppLinkSubmission.objects.get(pk=self._submit().json()['id'])
        sub.status = 'rejected'
        sub.reviewed_at = timezone.now()
        sub.save(update_fields=['status', 'reviewed_at'])
        resp = self.client.put(
            f'/api/sites/{self.site.id}/app-links/{sub.pk}/',
            {'platform': 'ios', 'url': 'https://apps.apple.com/app/new'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['status'], 'pending')
        self.assertEqual(data['platform'], 'ios')
        self.assertEqual(data['url'], 'https://apps.apple.com/app/new')
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'pending')
        self.assertIsNone(sub.reviewed_at)

    def test_pending_app_link_not_editable(self):
        self.client.force_authenticate(self.user)
        sub = AppLinkSubmission.objects.get(pk=self._submit().json()['id'])
        resp = self.client.put(
            f'/api/sites/{self.site.id}/app-links/{sub.pk}/',
            {'platform': 'ios', 'url': 'https://apps.apple.com/app/new'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'pending')

    def test_app_link_update_requires_owner(self):
        from django.utils import timezone

        other = User.objects.create_user(
            username='u2@example.com', email='u2@example.com', password='p'
        )
        self.client.force_authenticate(self.user)
        sub = AppLinkSubmission.objects.get(pk=self._submit().json()['id'])
        sub.status = 'rejected'
        sub.reviewed_at = timezone.now()
        sub.save(update_fields=['status', 'reviewed_at'])
        self.client.force_authenticate(other)
        resp = self.client.put(
            f'/api/sites/{self.site.id}/app-links/{sub.pk}/',
            {'platform': 'ios', 'url': 'https://apps.apple.com/app/new'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'rejected')


class ReviewCenterTestCase(TestCase):
    """后台「待审核」中心：计数接口 + 页面渲染 + 四类通过/驳回动作。"""

    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(
            name='DeFi', slug='defi', icon='🦄', sort_order=1
        )
        self.site = Site.objects.create(
            name='Uniswap',
            description='去中心化交易所',
            url='https://uniswap.org',
            category=self.category,
            sort_order=1,
        )
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='secret123',
            is_staff=True,
            is_superuser=True,
        )
        self.user = User.objects.create_user(
            username='u1@example.com', email='u1@example.com', password='p'
        )

    def _pending_site_submission(self, **kwargs):
        kwargs.setdefault('name', 'NewSite')
        kwargs.setdefault('url', 'https://newsite.example.com')
        kwargs.setdefault('description', 'desc')
        kwargs.setdefault('category', self.category)
        return SiteSubmission.objects.create(user=self.user, **kwargs)

    def _pending_tutorial(self, **kwargs):
        kwargs.setdefault('status', SiteTutorial.STATUS_PENDING)
        return SiteTutorial.objects.create(
            site=self.site,
            user=self.user,
            type='text',
            url='https://example.com/guide',
            title='Tutorial',
            **kwargs,
        )

    def _pending_app_link(self, **kwargs):
        kwargs.setdefault('platform', 'android')
        kwargs.setdefault('url', 'https://dl.example.com/app.apk')
        return AppLinkSubmission.objects.create(
            user=self.user, site=self.site, **kwargs
        )

    def _post_action(self, model, pk, action, note=''):
        return self.client.post(
            '/admin/review/',
            {'model': model, 'id': pk, 'action': action, 'note': note, 'tab': 'sites'},
        )

    def test_count_endpoint_requires_staff(self):
        resp = self.client.get('/admin/review/count/')
        self.assertEqual(resp.status_code, 302)

    def test_count_endpoint_returns_totals(self):
        self._pending_site_submission()
        self._pending_tutorial()
        self._pending_tutorial(
            delete_pending=True, status=SiteTutorial.STATUS_APPROVED
        )
        self._pending_app_link()
        self.client.force_login(self.admin)
        resp = self.client.get('/admin/review/count/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['sites'], 1)
        self.assertEqual(data['tutorials'], 1)
        self.assertEqual(data['tutorial_deletes'], 1)
        self.assertEqual(data['app_links'], 1)
        self.assertEqual(data['total'], 4)

    def test_review_page_requires_staff(self):
        resp = self.client.get('/admin/review/')
        self.assertEqual(resp.status_code, 302)

    def test_review_page_renders_with_pending(self):
        sub = self._pending_site_submission()
        self.client.force_login(self.admin)
        resp = self.client.get('/admin/review/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, sub.name)
        self.assertContains(resp, '通过并创建')

    def test_approve_site_submission(self):
        sub = self._pending_site_submission()
        self.client.force_login(self.admin)
        with mock.patch('apps.navigation.services.ensure_logo_async'):
            resp = self._post_action('site', sub.pk, 'approve')
        self.assertEqual(resp.status_code, 302)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SiteSubmission.STATUS_APPROVED)
        self.assertIsNotNone(sub.approved_site)
        self.assertTrue(sub.approved_site.is_active)

    def test_reject_site_submission_with_note(self):
        sub = self._pending_site_submission()
        self.client.force_login(self.admin)
        resp = self._post_action('site', sub.pk, 'reject', note='重复提交')
        self.assertEqual(resp.status_code, 302)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SiteSubmission.STATUS_REJECTED)
        self.assertEqual(sub.admin_note, '重复提交')

    def test_approve_tutorial_publish(self):
        t = self._pending_tutorial()
        self.client.force_login(self.admin)
        resp = self._post_action('tutorial', t.pk, 'approve')
        self.assertEqual(resp.status_code, 302)
        t.refresh_from_db()
        self.assertEqual(t.status, SiteTutorial.STATUS_APPROVED)

    def test_reject_tutorial_publish(self):
        t = self._pending_tutorial()
        self.client.force_login(self.admin)
        resp = self._post_action('tutorial', t.pk, 'reject')
        self.assertEqual(resp.status_code, 302)
        t.refresh_from_db()
        self.assertEqual(t.status, SiteTutorial.STATUS_REJECTED)

    def test_approve_tutorial_delete(self):
        t = self._pending_tutorial(
            delete_pending=True, status=SiteTutorial.STATUS_APPROVED
        )
        self.client.force_login(self.admin)
        resp = self._post_action('tutorial_delete', t.pk, 'approve')
        self.assertEqual(resp.status_code, 302)
        self.assertFalse(SiteTutorial.objects.filter(pk=t.pk).exists())

    def test_reject_tutorial_delete(self):
        t = self._pending_tutorial(
            delete_pending=True, status=SiteTutorial.STATUS_APPROVED
        )
        self.client.force_login(self.admin)
        resp = self._post_action('tutorial_delete', t.pk, 'reject')
        self.assertEqual(resp.status_code, 302)
        t.refresh_from_db()
        self.assertFalse(t.delete_pending)
        self.assertIsNone(t.delete_requested_at)

    def test_approve_app_link(self):
        sub = self._pending_app_link()
        self.client.force_login(self.admin)
        with mock.patch('apps.navigation.services.start_pull') as start_pull:
            resp = self._post_action('app_link', sub.pk, 'approve')
        self.assertEqual(resp.status_code, 302)
        sub.refresh_from_db()
        self.assertEqual(sub.status, AppLinkSubmission.STATUS_APPROVED)
        self.site.refresh_from_db()
        self.assertEqual(
            self.site.app_android_url, 'https://dl.example.com/app.apk'
        )
        start_pull.assert_called_once_with(self.site.pk)

    def test_reject_app_link_with_note(self):
        sub = self._pending_app_link()
        self.client.force_login(self.admin)
        resp = self._post_action('app_link', sub.pk, 'reject', note='链接失效')
        self.assertEqual(resp.status_code, 302)
        sub.refresh_from_db()
        self.assertEqual(sub.status, AppLinkSubmission.STATUS_REJECTED)
        self.assertEqual(sub.admin_note, '链接失效')

    def test_action_idempotent_on_already_processed(self):
        sub = self._pending_site_submission()
        self.client.force_login(self.admin)
        with mock.patch('apps.navigation.services.ensure_logo_async'):
            self._post_action('site', sub.pk, 'approve')
        before = Site.objects.count()
        resp = self._post_action('site', sub.pk, 'approve')
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(Site.objects.count(), before)
        sub.refresh_from_db()
        self.assertEqual(sub.status, SiteSubmission.STATUS_APPROVED)


class SecurityRegressionTestCase(TestCase):
    """安全修复回归：zip-slip / SSRF / 2FA 防爆破 / 票据清理与限流 / 枚举防护。"""

    def setUp(self):
        from .models import AppSetting

        self.client = APIClient()
        self.setting = AppSetting.objects.create(require_email_verification=True)
        self.category = Category.objects.create(name='DeFi', slug='defi')

    def _captcha_token(self, answer='SECU'):
        from django.utils import timezone

        from .captcha import _hash
        from .models import Captcha

        obj = Captcha.objects.create(
            token='tok-%s' % answer,
            answer_hash=_hash(answer),
            expires_at=timezone.now() + timezone.timedelta(minutes=5),
        )
        return obj.token

    def _zip_with_media(self, media_entries):
        """构造含 data.json 与若干 media 条目的 zip 字节流。"""
        from io import BytesIO
        import zipfile as zf

        buf = BytesIO()
        with zf.ZipFile(buf, 'w') as z:
            z.writestr('data.json', '[]')
            for name, content in media_entries.items():
                z.writestr(name, content)
        buf.seek(0)
        return buf

    # ---------- zip-slip ----------

    def test_restore_rejects_path_traversal(self):
        from django.core.management.base import CommandError

        from .backup import restore_archive

        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                evil = self._zip_with_media({'media/../../evil.txt': b'pwned'})
                with self.assertRaises(CommandError):
                    restore_archive(evil)
                # 越界文件绝不能写盘
                self.assertFalse(
                    os.path.exists(os.path.join(os.path.dirname(media_root), 'evil.txt'))
                )
                # 合法媒体仍可正常恢复
                good = self._zip_with_media({'media/logos/ok.png': b'png'})
                stats = restore_archive(good)
                self.assertEqual(stats['media_files'], 1)
                self.assertTrue(
                    os.path.exists(os.path.join(media_root, 'logos', 'ok.png'))
                )
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_admin_backup_restore_post_rejects_traversal(self):
        from django.contrib.auth.models import User

        staff = User.objects.create_user(
            username='ops@example.com', email='ops@example.com',
            password='opspass123', is_staff=True,
        )
        self.client.force_login(staff)
        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                evil = self._zip_with_media({'media/../../evil2.txt': b'pwned'})
                resp = self.client.post(
                    '/admin/backup/',
                    {'action': 'restore', 'confirm': '1', 'backup_file': evil},
                )
                self.assertEqual(resp.status_code, 302)
                self.assertFalse(
                    os.path.exists(os.path.join(os.path.dirname(media_root), 'evil2.txt'))
                )
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_admin_backup_requires_staff(self):
        resp = self.client.get('/admin/backup/')
        self.assertIn(resp.status_code, (302, 403))

    # ---------- SSRF ----------

    def test_ensure_public_host_blocks_private_targets(self):
        from .services import SSRFBlocked, _ensure_public_host

        for url in (
            'http://127.0.0.1:8000/x',
            'http://10.0.0.1/',
            'http://172.16.5.5/',
            'http://192.168.1.1/',
            'http://169.254.169.254/latest/meta-data/',
            'http://[::1]/',
            'ftp://example.com/finnav.apk',
        ):
            with self.assertRaises(SSRFBlocked, msg=url):
                _ensure_public_host(url)

    def test_ensure_public_host_allows_public_literal_ip(self):
        from .services import _ensure_public_host

        # 公网字面量 IP，不依赖 DNS
        _ensure_public_host('https://8.8.8.8/')

    def test_fetch_page_title_falls_back_for_private_url(self):
        from .services import fetch_page_title_info

        with mock.patch('apps.navigation.services.requests.get') as get:
            title, fallback = fetch_page_title_info('http://127.0.0.1/x')
        self.assertTrue(fallback)
        get.assert_not_called()

    def test_redirect_to_private_url_blocked(self):
        from types import SimpleNamespace

        from .services import SSRFBlocked, _safe_requests_get

        redirect = SimpleNamespace(
            status_code=302,
            headers={'Location': 'http://127.0.0.1:8000/internal'},
            close=lambda: None,
        )
        with mock.patch('apps.navigation.services.requests.get', return_value=redirect):
            with self.assertRaises(SSRFBlocked):
                _safe_requests_get('https://8.8.8.8/dl/app.apk')

    def test_stream_app_blocks_private_url(self):
        from .services import AppPullError, stream_app_to_site

        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                site = Site.objects.create(
                    name='X', url='https://x.example.com', category=self.category,
                    sort_order=1,
                    app_android_url='http://169.254.169.254/latest/meta-data/',
                )
                with self.assertRaises(AppPullError):
                    stream_app_to_site(site)
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    # ---------- 2FA 防爆破 ----------

    def _enabled_tfa_user(self):
        import pyotp

        from .models import TwoFactor

        user = User.objects.create_user(
            username='tfa-sec@example.com', email='tfa-sec@example.com',
            password='secret123',
        )
        secret = pyotp.random_base32()
        TwoFactor.objects.create(user=user, secret=secret, enabled=True)
        self.setting.twofa_enabled = True
        self.setting.save(update_fields=['twofa_enabled'])
        return user, secret

    def test_twofa_challenge_locks_after_max_attempts(self):
        from .models import TOTPChallenge

        cache.clear()
        _, secret = self._enabled_tfa_user()
        token = self._captcha_token('SECA')
        login = self.client.post(
            '/api/auth/token/',
            {
                'email': 'tfa-sec@example.com', 'password': 'secret123',
                'captcha_token': token, 'captcha_answer': 'SECA',
            },
            format='json',
        ).json()
        self.assertEqual(login['code'], 'TOTP_REQUIRED')

        for i in range(TOTPChallenge.MAX_ATTEMPTS):
            resp = self.client.post(
                '/api/auth/twofa/challenge/',
                {'totp_token': login['totp_token'], 'code': '000000'},
                format='json',
            )
            self.assertEqual(resp.status_code, 400, f'第 {i + 1} 次应返回 400')

        # 超限后挑战作废，即使正确动态码也拒绝
        import pyotp

        resp = self.client.post(
            '/api/auth/twofa/challenge/',
            {'totp_token': login['totp_token'], 'code': pyotp.TOTP(secret).now()},
            format='json',
        )
        self.assertEqual(resp.status_code, 401)
        challenge = TOTPChallenge.objects.get(token=login['totp_token'])
        self.assertTrue(challenge.used)

    def test_twofa_challenge_throttled(self):
        cache.clear()
        self._enabled_tfa_user()
        token = self._captcha_token('SECB')
        login = self.client.post(
            '/api/auth/token/',
            {
                'email': 'tfa-sec@example.com', 'password': 'secret123',
                'captcha_token': token, 'captcha_answer': 'SECB',
            },
            format='json',
        ).json()
        for _ in range(10):
            resp = self.client.post(
                '/api/auth/twofa/challenge/',
                {'totp_token': login['totp_token'], 'code': '000000'},
                format='json',
            )
            self.assertNotEqual(resp.status_code, 429)
        resp = self.client.post(
            '/api/auth/twofa/challenge/',
            {'totp_token': login['totp_token'], 'code': '000000'},
            format='json',
        )
        self.assertEqual(resp.status_code, 429)

    # ---------- 票据清理与限流 ----------

    def test_captcha_create_cleans_expired_rows(self):
        from django.utils import timezone

        from .captcha import create_captcha
        from .models import Captcha

        old = Captcha.objects.create(
            token='expired-old', answer_hash='x' * 64,
            expires_at=timezone.now() - timezone.timedelta(days=2),
        )
        create_captcha(Captcha)
        self.assertFalse(Captcha.objects.filter(pk=old.pk).exists())

    def test_totp_create_cleans_expired_rows(self):
        from django.utils import timezone

        from .models import TOTPChallenge

        user = User.objects.create_user(
            username='clean@example.com', email='clean@example.com',
            password='secret123',
        )
        old = TOTPChallenge.objects.create(
            token='expired-totp', user=user,
            expires_at=timezone.now() - timezone.timedelta(days=2),
        )
        TOTPChallenge.create(user)
        self.assertFalse(TOTPChallenge.objects.filter(pk=old.pk).exists())

    def test_captcha_endpoint_throttled(self):
        cache.clear()
        for _ in range(30):
            resp = self.client.get('/api/auth/captcha/')
            self.assertEqual(resp.status_code, 200, resp.status_code)
        resp = self.client.get('/api/auth/captcha/')
        self.assertEqual(resp.status_code, 429)

    def test_verify_endpoint_throttled(self):
        cache.clear()
        body = {'email': 'th@example.com', 'code': '000000', 'password': 'secret123'}
        for _ in range(20):
            resp = self.client.post('/api/auth/verify/', body, format='json')
            self.assertNotEqual(resp.status_code, 429, resp.status_code)
        resp = self.client.post('/api/auth/verify/', body, format='json')
        self.assertEqual(resp.status_code, 429)

    def test_password_reset_confirm_throttled(self):
        cache.clear()
        body = {
            'email': 'th@example.com', 'code': '000000', 'password': 'newpass123',
        }
        for _ in range(20):
            resp = self.client.post(
                '/api/auth/password-reset/confirm/', body, format='json'
            )
            self.assertNotEqual(resp.status_code, 429, resp.status_code)
        resp = self.client.post(
            '/api/auth/password-reset/confirm/', body, format='json'
        )
        self.assertEqual(resp.status_code, 429)


class PointsTestCase(TestCase):
    """积分机制：规则预置、审核通过发放、邀请推广、上限防刷与公开接口。"""

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        from .models import AppSetting

        AppSetting.objects.update_or_create(
            id=1, defaults={'require_email_verification': False}
        )

    def _captcha(self, answer='ABCD'):
        """写入一条已知答案的图形验证码，返回其 token。"""
        from django.utils import timezone

        from .captcha import _hash
        from .models import Captcha

        obj = Captcha.objects.create(
            token='ptok-%s-%d' % (answer, Captcha.objects.count()),
            answer_hash=_hash(answer),
            expires_at=timezone.now() + timezone.timedelta(minutes=5),
        )
        return obj.token

    def _user(self, email='user@example.com'):
        return User.objects.create_user(username=email, email=email, password='secret123')

    def _register(self, email, referral_code=''):
        payload = {
            'email': email,
            'password': 'secret123',
            'captcha_token': self._captcha(),
            'captcha_answer': 'ABCD',
        }
        if referral_code:
            payload['referral_code'] = referral_code
        return self.client.post('/api/auth/register/', payload, format='json')

    def _profile(self, user):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        return profile

    # ---------- 规则预置 ----------

    def test_default_rules_seeded(self):
        rules = {r.code: r for r in PointRule.objects.all()}
        self.assertEqual(
            set(rules),
            {
                'site_approved', 'tutorial_approved', 'app_link_approved',
                'referral_inviter', 'referral_referee',
                'site_submit', 'tutorial_submit', 'app_link_submit',
            },
        )
        self.assertEqual(rules['site_approved'].points, 20)
        self.assertEqual(rules['referral_inviter'].points, 30)
        self.assertEqual(rules['referral_referee'].points, 10)
        # 「提交即发」默认关闭
        self.assertFalse(rules['site_submit'].enabled)

    # ---------- 审核通过发放 ----------

    def test_site_approval_awards_points(self):
        user = self._user()
        self.assertEqual(self._profile(user).points_balance, 0)
        category = Category.objects.create(name='DeFi', slug='defi')
        sub = SiteSubmission.objects.create(
            user=user, name='Uniswap', url='https://uniswap.org',
            category=category, status=SiteSubmission.STATUS_PENDING,
        )
        site = sub.build_site()
        profile = self._profile(user)
        self.assertEqual(profile.points_balance, 20)
        self.assertEqual(profile.points_lifetime, 20)
        tx = PointTransaction.objects.get(user=user)
        self.assertEqual(tx.amount, 20)
        self.assertEqual(tx.balance_after, 20)
        self.assertEqual(tx.ref_type, 'site_submission')
        self.assertEqual(tx.ref_id, sub.pk)
        self.assertIsNotNone(site)

    def test_site_approval_is_idempotent(self):
        from .points import award_points

        user = self._user()
        award_points(user, 'site_approved', 'site_submission', 1)
        award_points(user, 'site_approved', 'site_submission', 1)
        self.assertEqual(PointTransaction.objects.filter(user=user).count(), 1)
        self.assertEqual(self._profile(user).points_balance, 20)

    def test_tutorial_approval_awards_points(self):
        user = self._user()
        category = Category.objects.create(name='DeFi', slug='defi')
        site = Site.objects.create(name='Uniswap', url='https://uniswap.org', category=category)
        tutorial = SiteTutorial.objects.create(
            site=site, user=user, type=SiteTutorial.TYPE_TEXT,
            url='https://example.com/how-to', title='如何使用',
        )
        from .points import award_points

        award_points(user, 'tutorial_approved', 'site_tutorial', tutorial.pk)
        self.assertEqual(self._profile(user).points_balance, 10)

    def test_app_link_approval_awards_points(self):
        user = self._user()
        category = Category.objects.create(name='DeFi', slug='defi')
        site = Site.objects.create(name='Uniswap', url='https://uniswap.org', category=category)
        sub = AppLinkSubmission.objects.create(
            user=user, site=site, platform=AppLinkSubmission.PLATFORM_IOS,
            url='https://apps.apple.com/app/uniswap', status=AppLinkSubmission.STATUS_PENDING,
        )
        sub.approve()
        self.assertEqual(self._profile(user).points_balance, 10)
        self.assertEqual(site.app_ios_url, sub.url)

    def test_disabled_rule_skipped(self):
        from .points import award_points

        user = self._user()
        rule = PointRule.objects.get(code='site_approved')
        rule.enabled = False
        rule.save()
        self.assertIsNone(award_points(user, 'site_approved', 'site_submission', 1))
        self.assertEqual(self._profile(user).points_balance, 0)

    # ---------- 上限防刷 ----------

    def test_daily_limit_blocks_extra_awards(self):
        from .points import award_points

        user = self._user()
        rule = PointRule.objects.get(code='site_approved')
        rule.daily_limit = 1
        rule.save()
        self.assertIsNotNone(award_points(user, 'site_approved', 'site_submission', 1))
        self.assertIsNone(award_points(user, 'site_approved', 'site_submission', 2))
        self.assertEqual(self._profile(user).points_balance, 20)

    def test_total_limit_blocks_extra_awards(self):
        from .points import award_points

        user = self._user()
        rule = PointRule.objects.get(code='site_approved')
        rule.daily_limit = 0
        rule.total_limit = 1
        rule.save()
        self.assertIsNotNone(award_points(user, 'site_approved', 'site_submission', 1))
        self.assertIsNone(award_points(user, 'site_approved', 'site_submission', 2))
        self.assertEqual(self._profile(user).points_balance, 20)

    # ---------- 邀请推广 ----------

    def test_referral_registration_awards_both(self):
        inviter = self._user('inviter@example.com')
        UserProfile.objects.create(user=inviter, referral_code='INVITER1')
        resp = self._register('referee@example.com', referral_code='inviter1')
        self.assertEqual(resp.status_code, 201)
        self.assertIn('access', resp.json())
        referee = User.objects.get(username='referee@example.com')
        referral = Referral.objects.get(referee=referee)
        self.assertEqual(referral.inviter, inviter)
        self.assertEqual(referral.code, 'INVITER1')
        self.assertEqual(self._profile(inviter).points_balance, 30)
        self.assertEqual(self._profile(referee).points_balance, 10)

    def test_referral_self_rejected(self):
        from .points import process_registration

        user = self._user()
        UserProfile.objects.create(user=user, referral_code='SELFCODE')
        self.assertIsNone(process_registration(user, 'SELFCODE'))
        self.assertFalse(Referral.objects.filter(inviter=user).exists())

    def test_referral_unknown_code_ignored(self):
        inviter = self._user('inviter2@example.com')
        UserProfile.objects.create(user=inviter, referral_code='INV2')
        resp = self._register('referee2@example.com', referral_code='NOPE1234')
        self.assertEqual(resp.status_code, 201)
        referee = User.objects.get(username='referee2@example.com')
        self.assertFalse(Referral.objects.filter(referee=referee).exists())
        self.assertEqual(self._profile(referee).points_balance, 0)
        self.assertEqual(self._profile(inviter).points_balance, 0)

    def test_referral_referee_only_referred_once(self):
        inviter = self._user('inviter3@example.com')
        UserProfile.objects.create(user=inviter, referral_code='INV3')
        self._register('referee3@example.com', referral_code='INV3')
        referee = User.objects.get(username='referee3@example.com')
        self.assertEqual(Referral.objects.filter(referee=referee).count(), 1)
        self.assertEqual(self._profile(inviter).points_balance, 30)

    def test_referral_via_email_verify_path(self):
        from .models import AppSetting, EmailVerification

        AppSetting.objects.update_or_create(
            id=1, defaults={'require_email_verification': True}
        )
        inviter = self._user('inviter4@example.com')
        UserProfile.objects.create(user=inviter, referral_code='INV4')
        import re as _re

        from django.core import mail

        with self.settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            resp = self.client.post(
                '/api/auth/register/',
                {
                    'email': 'referee4@example.com',
                    'password': 'secret123',
                    'captcha_token': self._captcha(),
                    'captcha_answer': 'ABCD',
                    'referral_code': 'INV4',
                },
                format='json',
            )
            self.assertEqual(resp.status_code, 200)
            record = EmailVerification.objects.get(
                email='referee4@example.com', purpose=EmailVerification.PURPOSE_REGISTER
            )
            self.assertEqual(record.referral_code, 'INV4')
            code = _re.search(r'验证码是：(\d{6})', mail.outbox[-1].body).group(1)
        resp = self.client.post(
            '/api/auth/verify/',
            {'email': 'referee4@example.com', 'code': code, 'password': 'secret123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        referee = User.objects.get(username='referee4@example.com')
        self.assertTrue(Referral.objects.filter(referee=referee, inviter=inviter).exists())
        self.assertEqual(self._profile(inviter).points_balance, 30)
        self.assertEqual(self._profile(referee).points_balance, 10)

    # ---------- 手动调账 ----------

    def test_adjust_points_positive_and_negative(self):
        from django.core.exceptions import ValidationError

        from .points import adjust_points

        user = self._user()
        adjust_points(user, 50, '测试奖励')
        self.assertEqual(self._profile(user).points_balance, 50)
        self.assertEqual(self._profile(user).points_lifetime, 50)
        adjust_points(user, -20, '测试扣减')
        self.assertEqual(self._profile(user).points_balance, 30)
        with self.assertRaises(ValueError):
            adjust_points(user, -999, '超额扣减')
        self.assertEqual(self._profile(user).points_balance, 30)

    # ---------- API ----------

    def test_points_rules_public_endpoint(self):
        resp = self.client.get('/api/points/rules/')
        self.assertEqual(resp.status_code, 200)
        codes = [r['code'] for r in resp.json()]
        self.assertIn('site_approved', codes)
        self.assertNotIn('site_submit', codes)  # 关闭的规则不公开

    def test_me_returns_points_and_referral(self):
        user = self._user()
        UserProfile.objects.create(user=user, referral_code='MYCODE')
        self.client.force_authenticate(user)
        resp = self.client.get('/api/me/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['points'], {'balance': 0, 'lifetime': 0})
        self.assertEqual(data['referral_code'], 'MYCODE')
        # 未配置转发域名时不生成分享链接
        self.assertEqual(data['referral_share_url'], '')

    def test_me_referral_share_url_from_setting(self):
        from .models import AppSetting

        AppSetting.objects.update_or_create(id=1, defaults={'share_base_url': 'https://finnav.app'})
        user = self._user()
        UserProfile.objects.create(user=user, referral_code='MYCODE2')
        self.client.force_authenticate(user)
        resp = self.client.get('/api/me/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json()['referral_share_url'], 'https://finnav.app/?ref=MYCODE2'
        )

    def test_me_points_transactions_paginated(self):
        from .points import award_points

        user = self._user()
        award_points(user, 'site_approved', 'site_submission', 1)
        award_points(user, 'tutorial_approved', 'site_tutorial', 1)
        self.client.force_authenticate(user)
        resp = self.client.get('/api/me/points/transactions/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['count'], 2)
        results = data['results']
        self.assertEqual(len(results), 2)
        # 最近在前
        self.assertEqual(results[0]['rule_code'], 'tutorial_approved')
        self.assertEqual(results[1]['rule_code'], 'site_approved')
        self.assertEqual(results[0]['balance_after'], 30)

    def test_points_transactions_requires_auth(self):
        resp = self.client.get('/api/me/points/transactions/')
        self.assertEqual(resp.status_code, 401)
