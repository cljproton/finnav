import json
import re

from django import forms
from django.contrib import admin
from django.contrib import messages
from django.contrib.admin.forms import AdminAuthenticationForm
from django.http import Http404, JsonResponse
from django.urls import path
from django.utils import timezone
from django.utils.html import format_html

from . import services
from .models import (
    AppDownload,
    AppLinkSubmission,
    AppSetting,
    Captcha,
    Category,
    Experience,
    ExperienceImage,
    ExperienceLike,
    ExperiencePurchase,
    PointRule,
    PointTransaction,
    PointsGift,
    PointsVoucher,
    Rating,
    Referral,
    Site,
    SiteSubmission,
    SiteTutorial,
    Tag,
    UserProfile,
    UserSiteInvite,
)

# 管理后台标题改为中文
admin.site.site_header = '金融导航管理后台'
admin.site.site_title = '金融导航管理后台'
admin.site.index_title = '站点管理'


class TwoFAAdminAuthenticationForm(AdminAuthenticationForm):
    """管理后台登录表单：全局开启 2FA 且该管理员已启用 2FA 时，需输入 TOTP 动态码。

    遵循与前端一致的粒度：全局开关(settings.twofa_enabled) 开启且该用户
    自己的 TwoFactor.enabled=True 时，登录需校验动态码。
    """

    totp_code = forms.CharField(
        label='动态码',
        max_length=6,
        required=False,
        widget=forms.TextInput(attrs={'autocomplete': 'one-time-code'}),
    )

    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        from .models import AppSetting
        from .twofa import user_has_2fa, verify_user_code

        if AppSetting.get().twofa_enabled and user_has_2fa(user):
            code = self.cleaned_data.get('totp_code', '')
            if not verify_user_code(user, code):
                raise forms.ValidationError('请输入正确的 6 位动态验证码。', code='totp')


