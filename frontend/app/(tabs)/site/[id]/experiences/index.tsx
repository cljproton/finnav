import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Modal from "@ant-design/react-native/es/modal";
import Toast from "@ant-design/react-native/es/toast";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import {
  deleteExperience,
  useSiteExperiences,
} from "../../../../../lib/api";
import { useAuth } from "../../../../../lib/auth";
import { useThemeColors } from "../../../../../constants/colors";
import type { Experience } from "../../../../../lib/types";
import AuthModal from "../../../../../components/AuthModal";

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DEFAULT_ASPECT = 3 / 4;
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 1.6;
const CARD_TEXT_HEIGHT = 92;
const COLUMN_GAP = 12;

function clampAspect(ratio: number): number {
  return Math.min(Math.max(ratio, MIN_ASPECT), MAX_ASPECT);
}

/* ---------- 双列瀑布流分配 ---------- */

function buildColumns(
  items: Experience[],
  ratios: Record<number, number>,
  colWidth: number,
): [Experience[], Experience[]] {
  const cols: [Experience[], Experience[]] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const ratio = clampAspect(ratios[item.id] || DEFAULT_ASPECT);
    const height = colWidth / ratio + CARD_TEXT_HEIGHT;
    const idx = heights[0] <= heights[1] ? 0 : 1;
    cols[idx].push(item);
    heights[idx] += height;
  }
  return cols;
}

/* ---------- 小红书风卡片 ---------- */

