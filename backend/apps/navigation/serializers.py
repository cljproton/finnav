from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

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
    Tag,
    UserFavorite,
    UserSiteInvite,
)


class SiteSerializer(serializers.ModelSerializer):
    """SiteObject 序列化器（API 契约字段）。"""

    logo = serializers.SerializerMethodField()
    app_android_has_cache = serializers.SerializerMethodField()
    app_android_cache_url = serializers.SerializerMethodField()
    app_android_sha256 = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True)
    tags = serializers.SerializerMethodField()

    class Meta:
        model = Site
        fields = (
            'id',
            'name',
            'description',
            'url',
            'logo',
            'category',
            'category_name',
            'tags',
            'sort_order',
            'app_android_url',
            'app_android_cache_url',
            'app_android_has_cache',
            'app_android_size',
            'app_android_cached_at',
            'app_android_sha256',
            'app_android_integrity_ok',
            'app_ios_url',
            'app_google_play_url',
            'invite_code',
            'invite_link',
            'visit_count',
            'rating_count',
            'rating_avg',
        )
        read_only_fields = fields

    def get_logo(self, obj):
        """返回 logo 的绝对 URL；未上传时返回 None。"""
        if not obj.logo:
            return None
        request = self.context.get('request')
        if request is not None:
            return request.build_absolute_uri(obj.logo.url)
        return obj.logo.url

    def get_tags(self, obj):
        """返回标签名列表（Tag.Meta 默认按 sort_order, name 排序），保持 string[] 契约。"""
        # 用 Python 迭代而非 values_list/order_by：配合外层 prefetch_related('tags') 消除 N+1
        return [t.name for t in obj.tags.all()]

    def get_app_android_has_cache(self, obj):
        """安卓 APP 是否已有本站本地缓存（公开信息，用于展示下载入口）。"""
        return bool(obj.app_android_file)

    def get_app_android_cache_url(self, obj):
        """安卓 APP 本地缓存下载地址；仅已登录用户可见，否则 None。

        本站缓存的 APK 是本站带宽资源，匿名用户不得获取真实地址（防刷量/盗链）。
        """
        if not obj.app_android_file:
            return None
        request = self.context.get('request')
        if request is None or not getattr(request.user, 'is_authenticated', False):
            return None
        return request.build_absolute_uri(obj.app_android_file.url)

    def get_app_android_sha256(self, obj):
        """缓存 APK 的 SHA-256 校验值（公开信息，供真实性核验比对）。"""
        if not obj.app_android_sha256:
            return None
        return obj.app_android_sha256


class RatingSerializer(serializers.ModelSerializer):
    """打星评分序列化器。score 为 0-5、0.5 递进；comment 可选。"""

    class Meta:
        model = Rating
        fields = (
            'id',
            'site',
            'user',
            'score',
            'comment',
            'rating_count',
            'rating_avg',
        )
        read_only_fields = ('id', 'rating_count', 'rating_avg')
        extra_kwargs = {
            'site': {'write_only': True},
            'user': {'write_only': True},
        }

    rating_count = serializers.SerializerMethodField()
    rating_avg = serializers.SerializerMethodField()

    score = serializers.FloatField(min_value=0.0, max_value=5.0)

    def validate_score(self, value):
        if abs((value * 2) - round(value * 2)) > 1e-6:
            raise serializers.ValidationError(_('评分必须为 0.5 的倍数（0-10）。'))
        return round(value, 1)

    def get_rating_count(self, obj):
        return obj.site.rating_count

    def get_rating_avg(self, obj):
        return obj.site.rating_avg


def mask_username(username):
    """脱敏用户名（当前为邮箱）：首字符 + *** + @域名（域名全保留）。

    zhangsan@example.com → z***@example.com；无 @ 时 x → x***。
    """
    if not username:
        return '***'
    text = str(username).strip()
    if '@' not in text:
        return text[0] + '***'
    local, _, domain = text.partition('@')
    return local[0] + '***@' + domain


class RatingReviewSerializer(serializers.ModelSerializer):
    """站点公开评价：展示脱敏用户名；匿名隐藏评论文本（仅评星可见）。"""

    username_masked = serializers.SerializerMethodField()
    comment = serializers.SerializerMethodField()

    class Meta:
        model = Rating
        fields = ('id', 'score', 'comment', 'username_masked', 'created_at')
        read_only_fields = fields

    def get_username_masked(self, obj):
        return mask_username(obj.user.username)

    def get_comment(self, obj):
        request = self.context.get('request')
        if request is None or not getattr(request.user, 'is_authenticated', False):
            return None
        return obj.comment