admin.site.login_form = TwoFAAdminAuthenticationForm
admin.site.login_template = 'admin/twofa_login.html'


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'icon', 'sites_count', 'sort_order', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    list_editable = ('sort_order', 'is_active')
    change_form_template = 'admin/category_change_form.html'

    def sites_count(self, obj):
        return obj.sites.count()

    sites_count.short_description = '站点数'

    def changeform_view(self, request, object_id=None, form_url='', extra_context=None):
        extra_context = extra_context or {}
        if object_id:
            category = self.get_object(request, object_id)
            if category is not None:
                extra_context['category_sites'] = category.sites.filter(is_active=True)
                extra_context['hidden_sites'] = category.sites.filter(is_active=False)
                extra_context['addable_sites'] = (
                    Site.objects.exclude(category=category).order_by('name')
                )
        return super().changeform_view(request, object_id, form_url, extra_context)

    def get_urls(self):
        urls = [
            path(
                '<path:object_id>/site-add/',
                self.admin_site.admin_view(self.site_add),
                name='navigation_category_site_add',
            ),
            path(
                '<path:object_id>/site-add-batch/',
                self.admin_site.admin_view(self.site_add_batch),
                name='navigation_category_site_add_batch',
            ),
            path(
                '<path:object_id>/site-remove/',
                self.admin_site.admin_view(self.site_remove),
                name='navigation_category_site_remove',
            ),
            path(
                '<path:object_id>/site-restore/',
                self.admin_site.admin_view(self.site_restore),
                name='navigation_category_site_restore',
            ),
            path(
                '<path:object_id>/field-save/',
                self.admin_site.admin_view(self.field_save),
                name='navigation_category_field_save',
            ),
        ]
        return urls + super().get_urls()

    def _get_category_or_404(self, request, object_id):
        obj = self.get_object(request, object_id)
        if obj is None:
            raise Http404('分类不存在')
        return obj

    def _post_site(self, request, object_id, action):
        category = self._get_category_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        try:
            body = json.loads(request.body or b'{}')
            site_id = body.get('site_id')
        except (ValueError, TypeError):
            return JsonResponse({'error': '请求体格式错误'}, status=400)
        site = Site.objects.filter(pk=site_id).first()
        if site is None:
            return JsonResponse({'ok': False, 'error': '站点不存在'}, status=404)
        update_fields = ['updated_at']
        if action == 'add':
            if site.category_id != category.pk:
                site.category = category
                update_fields.append('category')
            site.is_active = True
            update_fields.append('is_active')
        elif action == 'remove':
            if site.category_id != category.pk:
                return JsonResponse({'ok': False, 'error': '该站点不在此分类'}, status=400)
            site.is_active = False
            update_fields.append('is_active')
        elif action == 'restore':
            if site.category_id != category.pk:
                return JsonResponse({'ok': False, 'error': '该站点不在此分类'}, status=400)
            site.is_active = True
            update_fields.append('is_active')
        else:
            return JsonResponse({'error': 'unknown action'}, status=400)
        site.save(update_fields=update_fields)
        return JsonResponse({'ok': True})

    def site_add(self, request, object_id):
        """POST 将已存在的站点加入该分类（激活）。"""
        return self._post_site(request, object_id, 'add')

    def site_remove(self, request, object_id):
        """POST 从分类移除（停用隐藏，记录保留）。"""
        return self._post_site(request, object_id, 'remove')

    def site_restore(self, request, object_id):
        """POST 恢复已停用的站点（重新显示）。"""
        return self._post_site(request, object_id, 'restore')

    def site_add_batch(self, request, object_id):
        """POST 批量将多个站点加入该分类：body {site_ids: []}。

        逐站执行与 site_add 相同的逻辑（移动到分类 + 激活），返回成功/失败计数。
        """
        category = self._get_category_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        try:
            body = json.loads(request.body or b'{}')
            site_ids = body.get('site_ids')
        except (ValueError, TypeError):
            return JsonResponse({'error': '请求体格式错误'}, status=400)
        if not isinstance(site_ids, (list, tuple)):
            return JsonResponse({'error': 'site_ids 必须是数组'}, status=400)
        site_ids = [int(i) for i in site_ids if str(i).strip().isdigit()]
        if not site_ids:
            return JsonResponse({'ok': False, 'error': '请至少选择一个站点'}, status=400)
        now = timezone.now()
        added = moved = 0
        for site in Site.objects.filter(pk__in=site_ids):
            update_fields = ['updated_at']
            if site.category_id != category.pk:
                site.category = category
                update_fields.append('category')
                moved += 1
            if not site.is_active:
                site.is_active = True
                update_fields.append('is_active')
            site.save(update_fields=update_fields)
            added += 1
        return JsonResponse({'ok': True, 'added': added, 'moved': moved})

    _CATEGORY_SAFE_FIELDS = ('name', 'slug', 'icon', 'sort_order', 'is_active')

    def field_save(self, request, object_id):
        """POST 分类单字段自动保存：body {field, value}。"""
        category = self._get_category_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        try:
            body = json.loads(request.body or b'{}')
            field = body.get('field')
            value = body.get('value')
        except (ValueError, TypeError):
            return JsonResponse({'error': '请求体格式错误'}, status=400)
        if field not in self._CATEGORY_SAFE_FIELDS:
            return JsonResponse({'error': '不允许保存该字段'}, status=400)
        if field == 'is_active':
            value = str(value).lower() in ('true', '1', 'on')
        if field in ('sort_order',):
            try:
                value = int(value or 0)
            except (ValueError, TypeError):
                return JsonResponse(
                    {'ok': False, 'errors': {'sort_order': ['请输入整数']}}, status=400
                )
        meta = type('Meta', (), {'model': Category, 'fields': (field,)})
        form_cls = type(
            'SingleFieldForm', (forms.ModelForm,), {'Meta': meta}
        )
        form = form_cls({field: value}, instance=category)
        if not form.is_valid():
            return JsonResponse(
                {'ok': False, 'errors': form.errors.get_json_data()}, status=400
            )
        form.save(commit=False).save(update_fields=[field, 'updated_at'])
        return JsonResponse({'ok': True})


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name', 'sites_count', 'sort_order', 'created_at')
    search_fields = ('name',)
    list_editable = ('sort_order',)
    ordering = ('sort_order', 'name')

    def sites_count(self, obj):
        return obj.sites.count()

    sites_count.short_description = '站点数'
    sites_count.admin_order_field = 'sites__count'


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'category',
        'visit_count',
        'rating_count',
        'rating_avg',
        'sort_order',
        'is_active',
        'created_at',
    )
    list_filter = ('category', 'is_active')
    search_fields = ('name', 'description')
    list_editable = ('sort_order', 'is_active')
    autocomplete_fields = ('category',)
    date_hierarchy = 'created_at'
    change_form_template = 'admin/site_change_form.html'
    filter_horizontal = ('tags',)
    readonly_fields = ('logo_preview', 'visit_count', 'rating_count', 'rating_avg',
                       'app_android_status', 'app_android_integrity_status',
                       'app_android_sha256', 'app_android_verified_at',
                       'app_android_integrity_ok', 'created_at', 'updated_at')
    actions = ['verify_app_integrity']

    @admin.action(description='校验所选站点的安卓缓存完整性 (SHA-256)')
    def verify_app_integrity(self, request, queryset):
        from django.utils import timezone

        from .services import _sha256_file

        ok = bad = unverified = 0
        now = timezone.now()
        for site in queryset:
            file = site.app_android_file
            if not file or not file.name:
                continue
            if not site.app_android_sha256:
                site.app_android_integrity_ok = None
                unverified += 1
            else:
                good = False
                try:
                    if file.storage.exists(file.name):
                        good = _sha256_file(file.path).lower() == site.app_android_sha256.lower()
                except Exception:
                    good = False
                site.app_android_integrity_ok = good
                if good:
                    ok += 1
                else:
                    bad += 1
            site.app_android_verified_at = now
            site.save(update_fields=['app_android_integrity_ok',
                                     'app_android_verified_at', 'updated_at'])
        self.message_user(
            request,
            f'校验完成：通过 {ok}，失败/异常 {bad}，未核验 {unverified}',
            messages.SUCCESS if not bad else messages.WARNING,
        )

    def logo_preview(self, obj):
        if obj.logo:
            return format_html(
                '<img src="{}" style="max-height:40px;" />', obj.logo.url
            )
        return '-'

    logo_preview.short_description = 'Logo 预览'

    def _size_mb(self, size):
        mb = (size or 0) / (1024 * 1024)
        return f'{mb:.1f} MB' if mb < 1024 else f'{mb / 1024:.1f} GB'

    def app_android_status(self, obj):
        if not obj.app_android_file or obj.app_android_size is None:
            return format_html('<span style="color:#b02a37">尚未拉取</span>')
        cached_at = obj.app_android_cached_at.strftime('%Y-%m-%d %H:%M')
        return format_html(
            '{}（{} · {}）', obj.app_android_file.name, self._size_mb(obj.app_android_size),
            cached_at
        )

    app_android_status.short_description = '安卓缓存状态'

    def app_android_integrity_status(self, obj):
        if not obj.app_android_file or not obj.app_android_file.name:
            return '-'
        if obj.app_android_integrity_ok is True:
            return format_html('<span style="color:#198754">✓ 校验通过</span>')
        if obj.app_android_integrity_ok is False:
            return format_html('<span style="color:#b02a37">✗ 校验失败（可能被篡改）</span>')
        return format_html('<span style="color:#6c757d">未核验</span>')

    app_android_integrity_status.short_description = '安卓完整性'

    def changeform_view(self, request, object_id=None, form_url='', extra_context=None):
        extra_context = extra_context or {}
        extra_context['categories'] = Category.objects.order_by('sort_order', 'id')
        extra_context['available_tags'] = Tag.objects.all().order_by('sort_order', 'name')
        if object_id:
            site = self.get_object(request, object_id)
            if site is not None:
                extra_context['site_tags'] = list(
                    site.tags.values_list('name', flat=True)
                )
        return super().changeform_view(request, object_id, form_url, extra_context)

    def response_change(self, request, obj):
        if '_delete_android_cache' in request.POST and obj.app_android_file:
            try:
                obj.app_android_file.delete(save=False)
                obj.app_android_file = None
                obj.app_android_size = None
                obj.app_android_cached_at = None
                obj.app_android_sha256 = ''
                obj.app_android_verified_at = None
                obj.app_android_integrity_ok = None
                obj.save(update_fields=['app_android_file', 'app_android_size',
                                        'app_android_cached_at', 'app_android_sha256',
                                        'app_android_verified_at',
                                        'app_android_integrity_ok', 'updated_at'])
                self.message_user(request, '已删除安卓本地缓存。', messages.SUCCESS)
            except Exception as exc:
                self.message_user(request, f'删除失败：{exc}', messages.ERROR)
        return super().response_change(request, obj)

    def get_urls(self):
        urls = [
            path(
                '<path:object_id>/app-pull/status/',
                self.admin_site.admin_view(self.app_pull_status),
                name='navigation_site_app_pull_status',
            ),
            path(
                '<path:object_id>/app-pull/start/',
                self.admin_site.admin_view(self.app_pull_start),
                name='navigation_site_app_pull_start',
            ),
            path(
                '<path:object_id>/app-pull/cancel/',
                self.admin_site.admin_view(self.app_pull_cancel),
                name='navigation_site_app_pull_cancel',
            ),
            path(
                '<path:object_id>/field-save/',
                self.admin_site.admin_view(self.field_save),
                name='navigation_site_field_save',
            ),
            path(
                '<path:object_id>/app-cache-delete/',
                self.admin_site.admin_view(self.app_pull_delete_cache),
                name='navigation_site_app_cache_delete',
            ),
        ]
        return urls + super().get_urls()

    def _get_site_or_404(self, request, object_id):
        obj = self.get_object(request, object_id)
        if obj is None:
            raise Http404('站点不存在')
        return obj

    def app_pull_status(self, request, object_id):
        """GET 拉取进度（轮询）。终态读一次即清除，避免页面重复刷新。"""
        site = self._get_site_or_404(request, object_id)
        state = services.get_pull_state(site.pk)
        if state.get('status') in ('done', 'error', 'cancelled'):
            services.clear_pull_state(site.pk)
        return JsonResponse(state)

    def app_pull_start(self, request, object_id):
        """POST 启动后台拉取（异步，页面轮询进度）。

        请求体会携带前端录入的原始链接 url；若与已保存不一致则更新后
        再拉取，按钮「拉取…并保存到本站」即保存该链接。
        """
        site = self._get_site_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        url = None
        try:
            body = json.loads(request.body or b'{}')
            url = (body.get('url') or '').strip() or None
        except (ValueError, TypeError):
            pass
        if url:
            if not url.startswith(('http://', 'https://')):
                return JsonResponse(
                    {'error': '仅支持 http/https 下载链接'}, status=400
                )
            if url != site.app_android_url:
                site.app_android_url = url
                site.save(update_fields=['app_android_url', 'updated_at'])
        return JsonResponse(services.start_pull(site.pk))

    def app_pull_cancel(self, request, object_id):
        """POST 中断正在进行的拉取。"""
        site = self._get_site_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        cancelled = services.cancel_pull(site.pk)
        state = services.get_pull_state(site.pk)
        return JsonResponse({'cancelled': cancelled, **state})

    def app_pull_delete_cache(self, request, object_id):
        """POST 删除本站安卓 APP 本地缓存。"""
        site = self._get_site_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        if not site.app_android_file:
            return JsonResponse({'ok': False, 'error': '无本地缓存'}, status=400)
        site.app_android_file.delete(save=False)
        site.app_android_file = None
        site.app_android_size = None
        site.app_android_cached_at = None
        site.save(
            update_fields=[
                'app_android_file',
                'app_android_size',
                'app_android_cached_at',
                'updated_at',
            ]
        )
        return JsonResponse({'ok': True})

    # ---- 单字段保存（友好输入 + 批量） ----

    @staticmethod
    def _parse_tags(field, value):
        if isinstance(value, (list, tuple)):
            items = value
        elif isinstance(value, str):
            items = re.split(r'[,，、\n]+', value)
        else:
            raise forms.ValidationError('标签格式不正确')
        return [str(i).strip() for i in items if str(i).strip()]

    _SAFE_FIELDS = (
        'name', 'url', 'description', 'category', 'sort_order', 'is_active',
        'app_android_url', 'app_ios_url', 'app_google_play_url', 'logo',
        'invite_code', 'invite_link',
    ) + ('tags',)

    def field_save(self, request, object_id):
        """POST 保存单个字段（友好文本经转换后写入）。

        - tags：逗号/顿号/换行分隔的字符串 -> 列表
        - logo：multipart 上传文件
        """
        site = self._get_site_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        try:
            if request.content_type == 'application/json':
                payload = json.loads(request.body or b'{}')
                field = payload.get('field')
                value = payload.get('value')
            else:
                field = request.POST.get('field')
                value = request.POST.get('value')
        except (ValueError, TypeError):
            return JsonResponse({'error': '请求体格式错误'}, status=400)

        if field not in self._SAFE_FIELDS:
            return JsonResponse({'error': '不允许保存该字段'}, status=400)

        if field == 'tags':
            try:
                names = self._parse_tags(field, value)
            except forms.ValidationError as exc:
                return JsonResponse(
                    {'ok': False, 'errors': {field: list(exc.messages)}}, status=400
                )
            tags = [Tag.objects.get_or_create(name=n)[0] for n in names]
            site.tags.set(tags)
            Site.objects.filter(pk=site.pk).update(updated_at=timezone.now())
            return JsonResponse({'ok': True})

        meta = type('Meta', (), {'model': Site, 'fields': (field,)})
        form_cls = type('SingleFieldForm', (forms.ModelForm,), {'Meta': meta})
        form = form_cls(
            {field: value},
            files={'logo': request.FILES.get('file')} if field == 'logo' else None,
            instance=site,
        )
        if not form.is_valid():
            return JsonResponse(
                {'ok': False, 'errors': form.errors.get_json_data()}, status=400
            )
        obj = form.save(commit=False)
        obj.save(update_fields=[field, 'updated_at'])
        return JsonResponse({'ok': True})

    fieldsets = (
        (None, {'fields': ('name', 'description', 'url', 'category', 'tags')}),
        ('展示', {'fields': ('logo', 'logo_preview', 'sort_order', 'is_active')}),
        (
            'APP',
            {
                'description': '安卓可配置原始链接并由后台拉取缓存到本站（按钮在本页底部）；iOS 仅支持应用商店外链，不缓存。',
                'fields': (
                    'app_android_url',
                    'app_android_status',
                    'app_ios_url',
                ),
            },
        ),
        ('邀请', {'fields': ('invite_code', 'invite_link')}),
        ('时间', {'fields': ('created_at', 'updated_at')}),
    )


