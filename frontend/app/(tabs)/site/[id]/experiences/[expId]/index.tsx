import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator as RNActivityIndicator,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Modal from "@ant-design/react-native/es/modal";
import Toast from "@ant-design/react-native/es/toast";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import {
  deleteExperience,
  fetchExperienceDetail,
  purchaseExperience,
  toggleExperienceLike,
} from "../../../../../../lib/api";
import { useAuth } from "../../../../../../lib/auth";
import type { CaptchaPayload } from "../../../../../../lib/auth";
import { useThemeColors } from "../../../../../../constants/colors";
import type { Experience } from "../../../../../../lib/types";
import AuthModal from "../../../../../../components/AuthModal";

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ExperienceDetailScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const queryClient = useQueryClient();

  const { id, expId } = useLocalSearchParams<{ id: string; expId: string }>();
  const siteId = Number(id);
  const experienceId = Number(expId);

  const [item, setItem] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [liking, setLiking] = useState(false);
  const [liked, setLiked] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchExperienceDetail(siteId, experienceId);
      setItem(data);
      setLiked(data.liked);
    } catch (e: any) {
      Toast.fail(e?.message || t("加载失败"), 1.5);
    } finally {
      setLoading(false);
    }
  }, [siteId, experienceId, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const refreshRelated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["site-experiences", siteId] });
    queryClient.invalidateQueries({ queryKey: ["site", siteId] });
    queryClient.invalidateQueries({ queryKey: ["me-points"] });
    queryClient.invalidateQueries({ queryKey: ["me-points-transactions"] });
  }, [queryClient, siteId]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/site/${siteId}/experiences`);
    }
  };

  const handleBuy = async () => {
    if (!loggedIn) {
      setAuthVisible(true);
      return;
    }
    setPurchasing(true);
    try {
      const updated = await purchaseExperience(siteId, experienceId);
      setItem(updated);
      setLiked(updated.liked);
      Toast.success(t("购买成功"), 1.5);
      refreshRelated();
    } catch (e: any) {
      const msg = e?.message || t("购买失败");
      if (String(msg).includes("积分不足")) {
        Modal.alert(
          t("积分不足"),
          t("当前积分不足以购买该经验，去积分中心赚取积分后再来吧。"),
          [
            { text: t("取消"), style: "cancel" as const },
            { text: t("去积分中心"), onPress: () => router.push("/points") },
          ],
        );
      } else {
        Toast.fail(msg, 1.5);
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleLike = async () => {
    if (!loggedIn) {
      setAuthVisible(true);
      return;
    }
    if (liking) return;
    setLiking(true);
    try {
      const res = await toggleExperienceLike(siteId, experienceId);
      setLiked(res.liked);
      setItem((prev) =>
        prev ? { ...prev, like_count: res.like_count } : prev
      );
      queryClient.invalidateQueries({ queryKey: ["site-experiences", siteId] });
    } catch (e: any) {
      Toast.fail(e?.message || t("操作失败"), 1.5);
    } finally {
      setLiking(false);
    }
  };

  const handleDelete = () => {
    if (!item) return;
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
              await deleteExperience(siteId, experienceId);
              Toast.success(t("已删除"), 1.5);
              refreshRelated();
              goBack();
            } catch (e: any) {
              const msg = e?.message || t("删除失败");
              if (String(msg).includes("积分不足")) {
                Modal.alert(
                  t("积分不足"),
                  t(
                    "当前积分不足以删除该经验（需 {{cost}} 积分），去积分中心赚取积分后再来吧。",
                    { cost: item.price * 3 },
                  ),
                  [
                    { text: t("取消"), style: "cancel" as const },
                    { text: t("去积分中心"), onPress: () => router.push("/points") },
                  ],
                );
              } else {
                Toast.fail(msg, 1.5);
              }
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
          {t("加载失败")}
        </Text>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [
            styles.backHomeBtn,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.backHomeText, { color: colors.primary }]}>
            {t("返回")}
          </Text>
        </Pressable>
      </View>
    );
  }

  const unlocked = item.has_purchased || item.is_mine;
  const canLike = unlocked;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.text }]}
        >
          {item.title}
        </Text>
        <View style={styles.topBarRight}>
          {item.is_mine ? (
            <Pressable
              onPress={handleDelete}
              hitSlop={10}
              style={({ pressed }) => [
                styles.iconBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </Pressable>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        {item.cover ? (
          <ExpoImage
            source={{ uri: item.cover }}
            style={styles.cover}
            contentFit="cover"
          />
        ) : null}

        <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>

        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.textTertiary }]}>
            {t("作者：{{name}}", { name: item.author_name })} · {formatTime(item.created_at)}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="heart-outline" size={14} color={colors.textTertiary} />
            <Text style={[styles.statText, { color: colors.textTertiary }]}>
              {t("{{count}} 个赞", { count: item.like_count })}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="cart-outline" size={14} color={colors.textTertiary} />
            <Text style={[styles.statText, { color: colors.textTertiary }]}>
              {t("{{count}} 人已购买", { count: item.sales_count })}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="star-outline" size={14} color={colors.primary} />
            <Text style={[styles.statPrice, { color: colors.primary }]}>
              {item.price} {t("积分")}
            </Text>
          </View>
        </View>

        {unlocked ? (
          <>
            <Text style={[styles.contentLabel, { color: colors.textSecondary }]}>
              {t("正文")}
            </Text>
            <Text style={[styles.content, { color: colors.text }]}>{item.content}</Text>

            {item.images.length > 0 ? (
              <View style={styles.imageList}>
                {item.images.map((img) => (
                  <ExpoImage
                    key={img.id}
                    source={{ uri: img.url }}
                    style={styles.image}
                    contentFit="cover"
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                onPress={handleLike}
                disabled={liking || !canLike}
                style={({ pressed }) => [
                  styles.likeBtn,
                  {
                    backgroundColor: liked ? colors.primaryLight : colors.chipBg,
                    borderColor: liked ? colors.primary : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={liked ? "heart" : "heart-outline"}
                  size={18}
                  color={liked ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.likeBtnText,
                    { color: liked ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {liked ? t("已点赞") : t("点赞")}
                </Text>
              </Pressable>

              {item.is_mine ? (
                <Pressable
                  onPress={() =>
                    router.push(`/site/${siteId}/experiences/${experienceId}/edit`)
                  }
                  style={({ pressed }) => [
                    styles.editBtn,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                  <Text style={[styles.editBtnText, { color: colors.primary }]}>
                    {t("编辑")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : (
          <View
            style={[
              styles.lockedCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={32} color={colors.textTertiary} />
            <Text style={[styles.lockedTitle, { color: colors.text }]}>
              {t("购买后解锁全文")}
            </Text>
            <Text style={[styles.lockedPrice, { color: colors.primary }]}>
              {item.price} {t("积分")}
            </Text>
            <Pressable
              onPress={handleBuy}
              disabled={purchasing}
              style={({ pressed }) => [
                styles.buyBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              {purchasing ? (
                <RNActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.buyBtnText}>
                  {loggedIn
                    ? t("{{price}} 积分解锁", { price: item.price })
                    : t("登录后购买解锁")}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>

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
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
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
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  topBarRight: {
    width: 36,
    alignItems: "flex-end",
  },
  iconBtn: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  cover: {
    width: "100%",
    height: 200,
    borderRadius: 14,
    marginBottom: 14,
  },
  itemTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  metaRow: {
    marginTop: 8,
  },
  meta: {
    fontSize: 13,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.25)",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 13,
  },
  statPrice: {
    fontSize: 14,
    fontWeight: "700",
  },
  contentLabel: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 8,
  },
  content: {
    fontSize: 15,
    lineHeight: 24,
  },
  imageList: {
    gap: 10,
    marginTop: 14,
  },
  image: {
    width: "100%",
    height: 220,
    borderRadius: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  likeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  likeBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  lockedCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginTop: 18,
  },
  lockedTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
  },
  lockedPrice: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  buyBtn: {
    marginTop: 16,
    alignSelf: "stretch",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  buyBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
  },
  backHomeBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  backHomeText: {
    fontSize: 14,
    fontWeight: "600",
  },
});