class CategorySerializer(serializers.ModelSerializer):
    """分类序列化器（仅分类元信息；站点列表走 /api/sites/ 分页接口）。"""

    class Meta:
        model = Category
        fields = ('id', 'name', 'slug', 'icon', 'sort_order')
        read_only_fields = fields


class AppSettingSerializer(serializers.ModelSerializer):
    """站点全局设置序列化器。"""

    logo = serializers.SerializerMethodField()

    class Meta:
        model = AppSetting
        fields = (
            'site_title',
            'site_subtitle',
            'logo',
            'seo_title',
            'seo_description',
            'seo_keywords',
            'announcement',
            'announcement_enabled',
            'footer_copyright',
            'require_email_verification',
            'head_scripts',
            'sites_per_page',
            'share_base_url',
        )
        read_only_fields = fields

    def get_logo(self, obj):
        if not obj.logo:
            return None
        request = self.context.get('request')
        if request is not None:
            return request.build_absolute_uri(obj.logo.url)
        return obj.logo.url


class FavoritesSyncSerializer(serializers.Serializer):
    """同步收藏：整体替换为给定站点 id 列表。仅接受存在且启用的站点。"""

    site_ids = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=True
    )

    def validate_site_ids(self, value):
        value = list(dict.fromkeys(value))
        ids = set(value)
        existing = set(
            Site.objects.filter(id__in=ids, is_active=True).values_list('id', flat=True)
        )
        missing = sorted(ids - existing)
        if missing:
            raise serializers.ValidationError(
                _('站点不存在或未启用: %(missing)s') % {'missing': missing}
            )
        return value


class SearchHistorySyncSerializer(serializers.Serializer):
    """同步搜索历史：整体替换为给定搜索词列表。"""

    terms = serializers.ListField(
        child=serializers.CharField(max_length=100), allow_empty=True
    )

    def validate_terms(self, value):
        return [str(t).strip() for t in value if str(t).strip()]


class UserSiteInviteSerializer(serializers.ModelSerializer):
    """用户在某站点的专属邀请码/邀请链接。

    GET:  返回当前用户在指定站点的邀请配置（未配置则为空对象/None）。
    PUT:  创建或更新当前用户的邀请配置。
    """

    class Meta:
        model = UserSiteInvite
        fields = ('id', 'site', 'invite_code', 'invite_link', 'updated_at')
        read_only_fields = ('id', 'site', 'updated_at')

    def validate(self, attrs):
        if not (attrs.get('invite_code') or attrs.get('invite_link')):
            raise serializers.ValidationError(_('邀请码与邀请链接至少填一项。'))
        return attrs


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ('id', 'name', 'sort_order')
        read_only_fields = fields