@admin.register(AppSetting)
class AppSettingAdmin(admin.ModelAdmin):
    """站点全局设置（单例）：网站标题/副标题/图标/SEO/公告/底部版权等。"""

    change_form_template = 'admin/appsetting_change_form.html'

    list_display = (
        'site_title',
        'announcement_enabled',
        'footer_copyright',
        'updated_at',
    )
    fieldsets = (
        (
            '网站品牌',
            {'fields': ('site_title', 'site_subtitle', 'logo')},
        ),
        (
            '站点列表',
            {
                'fields': ('sites_per_page',),
                'description': '前端首页/搜索每次加载的站点条数，滑到底部自动加载下一批。'
                               '建议 10–50，数值过大会抵消分页带来的性能收益。',
            },
        ),
        (
            'SEO 信息',
            {'fields': ('seo_title', 'seo_description', 'seo_keywords')},
        ),
        (
            '网站公告',
            {'fields': ('announcement_enabled', 'announcement')},
        ),
        (
            '页脚',
            {'fields': ('footer_copyright',)},
        ),
        (
            '转发链接',
            {
                'fields': ('share_base_url',),
                'description': 'App 分享站点详情时使用的链接前缀。填写如 https://finnav.app（网页版前端地址），'
                               '分享链接变为「该地址/site/站点ID」；留空保持 finnav:///site/xx 深链接格式。',
            },
        ),
        (
            '账号与安全',
            {
                'fields': ('require_email_verification', 'twofa_enabled'),
                'description': '开启后注册需邮件验证码确认邮箱真实性；关闭则填写邮箱+密码即可直接注册。'
                               '「启用双因素认证(2FA)」开启后，用户可在个人中心用 TOTP 认证器（如 Google Authenticator）自行启用，登录时需输入 6 位动态码。',
            },
        ),
        (
            '前端自定义脚本',
            {
                'fields': ('head_scripts',),
                'description': '注入到前端页面 <head> 中的自定义 HTML/脚本（例如统计代码）。会原样输出到页面头部。',
            },
        ),
    )

    def has_add_permission(self, request):
        return not AppSetting.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Captcha)
