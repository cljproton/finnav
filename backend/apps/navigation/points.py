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
import secrets

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from .models import PointRule, PointTransaction, PointsGift, PointsVoucher, Referral, UserProfile


def ensure_user_profile(user):
    """惰性创建用户资料并返回；新建时立即生成唯一推广码。

    referral_code 是 unique 字段且默认空串，若用 get_or_create(user=user) 裸创建，
    第二条空串记录会撞唯一约束（IntegrityError → 500）。故此处先预生成推广码
    再 INSERT，绝不落空串；并发创建/码碰撞时重试或回退查询已创建的行。
    """
    profile = UserProfile.objects.filter(user=user).first()
    if profile is not None:
        return profile

    for _ in range(50):
        code = ''.join(
            secrets.choice(UserProfile.REFERRAL_ALPHABET) for _ in range(8)
        )
        if UserProfile.objects.filter(referral_code=code).exists():
            continue
        try:
            return UserProfile.objects.create(user=user, referral_code=code)
        except IntegrityError:
            # 并发下用户资料可能已被他人创建，或生成的码被抢占：回退查询或换码重试
            profile = UserProfile.objects.filter(user=user).first()
            if profile is not None:
                return profile
            continue
    raise RuntimeError('无法生成唯一推广码')


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
        profile = ensure_user_profile(user)
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


def deduct_points(user, amount, ref_type, ref_id, description, idempotent=True):
    """扣除用户积分（平台回收，无收款方），如编辑/删除经验扣费。

    原子执行：锁住余额行，余额不足抛出 ValueError（调用方转 400）。
    idempotent=True 时同一 (user, ref_type, ref_id) 只扣一次（删除场景防重试重复扣费）；
    idempotent=False 允许重复扣除（每次编辑保存都扣费）。
    amount 为正数，返回 PointTransaction 或 None（幂等跳过）。
    """
    amount = int(amount)
    if amount <= 0:
        raise ValueError(_('扣费金额必须为正。'))
    with transaction.atomic():
        profile = ensure_user_profile(user)
        locked = UserProfile.objects.select_for_update().get(pk=profile.pk)
        if idempotent and ref_type and ref_id is not None:
            exists = PointTransaction.objects.filter(
                user=user, ref_type=ref_type, ref_id=ref_id
            ).exists()
            if exists:
                return None
        if locked.points_balance < amount:
            raise ValueError(_('积分不足。'))
        new_balance = locked.points_balance - amount
        tx = PointTransaction.objects.create(
            user=user,
            rule=None,
            amount=-amount,
            balance_after=new_balance,
            ref_type=ref_type,
            ref_id=ref_id,
            description=description or '',
        )
        UserProfile.objects.filter(pk=locked.pk).update(
            points_balance=new_balance,
        )
        return tx


def transfer_points(from_user, to_user, amount, from_ref_type, to_ref_type, ref_id, description=None):
    """用户间积分转账（如经验购买）：从 from_user 扣除 amount，等额转给 to_user。

    原子执行：锁住双方余额行，余额不足抛出 ValueError（调用方转 400）；
    同一 (from_user, from_ref_type, ref_id) 只允许处理一次（幂等），重复调用返回 None。
    from_ref_type / to_ref_type 分别为扣款方与收款方各自的流水来源类型。
    返回 (buyer_tx, seller_tx) 或 None（幂等跳过）。
    """
    amount = int(amount)
    if amount <= 0:
        raise ValueError(_('转账金额必须为正。'))
    if from_user.pk == to_user.pk:
        raise ValueError(_('不能转账给自己。'))
    with transaction.atomic():
        if from_ref_type and ref_id is not None:
            exists = PointTransaction.objects.filter(
                user=from_user, ref_type=from_ref_type, ref_id=ref_id
            ).exists()
            if exists:
                return None
        buyer_profile = ensure_user_profile(from_user)
        seller_profile = ensure_user_profile(to_user)
        # 锁顺序固定（按 pk）避免并发死锁
        locked_buyer = UserProfile.objects.select_for_update().get(
            pk=min(buyer_profile.pk, seller_profile.pk)
        )
        locked_seller = UserProfile.objects.select_for_update().get(
            pk=max(buyer_profile.pk, seller_profile.pk)
        )
        buyer = locked_buyer if locked_buyer.user_id == from_user.pk else locked_seller
        seller = locked_seller if locked_seller.user_id == to_user.pk else locked_buyer
        if buyer.points_balance < amount:
            raise ValueError(_('积分不足，无法购买。'))
        buyer_new = buyer.points_balance - amount
        seller_new = seller.points_balance + amount
        buyer_tx = PointTransaction.objects.create(
            user=from_user,
            rule=None,
            amount=-amount,
            balance_after=buyer_new,
            ref_type=from_ref_type,
            ref_id=ref_id,
            description=description or '',
        )
        seller_tx = PointTransaction.objects.create(
            user=to_user,
            rule=None,
            amount=amount,
            balance_after=seller_new,
            ref_type=to_ref_type,
            ref_id=ref_id,
            description=description or '',
        )
        UserProfile.objects.filter(pk=buyer.pk).update(points_balance=buyer_new)
        UserProfile.objects.filter(pk=seller.pk).update(
            points_balance=seller_new,
            points_lifetime=seller.points_lifetime + amount,
        )
        return buyer_tx, seller_tx