function WaterfallCard({
  item,
  colors,
  width,
  ratio,
  onRatio,
  onPress,
  onDelete,
  onEdit,
}: {
  item: Experience;
  colors: any;
  width: number;
  ratio: number;
  onRatio: (id: number, value: number) => void;
  onPress: (e: Experience) => void;
  onDelete: (e: Experience) => void;
  onEdit: (e: Experience) => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.card,
        {
          width,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.imageWrap}>
        {item.cover ? (
          <Image
            source={{ uri: item.cover }}
            style={[styles.image, { aspectRatio: ratio }]}
            contentFit="cover"
            transition={150}
            onLoad={(e) => {
              const src = e.source;
              if (src && src.width && src.height) {
                onRatio(item.id, clampAspect(src.width / src.height));
              }
            }}
          />
        ) : (
          <View
            style={[
              styles.image,
              styles.imagePlaceholder,
              { backgroundColor: colors.chipBg, aspectRatio: ratio },
            ]}
          >
            <Ionicons name="flask-outline" size={28} color={colors.textTertiary} />
          </View>
        )}

        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>
            {item.price} {t("积分")}
          </Text>
        </View>
        <View style={styles.likeBadge}>
          <Ionicons name="heart" size={12} color="#FFFFFF" />
          <Text style={styles.likeText}>{item.like_count}</Text>
        </View>
      </View>

      <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.text }]}>
        {item.title}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.cardAuthor, { color: colors.textTertiary }]}
      >
        {item.author_name} · {formatTime(item.created_at)}
      </Text>

      {item.is_mine ? (
        <View style={styles.ownActions}>
          <Pressable
            onPress={() => onEdit(item)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.ownBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="pencil-outline" size={13} color={colors.primary} />
            <Text style={[styles.ownBtnText, { color: colors.primary }]}>
              {t("编辑")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(item)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.ownBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="trash-outline" size={13} color={colors.error} />
            <Text style={[styles.ownBtnText, { color: colors.error }]}>
              {t("删除")}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ---------- main ---------- */

export default function SiteExperiencesScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = Number(id);
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();

  const [authVisible, setAuthVisible] = useState(false);
  const [ratios, setRatios] = useState<Record<number, number>>({});

  const { data: pages, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useSiteExperiences(siteId);

  const experiences = pages?.pages.flatMap((p) => p.results) ?? [];

  const contentWidth = Math.min(windowWidth, 720) - 40;
  const colWidth = Math.floor((contentWidth - COLUMN_GAP) / 2);

  const [colLeft, colRight] = useMemo(
    () => buildColumns(experiences, ratios, colWidth),
    [experiences, ratios, colWidth],
  );

  const handleRatio = useCallback((expId: number, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setRatios((prev) => (prev[expId] === value ? prev : { ...prev, [expId]: value }));
  }, []);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/site/${siteId}`);
    }
  };

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["site-experiences", siteId] });
    queryClient.invalidateQueries({ queryKey: ["site", siteId] });
    queryClient.invalidateQueries({ queryKey: ["me-points"] });
  }, [queryClient, siteId]);

  const openPublish = () => {
    if (!loggedIn) {
      setAuthVisible(true);
      return;
    }
    router.push(`/site/${siteId}/experiences/create`);
  };

  const openEdit = (item: Experience) => {
    if (!loggedIn) {
      setAuthVisible(true);
      return;
    }
    router.push(`/site/${siteId}/experiences/${item.id}/edit`);
  };

  const handleDelete = (item: Experience) => {
    Modal.alert(
      t("删除经验"),
      t("确认删除「{{title}}」？将扣除 {{cost}} 积分（3 倍购买定价），购买与点赞记录将保留。", {
        title: item.title,
        cost: item.price * 3,
      }),
      [
        { text: t("取消"), style: "cancel" as const },
        {
          text: t("确认删除"),
          style: "destructive" as const,
          onPress: async () => {
            try {
              await deleteExperience(siteId, item.id);
              Toast.success(t("已删除"), 1.5);
              refresh();
            } catch (e: any) {
              Toast.fail(e?.message || t("删除失败"), 1.5);
            }
          },
        },
      ],
    );
  };

  const renderCard = (item: Experience) => (
    <WaterfallCard
      key={item.id}
      item={item}
      colors={colors}
      width={colWidth}
      ratio={clampAspect(ratios[item.id] || DEFAULT_ASPECT)}
      onRatio={handleRatio}
      onPress={(e) => router.push(`/site/${siteId}/experiences/${e.id}`)}
      onDelete={handleDelete}
      onEdit={openEdit}
    />
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{t("个人经验")}</Text>
        <View style={styles.topBarRight}>
          <Pressable
            onPress={openPublish}
            hitSlop={12}
            style={({ pressed }) => [
              styles.publishBtn,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.primary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={[styles.publishBtnText, { color: colors.primary }]}>
              {t("发布经验")}
            </Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : experiences.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.chipBg }]}>
            <Ionicons name="flask-outline" size={36} color={colors.textTertiary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("暂无经验")}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
            {t("发布第一份经验，赚取积分")}
          </Text>
          <Pressable
            onPress={openPublish}
            style={({ pressed }) => [
              styles.emptyBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.emptyBtnText, { color: colors.surfaceSolid }]}>
              {t("发布经验")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (
              hasNextPage &&
              !isFetchingNextPage &&
              layoutMeasurement.height + contentOffset.y >= contentSize.height - 80
            ) {
              fetchNextPage();
            }
          }}
          scrollEventThrottle={16}
        >
          <View style={styles.feed}>
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              {t("发布你的实战经验，其他人需积分购买解锁")}
            </Text>

            <View style={styles.columns}>
              <View style={[styles.column, { gap: COLUMN_GAP }]}>
                {colLeft.map(renderCard)}
              </View>
              <View style={[styles.column, { gap: COLUMN_GAP }]}>
                {colRight.map(renderCard)}
              </View>
            </View>

            {hasNextPage ? (
              <Pressable
                onPress={() => fetchNextPage()}
                style={[styles.loadMore, { borderColor: colors.border }]}
              >
                <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                  {isFetchingNextPage ? t("加载中…") : t("加载更多")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      )}

      <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onLogin={(email, password, captcha) => auth.login(email, password, captcha)}
        onLoginTFA={(email, totpToken, code) => auth.loginTFA(email, totpToken, code)}
        onRegister={(email, password, captcha) => auth.register(email, password, captcha)}
        onVerify={(email, code, password) => auth.verify(email, code, password)}
        onRequestReset={(email) => auth.requestPasswordReset(email)}
        onResetPassword={(email, code, password) => auth.resetPassword(email, code, password)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  topBarRight: {
    width: 84,
    alignItems: "flex-end",
  },
  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  publishBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  list: {
    alignItems: "stretch",
    paddingBottom: 40,
  },
  feed: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 14,
  },
  columns: {
    flexDirection: "row",
    gap: COLUMN_GAP,
  },
  column: {
    flex: 1,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  imageWrap: {
    width: "100%",
  },
  image: {
    width: "100%",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  priceBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "#FF2442",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priceText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  likeBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  likeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  cardAuthor: {
    fontSize: 12,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 8,
  },
  ownActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  ownBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  ownBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  emptyDesc: {
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  emptyBtn: {
    marginTop: 18,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 30,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  loadMore: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: "600",
  },
});