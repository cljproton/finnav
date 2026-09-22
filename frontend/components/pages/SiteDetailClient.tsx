// @ts-nocheck
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "../../lib/i18n";
import { Ionicons } from "../ui/icons";
import { Button, Input, message, Spin, Rate, InputTextArea } from "@/components/antd-wrapper";
import SeoHeading from "../SeoHeading";
import InternalLink from "../InternalLink";
import { useFavorites } from "../../lib/favorites";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import type { Site, UserSiteInvite } from "../../lib/types";
import AuthModal from "../AuthModal";
import ErrorState from "../ErrorState";
import { Logo } from "../Logo";
import ExternalLink from "../ExternalLink";
import { copyText, formatBytes, formatDateTime, siteDetailUrl } from "../../lib/utils";
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
  useSiteTutorialsTop,
  useSiteExperiences,
  useSitesInfinite,
} from "../../lib/api";
import {
  siteAboutParagraphs,
  siteUsageTipsParagraph,
  siteFaq,
} from "../../lib/seoCopy";

/* ---------- helpers ---------- */

/** 区块标题图标衬底：浅品牌色 32px 圆角块。 */
function SectionIcon({ name }: { name: string }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: "var(--fn-primary-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Ionicons name={name} size={17} color="var(--fn-primary)" />
    </div>
  );
}

/** 通用内容区块卡片：参考首页卡片体系（surface/border/圆角 16/微影）。 */
function SectionCard({
  icon,
  title,
  right,
  children,
  style,
}: {
  icon: string;
  title: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="fn-card" style={{ padding: 20, boxShadow: "var(--fn-shadow-sm)", ...style }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <SectionIcon name={icon} />
        <SeoHeading
          level={2}
          style={{ fontSize: 16, fontWeight: 600, color: "var(--fn-text)", flex: 1, minWidth: 0 }}
        >
          {title}
        </SeoHeading>
        {right}
      </div>
      {children}
    </div>
  );
}

/** 右上/下方悬浮提示小字（保存态）。 */
function StatusText({
  text,
  color = "var(--fn-text-tertiary)",
}: {
  text: string | null;
  color?: string;
}) {
  if (!text) return null;
  return (
    <span
      style={{
        fontSize: 13,
        color,
        fontWeight: 500,
        flexShrink: 0,
        marginLeft: 8,
      }}
    >
      {text}
    </span>
  );
}

async function shareSite(site: Site, invite: UserSiteInvite | null | undefined) {
  const lines: string[] = [site.name];
  if (invite?.invite_code) lines.push(i18n.t("邀请码: {{code}}", { code: invite.invite_code }));
  if (invite?.invite_link) lines.push(i18n.t("邀请链接: {{link}}", { link: invite.invite_link }));
  const detailUrl = siteDetailUrl(site.id);
  const message = lines.join("\n");

  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: site.name, text: message, url: detailUrl });
      return;
    }
  } catch {
    // 用户取消或原生分享不可用 → 走复制
  }
  const ok = await copyText(message);
  if (ok) {
    message.success(i18n.t("已复制站点信息"), 1.5);
  } else {
    message.error(i18n.t("复制失败"), 1.5);
  }
}

/* ---------- Hero logo ---------- */

function HeroLogo({ site }: { site: Site }) {
  return (
    <div
      style={{
        width: 88,
        height: 88,
        borderRadius: "22px",
        border: "1px solid var(--fn-border)",
        backgroundColor: "var(--fn-surface)",
        boxShadow: "var(--fn-shadow-sm)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {site.logo ? (
        <img
          src={site.logo}
          alt={site.name}
          width={88}
          height={88}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "22px" }}
        />
      ) : (
        <Logo size={44} />
      )}
    </div>
  );
}

/* ---------- 圆角操作按钮（顶部返回/分享/收藏） ---------- */

const circleBtn: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: "999px",
  backgroundColor: "var(--fn-surface)",
  border: "1px solid var(--fn-border)",
  boxShadow: "var(--fn-shadow-xs)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

/* ---------- Rating section ---------- */

