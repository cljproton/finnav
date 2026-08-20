from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from .models import (
    AppDownload,
    AppLinkSubmission,
    AppSetting,
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
    Site,
    SiteSubmission,
    SiteTutorial,
    Tag,
    UserFavorite,
    UserSiteInvite,
)
from .points import MIN_TRANSFER_AMOUNT, MIN_VOUCHER_AMOUNT


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


class ExperienceImageSerializer(serializers.ModelSerializer):
    """经验配图（读）：返回绝对 URL。"""

    url = serializers.SerializerMethodField()

    class Meta:
        model = ExperienceImage
        fields = ('id', 'url')
        read_only_fields = fields

    def get_url(self, obj):
        request = self.context.get('request')
        if request is not None:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class ExperienceSerializer(serializers.ModelSerializer):
    """经验（读）：公开元信息 + 按购买态解锁正文。

    匿名/未购买：仅 title/price/like_count/sales_count/封面/作者脱敏名等，
    不输出 content 与 images（决定权在序列化器，前端拿不到就不存在泄漏）。
    is_mine / has_purchased 为 true 时输出完整正文与全部图片。
    """

    author_name = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    has_purchased = serializers.SerializerMethodField()
    liked = serializers.SerializerMethodField()
    content = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Experience
        fields = (
            'id',
            'site',
            'title',
            'content',
            'price',
            'like_count',
            'sales_count',
            'author_name',
            'is_mine',
            'has_purchased',
            'liked',
            'cover',
            'images',
            'created_at',
            'updated_at',
        )
        read_only_fields = fields

    def _unlocked(self, obj):
        request = self.context.get('request')
        if request is None or not getattr(request.user, 'is_authenticated', False):
            return False
        if obj.author_id == request.user.pk:
            return True
        return ExperiencePurchase.objects.filter(
            experience=obj, user=request.user
        ).exists()

    def get_author_name(self, obj):
        return mask_username(obj.author.username)

    def get_is_mine(self, obj):
        request = self.context.get('request')
        if request is None or not getattr(request.user, 'is_authenticated', False):
            return False
        return obj.author_id == request.user.pk

    def get_has_purchased(self, obj):
        request = self.context.get('request')
        if request is None or not getattr(request.user, 'is_authenticated', False):
            return False
        if obj.author_id == request.user.pk:
            return False
        return ExperiencePurchase.objects.filter(
            experience=obj, user=request.user
        ).exists()

    def get_liked(self, obj):
        """当前登录用户是否已点赞（仅购买者/作者可赞）。"""
        request = self.context.get('request')
        if request is None or not getattr(request.user, 'is_authenticated', False):
            return False
        return ExperienceLike.objects.filter(
            experience=obj, user=request.user
        ).exists()

    def get_content(self, obj):
        if self._unlocked(obj):
            return obj.content
        return None

    def get_images(self, obj):
        if not self._unlocked(obj):
            return []
        request = self.context.get('request')
        qs = obj.images.all()
        return ExperienceImageSerializer(
            qs, many=True, context={'request': request}
        ).data

    def get_cover(self, obj):
        request = self.context.get('request')
        first = obj.images.first()
        if first is None:
            return None
        if request is not None:
            return request.build_absolute_uri(first.image.url)
        return first.image.url


