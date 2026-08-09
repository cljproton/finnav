"""用户个人化数据同步端点（需登录）。

- GET  /api/me/                         当前用户资料 + 收藏 id + 搜索历史
- PUT  /api/me/favorites/               整体替换收藏（body: {site_ids: [...]}）
- PUT  /api/me/search-history/          整体替换搜索历史（body: {terms: [...]}）
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserFavorite, UserSearchHistory
from .serializers import (
    FavoritesSyncSerializer,
    SearchHistorySyncSerializer,
    SiteSerializer,
)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        favs = list(
            UserFavorite.objects.filter(user=user).select_related('site')
        )
        history = list(
            UserSearchHistory.objects.filter(user=user)
            .values_list('term', flat=True)
        )
        return Response(
            {
                'id': user.id,
                'email': user.email,
                'favorites': [
                    SiteSerializer(f.site, context={'request': request}).data
                    for f in favs
                ],
                'favorite_ids': [f.site_id for f in favs],
                'search_history': history,
            }
        )


class FavoritesSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        serializer = FavoritesSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        site_ids = serializer.validated_data['site_ids']
        user = request.user
        UserFavorite.objects.filter(user=user).delete()
        UserFavorite.objects.bulk_create(
            [UserFavorite(user=user, site_id=sid) for sid in site_ids]
        )
        return Response({'site_ids': site_ids})


class SearchHistorySyncView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        serializer = SearchHistorySyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        terms = UserSearchHistory.set_terms(request.user, serializer.validated_data['terms'])
        return Response({'terms': terms})

    def delete(self, request):
        UserSearchHistory.objects.filter(user=request.user).delete()
        return Response({'terms': []}, status=status.HTTP_200_OK)