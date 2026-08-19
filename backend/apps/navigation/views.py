from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db.models import F, Q
from django.http import Http404
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AppDownload,
    AppLinkSubmission,
    AppSetting,
    Category,
    PointRule,
    PointTransaction,
    Rating,
    Site,
    SiteSubmission,
    SiteTutorial,
    SiteVisit,
    Tag,
    UserSiteInvite,
)
from .serializers import (
    AppDownloadSerializer,
    AppLinkSubmissionSerializer,
    AppSettingSerializer,
    CategorySerializer,
    PointRuleSerializer,
    PointTransactionSerializer,
    RatingReviewSerializer,
    RatingSerializer,
    SiteSerializer,
    SiteSubmissionCreateSerializer,
    SiteSubmissionListSerializer,
    SiteTutorialCreateSerializer,
    SiteTutorialSerializer,
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


class TutorialsPagination(PageNumberPagination):
    """教程列表分页：固定每页 20 条。"""

    page_size = 20
    page_size_query_param = None
    max_page_size = 100


class AppLinksPagination(PageNumberPagination):
    """我的 APP 下载链接提交分页：固定每页 10 条。"""

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

    queryset = (
        Site.objects.filter(is_active=True)
        .select_related('category')
        .prefetch_related('tags')
    )
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
        Site.objects.filter(pk=site.pk).update(visit_count=F('visit_count') + 1)
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
            download_count=F('download_count') + 1
        )
        site.refresh_from_db(fields=['download_count'])
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        AppDownload.objects.create(site_id=site.pk, platform=platform, user=user)
        return Response(
            {'id': site.pk, 'download_count': site.download_count}
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

    # ---------- 用户分享教程 ----------

    def _get_tutorial_or_404(self, site, tutorial_id):
        tutorial = SiteTutorial.objects.filter(pk=tutorial_id, site=site).first()
        if tutorial is None:
            raise Http404(_('教程不存在'))
        return tutorial

    @action(detail=True, methods=['get', 'post'], url_path='tutorials')
    def tutorials(self, request, pk=None):
        """站点用户分享的教程列表 / 分享新教程。

        GET  /api/sites/{id}/tutorials/          列表（?type=text|video|agent 过滤，
             只展示已审核通过(approved)的教程；登录用户额外包含自己分享的
             pending/rejected 教程以便看到审核状态，按访问量倒序分页）
        POST /api/sites/{id}/tutorials/          body {type, url, title?}；登录用户分享，
             标题由后端自动抓取（fetch_page_title）；新分享默认 status=pending，
             需管理员审核通过后才公开展示。
        """
        site = self.get_object()
        context = {'request': request}

        if request.method == 'POST':
            if not getattr(request.user, 'is_authenticated', False):
                return Response(
                    {'error': _('请先登录。')}, status=status.HTTP_401_UNAUTHORIZED
                )
            serializer = SiteTutorialCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            tutorial = serializer.save(site=site, user=request.user)
            return Response(
                SiteTutorialSerializer(tutorial, context=context).data,
                status=status.HTTP_201_CREATED,
            )

        qs = SiteTutorial.objects.filter(site=site).select_related('user')
        if getattr(request.user, 'is_authenticated', False):
            qs = qs.filter(
                Q(status=SiteTutorial.STATUS_APPROVED) | Q(user=request.user)
            )
        else:
            qs = qs.filter(status=SiteTutorial.STATUS_APPROVED)
        tutorial_type = request.query_params.get('type')
        if tutorial_type:
            qs = qs.filter(type=tutorial_type)
        qs = qs.order_by('-view_count', '-created_at')
        paginator = TutorialsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        if page is not None:
            return paginator.get_paginated_response(
                SiteTutorialSerializer(page, many=True, context=context).data
            )
        return Response(
            SiteTutorialSerializer(qs, many=True, context=context).data
        )

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticated],
        url_path='tutorials/title',
    )
    def tutorial_title_preview(self, request, pk=None):
        """POST /api/sites/{id}/tutorials/title/ 抓取链接标题供分享前预览/修改。

        body {url}；返回 {title, fallback}。抓取成功时 fallback=false；
        失败时 title 为域名兜底且 fallback=true，前端应留空让用户手动填写。
        """
        url = str(request.data.get('url') or '').strip()
        if not url:
            return Response(
                {'error': _('请填写链接。')}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            URLValidator(schemes=['http', 'https'])(url)
        except ValidationError:
            return Response(
                {'error': _('链接格式无效。')}, status=status.HTTP_400_BAD_REQUEST
            )
        from .services import fetch_page_title_info

        title, fallback = fetch_page_title_info(url)
        return Response({'title': title, 'fallback': fallback})

    @action(detail=True, methods=['get'], url_path='tutorials/top')
    def tutorials_top(self, request, pk=None):
        """GET /api/sites/{id}/tutorials/top/ 各类型访问量前 10 的教程。

        返回 {text: [...], video: [...], agent: [...]}，供详情页展示（仅已审核通过）。
        """
        site = self.get_object()
        context = {'request': request}
        top = {}
        for tutorial_type, _label in SiteTutorial.TYPE_CHOICES:
            qs = (
                SiteTutorial.objects.filter(
                    site=site,
                    type=tutorial_type,
                    status=SiteTutorial.STATUS_APPROVED,
                )
                .select_related('user')
                .order_by('-view_count', '-created_at')[:10]
            )
            top[tutorial_type] = SiteTutorialSerializer(qs, many=True, context=context).data
        return Response(top)

    @action(detail=True, methods=['post'], url_path=r'tutorials/(?P<tutorial_id>[^/.]+)/visit')
    def tutorial_visit(self, request, pk=None, tutorial_id=None):
        """POST /api/sites/{id}/tutorials/{tid}/visit/ 记录一次教程访问（点击）。"""
        site = self.get_object()
        tutorial = self._get_tutorial_or_404(site, tutorial_id)
        SiteTutorial.objects.filter(pk=tutorial.pk).update(
            view_count=F('view_count') + 1
        )
        tutorial.refresh_from_db(fields=['view_count'])
        return Response({'id': tutorial.pk, 'view_count': tutorial.view_count})

    @action(
        detail=True,
        methods=['post'],
        url_path=r'tutorials/(?P<tutorial_id>[^/.]+)/delete-request',
    )
    def tutorial_delete_request(self, request, pk=None, tutorial_id=None):
        """POST /api/sites/{id}/tutorials/{tid}/delete-request/ 作者删除教程。

        仅作者本人可操作：
        - 已驳回(rejected)：直接永久删除，无需管理员审核；
        - 已通过(approved)：置 delete_pending 后从公开列表隐藏，待管理员审核。
        """
        from django.utils import timezone

        site = self.get_object()
        tutorial = self._get_tutorial_or_404(site, tutorial_id)
        if tutorial.user_id != request.user.pk:
            return Response(
                {'error': _('只能申请删除自己分享的教程。')},
                status=status.HTTP_403_FORBIDDEN,
            )
        if tutorial.status == SiteTutorial.STATUS_PENDING:
            return Response(
                {'error': _('教程待审核，暂不能申请删除。')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if tutorial.status == SiteTutorial.STATUS_REJECTED:
            tutorial.delete()
            return Response({'id': tutorial.pk, 'deleted': True})
        if tutorial.delete_pending:
            return Response({'delete_pending': True})
        tutorial.delete_pending = True
        tutorial.delete_requested_at = timezone.now()
        tutorial.save(update_fields=['delete_pending', 'delete_requested_at', 'updated_at'])
        return Response({'id': tutorial.pk, 'delete_pending': True})

    @action(
        detail=True,
        methods=['post'],
        url_path=r'tutorials/(?P<tutorial_id>[^/.]+)/delete-cancel',
    )
    def tutorial_delete_cancel(self, request, pk=None, tutorial_id=None):
        """POST /api/sites/{id}/tutorials/{tid}/delete-cancel/ 撤销删除申请。"""
        site = self.get_object()
        tutorial = self._get_tutorial_or_404(site, tutorial_id)
        if tutorial.user_id != request.user.pk:
            return Response(
                {'error': _('只能操作自己分享的教程。')},
                status=status.HTTP_403_FORBIDDEN,
            )
        tutorial.delete_pending = False
        tutorial.delete_requested_at = None
        tutorial.save(update_fields=['delete_pending', 'delete_requested_at', 'updated_at'])
        return Response({'id': tutorial.pk, 'delete_pending': False})


    @action(
        detail=True,
        methods=['put', 'patch'],
        permission_classes=[IsAuthenticated],
        url_path=r'tutorials/(?P<tutorial_id>(?!top[/.]|title[/.])[^/.]+)',
    )
    def tutorial_update(self, request, pk=None, tutorial_id=None):
        """PUT/PATCH /api/sites/{id}/tutorials/{tid}/ 只能编辑被驳回的教程，编辑后回到 pending。"""
        site = self.get_object()
        tutorial = self._get_tutorial_or_404(site, tutorial_id)
        if tutorial.user_id != request.user.pk:
            return Response(
                {'error': _('只能编辑自己分享的教程。')},
                status=status.HTTP_403_FORBIDDEN,
            )
        if tutorial.status != SiteTutorial.STATUS_REJECTED:
            return Response(
                {'error': _('仅已驳回的教程可编辑。')},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = SiteTutorialCreateSerializer(
            tutorial,
            data=request.data,
            partial=request.method == 'PATCH',
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(status=SiteTutorial.STATUS_PENDING)
        return Response(
            SiteTutorialSerializer(
                tutorial, context={'request': request}
            ).data
        )

    # ---------- APP 下载链接提交 ----------

    @action(
        detail=True,
        methods=['get', 'post'],
        permission_classes=[IsAuthenticated],
        url_path='app-links',
    )
    def app_links(self, request, pk=None):
        """当前用户在站点的 APP 下载链接提交（按平台独立，需管理员审核）。

        GET  /api/sites/{id}/app-links/  查看当前用户的提交记录（含状态，分页
             返回 {count, next, previous, results}）。
        POST /api/sites/{id}/app-links/  body {platform, url} 提交新链接；
             同一 (用户, 站点, 平台) 仅允许一条待审核记录。
        """
        site = self.get_object()

        if request.method == 'POST':
            serializer = AppLinkSubmissionSerializer(
                data=request.data, context={'request': request, 'site': site}
            )
            serializer.is_valid(raise_exception=True)
            submission = serializer.save(site=site, user=request.user)
            return Response(
                AppLinkSubmissionSerializer(submission).data,
                status=status.HTTP_201_CREATED,
            )

        qs = AppLinkSubmission.objects.filter(user=request.user, site=site)
        paginator = AppLinksPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            AppLinkSubmissionSerializer(page, many=True).data
        )

    @action(
        detail=True,
        methods=['delete', 'put', 'patch'],
        permission_classes=[IsAuthenticated],
        url_path=r'app-links/(?P<submission_id>[^/.]+)',
    )
    def app_link_detail(self, request, pk=None, submission_id=None):
        """当前用户对已驳回 APP 链接提交的操作（作者本人）。
        DELETE /api/sites/{id}/app-links/{sid}/ 删除提交（仅已驳回，免审核）。
        PUT/PATCH /api/sites/{id}/app-links/{sid}/ 编辑提交，编辑后回到 pending。
        """
        site = self.get_object()
        submission = AppLinkSubmission.objects.filter(pk=submission_id, site=site).first()
        if submission is None:
            return Response({'error': _('提交不存在。')}, status=status.HTTP_404_NOT_FOUND)
        if submission.user_id != request.user.pk:
            return Response({'error': _('只能操作自己提交的链接。')}, status=status.HTTP_403_FORBIDDEN)
        if request.method == 'DELETE':
            if submission.status != AppLinkSubmission.STATUS_REJECTED:
                return Response(
                    {'error': _('仅已驳回的提交可直接删除。')},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            submission.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        if submission.status != AppLinkSubmission.STATUS_REJECTED:
            return Response(
                {'error': _('仅已驳回的提交可编辑。')},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = AppLinkSubmissionSerializer(
            submission,
            data=request.data,
            partial=request.method == 'PATCH',
            context={'request': request, 'site': site},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(status=AppLinkSubmission.STATUS_PENDING, reviewed_at=None)
        return Response(AppLinkSubmissionSerializer(submission).data)



class PointsRulesView(APIView):
    """GET /api/points/rules/ 公开的积分规则列表（仅启用），供 App 展示赚积分途径。"""

    permission_classes = [AllowAny]

    def get(self, request):
        rules = PointRule.objects.filter(enabled=True).order_by('id')
        return Response(PointRuleSerializer(rules, many=True).data)


class MyPointsTransactionsView(APIView):
    """GET /api/me/points/transactions/ 当前用户积分流水（分页）。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            PointTransaction.objects.filter(user=request.user)
            .select_related('rule')
            .order_by('-created_at')
        )
        paginator = AppLinksPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        if page is not None:
            return paginator.get_paginated_response(
                PointTransactionSerializer(page, many=True).data
            )
        return Response(PointTransactionSerializer(qs, many=True).data)


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


def _pending_review_counts():
    """四类待管理员审核的数量：站点提交 / 教程发布 / 教程删除申请 / APP 链接提交。"""
    return {
        'sites': SiteSubmission.objects.filter(
            status=SiteSubmission.STATUS_PENDING
        ).count(),
        'tutorials': SiteTutorial.objects.filter(
            status=SiteTutorial.STATUS_PENDING
        ).count(),
        'tutorial_deletes': SiteTutorial.objects.filter(delete_pending=True).count(),
        'app_links': AppLinkSubmission.objects.filter(
            status=AppLinkSubmission.STATUS_PENDING
        ).count(),
    }


def admin_review_count(request):
    """后台右上角「待审核」徽标的 JSON 计数接口（staff 专属，供轮询）。"""
    from django.http import JsonResponse

    counts = _pending_review_counts()
    counts['total'] = sum(counts.values())
    return JsonResponse(counts)


def admin_review(request):
    """待审核中心（staff 专属）：统一快速审核站点提交 / 教程发布 / 教程删除申请 / APP 链接提交。

    - GET：按 ?tab= 渲染对应 tab 的待审核卡片列表
    - POST：action=approve|reject + model=site|tutorial|tutorial_delete|app_link + id + 可选 note
      仅处理对应状态为待审核的记录（幂等），处理完跳回原 tab。
    """
    from django.contrib import messages
    from django.http import HttpResponseRedirect
    from django.shortcuts import render

    REVIEW_TABS = ('sites', 'tutorials', 'tutorial_deletes', 'app_links')

    if request.method == 'POST':
        model = request.POST.get('model') or ''
        action = request.POST.get('action') or ''
        pk = request.POST.get('id') or ''
        note = (request.POST.get('note') or '').strip()
        tab = request.POST.get('tab') or request.GET.get('tab') or 'sites'
        if tab not in REVIEW_TABS:
            tab = 'sites'

        def _redirect():
            return HttpResponseRedirect(request.path + '?tab=' + tab)

        def _done_pending():
            messages.info(request, '该提交已处理，无需重复操作。')

        if model == 'site' and pk:
            sub = SiteSubmission.objects.filter(pk=pk).first()
            if sub is None:
                raise Http404('提交不存在')
            if sub.status != SiteSubmission.STATUS_PENDING:
                _done_pending()
                return _redirect()
            if action == 'approve':
                try:
                    site = sub.build_site()
                except Exception as exc:  # noqa: BLE001
                    messages.error(request, f'创建站点失败：{exc}')
                    return _redirect()
                from .services import ensure_logo_async

                ensure_logo_async(site.pk)
                messages.success(request, f'审核通过，已创建站点「{site.name}」。')
            elif action == 'reject':
                sub.status = SiteSubmission.STATUS_REJECTED
                sub.admin_note = note or sub.admin_note
                sub.reviewed_at = timezone.now()
                sub.save(update_fields=['status', 'admin_note', 'reviewed_at'])
                messages.warning(request, f'已驳回站点提交「{sub.name}」。')
            return _redirect()

        if model == 'tutorial' and pk:
            tutorial = SiteTutorial.objects.filter(pk=pk).first()
            if tutorial is None:
                raise Http404('教程不存在')
            if tutorial.status != SiteTutorial.STATUS_PENDING:
                _done_pending()
                return _redirect()
            if action == 'approve':
                tutorial.status = SiteTutorial.STATUS_APPROVED
                tutorial.save(update_fields=['status', 'updated_at'])
                from .points import award_points

                award_points(
                    tutorial.user,
                    'tutorial_approved',
                    'site_tutorial',
                    tutorial.pk,
                    description=f'教程发布审核通过：{tutorial.title}',
                )
                messages.success(request, f'已通过教程发布审核「{tutorial.title}」。')
            elif action == 'reject':
                tutorial.status = SiteTutorial.STATUS_REJECTED
                tutorial.save(update_fields=['status', 'updated_at'])
                messages.warning(request, f'已驳回教程发布「{tutorial.title}」。')
            return _redirect()

        if model == 'tutorial_delete' and pk:
            tutorial = SiteTutorial.objects.filter(pk=pk).first()
            if tutorial is None:
                raise Http404('教程不存在')
            if not tutorial.delete_pending:
                _done_pending()
                return _redirect()
            if action == 'approve':
                tutorial.delete()
                messages.success(request, f'已同意删除教程「{tutorial.title}」。')
            elif action == 'reject':
                tutorial.delete_pending = False
                tutorial.delete_requested_at = None
                tutorial.save(
                    update_fields=['delete_pending', 'delete_requested_at', 'updated_at']
                )
                messages.warning(request, f'已驳回删除申请「{tutorial.title}」，教程恢复展示。')
            return _redirect()

        if model == 'app_link' and pk:
            sub = AppLinkSubmission.objects.filter(pk=pk).first()
            if sub is None:
                raise Http404('提交不存在')
            if sub.status != AppLinkSubmission.STATUS_PENDING:
                _done_pending()
                return _redirect()
            if action == 'approve':
                try:
                    sub.approve()
                except Exception as exc:  # noqa: BLE001
                    messages.error(request, f'审核通过失败：{exc}')
                    return _redirect()
                messages.success(
                    request, f'已通过 APP 链接提交「{sub.site} · {sub.get_platform_display()}」。'
                )
            elif action == 'reject':
                sub.status = AppLinkSubmission.STATUS_REJECTED
                sub.admin_note = note or sub.admin_note
                sub.reviewed_at = timezone.now()
                sub.save(update_fields=['status', 'admin_note', 'reviewed_at'])
                messages.warning(
                    request, f'已驳回 APP 链接提交「{sub.site} · {sub.get_platform_display()}」。'
                )
            return _redirect()

        messages.error(request, '无效的审核请求。')
        return _redirect()

    tab = request.GET.get('tab', 'sites')
    if tab not in REVIEW_TABS:
        tab = 'sites'
    context = {
        'tab': tab,
        'counts': _pending_review_counts(),
        'site_submissions': (
            SiteSubmission.objects.filter(status=SiteSubmission.STATUS_PENDING)
            .select_related('user', 'category')
            .prefetch_related('tags')
        ),
        'tutorials_publish': (
            SiteTutorial.objects.filter(status=SiteTutorial.STATUS_PENDING)
            .select_related('site', 'user')
        ),
        'tutorials_delete': (
            SiteTutorial.objects.filter(delete_pending=True)
            .select_related('site', 'user')
        ),
        'app_links': (
            AppLinkSubmission.objects.filter(status=AppLinkSubmission.STATUS_PENDING)
            .select_related('site', 'user')
        ),
    }
    return render(request, 'admin/review.html', context)


class TagViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/tags/ 标签列表（供提交站点等前端选择）。"""

    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    pagination_class = None


class SiteSubmissionViewSet(viewsets.ModelViewSet):
    """当前用户的站点提交：POST 提交(pending)、GET 查看自己列表。

    DELETE 仅允许删除已驳回(rejected)的提交，免管理员审核。
    """

    http_method_names = ['get', 'post', 'put', 'patch', 'delete']
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return SiteSubmissionListSerializer
        return SiteSubmissionCreateSerializer

    def get_queryset(self):
        return SiteSubmission.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def update(self, request, *args, **kwargs):
        """PUT/PATCH /api/site-submissions/{id}/ 只能编辑被驳回的提交，编辑后状态回到 pending。"""
        partial = kwargs.pop('partial', False)
        obj = self.get_object()
        if obj.status != SiteSubmission.STATUS_REJECTED:
            return Response(
                {"error": _("仅已驳回的提交可编辑。")},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(obj, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save(status=SiteSubmission.STATUS_PENDING, reviewed_at=None)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """DELETE /api/site-submissions/{id}/ 仅允许删除已驳回的提交，免管理员审核。"""
        submission = self.get_object()
        if submission.status != SiteSubmission.STATUS_REJECTED:
            return Response(
                {'error': _('仅已驳回的提交可直接删除。')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        submission.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