# ---------- 注册奖励 / 积分转赠 / 兑换码 ----------

MIN_TRANSFER_AMOUNT = 10      # 单次转赠最小面额（积分）
MIN_VOUCHER_AMOUNT = 10       # 兑换码最小面额（积分）
VOUCHER_VALID_DAYS = 30       # 兑换码有效期（天），生成时写入 expires_at
VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
VOUCHER_CODE_LENGTH = 12


def grant_registration_bonus(user):
    """新用户注册奖励（每人一次）。返回 PointTransaction 或 None。

    幂等：award_points 依据 (user, rule, ref_type, ref_id) 唯一约束 +
    registration_bonus 规则的 total_limit=1 双重保障，注册只触发一次。
    """
    return award_points(
        user,
        'registration_bonus',
        'registration',
        user.pk,
        description=_('新用户注册奖励'),
    )


def credit_points(user, amount, ref_type, ref_id, description, idempotent=True):
    """为用户加分（无规则，如兑换码核销到账）。

    原子执行：锁住余额行。idempotent=True 时同一 (user, ref_type, ref_id)
    只加一次。amount 为正数，返回 PointTransaction 或 None（幂等跳过）。
    """
    amount = int(amount)
    if amount <= 0:
        raise ValueError(_('加分金额必须为正。'))
    with transaction.atomic():
        profile = ensure_user_profile(user)
        locked = UserProfile.objects.select_for_update().get(pk=profile.pk)
        if idempotent and ref_type and ref_id is not None:
            exists = PointTransaction.objects.filter(
                user=user, ref_type=ref_type, ref_id=ref_id
            ).exists()
            if exists:
                return None
        new_balance = locked.points_balance + amount
        tx = PointTransaction.objects.create(
            user=user,
            rule=None,
            amount=amount,
            balance_after=new_balance,
            ref_type=ref_type,
            ref_id=ref_id,
            description=description or '',
        )
        UserProfile.objects.filter(pk=locked.pk).update(
            points_balance=new_balance,
            points_lifetime=locked.points_lifetime + amount,
        )
        return tx


