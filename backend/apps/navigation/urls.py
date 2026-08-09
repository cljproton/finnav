from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views
from .auth import (
    EmailTokenObtainPairView,
    captcha_image,
    login,
    password_reset_confirm,
    password_reset_request,
    register,
    verify,
)
from .sync import FavoritesSyncView, MeView, SearchHistorySyncView
from .twofa import (
    twofa_challenge,
    twofa_confirm,
    twofa_disable,
    twofa_setup,
    twofa_status,
)

router = DefaultRouter()
router.register('categories', views.CategoryViewSet, basename='category')
router.register('sites', views.SiteViewSet, basename='site')
router.register('tags', views.TagViewSet, basename='tag')
router.register(
    'site-submissions', views.SiteSubmissionViewSet, basename='site-submission'
)

urlpatterns = [
    path('health/', views.health, name='health'),
    path('settings/', views.SettingsView.as_view(), name='settings'),
    path('auth/captcha/', captcha_image, name='auth-captcha'),
    path('auth/register/', register, name='auth-register'),
    path('auth/verify/', verify, name='auth-verify'),
    path(
        'auth/password-reset/request/',
        password_reset_request,
        name='auth-password-reset-request',
    ),
    path(
        'auth/password-reset/confirm/',
        password_reset_confirm,
        name='auth-password-reset-confirm',
    ),
    path('auth/token/', login, name='auth-token'),
    path(
        'auth/token/refresh/',
        TokenRefreshView.as_view(),
        name='auth-token-refresh',
    ),
    path('auth/twofa/status/', twofa_status, name='auth-twofa-status'),
    path('auth/twofa/setup/', twofa_setup, name='auth-twofa-setup'),
    path('auth/twofa/confirm/', twofa_confirm, name='auth-twofa-confirm'),
    path('auth/twofa/disable/', twofa_disable, name='auth-twofa-disable'),
    path('auth/twofa/challenge/', twofa_challenge, name='auth-twofa-challenge'),
    path('me/', MeView.as_view(), name='me'),
    path('me/favorites/', FavoritesSyncView.as_view(), name='me-favorites'),
    path(
        'me/search-history/',
        SearchHistorySyncView.as_view(),
        name='me-search-history',
    ),
    path('', include(router.urls)),
]
