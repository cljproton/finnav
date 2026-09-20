"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Spin } from "antd";
import { Ionicons } from "../ui/icons";
import { message } from "@/components/antd-wrapper";
import { deleteExperience, useSiteExperiences } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Experience } from "../../lib/types";
import AuthModal from "../AuthModal";
import { ConfirmModal } from "../ConfirmModal";
import { formatDate } from "../../lib/utils";
import SeoHeading from "../SeoHeading";

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
  width,
  ratio,
  onRatio,
  onPress,
  onDelete,
  onEdit,
}: {
  item: Experience;
  width: number;
  ratio: number;
  onRatio: (id: number, value: number) => void;
  onPress: (e: Experience) => void;
  onDelete: (e: Experience) => void;
  onEdit: (e: Experience) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onPress(item)}
      style={{
        width,
        borderRadius: 12,
        border: "1px solid var(--fn-border)",
        backgroundColor: "var(--fn-surface)",
        overflow: "hidden",
        padding: 0,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div style={{ width: "100%", position: "relative" }}>
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- 远程用户上传图片，无需 next/image 优化
          <img
            src={item.cover}
            alt={item.title}
            style={{
              width: "100%",
              display: "block",
              aspectRatio: `${ratio}`,
              objectFit: "cover",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
            }}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                onRatio(item.id, clampAspect(img.naturalWidth / img.naturalHeight));
              }
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: ratio,
              backgroundColor: "var(--fn-chip-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
            }}
          >
            <Ionicons name="flask-outline" size={28} color="var(--fn-text-tertiary)" />
          </div>
        )}

        <div
          style={{
            position: "absolute",
            left: 8,
            bottom: 8,
            backgroundColor: "#FF2442",
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 3,
            paddingBottom: 3,
            borderRadius: 8,
          }}
        >
          <span style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 700 }}>
            {item.price} {t("积分")}
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            backgroundColor: "rgba(0,0,0,0.35)",
            paddingLeft: 7,
            paddingRight: 7,
            paddingTop: 3,
            paddingBottom: 3,
            borderRadius: 10,
          }}
        >
          <Ionicons name="heart" size={12} color="#FFFFFF" />
          <span style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 600 }}>{item.like_count}</span>
        </div>
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 19,
          color: "var(--fn-text)",
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 8,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textAlign: "left",
        }}
      >
        {item.title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--fn-text-tertiary)",
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 4,
          paddingBottom: 8,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          textAlign: "left",
        }}
      >
        {item.author_name} · {formatDate(item.created_at)}
      </div>

      {item.is_mine ? (
        <div style={{ display: "flex", flexDirection: "row", gap: 8, paddingLeft: 10, paddingRight: 10, paddingBottom: 10 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              border: "1px solid var(--fn-border)",
              borderRadius: 8,
              paddingTop: 5,
              paddingBottom: 5,
              paddingLeft: 10,
              paddingRight: 10,
              background: "none",
              cursor: "pointer",
            }}
          >
            <Ionicons name="pencil-outline" size={13} color="var(--fn-primary)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fn-primary)" }}>{t("编辑")}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              border: "1px solid var(--fn-border)",
              borderRadius: 8,
              paddingTop: 5,
              paddingBottom: 5,
              paddingLeft: 10,
              paddingRight: 10,
              background: "none",
              cursor: "pointer",
            }}
          >
            <Ionicons name="trash-outline" size={13} color="var(--fn-error)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fn-error)" }}>{t("删除")}</span>
          </button>
        </div>
      ) : null}
    </button>
  );
}

/* ---------- main ---------- */

