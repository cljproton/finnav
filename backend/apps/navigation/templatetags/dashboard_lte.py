"""AdminLTE 概览页数据：分类访问统计 + 站点综合排序。"""
import datetime

from django import template
from django.db.models import Count
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.utils import timezone

from ..models import AppDownload, Category, Site, SiteVisit

register = template.Library()

VISIT_WEIGHT = 0.5
RATING_WEIGHT = 0.3
COUNT_WEIGHT = 0.2


def _composite_score(visit_count, rating_avg, rating_count, max_visit, max_count):
    """把访问量、平均星级、评分人数归一化到 0-10 后加权求和。"""
    visit_norm = 10.0 * visit_count / max_visit if max_visit else 0.0
    count_norm = 10.0 * rating_count / max_count if max_count else 0.0
    return round(
        VISIT_WEIGHT * visit_norm
        + RATING_WEIGHT * rating_avg
        + COUNT_WEIGHT * count_norm,
        1,
    )


@register.inclusion_tag('admin/dashboard_overview.html', takes_context=True)
def site_overview(context):
    """渲染概览：分类统计卡片 + 站点综合排序表格。"""
    sites = list(
        Site.objects.filter(is_active=True)
        .select_related('category')
        .annotate(score_count=Count('ratings', distinct=True))
    )

    categories = []
    for category in Category.objects.filter(is_active=True).order_by('sort_order'):
        cat_sites = [s for s in sites if s.category_id == category.id]
        if not cat_sites:
            continue
        categories.append(
            {
                'name': category.name,
                'icon': category.icon or '',
                'site_count': len(cat_sites),
                'total_visits': sum(s.visit_count for s in cat_sites),
                'rating_count': sum(s.score_count for s in cat_sites),
                'rating_avg': round(
                    sum(s.rating_avg for s in cat_sites if s.rating_count) / len(cat_sites),
                    1,
                )
                if cat_sites
                else 0.0,
            }
        )

    max_visit = max((s.visit_count for s in sites), default=0)
    max_count = max((s.score_count for s in sites), default=0)

    ranked = sorted(
        sites,
        key=lambda s: _composite_score(
            s.visit_count, s.rating_avg, s.score_count, max_visit, max_count
        ),
        reverse=True,
    )

    top_sites = []
    for site in ranked[:10]:
        top_sites.append(
            {
                'id': site.id,
                'name': site.name,
                'category_name': site.category.name,
                'visit_count': site.visit_count,
                'rating_avg': site.rating_avg,
                'rating_count': site.score_count,
                'composite': _composite_score(
                    site.visit_count,
                    site.rating_avg,
                    site.score_count,
                    max_visit,
                    max_count,
                ),
            }
        )

    total_sites = len(sites)
    total_visits = sum(s.visit_count for s in sites)
    total_ratings = sum(s.score_count for s in sites)
    global_avg = (
        round(sum(s.rating_avg for s in sites if s.rating_count) / sum(
            1 for s in sites if s.rating_count
        ), 1)
        if any(s.rating_count for s in sites)
        else 0.0
    )

    return {
        'overview': {
            'total_sites': total_sites,
            'total_visits': total_visits,
            'total_ratings': total_ratings,
            'global_avg': global_avg,
        },
        'overview_categories': categories,
        'overview_top_sites': top_sites,
    }


# ------------------- 访问趋势（每日/每周/每月） -------------------

DAILY_DAYS = 30     # 每日趋势近 N 天
WEEKLY_WEEKS = 12   # 每周趋势近 N 周
MONTHLY_MONTHS = 12  # 每月趋势近 N 月


def _today():
    return timezone.localtime(timezone.now()).date()


def _last_days(n):
    today = _today()
    return [today - datetime.timedelta(days=i) for i in range(n - 1, -1, -1)]


def _last_weeks(n):
    today = _today()
    cur = today - datetime.timedelta(days=today.weekday())  # 本周周一
    return [cur - datetime.timedelta(weeks=i) for i in range(n - 1, -1, -1)]