class CaptchaAdmin(admin.ModelAdmin):
    list_display = ('token', 'used', 'attempts', 'expires_at', 'created_at')
    list_filter = ('used',)
    readonly_fields = ('token', 'answer_hash', 'attempts', 'used', 'expires_at', 'created_at')
    search_fields = ('token',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return True


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = ('site', 'user', 'score', 'comment', 'created_at')
    list_filter = ('site__category', 'score')
    search_fields = ('site__name', 'user__username', 'comment')
    autocomplete_fields = ('site',)
    readonly_fields = ('created_at', 'updated_at')
    list_per_page = 50


@admin.register(UserSiteInvite)
class UserSiteInviteAdmin(admin.ModelAdmin):
    list_display = (
        'user', 'site', 'invite_code', 'invite_link', 'updated_at'
    )
    list_filter = ('site__category',)
    search_fields = ('user__email', 'user__username', 'site__name', 'invite_code')
    autocomplete_fields = ('site',)
    readonly_fields = ('created_at', 'updated_at')
    list_per_page = 50


@admin.register(SiteSubmission)
class SiteSubmissionAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'category', 'status', 'approved_site', 'created_at')
    list_filter = ('status', 'category')
    search_fields = ('name', 'url', 'user__email', 'user__username', 'description')
    readonly_fields = ('created_at', 'reviewed_at', 'approved_site', 'status')
    list_per_page = 20
    change_form_template = 'admin/sitesubmission_change_form.html'
    change_list_template = 'admin/sitesubmission_change_list.html'

    def get_urls(self):
        urls = [
            path(
                '<path:object_id>/approve/',
                self.admin_site.admin_view(self.submit_approve),
                name='navigation_sitesubmission_approve',
            ),
            path(
                '<path:object_id>/reject/',
                self.admin_site.admin_view(self.submit_reject),
                name='navigation_sitesubmission_reject',
            ),
        ]
        return urls + super().get_urls()

    def _get_submission_or_404(self, request, object_id):
        obj = self.get_object(request, object_id)
        if obj is None:
            raise Http404('提交不存在')
        return obj

    def _redirect(self, request, obj):
        from django.http import HttpResponseRedirect
        from django.urls import reverse

        return HttpResponseRedirect(reverse('admin:navigation_sitesubmission_change', args=[obj.pk]))

    def submit_approve(self, request, object_id):
        """POST 审核通过：创建站点并启用。重复点击幂等（已通过则复用已建站点）。"""
        obj = self._get_submission_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        if obj.status == SiteSubmission.STATUS_APPROVED and obj.approved_site_id:
            return self._redirect(request, obj)
        try:
            site = obj.build_site()
        except Exception as exc:  # noqa: BLE001
            messages.error(request, f'创建站点失败：{exc}')
            return self._redirect(request, obj)
        from .services import ensure_logo_async

        ensure_logo_async(site.pk)
        self.message_user(
            request, f'审核通过，已创建站点「{site.name}」。', messages.SUCCESS
        )
        return self._redirect(request, obj)

    def submit_reject(self, request, object_id):
        """POST 审核驳回：body 可选 admin_note。"""
        obj = self._get_submission_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        note = ''
        try:
            body = json.loads(request.body or b'{}')
            note = (body.get('note') or '').strip()
        except (ValueError, TypeError):
            pass
        obj.status = SiteSubmission.STATUS_REJECTED
        obj.admin_note = note or obj.admin_note
        obj.reviewed_at = timezone.now()
        obj.save(update_fields=['status', 'admin_note', 'reviewed_at'])
        self.message_user(request, '已驳回该提交。', messages.WARNING)
        return self._redirect(request, obj)

    def changeform_view(self, request, object_id=None, form_url='', extra_context=None):
        extra_context = extra_context or {}
        if object_id:
            obj = self.get_object(request, object_id)
            if obj is not None:
                extra_context['submission'] = obj
                extra_context['tag_names'] = list(obj.tags.values_list('name', flat=True))
        return super().changeform_view(request, object_id, form_url, extra_context)

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context['current_status'] = request.GET.get('status__exact', '')
        extra_context['submission_tab_urls'] = self._submission_tab_urls(request)
        return super().changelist_view(request, extra_context)

    def _submission_tab_urls(self, request):
        from urllib.parse import urlencode

        base = {k: v for k, v in list(request.GET.items()) if k != 'status__exact'}
        if 'p' in base:
            base.pop('p')
        urls = {'all': '?' + urlencode(base) if base else ''}
        for status in SiteSubmission.STATUS_CHOICES:
            status = status[0]
            params = dict(base)
            params['status__exact'] = status
            urls[status] = '?' + urlencode(params)
        return urls