def gift_points(sender, recipient, amount, message=''):
    """按邮箱转赠积分：sender 扣除 amount，recipient 等额到账（免手续费）。

    原子执行：锁住双方余额行（按 pk 排序防死锁），余额不足抛 ValueError；
    创建 PointsGift 记录并以 gift.pk 为 ref_id 写两条流水。
    返回 (gift, sender_tx, recipient_tx)。
    """
    amount = int(amount)
    if amount < MIN_TRANSFER_AMOUNT:
        raise ValueError(_('单次转赠至少 %(min)s 积分。') % {'min': MIN_TRANSFER_AMOUNT})
    if sender.pk == recipient.pk:
        raise ValueError(_('不能转赠给自己。'))
    with transaction.atomic():
        sender_profile = ensure_user_profile(sender)
        recipient_profile = ensure_user_profile(recipient)
        locked_a = UserProfile.objects.select_for_update().get(
            pk=min(sender_profile.pk, recipient_profile.pk)
        )
        locked_b = UserProfile.objects.select_for_update().get(
            pk=max(sender_profile.pk, recipient_profile.pk)
        )
        giver = locked_a if locked_a.user_id == sender.pk else locked_b
        receiver = locked_b if locked_b.user_id == recipient.pk else locked_a
        if giver.points_balance < amount:
            raise ValueError(_('积分不足，无法转赠。'))
        giver_new = giver.points_balance - amount
        receiver_new = receiver.points_balance + amount
        gift = PointsGift.objects.create(
            sender=sender, recipient=recipient, amount=amount, message=(message or '')[:200],
        )
        sender_tx = PointTransaction.objects.create(
            user=sender,
            rule=None,
            amount=-amount,
            balance_after=giver_new,
            ref_type='points_gift_out',
            ref_id=gift.pk,
            description=_('转赠积分给 %(email)s') % {'email': recipient.email},
        )
        recipient_tx = PointTransaction.objects.create(
            user=recipient,
            rule=None,
            amount=amount,
            balance_after=receiver_new,
            ref_type='points_gift_in',
            ref_id=gift.pk,
            description=_('收到 %(email)s 转赠的积分') % {'email': sender.email},
        )
        UserProfile.objects.filter(pk=giver.pk).update(points_balance=giver_new)
        UserProfile.objects.filter(pk=receiver.pk).update(
            points_balance=receiver_new,
            points_lifetime=receiver.points_lifetime + amount,
        )
        return gift, sender_tx, recipient_tx


def _generate_voucher_code():
    """生成唯一兑换码（幂等重试，避免撞 unique）。"""
    for _ in range(50):
        code = ''.join(
            secrets.choice(VOUCHER_ALPHABET) for _ in range(VOUCHER_CODE_LENGTH)
        )
        if not PointsVoucher.objects.filter(code=code).exists():
            return code
    raise RuntimeError('无法生成唯一兑换码')


def create_voucher(user, amount):
    """生成积分兑换码：从 user 余额扣除 amount（平台回收，不退还）。

    原子执行：先建兑换码再扣款，余额不足则整体回滚并抛 ValueError（调用方转 400）。
    返回 PointsVoucher。
    """
    amount = int(amount)
    if amount < MIN_VOUCHER_AMOUNT:
        raise ValueError(_('兑换码面额至少 %(min)s 积分。') % {'min': MIN_VOUCHER_AMOUNT})
    code = _generate_voucher_code()
    with transaction.atomic():
        voucher = PointsVoucher.objects.create(
            code=code,
            creator=user,
            amount=amount,
            expires_at=timezone.now() + timezone.timedelta(days=VOUCHER_VALID_DAYS),
        )
        deduct_points(
            user,
            amount,
            'points_voucher_create',
            voucher.pk,
            _('生成积分兑换码'),
            idempotent=True,
        )
    return voucher


def redeem_voucher(user, code):
    """核销兑换码：校验有效性后将面额到账 user（免手续费）。

    原子执行：select_for_update 锁码，状态校验（待核销 / 未过期 / 非本人生成）
    后标记 used 并加分。返回 (voucher, tx)。
    """
    code = (code or '').strip().upper()
    if not code:
        raise ValueError(_('请填写兑换码。'))
    with transaction.atomic():
        voucher = PointsVoucher.objects.select_for_update().filter(
            code__iexact=code
        ).first()
        if voucher is None:
            raise ValueError(_('兑换码不存在。'))
        if voucher.creator_id == user.pk:
            raise ValueError(_('不能核销自己生成的兑换码。'))
        if voucher.status != PointsVoucher.STATUS_ACTIVE:
            raise ValueError(_('兑换码已核销或已作废。'))
        if voucher.expires_at and voucher.expires_at < timezone.now():
            raise ValueError(_('兑换码已过期。'))
        voucher.status = PointsVoucher.STATUS_USED
        voucher.redeemed_by = user
        voucher.redeemed_at = timezone.now()
        voucher.save(update_fields=['status', 'redeemed_by', 'redeemed_at'])
        tx = credit_points(
            user,
            voucher.amount,
            'points_voucher_redeem',
            voucher.pk,
            _('核销积分兑换码'),
            idempotent=True,
        )
    return voucher, tx