class ExperienceCreateSerializer(serializers.ModelSerializer):
    """经验（写）：发布时作者自定价格，可附带已上传的配图 id 列表。"""

    image_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
        write_only=True,
    )

    class Meta:
        model = Experience
        fields = ('id', 'title', 'content', 'price', 'image_ids', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_title(self, value):
        title = str(value or '').strip()
        if not title:
            raise serializers.ValidationError(_('请填写标题。'))
        if len(title) > 80:
            raise serializers.ValidationError(_('标题过长（最多 80 字）。'))
        return title

    def validate_content(self, value):
        content = str(value or '').strip()
        if not content:
            raise serializers.ValidationError(_('请填写经验正文。'))
        return content

    def validate_price(self, value):
        if value < Experience.PRICE_MIN or value > Experience.PRICE_MAX:
            raise serializers.ValidationError(
                _('价格需在 %(min)s ~ %(max)s 积分之间。')
                % {'min': Experience.PRICE_MIN, 'max': Experience.PRICE_MAX}
            )
        return value

    def validate_image_ids(self, value):
        from .models import ExperienceImage

        request = self.context.get('request')
        uploader = request.user if request is not None else None
        value = list(dict.fromkeys(value))[: ExperienceImage.MAX_IMAGES]
        if len(value) > ExperienceImage.MAX_IMAGES:
            raise serializers.ValidationError(
                _('最多上传 %(max)s 张图片。')
                % {'max': ExperienceImage.MAX_IMAGES}
            )
        if not value:
            return value
        # 创建时仅允许本人上传的孤儿图；编辑时额外允许本经验已关联的配图。
        owned = set(
            ExperienceImage.objects.filter(
                pk__in=value,
                uploaded_by=uploader,
                experience__isnull=True,
            ).values_list('pk', flat=True)
        )
        allowed = owned
        if self.instance is not None:
            attached = set(
                ExperienceImage.objects.filter(
                    experience_id=self.instance.pk
                ).values_list('pk', flat=True)
            )
            allowed |= attached
        missing = [i for i in value if i not in allowed]
        if missing:
            raise serializers.ValidationError(
                _('包含无效或已使用的图片。')
            )
        return value

    def create(self, validated_data):
        from .models import ExperienceImage

        image_ids = validated_data.pop('image_ids', [])
        request = self.context.get('request')
        experience = super().create(validated_data)
        if image_ids:
            ExperienceImage.objects.filter(pk__in=image_ids).update(
                experience_id=experience.pk
            )
            # 清理同一上传者其它未关联的孤儿图片
            if request is not None:
                ExperienceImage.objects.filter(
                    uploaded_by=request.user,
                    experience__isnull=True,
                ).exclude(pk__in=image_ids).delete()
        return experience

    def update(self, instance, validated_data):
        from .models import ExperienceImage

        image_ids = validated_data.pop('image_ids', None)
        experience = super().update(instance, validated_data)
        if image_ids is not None:
            current = set(
                ExperienceImage.objects.filter(
                    experience_id=experience.pk
                ).values_list('pk', flat=True)
            )
            new_set = set(image_ids)
            remove = current - new_set
            if remove:
                ExperienceImage.objects.filter(pk__in=remove).delete()
            attach = new_set - current
            if attach:
                ExperienceImage.objects.filter(pk__in=attach).update(
                    experience_id=experience.pk
                )
        return experience


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


class PointsTransferSerializer(serializers.Serializer):
    """按邮箱转赠积分：{to_email, amount, message?}。"""

    to_email = serializers.EmailField()
    amount = serializers.IntegerField(min_value=MIN_TRANSFER_AMOUNT)
    message = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=200
    )

    def validate(self, attrs):
        from django.contrib.auth.models import User

        email = attrs['to_email'].strip().lower()
        recipient = User.objects.filter(username__iexact=email).first() or \
            User.objects.filter(email__iexact=email).first()
        if recipient is None:
            raise serializers.ValidationError(_('对方账号不存在，请核对邮箱。'))
        request = self.context.get('request')
        if request is not None and recipient.pk == request.user.pk:
            raise serializers.ValidationError(_('不能转赠给自己。'))
        attrs['recipient'] = recipient
        attrs['to_email'] = recipient.email
        return attrs


class PointsVoucherCreateSerializer(serializers.Serializer):
    """生成兑换码：{amount}。"""

    amount = serializers.IntegerField(min_value=MIN_VOUCHER_AMOUNT)


class PointsVoucherRedeemSerializer(serializers.Serializer):
    """核销兑换码：{code}。"""

    code = serializers.CharField(max_length=24)

    def validate_code(self, value):
        return value.strip().upper()


class PointsGiftSerializer(serializers.ModelSerializer):
    sender_email = serializers.EmailField(source='sender.email', read_only=True)
    recipient_email = serializers.EmailField(source='recipient.email', read_only=True)

    class Meta:
        model = PointsGift
        fields = ('id', 'sender_email', 'recipient_email', 'amount', 'message', 'created_at')
        read_only_fields = fields


class PointsVoucherSerializer(serializers.ModelSerializer):
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = PointsVoucher
        fields = (
            'id', 'code', 'amount', 'status', 'is_expired',
            'expires_at', 'redeemed_at', 'created_at',
        )
        read_only_fields = fields