@admin.register(AppDownload)
class AppDownloadAdmin(admin.ModelAdmin):
    list_display = ('site', 'platform', 'user', 'downloaded_at')
    list_filter = ('platform', 'site__category')
    search_fields = ('site__name',)
    autocomplete_fields = ('site',)
    readonly_fields = ('site', 'platform', 'user', 'downloaded_at')
    date_hierarchy = 'downloaded_at'
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(SiteTutorial)
class SiteTutorialAdmin(admin.ModelAdmin):
    """用户分享的教程（发布审核 + 删除申请审核）。"""

    list_display = (
        'title', 'site', 'user', 'type', 'status', 'view_count',
        'delete_pending', 'delete_requested_at', 'created_at',
    )
    list_filter = ('type', 'status', 'delete_pending', 'site__category')
    search_fields = ('title', 'url', 'user__email', 'user__username', 'site__name')
    autocomplete_fields = ('site',)
    readonly_fields = ('created_at', 'updated_at')
    list_per_page = 50
    actions = ['approve_publish', 'reject_publish', 'approve_deletes', 'reject_deletes']

    @admin.action(description='通过所选发布审核（公开教程）')
    def approve_publish(self, request, queryset):
        from .points import award_points

        approved = 0
        for tutorial in queryset.filter(status=SiteTutorial.STATUS_PENDING):
            tutorial.status = SiteTutorial.STATUS_APPROVED
            tutorial.save(update_fields=['status', 'updated_at'])
            award_points(
                tutorial.user,
                'tutorial_approved',
                'site_tutorial',
                tutorial.pk,
                description=f'教程发布审核通过：{tutorial.title}',
            )
            approved += 1
        self.message_user(
            request, f'已通过 {approved} 条教程的发布审核。', messages.SUCCESS
        )

    @admin.action(description='驳回所选发布审核（不公开）')
    def reject_publish(self, request, queryset):
        rejected = queryset.filter(status=SiteTutorial.STATUS_PENDING).update(
            status=SiteTutorial.STATUS_REJECTED
        )
        self.message_user(
            request, f'已驳回 {rejected} 条教程的发布审核。', messages.SUCCESS
        )

    @admin.action(description='通过所选删除申请（删除教程）')
    def approve_deletes(self, request, queryset):
        deleted = 0
        for tutorial in queryset.filter(delete_pending=True):
            tutorial.delete()
            deleted += 1
        self.message_user(
            request, f'已删除 {deleted} 条待审核教程。', messages.SUCCESS
        )

    @admin.action(description='驳回所选删除申请（恢复展示）')
    def reject_deletes(self, request, queryset):
        rejected = queryset.filter(delete_pending=True).update(
            delete_pending=False, delete_requested_at=None
        )
        self.message_user(
            request, f'已驳回 {rejected} 条删除申请。', messages.SUCCESS
        )


