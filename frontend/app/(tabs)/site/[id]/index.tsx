import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, useColorScheme, Share, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "../../../../lib/i18n";
import Button from "@ant-design/react-native/es/button";
import WhiteSpace from "@ant-design/react-native/es/white-space";
import WingBlank from "@ant-design/react-native/es/wing-blank";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import Toast from "@ant-design/react-native/es/toast";
import {
  useSiteDetail,
  reportVisit,
  submitRating,
  fetchMyRating,
  useUpdateSiteCache,
  useSiteInvite,
  reportAppDownload,
  saveSiteInvite,
  useSettings,
} from "../../../../lib/api";
import { useFavorites } from "../../../../lib/favorites";
import { useAuth } from "../../../../lib/auth";
import type { CaptchaPayload } from "../../../../lib/auth";
import { useThemeColors } from "../../../../constants/colors";
import type { Site, UserSiteInvite } from "../../../../lib/types";
import AuthModal from "../../../../components/AuthModal";
import { Logo } from "../../../../components/Logo";

/* ---------- helpers ---------- */



function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatCachedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function siteDetailUrl(id: number, shareBaseUrl?: string | null): string {
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location?.origin
  ) {
    return `${window.location.origin}/site/${id}`;
  }
  // 后端配置了转发来源域名时用 https/http 链接（装了 App 打开网页版、没装也能看）；否则保持 finnav 深链。
  if (shareBaseUrl) {
    return `${shareBaseUrl.replace(/\/+$/, "")}/site/${id}`;
  }
  return Linking.createURL(`/site/${id}`);
}

function openExternal(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  Linking.openURL(url);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy copy
  }
  try {
    if (typeof document !== "undefined") {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    }
  } catch {
    // ignore
  }
  return false;
}

async function shareSite(site: Site, invite: UserSiteInvite | null | undefined, shareBaseUrl?: string | null) {
  const lines: string[] = [site.name];
  if (invite?.invite_code) lines.push(i18n.t("邀请码: {{code}}", { code: invite.invite_code }));
  if (invite?.invite_link) lines.push(i18n.t("邀请链接: {{link}}", { link: invite.invite_link }));
  const detailUrl = siteDetailUrl(site.id, shareBaseUrl);
  lines.push(i18n.t("来源：{{url}}", { url: detailUrl }));
  const message = lines.join("\n");
  const shareUrl = detailUrl;

  // Web：优先原生分享，否则复制到剪贴板（Alert 在 web 不生效，改用 Toast 反馈）。
  if (Platform.OS === "web") {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: site.name, text: message, url: shareUrl });
        return;
      }
    } catch {
      // 用户取消或原生分享不可用 → 走复制
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        Toast.success(i18n.t("已复制站点信息"), 1.5);
        return;
      }
    } catch {
      // fall through to legacy copy
    }
    try {
      if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = message;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        Toast.success(i18n.t("已复制站点信息"), 1.5);
      }
    } catch {
      Toast.fail(i18n.t("复制失败"), 1.5);
    }
    return;
  }

  // 原生：系统分享面板
  try {
    await Share.share({ message, url: shareUrl, title: site.name });
  } catch {
    // user cancelled
  }
}

/* ---------- sub-components ---------- */

function HeroLogo({ site, colors }: { site: Site; colors: any }) {
  const size = 88;
  if (site.logo) {
    return (
      <View
        style={[
          styles.heroLogo,
          {
            width: size,
            height: size,
            borderRadius: size * 0.22,
            backgroundColor: colors.primaryLight,
          },
        ]}
      >
        <Logo uri={site.logo} name={site.name} size={size} />
      </View>
    );
  }


    return (
      <View
        style={[
          styles.heroLogo,
          {
            width: size,
            height: size,
            borderRadius: size * 0.22,
            backgroundColor: colors.primaryLight,
          },
        ]}
      >
        <Logo uri={null} name={site.name} size={size} />
      </View>
    );
}

/* ---------- Star rating input ---------- */