class SiteSubmissionCreateSerializer(serializers.ModelSerializer):
    """用户提交新站点（创建时）。"""

    tags = serializers.SlugRelatedField(
        many=True,
        slug_field='name',
        queryset=Tag.objects.all(),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = SiteSubmission
        fields = ('id', 'name', 'url', 'description', 'category', 'tags', 'status',
                  'admin_note', 'created_at')
        read_only_fields = ('id', 'status', 'admin_note', 'created_at')

    def validate_category(self, value):
        if not value.is_active:
            raise serializers.ValidationError(_('该分类已停用，无法提交。'))
        return value


class SiteSubmissionListSerializer(serializers.ModelSerializer):
    """用户查看自己提交记录（带状态）。"""

    category_name = serializers.CharField(source='category.name', read_only=True)
    tags = serializers.SerializerMethodField()

    class Meta:
        model = SiteSubmission
        fields = ('id', 'name', 'url', 'description', 'category', 'category_name',
                  'tags', 'status', 'admin_note', 'created_at', 'approved_site')
        read_only_fields = fields

    def get_tags(self, obj):
        return list(obj.tags.values_list('name', flat=True))


class PointRuleSerializer(serializers.ModelSerializer):
    """公开的积分规则（供 App「赚积分」页展示，仅启用规则）。"""

    class Meta:
        model = PointRule
        fields = ('code', 'name', 'points', 'description')
        read_only_fields = fields


class PointTransactionSerializer(serializers.ModelSerializer):
    """用户积分流水（本人可见）。"""

    rule_code = serializers.CharField(source='rule.code', read_only=True)
    rule_name = serializers.CharField(source='rule.name', read_only=True)

    class Meta:
        model = PointTransaction
        fields = (
            'id', 'amount', 'balance_after', 'rule_code', 'rule_name',
            'ref_type', 'description', 'created_at',
        )
        read_only_fields = fields


class AppDownloadSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppDownload
        fields = ('id', 'site', 'platform', 'downloaded_at')
        read_only_fields = ('id', 'site', 'platform', 'downloaded_at')


class SiteTutorialSerializer(serializers.ModelSerializer):
    """用户分享教程（读）：公开展示，含脱敏分享者与当前用户关系。"""

    username_masked = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = SiteTutorial
        fields = (
            'id',
            'site',
            'type',
            'url',
            'title',
            'status',
            'view_count',
            'username_masked',
            'is_mine',
            'can_delete',
            'delete_pending',
            'created_at',
        )
        read_only_fields = fields

    def get_username_masked(self, obj):
        return mask_username(obj.user.username)

    def get_is_mine(self, obj):
        request = self.context.get('request')
        if request is None or not getattr(request.user, 'is_authenticated', False):
            return False
        return obj.user_id == request.user.pk

    def get_can_delete(self, obj):
        request = self.context.get('request')
        if request is None or not getattr(request.user, 'is_authenticated', False):
            return False
        return (
            obj.user_id == request.user.pk
            and obj.status != SiteTutorial.STATUS_PENDING
            and not obj.delete_pending
        )


class SiteTutorialCreateSerializer(serializers.ModelSerializer):
    """用户分享教程（写）：只需类型 + 链接，标题自动抓取；也可手动指定标题覆盖。"""

    url = serializers.CharField(max_length=500)
    title = serializers.CharField(
        max_length=200, required=False, allow_blank=True, trim_whitespace=True
    )

    class Meta:
        model = SiteTutorial
        fields = ('id', 'type', 'url', 'title', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_type(self, value):
        choices = dict(SiteTutorial.TYPE_CHOICES)
        if value not in choices:
            raise serializers.ValidationError(_('未知的教程类型。'))
        return value

    def validate_url(self, value):
        url = str(value or '').strip()
        if not url:
            raise serializers.ValidationError(_('请填写链接。'))
        try:
            URLValidator(schemes=['http', 'https'])(url)
        except ValidationError:
            raise serializers.ValidationError(_('链接格式无效。'))
        return url

    def validate_title(self, value):
        title = str(value or '').strip()
        if len(title) > 200:
            raise serializers.ValidationError(_('标题过长（最多 200 字）。'))
        return title

    def create(self, validated_data):
        manual_title = validated_data.get('title')
        url = validated_data['url']
        if not manual_title:
            from .services import fetch_page_title

            manual_title = fetch_page_title(url) or url
        validated_data['title'] = manual_title
        return super().create(validated_data)


class AppLinkSubmissionSerializer(serializers.ModelSerializer):
    """用户提交的 APP 下载链接（按平台独立提交，需管理员审核）。"""

    class Meta:
        model = AppLinkSubmission
        fields = ('id', 'site', 'platform', 'url', 'status', 'admin_note', 'created_at')
        read_only_fields = ('id', 'site', 'status', 'admin_note', 'created_at')

    def validate_platform(self, value):
        choices = dict(AppLinkSubmission.PLATFORM_CHOICES)
        if value not in choices:
            raise serializers.ValidationError(_('未知的平台。'))
        return value

    def validate_url(self, value):
        url = str(value or '').strip()
        if not url:
            raise serializers.ValidationError(_('请填写链接。'))
        try:
            URLValidator(schemes=['http', 'https'])(url)
        except ValidationError:
            raise serializers.ValidationError(_('链接格式无效。'))
        return url

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        site = self.context.get('site')
        if (
            request is not None
            and getattr(request.user, 'is_authenticated', False)
            and site is not None
        ):
            pending = AppLinkSubmission.objects.filter(
                user=request.user,
                site=site,
                platform=attrs.get('platform'),
                status=AppLinkSubmission.STATUS_PENDING,
            ).exists()
            if pending:
                raise serializers.ValidationError(
                    _('该平台已有待审核的提交，请等待审核结果。')
                )
        return attrs