@admin.register(AppLinkSubmission)
class AppLinkSubmissionAdmin(admin.ModelAdmin):
    """用户提交的 APP 下载链接（审核通过后写入站点并触发安卓自动拉取）。"""

    list_display = ('site', 'platform', 'url', 'user', 'status', 'created_at')
    list_filter = ('status', 'platform', 'site__category')
    search_fields = ('site__name', 'url', 'user__email', 'user__username')
    autocomplete_fields = ('site',)
    readonly_fields = ('created_at', 'reviewed_at', 'status')
    list_per_page = 50
    change_form_template = 'admin/applinksubmission_change_form.html'
    actions = ['approve_selected', 'reject_selected']

    @admin.action(description='审核通过所选提交（安卓联动自动拉取）')
    def approve_selected(self, request, queryset):
        ok = 0
        errors = []
        for submission in queryset.filter(status=AppLinkSubmission.STATUS_PENDING):
            try:
                submission.approve()
                ok += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f'{submission}: {exc}')
        msg = f'已通过 {ok} 条提交。'
        if errors:
            msg += ' 失败：' + '；'.join(errors[:5])
        self.message_user(request, msg, messages.WARNING if errors else messages.SUCCESS)

    @admin.action(description='驳回所选提交')
    def reject_selected(self, request, queryset):
        from django.utils import timezone

        rejected = queryset.filter(status=AppLinkSubmission.STATUS_PENDING).update(
            status=AppLinkSubmission.STATUS_REJECTED, reviewed_at=timezone.now()
        )
        self.message_user(request, f'已驳回 {rejected} 条提交。', messages.SUCCESS)

    def get_urls(self):
        urls = [
            path(
                '<path:object_id>/approve/',
                self.admin_site.admin_view(self.submit_approve),
                name='navigation_applinksubmission_approve',
            ),
            path(
                '<path:object_id>/reject/',
                self.admin_site.admin_view(self.submit_reject),
                name='navigation_applinksubmission_reject',
            ),
        ]
        return urls + super().get_urls()

    def _get_submission_or_404(self, request, object_id):
        obj = self.get_object(request, object_id)
        if obj is None:
            raise Http404('提交不存在')
        return obj

    def _redirect(self, request, obj):
        from django.http import HttpResponseRedirect
        from django.urls import reverse

        return HttpResponseRedirect(
            reverse('admin:navigation_applinksubmission_change', args=[obj.pk])
        )

    def submit_approve(self, request, object_id):
        """POST 审核通过：写入站点对应链接，安卓触发后台拉取 APK。"""
        obj = self._get_submission_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        if obj.status == AppLinkSubmission.STATUS_PENDING:
            try:
                obj.approve()
            except Exception as exc:  # noqa: BLE001
                messages.error(request, f'审核通过失败：{exc}')
                return self._redirect(request, obj)
            self.message_user(request, '已通过，站点链接已更新。', messages.SUCCESS)
        else:
            self.message_user(request, '该提交已处理，无需重复操作。', messages.WARNING)
        return self._redirect(request, obj)

    def submit_reject(self, request, object_id):
        """POST 驳回：body 可选 note。"""
        from django.utils import timezone

        obj = self._get_submission_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        note = ''
        try:
            body = json.loads(request.body or b'{}')
            note = (body.get('note') or '').strip()
        except (ValueError, TypeError):
            pass
        if obj.status == AppLinkSubmission.STATUS_PENDING:
            obj.status = AppLinkSubmission.STATUS_REJECTED
            obj.admin_note = note or obj.admin_note
            obj.reviewed_at = timezone.now()
            obj.save(update_fields=['status', 'admin_note', 'reviewed_at'])
            self.message_user(request, '已驳回该提交。', messages.WARNING)
        else:
            self.message_user(request, '该提交已处理，无需重复操作。', messages.WARNING)
        return self._redirect(request, obj)

    def changeform_view(self, request, object_id=None, form_url='', extra_context=None):
        extra_context = extra_context or {}
        if object_id:
            obj = self.get_object(request, object_id)
            if obj is not None:
                extra_context['submission'] = obj
                extra_context['pending'] = obj.status == AppLinkSubmission.STATUS_PENDING
                extra_context['platform_label'] = obj.get_platform_display()
                extra_context['site_android_url'] = obj.site.app_android_url
        return super().changeform_view(request, object_id, form_url, extra_context)