function StarRatingInput({
  value,
  onChange,
  colors,
}: {
  value: number;
  onChange: (v: number) => void;
  colors: any;
}) {
  const displayValue = value;

  return (
    <View style={styles.starRow}>
      {[0, 1, 2, 3, 4].map((starIdx) => {
        const filled = displayValue >= starIdx + 1;
        const halfFilled = !filled && displayValue >= starIdx + 0.5;
        return (
          <Pressable
            key={starIdx}
            onPressIn={() => {
              const newVal = starIdx + 1;
              onChange(newVal === value ? 0 : newVal);
            }}
            style={styles.starWrap}
          >
            {filled ? (
              <Ionicons name="star" size={32} color={colors.starActive} />
            ) : halfFilled ? (
              <View style={styles.halfStarContainer}>
                <Ionicons name="star-outline" size={32} color={colors.starInactive} />
                <View style={styles.halfStarOverlay}>
                  <Ionicons name="star" size={32} color={colors.starActive} />
                </View>
              </View>
            ) : (
              <Ionicons name="star-outline" size={32} color={colors.starInactive} />
            )}
            <Text style={[styles.starValue, { color: colors.textTertiary }]}>
              {starIdx + 1}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Rating section ---------- */

function RatingSection({
  site,
  colors,
  onLoginPress,
}: {
  site: Site;
  colors: any;
  onLoginPress: () => void;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const updateCache = useUpdateSiteCache();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [ratingCount, setRatingCount] = useState(site.rating_count);
  const [ratingAvg, setRatingAvg] = useState(site.rating_avg);
  const [ratingLoaded, setRatingLoaded] = useState(false);
  const localEditRef = useRef(false);

  // 站点数据刷新时同步评分聚合值；用户刚提交评分时不覆盖乐观值（updateCache/patch 优先）。
  useEffect(() => {
    if (localEditRef.current) return;
    setRatingCount(site.rating_count);
    setRatingAvg(site.rating_avg);
  }, [site.id, site.rating_count, site.rating_avg]);

  // 打开详情页即读回当前登录用户既有的评分与评论，用于回显。
  useEffect(() => {
    if (!auth.token) return;
    let alive = true;
    localEditRef.current = false;
    fetchMyRating(site.id)
      .then((r) => {
        if (!alive) return;
        if (localEditRef.current) return; // 拉取期间用户已本地修改，跳过旧数据
        if (r.score !== null) setScore(r.score);
        if (r.comment) setComment(r.comment);
        setRatingLoaded(true);
      })
      .catch(() => {
        setRatingLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [auth.token, site.id]);

  // 落盘评分+评论。
  const persist = useCallback(
    async (nextScore: number, nextComment: string) => {
      if (!auth.token) return false;
      localEditRef.current = true;
      setSubmitting(true);
      setError("");
      try {
        const res = await submitRating(site.id, {
          score: nextScore,
          comment: nextComment.trim() || undefined,
        });
        setRatingCount(res.rating_count);
        setRatingAvg(res.rating_avg);
        updateCache(site.id, {
          rating_count: res.rating_count,
          rating_avg: res.rating_avg,
        });
        queryClient.invalidateQueries({ queryKey: ["site-reviews", site.id] });
        queryClient.invalidateQueries({ queryKey: ["sites"] });
        queryClient.invalidateQueries({ queryKey: ["me-points"] });
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
        return true;
      } catch (e: any) {
        setError(e?.message || t("保存失败"));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [auth.token, site.id, updateCache, queryClient],
  );

  // 点星：自动保存。
  const handleScoreChange = useCallback(
    (newScore: number) => {
      if (!auth.token) {
        onLoginPress();
        return;
      }
      localEditRef.current = true;
      setScore(newScore);
      persist(newScore, comment);
    },
    [auth.token, comment, onLoginPress, persist],
  );

  // 评论：去抖自动保存（停顿后落盘）。
  const commentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (commentTimer.current) clearTimeout(commentTimer.current);
    };
  }, []);
  const handleCommentChange = useCallback(
    (text: string) => {
      setComment(text);
      if (!auth.token) return;
      if (commentTimer.current) clearTimeout(commentTimer.current);
      if (score === 0) return; // 尚未评分，仅记录本地，待打分后一并保存
      commentTimer.current = setTimeout(() => {
        persist(score, text);
      }, 900);
    },
    [auth.token, persist, score],
  );

  // 失焦立即落盘（需已有评分）
  const handleBlur = useCallback(() => {
    if (commentTimer.current) {
      clearTimeout(commentTimer.current);
      commentTimer.current = null;
    }
    if (auth.token && score > 0) {
      persist(score, comment);
    }
  }, [auth.token, score, comment, persist]);

  const hasAggregate = ratingCount > 0;
  const showCommentHint = ratingLoaded && auth.token;
  // 未评分时默认展示满分（5.0）
  const safeAvg = Number.isFinite(ratingAvg) ? ratingAvg : 0;
  const displayAvg = hasAggregate ? safeAvg : 5.0;

  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Ionicons name="star-outline" size={18} color={colors.starActive} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("评价")}</Text>
        <View style={styles.aggregateInline}>
          <Ionicons name="star" size={14} color={colors.starActive} />
          <Text style={[styles.aggregateInlineText, { color: colors.text }]}>
            {displayAvg.toFixed(1)}
          </Text>
          <Text style={[styles.aggregateInlineCount, { color: colors.textTertiary }]}>
            {hasAggregate ? `(${ratingCount})` : t("· 未评分")}
          </Text>
        </View>
      </View>

      {auth.user ? (
        <View style={styles.ratingInputArea}>
          <View style={styles.starHeader}>
            <StarRatingInput value={score} onChange={handleScoreChange} colors={colors} />
            <View style={styles.ratingStatus}>
              {saved ? (
                <Text style={[styles.ratingSaved, { color: colors.success }]}>
                  {t("已保存")}
                </Text>
              ) : submitting ? (
                <Text style={[styles.ratingSaving, { color: colors.textTertiary }]}>
                  {t("保存中…")}
                </Text>
              ) : score > 0 ? (
                <Text style={[styles.scoreValue, { color: colors.text }]}>
                  {t("{{score}} 分", { score })}
                </Text>
              ) : (
                <Text style={[styles.scoreValue, { color: colors.textTertiary }]}>
                  {t("轻触打分")}
                </Text>
              )}
            </View>
          </View>

          <TextInput
            value={comment}
            onChangeText={handleCommentChange}
            onBlur={handleBlur}
            placeholder={t("说点什么…（可选，自动保存）")}
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            style={[
              styles.commentInput,
              {
                color: colors.text,
                backgroundColor: colors.chipBg,
                borderColor: colors.border,
              },
            ]}
          />

          {error ? (
            <Text style={[styles.ratingError, { color: colors.error }]}>{error}</Text>
          ) : null}

          {showCommentHint && score === 0 && !comment.trim() ? (
            <Text style={[styles.ratingHint, { color: colors.textTertiary }]}>
              {t("轻触星星即可评分并自动保存")}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.ratingLoginPrompt}>
          <Button
            onPress={onLoginPress}
            style={{
              ...styles.loginPromptBtn,
              borderColor: colors.primary,
              backgroundColor: "transparent",
            }}
          >
            <View style={styles.loginPromptInner}>
              <Ionicons name="log-in-outline" size={18} color={colors.primary} />
              <Text style={[styles.loginPromptText, { color: colors.primary }]}>
                {t("登录后可打分")}
              </Text>
            </View>
          </Button>
        </View>
      )}
    </View>
  );
}

/* ---------- Reviews entry ---------- */

function ReviewsEntry({
  site,
  colors,
}: {
  site: Site;
  colors: any;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/site/${site.id}/reviews`)}
      style={({ pressed }) => [
        styles.section,
        styles.reviewsEntry,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.sectionHeader, styles.reviewsEntryHeader]}>
        <Ionicons name="chatbubbles-outline" size={18} color={colors.starActive} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("大家的评价")}
        </Text>
        <View style={styles.reviewsEntryRight}>
          <Text style={[styles.reviewsEntryCount, { color: colors.textTertiary }]}>
            {site.rating_count > 0 ? `${site.rating_count} ` : ""}
            {t("查看全部评价")}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      </View>
    </Pressable>
  );
}

/* ---------- Tutorials entry ---------- */

function TutorialsEntry({
  site,
  colors,
}: {
  site: Site;
  colors: any;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/site/${site.id}/tutorials`)}
      style={({ pressed }) => [
        styles.section,
        styles.reviewsEntry,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.sectionHeader, styles.reviewsEntryHeader]}>
        <Ionicons name="book-outline" size={18} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("教程")}
        </Text>
        <View style={styles.reviewsEntryRight}>
          <Text style={[styles.reviewsEntryCount, { color: colors.textTertiary }]}>
            {t("用户分享的教程")}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      </View>
    </Pressable>
  );
}

/* ---------- Experiences entry ---------- */

function ExperiencesEntry({
  site,
  colors,
}: {
  site: Site;
  colors: any;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/site/${site.id}/experiences`)}
      style={({ pressed }) => [
        styles.section,
        styles.reviewsEntry,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.sectionHeader, styles.reviewsEntryHeader]}>
        <Ionicons name="flask-outline" size={18} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("个人经验")}
        </Text>
        <View style={styles.reviewsEntryRight}>
          <Text style={[styles.reviewsEntryCount, { color: colors.textTertiary }]}>
            {t("实战经验 · 积分解锁")}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      </View>
    </Pressable>
  );
}

/* ---------- Invite section ---------- */

function InviteSection({
  site,
  colors,
  onLoginPress,
}: {
  site: Site;
  colors: any;
  onLoginPress: () => void;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const loggedIn = !!auth.token;

  const { data: invite } = useSiteInvite(site.id, loggedIn);
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (invite) {
      setCode(invite.invite_code || "");
      setLink(invite.invite_link || "");
    }
  }, [invite]);

  // 自动保存：任一处修改后停顿 900ms 落盘。
  const inviteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (inviteTimer.current) clearTimeout(inviteTimer.current);
    };
  }, []);
  const persistInvite = useCallback(
    async (nextCode: string, nextLink: string) => {
      if (!auth.token) return;
      setSaving(true);
      setError("");
      try {
        const savedData = await saveSiteInvite(site.id, {
          invite_code: nextCode.trim(),
          invite_link: nextLink.trim(),
        });
        queryClient.setQueryData(["site-invite", site.id], savedData);
        queryClient.invalidateQueries({ queryKey: ["site-invite", site.id] });
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      } catch (e: any) {
        setError(e?.message || t("保存失败"));
      } finally {
        setSaving(false);
      }
    },
    [auth.token, site.id, queryClient],
  );

  const scheduleInviteSave = useCallback(
    (nextCode: string, nextLink: string) => {
      if (inviteTimer.current) clearTimeout(inviteTimer.current);
      inviteTimer.current = setTimeout(() => {
        persistInvite(nextCode, nextLink);
      }, 900);
    },
    [persistInvite],
  );

  const handleCodeChange = useCallback(
    (text: string) => {
      setCode(text);
      scheduleInviteSave(text, link);
    },
    [link, scheduleInviteSave],
  );

  const handleLinkChange = useCallback(
    (text: string) => {
      setLink(text);
      scheduleInviteSave(code, text);
    },
    [code, scheduleInviteSave],
  );

  // 失焦立即落盘
  const handleInviteBlur = useCallback(() => {
    if (inviteTimer.current) {
      clearTimeout(inviteTimer.current);
      inviteTimer.current = null;
    }
    persistInvite(code, link);
  }, [code, link, persistInvite]);

  if (!loggedIn) {
    return (
      <View
        style={[
          styles.section,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.sectionHeader}>
          <Ionicons name="gift-outline" size={18} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("邀请码")}
          </Text>
        </View>
        <Button
          onPress={onLoginPress}
          style={{
            ...styles.loginPromptBtn,
            borderColor: colors.primary,
            backgroundColor: "transparent",
          }}
        >
          <View style={styles.loginPromptInner}>
            <Ionicons name="log-in-outline" size={18} color={colors.primary} />
            <Text style={[styles.loginPromptText, { color: colors.primary }]}>
              {t("登录后配置你的专属邀请码")}
            </Text>
          </View>
        </Button>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Ionicons name="gift-outline" size={18} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("我的邀请码")}
        </Text>
        <View style={styles.inviteStatus}>
          {saved ? (
            <Text style={[styles.ratingSaved, { color: colors.success }]}>{t("已保存")}</Text>
          ) : saving ? (
            <Text style={[styles.ratingSaving, { color: colors.textTertiary }]}>
              {t("保存中…")}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={[styles.inviteHint, { color: colors.textTertiary }]}>
        {t("设置你的专属邀请码或邀请链接，转发站点时自动附带。输入后自动保存。")}
      </Text>

      <TextInput
        value={code}
        onChangeText={handleCodeChange}
        onBlur={handleInviteBlur}
        placeholder={t("邀请码（可选）")}
        placeholderTextColor={colors.textTertiary}
        style={[
          styles.inviteInput,
          {
            color: colors.text,
            backgroundColor: colors.chipBg,
            borderColor: colors.border,
          },
        ]}
      />

      <TextInput
        value={link}
        onChangeText={handleLinkChange}
        onBlur={handleInviteBlur}
        placeholder={t("邀请链接（可选）")}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={[
          styles.inviteInput,
          {
            color: colors.text,
            backgroundColor: colors.chipBg,
            borderColor: colors.border,
          },
        ]}
      />

      {error ? (
        <Text style={[styles.ratingError, { color: colors.error }]}>{error}</Text>
      ) : null}

      <Text style={[styles.inviteHint, { color: colors.textTertiary }]}>
        {t("之后点击右上角分享，邀请码即随站点一起转发。")}
      </Text>
    </View>
  );
}

/* ---------- main ---------- */

export default function SiteDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const router = useRouter();
  const { isFavorite, toggle } = useFavorites();
  const auth = useAuth();
  const loggedIn = !!auth.token;

  const [authVisible, setAuthVisible] = useState(false);
  const visitReported = useRef(false);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const siteId = Number(id);

  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  let cachedSite: Site | undefined;

  // 站点列表已改为分页形状（{pages:{results}|同 key 的任意数组}），
  // 兼容地遍历所有缓存以查找该站点（仅用于首屏提速，非一致来源）。
  const siteQueries = queryClient.getQueriesData({
    queryKey: ["sites"],
  });
  for (const [, data] of siteQueries) {
    if (Array.isArray(data)) {
      const found = data.find((s) => s.id === siteId);
      if (found) {
        cachedSite = found;
        break;
      }
    } else if (data && typeof data === "object" && "pages" in data) {
      const pages = (data as { pages?: Array<{ results?: Site[] }> }).pages;
      const found = (pages ?? []).flatMap((p) => p.results ?? []).find(
        (s) => s.id === siteId,
      );
      if (found) {
        cachedSite = found;
        break;
      }
    }
  }

  const { data: fetchedSite, isLoading, error } = useSiteDetail(siteId);
  const site = fetchedSite ?? cachedSite;
  const fav = site ? isFavorite(site.id) : false;

  const { data: invite } = useSiteInvite(siteId, loggedIn);

  useEffect(() => {
    if (site && !visitReported.current) {
      visitReported.current = true;
      reportVisit(site.id);
    }
  }, [site]);

  // 图标为空时，后台可能正在异步拉取：延迟多次重试刷新接口，
  // 图标就绪后自动出现（无需手动刷新），不会反复轮询。
  const logoPolledFor = useRef<number | null>(null);
  useEffect(() => {
    if (!site || site.logo) return;
    if (logoPolledFor.current === site.id) return;
    logoPolledFor.current = site.id;
    const delays = [3000, 9000, 21000];
    const timers = delays.map((delay) =>
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["site", siteId] });
      }, delay),
    );
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [site, siteId, queryClient]);

  const handleLogin = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) => {
      return auth.login(email, password, captcha);
    },
    [auth],
  );

  const handleLoginTFA = useCallback(
    async (email: string, totpToken: string, code: string) => {
      await auth.loginTFA(email, totpToken, code);
    },
    [auth],
  );

  const handleRegister = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) => {
      return auth.register(email, password, captcha);
    },
    [auth],
  );

  const handleVerify = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.verify(email, code, password);
    },
    [auth],
  );

  const handleRequestReset = useCallback(
    async (email: string) => {
      await auth.requestPasswordReset(email);
    },
    [auth],
  );

  const handleResetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.resetPassword(email, code, password);
    },
    [auth],
  );

  const openAppLinkSubmit = useCallback(() => {
    router.push(`/site/${siteId}/app-links`);
  }, [router, siteId]);

  if (isLoading || !site) {
    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background, paddingTop: 60 },
        ]}
      >
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textTertiary, marginTop: 12 }}>{t("加载中...")}</Text>
        </View>
      </View>
    );
  }

  if (error && !site) {
    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background, paddingTop: 60 },
        ]}
      >
        <View style={styles.centerLoading}>
          <Text style={{ color: colors.error }}>{t("加载失败")}</Text>
          <Pressable onPress={goBack} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.primary }}>{t("返回")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Back + favorite + share header */}
        <View style={styles.topBar}>
          <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
            <Ionicons
              name="chevron-back"
              size={24}
              color={colors.text}
            />
          </Pressable>
          <View style={styles.topBarRight}>
            <Pressable
              onPress={() => shareSite(site, invite, settings?.share_base_url)}
              hitSlop={12}
              style={styles.shareBtn}
            >
              <Ionicons
                name="arrow-redo-outline"
                size={20}
                color={colors.text}
              />
            </Pressable>
            <Pressable
              onPress={() => site && toggle(site)}
              hitSlop={12}
              style={styles.favBtn}
            >
              <Ionicons
                name={fav ? "star" : "star-outline"}
                size={24}
                color={fav ? colors.starActive : colors.starInactive}
              />
            </Pressable>
          </View>
        </View>

        {/* Hero */}
        <View style={styles.heroSection}>
          <HeroLogo site={site} colors={colors} />
          <Text style={[styles.siteName, { color: colors.text }]}>
            {site.name}
          </Text>
          <Text style={[styles.siteDesc, { color: colors.textSecondary }]}>
            {site.description}
          </Text>

          {/* Tags */}
          <View style={styles.tagRow}>
            <View
              style={[
                styles.detailTag,
                styles.categoryTag,
                {
                  backgroundColor: colors.primaryLight,
                  borderColor: colors.borderGlow,
                },
              ]}
            >
              <Text style={[styles.detailTagText, { color: colors.primary }]}>
                {site.category_name}
              </Text>
            </View>
            {(site.tags ?? []).map((tag, idx) => (
              <Pressable
                key={`${tag}-${idx}`}
                onPress={() =>
                  router.push(`/search?q=${encodeURIComponent(tag)}`)
                }
                hitSlop={4}
                style={({ pressed }) => [
                  styles.detailTag,
                  styles.tagChip,
                  {
                    backgroundColor: colors.tagBg,
                    borderColor: "transparent",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.detailTagText, { color: colors.tagText }]}>
                  {tag}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <WhiteSpace size="md" />

        {/* Rating section */}
        <RatingSection
          site={site}
          colors={colors}
          onLoginPress={() => setAuthVisible(true)}
        />

        {/* Other users' reviews */}
        <ReviewsEntry site={site} colors={colors} />

        {/* Invite code section */}
        <InviteSection
          site={site}
          colors={colors}
          onLoginPress={() => setAuthVisible(true)}
        />

        {/* User tutorials entry */}
        <TutorialsEntry site={site} colors={colors} />

        {/* User experiences entry */}
        <ExperiencesEntry site={site} colors={colors} />

        {/* APP download */}
        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("APP 下载")}
            </Text>
            <Pressable
              onPress={openAppLinkSubmit}
              hitSlop={6}
              style={({ pressed }) => [
                styles.appLinkSubmitBtn,
                {
                  backgroundColor: colors.primaryLight,
                  borderColor: colors.primary,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={[styles.appLinkSubmitText, { color: colors.primary }]}>
                {t("提交下载链接")}
              </Text>
            </Pressable>
          </View>

            {/* Android */}
            {(site.app_android_cache_url || site.app_android_url) && (
              <View style={styles.platformBlock}>
                <View style={styles.platformLabelRow}>
                  <Ionicons name="logo-android" size={16} color={colors.primary} />
                  <Text style={[styles.platformLabel, { color: colors.textSecondary }]}>
                    {t("安卓")}
                  </Text>
                  {site.app_android_size ? (
                    <Text style={[styles.platformMeta, { color: colors.textTertiary }]}>
                      {formatBytes(site.app_android_size)}
                    </Text>
                  ) : null}
                </View>
                {site.app_android_has_cache ? (
                  site.app_android_integrity_ok === false ? (
                    <>
                      <View
                        style={[
                          styles.integrityBlocked,
                          {
                            backgroundColor: isDark
                              ? "rgba(248,113,113,0.12)"
                              : "rgba(220,38,38,0.08)",
                            borderColor: colors.error,
                          },
                        ]}
                      >
                        <Ionicons
                          name="warning-outline"
                          size={18}
                          color={colors.error}
                        />
                        <Text style={[styles.integrityBlockedText, { color: colors.error }]}>
                          {t("本站缓存校验失败，可能已被篡改，已暂停本站下载，请使用官网原始链接。")}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Button
                        onPress={() => {
                          if (!loggedIn) {
                            setAuthVisible(true);
                            return;
                          }
                          if (site.app_android_cache_url) {
                            openExternal(site.app_android_cache_url);
                            reportAppDownload(site.id, "android_cache");
                            return;
                          }
                          // 已登录但拿到的还是匿名缓存（无本站地址）：触发带鉴权刷新后重试
                          queryClient.invalidateQueries({ queryKey: ["site", siteId] });
                          queryClient.invalidateQueries({ queryKey: ["sites"] });
                          Toast.info(t("正在获取下载地址，请稍后重试"), 1.5);
                        }}
                        style={{
                          ...styles.downloadBtn,
                          backgroundColor: colors.downloadBg,
                          borderColor: colors.downloadBg,
                        }}
                      >
                        <View style={styles.downloadInner}>
                          <Ionicons
                            name="download-outline"
                            size={20}
                            color={colors.downloadText}
                          />
                          <Text
                            style={[styles.downloadText, { color: colors.downloadText }]}
                          >
                            {t("下载安卓版（本站）")}
                          </Text>
                        </View>
                      </Button>
                      {site.app_android_cached_at ? (
                        <Text
                          style={[styles.cacheHint, { color: colors.textTertiary }]}
                        >
                          {t("本站缓存于 {{time}}", { time: formatCachedAt(site.app_android_cached_at) })}
                        </Text>
                      ) : null}

                      {/* 真实性核验 */}
                      {site.app_android_sha256 ? (
                        <View
                          style={[
                            styles.verifyPanel,
                            {
                              backgroundColor: colors.chipBg,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <View style={styles.verifyHeader}>
                            <Ionicons
                              name="shield-checkmark-outline"
                              size={16}
                              color={colors.primary}
                            />
                            <Text style={[styles.verifyTitle, { color: colors.text }]}>
                              {t("真实性核验")}
                            </Text>
                            {site.app_android_integrity_ok === true ? (
                              <Text
                                style={[styles.verifyBadge, { color: "#16a34a" }]}
                              >
                                {t("✓ 已校验")}
                              </Text>
                            ) : (
                              <Text
                                style={[styles.verifyBadge, { color: colors.textTertiary }]}
                              >
                                {t("尚未核验")}
                              </Text>
                            )}
                          </View>

                          {site.app_android_url ? (
                            <View style={styles.verifyRow}>
                              <Text style={[styles.verifyLabel, { color: colors.textTertiary }]}>
                                {t("缓存来源")}
                              </Text>
                              <View style={styles.verifyUrlBox}>
                                <Text
                                  style={[styles.verifyUrl, { color: colors.primary }]}
                                  numberOfLines={1}
                                  ellipsizeMode="middle"
                                  onPress={() => openExternal(site.app_android_url!)}
                                >
                                  {site.app_android_url}
                                </Text>
                                <Text
                                  style={[styles.verifyCopy, { color: colors.primary }]}
                                  onPress={async () => {
                                    const ok = await copyText(site.app_android_url!);
                                    if (ok) {
                                      Toast.success(t("已复制链接"), 1.5);
                                    } else {
                                      Toast.fail(t("复制失败"), 1.5);
                                    }
                                  }}
                                >
                                  {t("复制")}
                                </Text>
                              </View>
                            </View>
                          ) : null}

                          {site.app_android_cached_at ? (
                            <View style={styles.verifyRow}>
                              <Text style={[styles.verifyLabel, { color: colors.textTertiary }]}>
                                {t("缓存时间")}
                              </Text>
                              <Text style={[styles.verifyValue, { color: colors.text }]}>
                                {formatCachedAt(site.app_android_cached_at)}
                              </Text>
                            </View>
                          ) : null}

                          <View style={styles.verifyRow}>
                            <Text style={[styles.verifyLabel, { color: colors.textTertiary }]}>
                              SHA-256
                            </Text>
                            <View style={styles.verifyHashBox}>
                              <Text
                                style={[styles.verifyHash, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {site.app_android_sha256}
                              </Text>
                              <Text
                                style={[styles.verifyCopy, { color: colors.primary }]}
                                onPress={async () => {
                                  const ok = await copyText(site.app_android_sha256!);
                                  if (ok) {
                                    Toast.success(t("已复制校验值"), 1.5);
                                  } else {
                                    Toast.fail(t("复制失败"), 1.5);
                                  }
                                }}
                              >
                                {t("复制")}
                              </Text>
                            </View>
                          </View>

                          <Text style={[styles.verifyNote, { color: colors.textTertiary }]}>
                            {t("本站缓存 APK 直接抓取自上方官方链接、未做任何修改（已记录 SHA-256）。 可与官网下载包比对校验值，完全一致即为正版安装包。")}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  )
                ) : (
                  <Button
                    onPress={() => {
                      if (site.app_android_url) {
                        openExternal(site.app_android_url);
                        reportAppDownload(site.id, "android_original");
                      } else if (site.app_android_cache_url) {
                        openExternal(site.app_android_cache_url);
                        reportAppDownload(site.id, "android_cache");
                      }
                    }}
                    style={{
                      ...styles.downloadBtn,
                      backgroundColor: colors.primaryLight,
                      borderColor: colors.primary,
                    }}
                  >
                    <View style={styles.downloadInner}>
                      <Ionicons
                        name="download-outline"
                        size={20}
                        color={colors.primary}
                      />
                      <Text style={[styles.downloadText, { color: colors.primary }]}>
                        {t("安卓版 原始下载")}
                      </Text>
                    </View>
                  </Button>
                )}
              </View>
            )}

            {/* Google Play */}
            {site.app_google_play_url ? (
              <View style={[styles.platformBlock, { marginTop: 16 }]}>
                <View style={styles.platformLabelRow}>
                  <Ionicons name="logo-google-playstore" size={16} color={colors.primary} />
                  <Text style={[styles.platformLabel, { color: colors.textSecondary }]}>
                    Google Play
                  </Text>
                </View>
                <Button
                  onPress={() => {
                    openExternal(site.app_google_play_url);
                    reportAppDownload(site.id, "google_play");
                  }}
                  style={{
                    ...styles.downloadBtn,
                    backgroundColor: colors.primaryLight,
                    borderColor: colors.primary,
                  }}
                >
                  <View style={styles.downloadInner}>
                    <Ionicons
                      name="logo-google-playstore"
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={[styles.downloadText, { color: colors.primary }]}>
                      {t("Google Play 下载")}
                    </Text>
                  </View>
                </Button>
              </View>
            ) : null}

            {/* iOS */}
            {site.app_ios_url ? (
              <View style={[styles.platformBlock, { marginTop: 16 }]}>
                <View style={styles.platformLabelRow}>
                  <Ionicons name="logo-apple" size={16} color={colors.primary} />
                  <Text style={[styles.platformLabel, { color: colors.textSecondary }]}>
                    iOS
                  </Text>
                </View>
                <Button
                  onPress={() => {
                    openExternal(site.app_ios_url);
                    reportAppDownload(site.id, "ios");
                  }}
                  style={{
                    ...styles.downloadBtn,
                    backgroundColor: colors.primaryLight,
                    borderColor: colors.primary,
                  }}
                >
                  <View style={styles.downloadInner}>
                    <Ionicons
                      name="storefront-outline"
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={[styles.downloadText, { color: colors.primary }]}>
                      {t("App Store 下载")}
                    </Text>
                  </View>
                </Button>
              </View>
            ) : null}
          </View>

        {/* Primary CTA: visit website (invite link overrides) */}
        <Button
          type="primary"
          onPress={() => openExternal(site.invite_link || site.url)}
          style={{
            ...styles.visitBtn,
            backgroundColor: isDark
              ? "rgba(129,140,248,0.12)"
              : "rgba(79,70,229,0.08)",
            borderColor: colors.primary,
          }}
        >
          <View style={styles.visitInner}>
            <Ionicons name="globe-outline" size={20} color={colors.primary} />
            <Text style={[styles.visitText, { color: colors.primary }]}>
              {site.invite_link ? t("通过邀请链接访问") : t("访问官网")}
            </Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </View>
        </Button>

        {site.invite_code ? (
          <View style={[styles.inviteCodeBlock, { marginTop: 14 }]}>
            <Text style={[styles.inviteCodeLabel, { color: colors.textTertiary }]}>
              {t("站点邀请码")}
            </Text>
            <View
              style={[
                styles.inviteCodeRow,
                {
                  backgroundColor: colors.chipBg,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="gift" size={16} color={colors.primary} />
              <Text style={[styles.inviteCodeText, { color: colors.text }]}>
                {site.invite_code}
              </Text>
              <Pressable
                onPress={async () => {
                  const ok = await copyText(site.invite_code);
                  if (ok) {
                    Toast.success(t("已复制邀请码"), 1.5);
                  } else {
                    Toast.fail(t("复制失败"), 1.5);
                  }
                }}
                hitSlop={10}
                style={styles.inviteCopyBtn}
              >
                <Ionicons name="copy-outline" size={15} color={colors.primary} />
                <Text style={[styles.inviteCopyText, { color: colors.primary }]}>
                  {t("复制")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <WhiteSpace size="lg" />
      </ScrollView>

      {/* Auth modal */}
      <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onLogin={handleLogin}
        onLoginTFA={handleLoginTFA}
        onRegister={handleRegister}
        onVerify={handleVerify}
        onRequestReset={handleRequestReset}
        onResetPassword={handleResetPassword}
      />
    </View>
  );
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 52,
    paddingBottom: 8,
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  favBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Hero */
  heroSection: {
    alignItems: "center",
    paddingVertical: 16,
  },
  heroLogo: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroLogoText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  siteName: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 16,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  siteDesc: {
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 12,
    gap: 6,
  },
  detailTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryTag: {
    alignItems: "center",
    justifyContent: "center",
  },
  tagChip: {
    alignItems: "center",
    justifyContent: "center",
  },
  detailTagText: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },

  /* Sections */
  section: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  /* Download */
  downloadBtn: {
    borderRadius: 10,
    height: 48,
  },
  downloadInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  downloadText: {
    fontSize: 15,
    fontWeight: "700",
  },
  platformBlock: {
    marginTop: 16,
  },
  platformLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  platformLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  platformMeta: {
    fontSize: 12,
    marginLeft: "auto",
  },
  cacheHint: {
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },

  /* Integrity verification panel */
  integrityBlocked: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  integrityBlockedText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  verifyPanel: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  verifyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  verifyTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  verifyBadge: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: "700",
  },
  verifyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  verifyLabel: {
    fontSize: 12,
  },
  verifyUrlBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "75%",
  },
  verifyUrl: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  verifyValue: {
    fontSize: 12,
  },
  verifyHashBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "75%",
  },
  verifyHash: {
    fontSize: 11,
    flexShrink: 1,
  },
  verifyCopy: {
    fontSize: 12,
    fontWeight: "700",
  },
  verifyNote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },

  /* Visit CTA */
  visitBtn: {
    marginTop: 16,
    borderRadius: 12,
    height: 52,
  },
  visitInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  visitText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  inviteCodeBlock: {
    width: "100%",
  },
  inviteCodeLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    marginBottom: 6,
  },
  inviteCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  inviteCodeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  inviteCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
  },
  inviteCopyText: {
    fontSize: 13,
    fontWeight: "600",
  },

  /* Rating */
  aggregateInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: "auto",
  },
  aggregateInlineText: {
    fontSize: 15,
    fontWeight: "700",
  },
  aggregateInlineCount: {
    fontSize: 12,
  },
  ratingInputArea: {
    gap: 12,
  },
  starHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  starRow: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  starWrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  starValue: {
    fontSize: 9,
    fontWeight: "600",
    marginTop: -2,
  },
  halfStarContainer: {
    position: "relative",
    width: 32,
    height: 32,
  },
  halfStarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 16,
    height: 32,
    overflow: "hidden",
  },
  ratingStatus: {
    minWidth: 56,
    alignItems: "center",
  },
  ratingSaved: {
    fontSize: 13,
    fontWeight: "700",
  },
  ratingSaving: {
    fontSize: 13,
    fontWeight: "500",
  },
  scoreValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top",
  },
  ratingError: {
    fontSize: 13,
  },
  ratingHint: {
    fontSize: 12,
  },
  ratingLoginPrompt: {
    alignItems: "center",
    paddingVertical: 4,
  },
  loginPromptBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    height: 44,
  },
  loginPromptInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loginPromptText: {
    fontSize: 14,
    fontWeight: "600",
  },

  /* Invite */
  inviteHint: {
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 17,
  },
  inviteInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  inviteStatus: {
    marginLeft: "auto",
    alignItems: "center",
  },

  /* Reviews entry */
  reviewsEntry: {
    flexDirection: "row",
    alignItems: "center",
  },
  reviewsEntryHeader: {
    marginBottom: 0,
    flex: 1,
  },
  reviewsEntryRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
  },
  reviewsEntryCount: {
    fontSize: 13,
  },

  /* App link submit */
  appLinkSubmitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: "auto",
  },
  appLinkSubmitText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
