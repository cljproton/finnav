from django.db.models import Q
from django.utils.translation import gettext as _
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AppDownload,
    AppSetting,
    Category,
    Rating,
    Site,
    SiteSubmission,
    SiteVisit,
    Tag,
    UserSiteInvite,
)
from .serializers import (
    AppDownloadSerializer,
    AppSettingSerializer,
    CategorySerializer,
    RatingReviewSerializer,
    RatingSerializer,
    SiteSerializer,
    SiteSubmissionCreateSerializer,
    SiteSubmissionListSerializer,
    TagSerializer,
    UserSiteInviteSerializer,
)


@api_view(['GET'])
def health(request):
    """GET /api/health/ 健康检查。"""
    return Response({'status': 'ok'})


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/categories/ 分类列表（仅分类元信息，不含站点）。"""

    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer


class SiteListPagination(PageNumberPagination):
    """站点列表分页：每页条数由后台全局设置 AppSetting.sites_per_page 控制。"""

    page_size_query_param = None
    max_page_size = 100

    def get_page_size(self, request):
        from .models import AppSetting

        page_size = AppSetting.get().sites_per_page
        return min(max(page_size, 1), self.max_page_size)


class RatingsPagination(PageNumberPagination):
    """评价列表分页：固定每页 10 条。"""

    page_size = 10
    page_size_query_param = None
    max_page_size = 100


class SiteViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/sites/ 站点列表（分页：{count, next, previous, results}）。
    支持查询参数:
      - q:        名称/描述/标签模糊搜索
      - category: 按分类 slug 过滤
      - ordering: sort_order(默认) / -sort_order / name / -name
      - page:     页码（每页条数由全局设置决定）
    GET /api/sites/{id}/ 站点详情。
    GET /api/sites/ids/ 全部启用站点 id（供收藏剪枝等轻量场景，不分页）。
    """

    queryset = Site.objects.filter(is_active=True)
    serializer_class = SiteSerializer
    pagination_class = SiteListPagination
    filter_backends = (filters.OrderingFilter,)
    ordering_fields = ('sort_order', 'name')
    ordering = ('sort_order',)

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def ids(self, request):
        """GET /api/sites/ids/ 返回全部启用站点的 id 列表（轻量）。"""
        ids = list(
            Site.objects.filter(is_active=True).values_list('id', flat=True)
        )
        return Response({'ids': ids})

    def retrieve(self, request, *args, **kwargs):
        from .services import ensure_logo_async

        instance = self.get_object()
        # 站点 logo 无需人工配置：详情访问时若尚未成功获取过则后台异步抓取并缓存到本站，
        # 不阻塞本次请求（首次返回 logo=null，前端用占位图，图标就绪后自动出现）。
        if not instance.logo and not instance.logo_fetched_at:
            ensure_logo_async(instance.pk)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def get_queryset(self):
        queryset = super().get_queryset()

        q = self.request.query_params.get('q')
        if q:
            queryset = queryset.filter(
                Q(name__icontains=q)
                | Q(description__icontains=q)
                | Q(tags__name__icontains=q)
            ).distinct()

        category_slug = self.request.query_params.get('category')
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)

        return queryset

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def visit(self, request, pk=None):
        """POST /api/sites/{id}/visit/ 记录一次站点访问（打开详情页）。"""
        site = self.get_object()
        Site.objects.filter(pk=site.pk).update(visit_count=site.visit_count + 1)
        SiteVisit.objects.create(site_id=site.pk)
        site.refresh_from_db(fields=['visit_count'])
        return Response(
            {'id': site.pk, 'visit_count': site.visit_count}
        )

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def download(self, request, pk=None):
        """POST /api/sites/{id}/download/ 记录一次通过本站的 APP 下载。

        body: {platform: android_cache|android_original|google_play|ios}
        仅递增计数并落一条 AppDownload；未知平台忽略。
        """
        site = self.get_object()
        platform = str(request.data.get('platform') or '').strip()
        choices = dict(AppDownload.PLATFORM_CHOICES)
        if platform not in choices:
            return Response(
                {'error': _('未知下载平台')}, status=status.HTTP_400_BAD_REQUEST
            )
        Site.objects.filter(pk=site.pk).update(
            download_count=site.download_count + 1
        )
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        AppDownload.objects.create(site_id=site.pk, platform=platform, user=user)
        return Response(
            {'id': site.pk, 'download_count': site.download_count + 1}
        )

    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def ratings(self, request, pk=None):
        """GET /api/sites/{id}/ratings/ 该站点其它用户的评价。

        匿名可浏览（用户名脱敏 + 评星，评论文本隐藏）；登录可见完整内容，
        并排除当前用户本人。返回分页形状 {count, next, previous, results}。
        """
        site = self.get_object()
        qs = (
            Rating.objects.filter(site=site)
            .select_related('user')
            .order_by('-created_at')
        )
        if getattr(request.user, 'is_authenticated', False):
            qs = qs.exclude(user=request.user)
        context = {'request': request}
        paginator = RatingsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        if page is not None:
            return paginator.get_paginated_response(
                RatingReviewSerializer(page, many=True, context=context).data
            )
        return Response(
            RatingReviewSerializer(qs, many=True, context=context).data
        )

    @action(
        detail=True,
        methods=['get', 'post', 'delete'],
        permission_classes=[IsAuthenticated],
    )
    def rate(self, request, pk=None):
        """
        GET    /api/sites/{id}/rate/       当前用户评分 (score, comment)；未评过则 score=null。
        POST   /api/sites/{id}/rate/       创建/更新当前用户评分（score 0-5、0.5 递进；comment 可选）。
        DELETE /api/sites/{id}/rate/       删除当前用户评分。
        """
        site = self.get_object()

        if request.method == 'GET':
            rating = Rating.objects.filter(site=site, user=request.user).first()
            return Response(
                {
                    'score': rating.score if rating else None,
                    'comment': rating.comment if rating else '',
                }
            )

        if request.method == 'DELETE':
            Rating.objects.filter(site=site, user=request.user).delete()
            site._refresh_rating_aggregates()
            return Response(status=status.HTTP_204_NO_CONTENT)

        data = dict(request.data)
        data['site'] = site.pk
        data['user'] = request.user.pk

        rating = Rating.objects.filter(site=site, user=request.user).first()
        serializer = RatingSerializer(rating, data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        site.refresh_from_db(fields=['rating_count', 'rating_avg'])
        return Response(
            {
                'id': serializer.instance.id,
                'score': serializer.instance.score,
                'comment': serializer.instance.comment,
                'rating_count': site.rating_count,
                'rating_avg': site.rating_avg,
            }
        )

    @action(
        detail=True,
        methods=['get', 'put', 'delete'],
        permission_classes=[IsAuthenticated],
    )
    def invite(self, request, pk=None):
        """当前用户在某站点的专属邀请码/邀请链接。

        GET    /api/sites/{id}/invite/  返回当前用户在该站点的邀请配置（无则 200 + null）
        PUT    /api/sites/{id}/invite/  body {invite_code?, invite_link?} 创建或更新
        DELETE /api/sites/{id}/invite/  删除当前用户在该站点的邀请配置
        """
        site = self.get_object()
        invite = UserSiteInvite.objects.filter(
            user=request.user, site=site
        ).first()

        if request.method == 'GET':
            data = (
                UserSiteInviteSerializer(invite).data
                if invite
                else {'invite_code': '', 'invite_link': ''}
            )
            return Response(data)

        if request.method == 'DELETE':
            if invite:
                invite.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        data = dict(request.data)
        data.setdefault('invite_code', '')
        data.setdefault('invite_link', '')
        serializer = UserSiteInviteSerializer(invite, data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save(site=site, user=request.user)
        return Response(serializer.data)


class SettingsView(APIView):
    """GET /api/settings/ 站点全局设置（首页标题/副标题）。"""

    permission_classes = [AllowAny]

    def get(self, request):
        serializer = AppSettingSerializer(AppSetting.get(), context={'request': request})
        return Response(serializer.data)


def admin_overview(request):
    """SimpleUI 首页看板：独立页面（深色科技风），经 SIMPLEUI_HOME_PAGE 以 iframe 承载。"""
    from django.shortcuts import render

    return render(request, 'admin/overview.html')


def admin_backup(request):
    """数据备份 / 恢复页面（staff 专属）。

    - GET：展示页面
    - POST action=download：生成并下载备份 zip
    - POST action=restore：上传备份 zip 并恢复（需勾选确认）
    """
    from django.contrib import messages
    from django.contrib.auth import get_user_model
    from django.conf import settings
    from django.http import HttpResponse, HttpResponseRedirect
    from django.shortcuts import render

    from .backup import build_backup_archive, restore_archive
    from .models import Category, Site, Tag, UserSiteInvite

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'download':
            archive = build_backup_archive()
            filename = f'backup-{request.user.pk or "0"}-{int(__import__("time").time())}.zip'
            response = HttpResponse(archive.read(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response

        if action == 'restore':
            if request.POST.get('confirm') != '1':
                messages.error(request, '请先勾选「我确认将覆盖现有数据」。')
                return HttpResponseRedirect(request.path)
            uploaded = request.FILES.get('backup_file')
            if not uploaded:
                messages.error(request, '请选择要恢复的备份文件。')
                return HttpResponseRedirect(request.path)
            try:
                stats = restore_archive(uploaded)
                messages.success(
                    request,
                    f'恢复完成：数据文件 {stats["data_file"]}（{stats["data_bytes"]} 字节），'
                    f'媒体文件 {stats["media_files"]} 个。',
                )
            except Exception as exc:  # noqa: BLE001
                messages.error(request, f'恢复失败：{exc}')
            return HttpResponseRedirect(request.path)

    User = get_user_model()
    context = {
        'stats': {
            'categories': Category.objects.count(),
            'sites': Site.objects.count(),
            'tags': Tag.objects.count(),
            'users': User.objects.count(),
            'ratings': Rating.objects.count(),
            'invites': UserSiteInvite.objects.count(),
        },
        'media_root': str(settings.MEDIA_ROOT),
    }
    return render(request, 'admin/backup.html', context)


def admin_twofa(request):
    """后台管理员自助配置 2FA 页面（staff 专属）。

    - GET：展示当前状态；未启用时生成密钥并给出二维码
    - POST action=enable  {code} 校验动态码后启用
    - POST action=disable {code} 校验当前动态码后停用
    """
    from django.contrib import messages
    from django.http import HttpResponseRedirect
    from django.shortcuts import render

    from .twofa import (
        _qr_datauri,
        _verify_secret,
        _otpauth_url,
        twofa_secret,
    )

    row = twofa_secret(request.user)

    if request.method == 'POST':
        action = request.POST.get('action')
        code = (request.POST.get('code') or '').strip()
        if action == 'enable':
            if _verify_secret(row.secret, code):
                if not row.enabled:
                    from django.utils import timezone

                    row.enabled = True
                    if not row.confirmed_at:
                        row.confirmed_at = timezone.now()
                    row.save(update_fields=['enabled', 'confirmed_at'])
                    messages.success(request, '2FA 已启用。下次登录需输入动态验证码。')
                else:
                    messages.info(request, '2FA 已处于启用状态。')
            else:
                messages.error(request, '动态验证码错误，请重试。')
        elif action == 'disable':
            if row.enabled and _verify_secret(row.secret, code):
                row.enabled = False
                row.confirmed_at = None
                row.save(update_fields=['enabled', 'confirmed_at'])
                messages.success(request, '2FA 已停用。')
            else:
                messages.error(request, '动态验证码错误，请重试。')
        return HttpResponseRedirect(request.path)

    context = {
        'enabled': row.enabled,
        'secret': row.secret,
        'qr': None,
    }
    if not row.enabled:
        context['qr'] = _qr_datauri(_otpauth_url(request.user, row))
    return render(request, 'admin/twofa.html', context)


def admin_upgrade_notes(request):
    """模板维护说明独立页（staff 专属）。

    原位于 admin/index.html 顶部的多行 {# #} 注释会泄漏到页面 HTML 顶部，
    现将维护说明迁移至独立页面以便查阅。
    """
    from django.shortcuts import render

    return render(request, 'admin/upgrade_notes.html')


class TagViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/tags/ 标签列表（供提交站点等前端选择）。"""

    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    pagination_class = None


class SiteSubmissionViewSet(viewsets.ModelViewSet):
    """当前用户的站点提交：POST 提交(pending)、GET 查看自己列表。"""

    http_method_names = ['get', 'post']
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return SiteSubmissionListSerializer
        return SiteSubmissionCreateSerializer

    def get_queryset(self):
        return SiteSubmission.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