@admin.register(PointRule)
class PointRuleAdmin(admin.ModelAdmin):
    """积分规则（后台可配置积分值、开关与防刷上限）。"""

    list_display = (
        'code', 'name', 'points', 'enabled', 'daily_limit', 'total_limit', 'updated_at'
    )
    list_filter = ('enabled',)
    search_fields = ('code', 'name', 'description')
    list_editable = ('points', 'enabled', 'daily_limit', 'total_limit')
    fieldsets = (
        (
            None,
            {
                'fields': ('code', 'name', 'points', 'enabled'),
                'description': 'points 为本次事件发放的积分（可为负，用于扣分场景）；'
                               'enabled 关闭后该规则不再发放。',
            },
        ),
        (
            '防刷限制',
            {
                'fields': ('daily_limit', 'total_limit'),
                'description': '每用户「每日 / 累计」发放次数上限，0 表示不限。'
                               '邀请与内容审核类规则建议配置上限以防批量刷分。',
            },
        ),
        ('说明', {'fields': ('description',)}),
    )

    def get_readonly_fields(self, request, obj=None):
        # 已有流水引用的规则代码不允许修改，避免台账来源漂移
        if obj is not None and obj.transactions.exists():
            return ('code',)
        return ()


@admin.register(PointTransaction)
class PointTransactionAdmin(admin.ModelAdmin):
    """积分流水（只读，仅供审计；调账请到用户资料页）。"""

    list_display = (
        'user', 'amount', 'balance_after', 'rule', 'ref_type', 'description', 'created_at'
    )
    list_filter = ('ref_type',)
    search_fields = ('user__email', 'user__username', 'description')
    autocomplete_fields = ('user',)
    readonly_fields = (
        'user', 'rule', 'amount', 'balance_after', 'ref_type', 'ref_id',
        'description', 'created_at',
    )
    date_hierarchy = 'created_at'
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    """邀请记录（只读）。"""

    list_display = ('inviter', 'referee', 'code', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('inviter__email', 'inviter__username', 'referee__email', 'code')
    readonly_fields = ('inviter', 'referee', 'code', 'status', 'created_at')
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PointsGift)
class PointsGiftAdmin(admin.ModelAdmin):
    """积分转赠记录（只读，审计用）。"""

    list_display = ('sender', 'recipient', 'amount', 'message', 'created_at')
    search_fields = ('sender__email', 'sender__username', 'recipient__email', 'message')
    autocomplete_fields = ('sender', 'recipient')
    readonly_fields = ('sender', 'recipient', 'amount', 'message', 'created_at')
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PointsVoucher)
class PointsVoucherAdmin(admin.ModelAdmin):
    """积分兑换码（只读，审计用）。生成时已从创建者余额扣除，不退款。"""

    list_display = (
        'code', 'creator', 'amount', 'status', 'redeemed_by', 'redeemed_at', 'expires_at',
        'created_at',
    )
    list_filter = ('status',)
    search_fields = ('code', 'creator__email', 'creator__username',
                     'redeemed_by__email', 'redeemed_by__username')
    autocomplete_fields = ('creator', 'redeemed_by')
    readonly_fields = (
        'code', 'creator', 'amount', 'status', 'redeemed_by', 'redeemed_at',
        'expires_at', 'created_at',
    )
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """用户积分与推广资料。积分字段只读，调账通过页内「积分调账」按钮完成。"""

    list_display = (
        'user', 'referral_code', 'points_balance', 'points_lifetime', 'created_at'
    )
    search_fields = ('user__email', 'user__username', 'referral_code')
    autocomplete_fields = ('user',)
    readonly_fields = (
        'user', 'referral_code', 'points_balance', 'points_lifetime', 'created_at',
        'updated_at',
    )
    list_per_page = 50
    change_form_template = 'admin/userprofile_change_form.html'

    def get_urls(self):
        urls = [
            path(
                '<path:object_id>/adjust/',
                self.admin_site.admin_view(self.adjust_points),
                name='navigation_userprofile_adjust',
            ),
        ]
        return urls + super().get_urls()

    def _get_profile_or_404(self, request, object_id):
        obj = self.get_object(request, object_id)
        if obj is None:
            raise Http404('用户资料不存在')
        return obj

    def adjust_points(self, request, object_id):
        """POST 手动调账：body {amount, reason}。amount 可为负。"""
        from .points import adjust_points as do_adjust

        profile = self._get_profile_or_404(request, object_id)
        if request.method != 'POST':
            return JsonResponse({'error': 'method not allowed'}, status=405)
        try:
            body = json.loads(request.body or b'{}')
            amount = int(body.get('amount'))
            reason = str(body.get('reason') or '').strip()
        except (ValueError, TypeError):
            return JsonResponse({'error': '请求体格式错误'}, status=400)
        try:
            do_adjust(profile.user, amount, reason)
        except ValueError as exc:
            return JsonResponse({'ok': False, 'error': str(exc)}, status=400)
        profile.refresh_from_db(fields=['points_balance', 'points_lifetime'])
        return JsonResponse(
            {
                'ok': True,
                'balance': profile.points_balance,
                'lifetime': profile.points_lifetime,
            }
        )


