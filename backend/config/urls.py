"""Root URL configuration for the finnav backend."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.admin.views.decorators import staff_member_required
from django.urls import include, path
from django.views.generic import RedirectView

from apps.navigation import views

urlpatterns = [
    # Django 语言切换视图（POST /i18n/setlang/，后台中文/英文切换）
    path('i18n/', include('django.conf.urls.i18n')),
    # SimpleUI 首页看板（独立页面，放在 admin include 之前避免被吞）
    path(
        'admin/overview/',
        staff_member_required(views.admin_overview, login_url='admin:login'),
        name='admin_overview',
    ),
    path(
        'admin/backup/',
        staff_member_required(views.admin_backup, login_url='admin:login'),
        name='admin_backup',
    ),
    path(
        'admin/twofa/',
        staff_member_required(views.admin_twofa, login_url='admin:login'),
        name='admin_twofa',
    ),
    path(
        'admin/upgrade-notes/',
        staff_member_required(views.admin_upgrade_notes, login_url='admin:login'),
        name='admin_upgrade_notes',
    ),
    path(
        'admin/navigation/twofactor/',
        RedirectView.as_view(url='/admin/', permanent=True),
    ),
    path('admin/', admin.site.urls),
    path('api/', include('apps.navigation.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
