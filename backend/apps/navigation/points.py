"""积分发放与邀请推广服务。

所有积分变动都必须经过本模块：
  - award_points()            事件发放（幂等：同一事件只发一次）
  - process_registration()    注册时处理一级邀请并发放双方积分
  - adjust_points()           管理员手动调账（可负，余额不足则拒绝）
  - ensure_user_profile()     惰性创建用户资料（含推广码）

设计要点：
  - PointTransaction 只追加不可改，balance_after 为变动后快照，作为审计依据
  - UserProfile.points_balance 为缓存，事务内 select_for_update 原子更新
  - 规则按 code 查找，未启用/积分为 0/超限时静默跳过（不影响业务主流程）
"""
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from .models import PointRule, PointTransaction, Referral, UserProfile


def ensure_user_profile(user):
    """惰性创建用户资料并返回。"""
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def _get_rule(code):
    return PointRule.objects.filter(code=code).first()


def _over_limit(user, rule):
    """校验每用户每日/累计发放次数上限（0 表示不限）。"""
    qs = PointTransaction.objects.filter(user=user, rule=rule)
    if rule.total_limit and qs.count() >= rule.total_limit:
        return True
    if rule.daily_limit:
        since = timezone.now() - timezone.timedelta(hours=24)
        if qs.filter(created_at__gte=since).count() >= rule.daily_limit:
            return True
    return False


def _apply(user, rule, ref_type, ref_id, description):
    """事务内写台账并更新缓存余额。锁内复查幂等与发放上限。"""
    with transaction.atomic():
        profile, _ = UserProfile.objects.get_or_create(user=user)
        # 锁住余额行（MySQL/PG 生效），并取最新快照
        locked = UserProfile.objects.select_for_update().get(pk=profile.pk)
        # 锁内复查幂等：同一 (user, rule, ref_type, ref_id) 只发一次
        if PointTransaction.objects.filter(
            user=user, rule=rule, ref_type=ref_type, ref_id=ref_id
        ).exists():
            return None
        # 锁内复查每日/累计上限，防止并发绕过
        if _over_limit(user, rule):
            return None
        amount = rule.points
        new_balance = locked.points_balance + amount
        if new_balance < 0:
            new_balance = 0
        tx = PointTransaction.objects.create(
            user=user,
            rule=rule,
            amount=amount,
            balance_after=new_balance,
            ref_type=ref_type,
            ref_id=ref_id,
            description=description or '',
        )
        UserProfile.objects.filter(pk=locked.pk).update(
            points_balance=new_balance,
            points_lifetime=locked.points_lifetime + max(amount, 0),
        )
        return tx


def award_points(user, rule_code, ref_type, ref_id, description=None):
    """按规则发放积分，返回 PointTransaction 或 None（跳过）。

    幂等：同一 (user, rule, ref_type, ref_id) 只发一次；规则未启用、
    积分为 0 或超出上限时静默跳过，不抛异常以免影响审核等主流程。
    """
    rule = _get_rule(rule_code)
    if rule is None or not rule.enabled or rule.points == 0:
        return None
    if ref_id is None:
        return None
    if _over_limit(user, rule):
        return None
    return _apply(user, rule, ref_type, ref_id, description)


def process_registration(user, referral_code):
    """注册后处理一级邀请：被邀请人唯一，注册即达标并发放双方积分。

    返回 Referral 记录或 None（无有效推广码 / 自邀请 / 已被邀请）。
    """
    code = (referral_code or '').strip().upper()
    if not code:
        return None
    inviter_profile = (
        UserProfile.objects.filter(referral_code__iexact=code)
        .select_related('user')
        .first()
    )
    if inviter_profile is None:
        return None
    inviter = inviter_profile.user
    if inviter.pk == user.pk:
        return None
    if Referral.objects.filter(referee=user).exists():
        return None
    referral = Referral.objects.create(
        inviter=inviter, referee=user, code=inviter_profile.referral_code
    )
    award_points(
        user,
        'referral_referee',
        'referral',
        referral.pk,
        description=_('好友邀请注册奖励'),
    )
    award_points(
        inviter,
        'referral_inviter',
        'referral',
        referral.pk,
        description=_('邀请好友注册奖励'),
    )
    return referral


def adjust_points(user, amount, reason):
    """管理员手动调账（amount 可为负）。余额不足时拒绝并抛出 ValueError。"""
    amount = int(amount)
    if amount == 0:
        raise ValueError(_('积分变动不能为 0。'))
    reason = (reason or '').strip()
    if not reason:
        raise ValueError(_('请填写调整原因。'))
    with transaction.atomic():
        profile = ensure_user_profile(user)
        locked = UserProfile.objects.select_for_update().get(pk=profile.pk)
        new_balance = locked.points_balance + amount
        if new_balance < 0:
            raise ValueError(_('积分不足，无法扣减。'))
        tx = PointTransaction.objects.create(
            user=user,
            rule=None,
            amount=amount,
            balance_after=new_balance,
            ref_type='manual',
            ref_id=None,
            description=reason,
        )
        UserProfile.objects.filter(pk=locked.pk).update(
            points_balance=new_balance,
            points_lifetime=locked.points_lifetime + max(amount, 0),
        )
        return tx