class ExperienceImageInline(admin.TabularInline):
    """经验配图内联（管理后台可直接维护图片）。"""

    model = ExperienceImage
    extra = 0
    readonly_fields = ('uploaded_by',)


@admin.register(Experience)
class ExperienceAdmin(admin.ModelAdmin):
    """实战经验（付费内容，无审核直接公开）。"""

    list_display = (
        'title', 'site', 'author', 'price', 'like_count', 'sales_count',
        'is_active', 'created_at',
    )
    list_filter = ('is_active', 'site__category')
    search_fields = ('title', 'content', 'author__email', 'author__username', 'site__name')
    autocomplete_fields = ('site', 'author')
    readonly_fields = ('like_count', 'sales_count', 'created_at', 'updated_at')
    inlines = (ExperienceImageInline,)
    list_per_page = 50

    @admin.action(description='隐藏所选经验（soft delete）')
    def hide_experiences(self, request, queryset):
        hidden = queryset.update(is_active=False)
        self.message_user(request, f'已隐藏 {hidden} 条经验。', messages.SUCCESS)

    @admin.action(description='恢复显示所选经验')
    def show_experiences(self, request, queryset):
        shown = queryset.update(is_active=True)
        self.message_user(request, f'已恢复 {shown} 条经验。', messages.SUCCESS)


@admin.register(ExperienceImage)
class ExperienceImageAdmin(admin.ModelAdmin):
    """经验配图（孤儿图片管理）。"""

    list_display = ('pk', 'experience', 'uploaded_by', 'image', 'created_at')
    list_filter = ('experience', 'uploaded_by')
    search_fields = ('experience__title', 'uploaded_by__email', 'uploaded_by__username')
    list_per_page = 50


@admin.register(ExperiencePurchase)
class ExperiencePurchaseAdmin(admin.ModelAdmin):
    """经验购买记录（只读，审计用）。"""

    list_display = ('experience', 'user', 'price', 'purchased_at')
    search_fields = ('experience__title', 'user__email', 'user__username')
    autocomplete_fields = ('experience', 'user')
    readonly_fields = ('experience', 'user', 'price', 'purchased_at')
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ExperienceLike)
class ExperienceLikeAdmin(admin.ModelAdmin):
    """经验点赞记录（只读）。"""

    list_display = ('experience', 'user', 'created_at')
    search_fields = ('experience__title', 'user__email', 'user__username')
    autocomplete_fields = ('experience', 'user')
    readonly_fields = ('experience', 'user', 'created_at')
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False