def _last_months(n):
    today = _today()
    result = []
    for i in range(n - 1, -1, -1):
        mm = today.month - i
        yy = today.year
        while mm <= 0:
            mm += 12
            yy -= 1
        result.append((yy, mm))
    return result


def _build_series(bucket_counts, buckets, cat_ids, cat_names, fmt):
    """按时间桶顺序 + 分类拼成 ECharts 序列，缺失补 0。"""
    return {
        'labels': [fmt(b) for b in buckets],
        'series': [
            {'name': cat_names[cid], 'data': [
                bucket_counts.get((b, cid), 0) for b in buckets
            ]}
            for cid in cat_ids
        ],
    }


@register.inclusion_tag('admin/visit_trends.html', takes_context=True)
def visit_trends(context):
    """访问趋势：每日(近30天)/每周(近12周)/每月(近12个月)，按分类堆叠、缺失补 0。"""
    tz = timezone.get_current_timezone()
    categories = list(Category.objects.filter(is_active=True).order_by('sort_order'))
    cat_ids = [c.id for c in categories]
    cat_names = {c.id: c.name for c in categories}

    def _agg(trunc_fn, buckets):
        if isinstance(buckets[0], tuple):  # 月度桶：(year, month)
            first = datetime.date(buckets[0][0], buckets[0][1], 1)
        else:
            first = buckets[0]
        start = timezone.make_aware(
            datetime.datetime.combine(first, datetime.time.min), tz
        )
        rows = (
            SiteVisit.objects.filter(visited_at__gte=start)
            .annotate(bucket=trunc_fn('visited_at', tzinfo=tz))
            .values('bucket', 'site__category_id')
            .annotate(count=Count('id'))
        )
        counts = {}
        for r in rows:
            key = r['bucket']
            if trunc_fn is TruncMonth:
                key = (key.year, key.month)
            elif isinstance(key, datetime.datetime):
                # TruncWeek/TruncDay 在 tzinfo 下返回带 00:00 的 datetime，归一为 date
                key = key.date()
            counts[(key, r['site__category_id'])] = r['count']
        return counts

    daily_buckets = _last_days(DAILY_DAYS)
    daily_counts = _agg(TruncDate, daily_buckets)
    weekly_buckets = _last_weeks(WEEKLY_WEEKS)
    weekly_counts = _agg(TruncWeek, weekly_buckets)
    monthly_buckets = _last_months(MONTHLY_MONTHS)
    monthly_counts = _agg(TruncMonth, monthly_buckets)

    return {
        'visit_trends': {
            'daily': _build_series(
                daily_counts, daily_buckets, cat_ids, cat_names,
                lambda d: d.strftime('%m-%d'),
            ),
            'weekly': _build_series(
                weekly_counts, weekly_buckets, cat_ids, cat_names,
                lambda d: d.strftime('%m-%d'),
            ),
            'monthly': _build_series(
                monthly_counts, monthly_buckets, cat_ids, cat_names,
                lambda b: f'{b[0]}-{b[1]:02d}',
            ),
        }
    }


# ------------------- APP 下载统计（通过本站各入口） -------------------

_PLATFORM_LABELS = dict(AppDownload.PLATFORM_CHOICES)


@register.inclusion_tag('admin/download_overview.html', takes_context=True)
def app_downloads(context):
    """通过本站下载 APP 的汇总：总量、按平台分布、Top 站点。"""
    total = AppDownload.objects.count()
    by_platform = [
        {'key': p, 'label': _PLATFORM_LABELS[p], 'count': c}
        for p, c in AppDownload.objects.values_list('platform')
        .annotate(c=Count('id')).order_by('-c')
    ]
    by_platform.sort(key=lambda x: x['count'], reverse=True)
    top_sites = list(
        AppDownload.objects.values('site_id', 'site__name')
        .annotate(c=Count('id'))
        .order_by('-c')[:10]
    )
    return {
        'downloads': {
            'total': total,
            'by_platform': by_platform,
            'top_sites': [
                {'id': r['site_id'], 'name': r['site__name'], 'count': r['c']}
                for r in top_sites
            ],
        }
    }