function RatingSection({
  site,
  onLoginPress,
}: {
  site: Site;
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
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t("保存失败"));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [auth.token, site.id, updateCache, queryClient, t],
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

  const statusColor = saved
    ? "var(--fn-success)"
    : submitting
      ? "var(--fn-text-tertiary)"
      : score > 0
        ? "var(--fn-text)"
        : "var(--fn-text-tertiary)";
  const statusText =
    saved ? t("已保存")
    : submitting ? t("保存中…")
    : score > 0 ? t("{{score}} 分", { score })
    : t("轻触打分");

  return (
    <SectionCard
      icon="star-outline"
      title={t("评价")}
      right={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            color: "var(--fn-star-active)",
          }}
        >
          <Ionicons name="star" size={14} color="var(--fn-star-active)" />
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--fn-text)" }}>
            {displayAvg.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>
            {hasAggregate ? `(${ratingCount})` : t("· 未评分")}
          </span>
        </div>
      }
    >
      {auth.user ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Rate
              value={score}
              onChange={(v) => handleScoreChange(Number(v))}
              count={5}
              style={{ fontSize: 26 }}
            />
            <span style={{ fontSize: 14, fontWeight: 500, color: statusColor, marginLeft: 4 }}>
              {statusText}
            </span>
          </div>

          <InputTextArea
            value={comment}
            onChange={(e) => handleCommentChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={t("说点什么…（可选，自动保存）")}
            autoSize={{ minRows: 3, maxRows: 6 }}
            style={{
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 15,
              lineHeight: 1.5,
              backgroundColor: "var(--fn-chip-bg)",
              borderColor: "var(--fn-border)",
              color: "var(--fn-text)",
              resize: "vertical",
              boxShadow: "none",
            }}
          />

          {error ? (
            <span style={{ fontSize: 13, color: "var(--fn-error)" }}>{error}</span>
          ) : null}

          {showCommentHint && score === 0 && !comment.trim() ? (
            <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>
              {t("轻触星星即可评分并自动保存")}
            </span>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "flex" }}>
          <Button
            onClick={onLoginPress}
            type="ghost"
            style={{
              width: "100%",
              height: 48,
              borderRadius: 12,
              fontSize: 15,
              borderColor: "var(--fn-primary)",
              color: "var(--fn-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name="log-in-outline" size={18} color="var(--fn-primary)" />
            {t("登录后可打分")}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

/* ---------- 用户内容入口（评价/教程/经验） ---------- */

function ContentEntry({
  href,
  icon,
  title,
  linkText,
  count,
  showCount = false,
}: {
  href: string;
  icon: string;
  title: string;
  linkText: string;
  count?: number;
  showCount?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div
      className="fn-card"
      role="button"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      aria-label={linkText}
      style={{
        padding: "14px 16px",
        boxShadow: "var(--fn-shadow-sm)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <SectionIcon name={icon} />
      <SeoHeading
        level={2}
        style={{ fontSize: 16, fontWeight: 600, color: "var(--fn-text)", flex: 1, minWidth: 0 }}
      >
        {title}
      </SeoHeading>
      <InternalLink href={href} accessibilityLabel={linkText} style={{ flexShrink: 0 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "var(--fn-text-tertiary)",
            whiteSpace: "nowrap",
          }}
        >
          {showCount && count ? `${count} ` : ""}
          {linkText}
          <Ionicons name="chevron-forward" size={15} color="var(--fn-text-tertiary)" />
        </span>
      </InternalLink>
    </div>
  );
}

/* ---------- Invite section ---------- */

function InviteSection({
  site,
  onLoginPress,
}: {
  site: Site;
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
  const inviteHydratedRef = useRef(false);

  // 邀请码/链接数据加载后回填表单；不覆盖用户已编辑内容。
  useEffect(() => {
    if (!invite) return;
    if (inviteHydratedRef.current) return;
    inviteHydratedRef.current = true;
    setCode(invite.invite_code || "");
    setLink(invite.invite_link || "");
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
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t("保存失败"));
      } finally {
        setSaving(false);
      }
    },
    [auth.token, site.id, queryClient, t],
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
      <SectionCard icon="gift-outline" title={t("邀请码")}>
        <Button
          onClick={onLoginPress}
          type="ghost"
          block
          style={{
            height: 48,
            borderRadius: 12,
            fontSize: 15,
            borderColor: "var(--fn-primary)",
            color: "var(--fn-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons name="log-in-outline" size={18} color="var(--fn-primary)" />
          {t("登录后配置你的专属邀请码")}
        </Button>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon="gift-outline"
      title={t("我的邀请码")}
      right={
        <StatusText
          text={saved ? t("已保存") : saving ? t("保存中…") : null}
          color={saved ? "var(--fn-success)" : "var(--fn-text-tertiary)"}
        />
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>
          {t("设置你的专属邀请码或邀请链接，转发站点时自动附带。输入后自动保存。")}
        </span>

        <Input
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          onBlur={handleInviteBlur}
          placeholder={t("邀请码（可选）")}
          style={{
            borderRadius: 12,
            height: 44,
            paddingLeft: 14,
            paddingRight: 14,
            fontSize: 15,
            backgroundColor: "var(--fn-chip-bg)",
            borderColor: "var(--fn-border)",
            color: "var(--fn-text)",
            boxShadow: "none",
          }}
        />

        <Input
          value={link}
          onChange={(e) => handleLinkChange(e.target.value)}
          onBlur={handleInviteBlur}
          placeholder={t("邀请链接（可选）")}
          autoComplete="off"
          spellCheck={false}
          style={{
            borderRadius: 12,
            height: 44,
            paddingLeft: 14,
            paddingRight: 14,
            fontSize: 15,
            backgroundColor: "var(--fn-chip-bg)",
            borderColor: "var(--fn-border)",
            color: "var(--fn-text)",
            boxShadow: "none",
          }}
        />

        {error ? (
          <span style={{ fontSize: 13, color: "var(--fn-error)" }}>{error}</span>
        ) : null}

        <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>
          {t("之后点击右上角分享，邀请码即随站点一起转发。")}
        </span>
      </div>
    </SectionCard>
  );
}

/* ---------- main ---------- */

export default function SiteDetailClient({
  initialSite,
  initialRelatedSites = [],
}: {
  initialSite?: Site;
  initialRelatedSites?: Site[];
}) {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isFavorite, toggle } = useFavorites();
  const auth = useAuth();
  const loggedIn = !!auth.token;

  const [authVisible, setAuthVisible] = useState(false);
  const visitReported = useRef(false);

  const goBack = () => {
    // 明确导航回来源列表页，避免浏览器残留的上一个站点记录
    const fromUrl = searchParams?.get("from") || "";
    const target = fromUrl === "/search" || fromUrl === "/favorites" ? fromUrl : "/";
    router.replace(target);
  };

  const siteId = Number(params?.id);

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
      const found = data.find((s: Site) => s.id === siteId);
      if (found) {
        cachedSite = found;
        break;
      }
    } else if (data && typeof data === "object" && "pages" in data) {
      const pages = (data as { pages?: Array<{ results?: Site[] }> }).pages;
      const found = (pages ?? []).flatMap((p) => p.results ?? []).find(
        (s: Site) => s.id === siteId,
      );
      if (found) {
        cachedSite = found;
        break;
      }
    }
  }

  const { data: fetchedSite, isLoading, error, refetch } = useSiteDetail(siteId, initialSite);
  const site = fetchedSite ?? cachedSite;
  const fav = site ? isFavorite(site.id) : false;

  const { data: invite } = useSiteInvite(siteId, loggedIn);

  // 拉取教程/经验/同类站点数据，用于撰写「关于」「常见问题」SEO 文案与「同类推荐」内链。
  const { data: tutorialsTop } = useSiteTutorialsTop(siteId);
  const { data: experiencesPage } = useSiteExperiences(siteId);
  const { data: relatedPages } = useSitesInfinite({
    category: site?.category_slug || "__pending__",
  });

  const tutorialCount = tutorialsTop
    ? tutorialsTop.text.length + tutorialsTop.video.length + tutorialsTop.agent.length
    : undefined;
  const experienceCount = experiencesPage?.pages?.[0]?.count;
  const relatedSites = useMemo(() => {
    const list = (relatedPages?.pages ?? []).flatMap((p) => p.results);
    const fromQuery = list.filter((s) => s.id !== siteId).slice(0, 6);
    // 服务端预取的同分类站点（SSR 静态 HTML 内链），query 数据到达前兜底展示。
    return fromQuery.length > 0 ? fromQuery : initialRelatedSites.filter((s) => s.id !== siteId).slice(0, 6);
  }, [relatedPages, siteId, initialRelatedSites]);

  // 「关于」「常见问题」正文：纯挂载文本，同时提升抓取到的有效信息量。
  const aboutParagraphs = site
    ? siteAboutParagraphs(t, settings, site, { tutorials: tutorialCount, experiences: experienceCount })
    : [];
  const usageTips = site ? siteUsageTipsParagraph(t, site) : "";
  const faqItems = site ? siteFaq(t, settings, site) : [];

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

  if (isLoading || !site) {
    return (
      <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 20 48px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "50vh",
            gap: 12,
          }}
        >
          <Spin size="large" />
          <span style={{ color: "var(--fn-text-tertiary)", fontSize: 14 }}>
            {t("加载中...")}
          </span>
        </div>
      </div>
    );
  }

  if (error && !site) {
    return (
      <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
        <ErrorState message={t("加载失败")} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20 48px" }}>
        {/* Back + share + favorite header */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 16,
            paddingBottom: 8,
          }}
        >
          <button
            type="button"
            onClick={goBack}
            style={circleBtn}
            aria-label={t("返回")}
          >
            <Ionicons name="chevron-back" size={22} color="var(--fn-text)" />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => shareSite(site, invite)}
              style={circleBtn}
              aria-label={t("分享")}
            >
              <Ionicons name="arrow-redo-outline" size={19} color="var(--fn-text)" />
            </button>
            <button
              type="button"
              onClick={() => toggle(site)}
              style={circleBtn}
              aria-label={fav ? t("取消收藏") : t("收藏站点")}
            >
              <Ionicons
                name={fav ? "star" : "star-outline"}
                size={22}
                color={fav ? "var(--fn-star-active)" : "var(--fn-star-inactive)"}
              />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Hero */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: 8,
            }}
          >
            <HeroLogo site={site} />
            <SeoHeading
              level={1}
              style={{
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--fn-text)",
                textAlign: "center",
                marginTop: 20,
              }}
            >
              {site.name}
            </SeoHeading>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: "var(--fn-text-secondary)",
                textAlign: "center",
                margin: "10px 8px 0",
              }}
            >
              {site.description}
            </p>

            {/* Tags */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
              }}
            >
              <InternalLink
                href={`/?category=${encodeURIComponent(site.category_slug || "")}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 14px",
                  borderRadius: "999px",
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1,
                  backgroundColor: "var(--fn-primary-light)",
                  color: "var(--fn-primary)",
                  border: "1px solid var(--fn-border-glow)",
                }}
              >
                {site.category_name}
              </InternalLink>
              {(site.tags ?? []).map((tag, idx) => (
                <InternalLink
                  key={`${tag}-${idx}`}
                  href={`/search?q=${encodeURIComponent(tag)}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "8px 14px",
                    borderRadius: "999px",
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1,
                    backgroundColor: "var(--fn-tag-bg)",
                    color: "var(--fn-tag-text)",
                    border: "1px solid var(--fn-border)",
                  }}
                >
                  {tag}
                </InternalLink>
              ))}
            </div>
          </div>

          {/* Rating section */}
          <RatingSection
            site={site}
            onLoginPress={() => setAuthVisible(true)}
          />

          {/* Other users' reviews */}
          <ContentEntry
            href={`/site/${site.id}/reviews`}
            icon="chatbubbles-outline"
            title={t("大家的评价")}
            linkText={t("查看全部评价")}
            count={site.rating_count || 0}
            showCount={!!site.rating_count}
          />

          {/* Invite code section */}
          <InviteSection
            site={site}
            onLoginPress={() => setAuthVisible(true)}
          />

          {/* User tutorials entry */}
          <ContentEntry
            href={`/site/${site.id}/tutorials`}
            icon="book-outline"
            title={t("教程")}
            linkText={t("用户分享的教程")}
          />

          {/* User experiences entry */}
          <ContentEntry
            href={`/site/${site.id}/experiences`}
            icon="flask-outline"
            title={t("个人经验")}
            linkText={t("实战经验 · 积分解锁")}
          />

          {/* APP download */}
          <SectionCard
            icon="phone-portrait-outline"
            title={t("APP 下载")}
            right={
              <InternalLink
                href={`/site/${siteId}/app-links`}
                accessibilityLabel={t("提交下载链接")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 12px",
                  borderRadius: "999px",
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: 1,
                  backgroundColor: "var(--fn-primary-light)",
                  color: "var(--fn-primary)",
                  border: "1px solid var(--fn-primary)",
                  flexShrink: 0,
                }}
              >
                <Ionicons name="add" size={14} color="var(--fn-primary)" />
                <span style={{ color: "var(--fn-primary)" }}>{t("提交下载链接")}</span>
              </InternalLink>
            }
          >
            {/* Android */}
            {(site.app_android_cache_url || site.app_android_url) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Ionicons name="logo-android" size={16} color="var(--fn-primary)" />
                  <span style={{ fontSize: 15, color: "var(--fn-text-secondary)", fontWeight: 600 }}>
                    {t("安卓")}
                  </span>
                  {site.app_android_size ? (
                    <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>
                      {formatBytes(site.app_android_size)}
                    </span>
                  ) : null}
                </div>

                {site.app_android_has_cache ? (
                  site.app_android_integrity_ok === false ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "12px 14px",
                        borderRadius: 12,
                        backgroundColor: "var(--fn-surface)",
                        border: "1px solid var(--fn-error)",
                      }}
                    >
                      <Ionicons name="warning-outline" size={18} color="var(--fn-error)" style={{ marginTop: 1 }} />
                      <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--fn-error)" }}>
                        {t("本站缓存校验失败，可能已被篡改，已暂停本站下载，请使用官网原始链接。")}
                      </span>
                    </div>
                  ) : (
                    <>
                      <Button
                        type="primary"
                        block
                        onClick={() => {
                          if (!loggedIn) {
                            setAuthVisible(true);
                            return;
                          }
                          if (site.app_android_cache_url) {
                            window.open(site.app_android_cache_url, "_blank", "noopener,noreferrer");
                            reportAppDownload(site.id, "android_cache");
                            return;
                          }
                          // 已登录但拿到的还是匿名缓存（无本站地址）：触发带鉴权刷新后重试
                          queryClient.invalidateQueries({ queryKey: ["site", siteId] });
                          queryClient.invalidateQueries({ queryKey: ["sites"] });
                          message.info(t("正在获取下载地址，请稍后重试"), 1.5);
                        }}
                        style={{
                          height: 50,
                          borderRadius: 12,
                          fontSize: 15,
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        <Ionicons name="download-outline" size={19} color="#fff" />
                        <span style={{ color: "#fff" }}>{t("下载安卓版（本站）")}</span>
                      </Button>
                      {site.app_android_cached_at ? (
                        <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>
                          {t("本站缓存于 {{time}}", { time: formatDateTime(site.app_android_cached_at) })}
                        </span>
                      ) : null}

                      {/* 真实性核验 */}
                      {site.app_android_sha256 ? (
                        <div
                          style={{
                            padding: "14px 16px",
                            borderRadius: 14,
                            backgroundColor: "var(--fn-chip-bg)",
                            border: "1px solid var(--fn-border)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Ionicons name="shield-checkmark-outline" size={16} color="var(--fn-primary)" />
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fn-text)" }}>
                              {t("真实性核验")}
                            </span>
                            <span
                              style={{
                                marginLeft: 4,
                                fontSize: 13,
                                fontWeight: 500,
                                color: site.app_android_integrity_ok === true
                                  ? "var(--fn-success)"
                                  : "var(--fn-text-tertiary)",
                              }}
                            >
                              {site.app_android_integrity_ok === true ? t("✓ 已校验") : t("尚未核验")}
                            </span>
                          </div>

                          {site.app_android_url ? (
                            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                              <span style={{ flexShrink: 0, fontSize: 13, color: "var(--fn-text-tertiary)" }}>
                                {t("缓存来源")}
                              </span>
                              <span
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <ExternalLink
                                  url={site.app_android_url}
                                  style={{
                                    color: "var(--fn-primary)",
                                    fontSize: 13,
                                    overflow: "hidden",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                    display: "block",
                                  }}
                                >
                                  {site.app_android_url}
                                </ExternalLink>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const ok = await copyText(site.app_android_url!);
                                    if (ok) {
                                      message.success(t("已复制链接"), 1.5);
                                    } else {
                                      message.error(t("复制失败"), 1.5);
                                    }
                                  }}
                                  style={{
                                    flexShrink: 0,
                                    border: "none",
                                    background: "none",
                                    padding: 0,
                                    fontSize: 13,
                                    color: "var(--fn-primary)",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                  }}
                                >
                                  {t("复制")}
                                </button>
                              </span>
                            </div>
                          ) : null}

                          {site.app_android_cached_at ? (
                            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                              <span style={{ flexShrink: 0, fontSize: 13, color: "var(--fn-text-tertiary)" }}>
                                {t("缓存时间")}
                              </span>
                              <span style={{ fontSize: 13, color: "var(--fn-text)" }}>
                                {formatDateTime(site.app_android_cached_at)}
                              </span>
                            </div>
                          ) : null}

                          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                            <span style={{ flexShrink: 0, fontSize: 13, color: "var(--fn-text-tertiary)" }}>
                              SHA-256
                            </span>
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  color: "var(--fn-text)",
                                  fontFamily: "var(--fn-font-mono)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  display: "block",
                                }}
                              >
                                {site.app_android_sha256}
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  const ok = await copyText(site.app_android_sha256!);
                                  if (ok) {
                                    message.success(t("已复制校验值"), 1.5);
                                  } else {
                                    message.error(t("复制失败"), 1.5);
                                  }
                                }}
                                style={{
                                  flexShrink: 0,
                                  border: "none",
                                  background: "none",
                                  padding: 0,
                                  fontSize: 13,
                                  color: "var(--fn-primary)",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                }}
                              >
                                {t("复制")}
                              </button>
                            </span>
                          </div>

                          <span style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fn-text-tertiary)" }}>
                            {t("本站缓存 APK 直接抓取自上方官方链接、未做任何修改（已记录 SHA-256）。 可与官网下载包比对校验值，完全一致即为正版安装包。")}
                          </span>
                        </div>
                      ) : null}
                    </>
                  )
                ) : (
                  <ExternalLink
                    url={site.app_android_url || site.app_android_cache_url || ""}
                    onPress={() =>
                      reportAppDownload(
                        site.id,
                        site.app_android_url ? "android_original" : "android_cache",
                      )
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: "100%",
                      height: 50,
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 600,
                      backgroundColor: "var(--fn-primary-light)",
                      color: "var(--fn-primary)",
                      border: "1px solid var(--fn-primary)",
                    }}
                  >
                    <Ionicons name="download-outline" size={19} color="var(--fn-primary)" />
                    {t("安卓版 原始下载")}
                  </ExternalLink>
                )}
              </div>
            ) : null}

            {/* Google Play */}
            {site.app_google_play_url ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Ionicons name="logo-google-playstore" size={16} color="var(--fn-primary)" />
                  <span style={{ fontSize: 15, color: "var(--fn-text-secondary)", fontWeight: 600 }}>
                    Google Play
                  </span>
                </div>
                <ExternalLink
                  url={site.app_google_play_url}
                  onPress={() => reportAppDownload(site.id, "google_play")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    height: 50,
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 600,
                    backgroundColor: "var(--fn-primary-light)",
                    color: "var(--fn-primary)",
                    border: "1px solid var(--fn-primary)",
                  }}
                >
                  <Ionicons name="logo-google-playstore" size={19} color="var(--fn-primary)" />
                  {t("Google Play 下载")}
                </ExternalLink>
              </div>
            ) : null}

            {/* iOS */}
            {site.app_ios_url ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Ionicons name="logo-apple" size={16} color="var(--fn-primary)" />
                  <span style={{ fontSize: 15, color: "var(--fn-text-secondary)", fontWeight: 600 }}>
                    iOS
                  </span>
                </div>
                <ExternalLink
                  url={site.app_ios_url}
                  onPress={() => reportAppDownload(site.id, "ios")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    height: 50,
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 600,
                    backgroundColor: "var(--fn-primary-light)",
                    color: "var(--fn-primary)",
                    border: "1px solid var(--fn-primary)",
                  }}
                >
                  <Ionicons name="storefront-outline" size={19} color="var(--fn-primary)" />
                  {t("App Store 下载")}
                </ExternalLink>
              </div>
            ) : null}
          </SectionCard>

          {/* Primary CTA: visit website (invite link overrides).
              Web 端渲染为真实 <a href> 出站链接，供搜索引擎抓取。 */}
          <ExternalLink
            url={site.invite_link || site.url}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              height: 54,
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "0.01em",
              backgroundColor: "var(--fn-primary)",
              color: "#fff",
              border: "1px solid var(--fn-primary)",
              boxShadow: "0 8px 24px rgba(79, 70, 229, 0.25)",
            }}
          >
            <Ionicons name="globe-outline" size={20} color="#fff" />
            {site.invite_link ? t("通过邀请链接访问") : t("访问官网")}
            <Ionicons name="open-outline" size={16} color="#fff" />
          </ExternalLink>

          {site.invite_code ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)", textAlign: "center" }}>
                {t("站点邀请码")}
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderRadius: 14,
                  backgroundColor: "var(--fn-chip-bg)",
                  border: "1px solid var(--fn-border)",
                  boxShadow: "var(--fn-shadow-xs)",
                }}
              >
                <Ionicons name="gift" size={16} color="var(--fn-primary)" />
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: "var(--fn-text)",
                    fontFamily: "var(--fn-font-mono)",
                  }}
                >
                  {site.invite_code}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(site.invite_code);
                    if (ok) {
                      message.success(t("已复制邀请码"), 1.5);
                    } else {
                      message.error(t("复制失败"), 1.5);
                    }
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: "1px solid var(--fn-primary)",
                    backgroundColor: "transparent",
                    color: "var(--fn-primary)",
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1,
                    cursor: "pointer",
                  }}
                >
                  <Ionicons name="copy-outline" size={14} color="var(--fn-primary)" />
                  {t("复制")}
                </button>
              </div>
            </div>
          ) : null}

          {/* 关于：可见正文，提升抓取到的有效文本量 */}
          <SectionCard icon="information-circle-outline" title={t("关于 {{name}}", { name: site.name })}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {aboutParagraphs.map((paragraph, idx) => (
                <p
                  key={idx}
                  style={{
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: "var(--fn-text-secondary)",
                    margin: 0,
                  }}
                >
                  {paragraph}
                </p>
              ))}
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: "var(--fn-text-secondary)",
                  margin: 0,
                }}
              >
                {usageTips}
              </p>
            </div>
          </SectionCard>

          {/* 常见问题 */}
          <SectionCard icon="help-circle-outline" title={t("常见问题")}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {faqItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    paddingTop: 14,
                    paddingBottom: 14,
                    borderTop: idx === 0 ? "none" : "1px solid var(--fn-divider)",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 650, color: "var(--fn-text)", lineHeight: 1.4 }}>
                    {item.q}
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "var(--fn-text-secondary)",
                      margin: "8px 0 0",
                    }}
                  >
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* 同类推荐：同分类站点内链，同时解决「页面没有指向其他页面的链接」 */}
          {relatedSites.length > 0 ? (
            <SectionCard
              icon="albums-outline"
              title={t("同类推荐")}
              right={
                <InternalLink
                  href={`/?category=${encodeURIComponent(site.category_slug || "")}`}
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--fn-primary)",
                    textDecoration: "underline",
                  }}
                >
                  查看所有{t("同分类站点")}
                </InternalLink>
              }
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                {relatedSites.map((related) => (
                  <InternalLink
                    key={related.id}
                    href={`/site/${related.id}`}
                    style={{
                      display: "block",
                      paddingTop: 14,
                      paddingBottom: 14,
                      borderTop: "1px solid var(--fn-divider)",
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fn-primary)" }}>
                      {related.name}
                    </span>
                    <span
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: "var(--fn-text-tertiary)",
                        marginTop: 4,
                      }}
                    >
                      {related.description}
                    </span>
                  </InternalLink>
                ))}
              </div>
</SectionCard>
           ) : null}

         </div>
       </div>

       <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onVerify={handleVerify}
        onRequestReset={handleRequestReset}
        onResetPassword={handleResetPassword}
      />
    </div>
  );
}