export default function SiteExperiencesClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const params = useParams<{ id: string }>();
  const siteId = Number(params?.id);
  const queryClient = useQueryClient();

  const [authVisible, setAuthVisible] = useState(false);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [pendingDelete, setPendingDelete] = useState<Experience | null>(null);
  const [windowWidth, setWindowWidth] = useState(375);

  const { data: pages, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useSiteExperiences(siteId);

  useEffect(() => {
    const calc = () => setWindowWidth(window.innerWidth);
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const experiences = useMemo(
    () => pages?.pages.flatMap((p) => p.results) ?? [],
    [pages],
  );

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
    if (typeof window !== "undefined" && window.history.length > 1) {
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
    setPendingDelete(item);
  };

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const item = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteExperience(siteId, item.id);
      message.success(t("已删除"), 1.5);
      refresh();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t("删除失败"), 1.5);
    }
  }, [pendingDelete, siteId, refresh, t]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (!el) return;
      if (hasNextPage && !isFetchingNextPage && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  const renderCard = (item: Experience) => (
    <WaterfallCard
      key={item.id}
      item={item}
      width={colWidth}
      ratio={clampAspect(ratios[item.id] || DEFAULT_ASPECT)}
      onRatio={handleRatio}
      onPress={(e) => router.push(`/site/${siteId}/experiences/${e.id}`)}
      onDelete={handleDelete}
      onEdit={openEdit}
    />
  );

  return (
    <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 48px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 16,
            paddingBottom: 8,
          }}
        >
          <button
            type="button"
            onClick={goBack}
            aria-label={t("返回")}
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              backgroundColor: "var(--fn-surface)",
              border: "1px solid var(--fn-border)",
              boxShadow: "var(--fn-shadow-xs)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Ionicons name="chevron-back" size={22} color="var(--fn-text)" />
          </button>
          <SeoHeading level={1} style={{ fontSize: 17, fontWeight: 700, color: "var(--fn-text)" }}>
            {t("个人经验")}
          </SeoHeading>
          <button
            type="button"
            onClick={openPublish}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: 10,
              paddingRight: 10,
              borderRadius: 16,
              border: "1px solid var(--fn-primary)",
              backgroundColor: "var(--fn-primary-light)",
              cursor: "pointer",
            }}
          >
            <Ionicons name="add" size={16} color="var(--fn-primary)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fn-primary)" }}>{t("发布经验")}</span>
          </button>
        </div>

        {isLoading ? (
          <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spin size="large" />
          </div>
        ) : experiences.length === 0 ? (
          <div
            style={{
              minHeight: "50vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingLeft: 32,
              paddingRight: 32,
              paddingBottom: 60,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: "var(--fn-chip-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons name="flask-outline" size={36} color="var(--fn-text-tertiary)" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fn-text)" }}>{t("暂无经验")}</div>
            <div style={{ fontSize: 13, marginTop: 6, color: "var(--fn-text-tertiary)", textAlign: "center" }}>
              {t("发布第一份经验，赚取积分")}
            </div>
            <button
              type="button"
              onClick={openPublish}
              style={{
                marginTop: 18,
                borderRadius: 22,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 30,
                paddingRight: 30,
                backgroundColor: "var(--fn-primary)",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fn-surface-solid)" }}>{t("发布经验")}</span>
            </button>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
            onScroll={handleScroll}
          >
            <div style={{ fontSize: 13, lineHeight: 19, marginTop: 4, color: "var(--fn-text-tertiary)" }}>
              {t("发布你的实战经验，其他人需积分购买解锁")}
            </div>

            <div style={{ display: "flex", flexDirection: "row", gap: COLUMN_GAP }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: COLUMN_GAP, minWidth: 0 }}>
                {colLeft.map(renderCard)}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: COLUMN_GAP, minWidth: 0 }}>
                {colRight.map(renderCard)}
              </div>
            </div>

            {hasNextPage ? (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                style={{
                  border: "1px solid var(--fn-border)",
                  borderRadius: 10,
                  paddingTop: 12,
                  paddingBottom: 12,
                  height: 44,
                  textAlign: "center",
                  background: "none",
                  cursor: "pointer",
                  marginTop: 14,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fn-primary)" }}>
                  {isFetchingNextPage ? t("加载中…") : t("加载更多")}
                </span>
              </button>
            ) : null}
          </div>
        )}

        <ConfirmModal
          visible={!!pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          title={t("删除经验")}
          message={t(
            "确认删除「{{title}}」？将扣除 {{cost}} 积分（3 倍购买定价），购买与点赞记录将保留。",
            { title: pendingDelete?.title ?? "", cost: (pendingDelete?.price ?? 0) * 3 },
          )}
          confirmText={t("确认删除")}
          destructive
        />

        <AuthModal
          visible={authVisible}
          onClose={() => setAuthVisible(false)}
          onLogin={(email, password, captcha) => auth.login(email, password, captcha)}
          onRegister={(email, password, captcha) => auth.register(email, password, captcha)}
          onVerify={(email, code, password) => auth.verify(email, code, password)}
          onRequestReset={(email) => auth.requestPasswordReset(email)}
          onResetPassword={(email, code, password) => auth.resetPassword(email, code, password)}
        />
      </div>
    </div>
  );
}