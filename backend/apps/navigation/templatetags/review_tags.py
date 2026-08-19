"""待审核中心模板标签：后台右上角徽标等场景的服务端渲染计数。"""
from django import template

from ..models import AppLinkSubmission, SiteSubmission, SiteTutorial

register = template.Library()


def _pending_counts():
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


@register.simple_tag
def pending_review_total():
    """后台右上角「待审核」徽标总数（含教程删除申请）。"""
    counts = _pending_counts()
    return sum(counts.values())