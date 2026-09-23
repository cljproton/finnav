"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Spin, Button } from "antd";
import { Ionicons } from "../ui/icons";
import { message } from "@/components/antd-wrapper";
import {
  deleteExperience,
  fetchExperienceDetail,
  purchaseExperience,
  toggleExperienceLike,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Experience } from "../../lib/types";
import AuthModal from "../AuthModal";
import ErrorState from "../ErrorState";
import { ConfirmModal } from "../ConfirmModal";
import { formatDateTime } from "../../lib/utils";
import SeoHeading from "../SeoHeading";

interface ConfirmState {
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export default function ExperienceDetailClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const queryClient = useQueryClient();

  const params = useParams<{ id: string; expId: string }>();
  const siteId = Number(params?.id);
  const experienceId = Number(params?.expId);

  const [item, setItem] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [liking, setLiking] = useState(false);
  const [liked, setLiked] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchExperienceDetail(siteId, experienceId);
        if (!alive) return;
        setItem(data);
        setLiked(data.liked);
      } catch (e: unknown) {
        if (!alive) return;
        message.error(e instanceof Error ? e.message : t("加载失败"), 1.5);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [siteId, experienceId, loggedIn, reloadToken, t]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadToken((v) => v + 1);
  }, []);

  const refreshRelated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["site-experiences", siteId] });
    queryClient.invalidateQueries({ queryKey: ["site", siteId] });
    queryClient.invalidateQueries({ queryKey: ["me-points"] });
    queryClient.invalidateQueries({ queryKey: ["me-points-transactions"] });
  }, [queryClient, siteId]);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
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
      message.success(t("购买成功"), 1.5);
      refreshRelated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("购买失败");
      if (String(msg).includes("积分不足")) {
        setConfirm({
          title: t("积分不足"),
          message: t("当前积分不足以购买该经验，去积分中心赚取积分后再来吧。"),
          confirmText: t("去积分中心"),
          onConfirm: () => {
            setConfirm(null);
            router.push("/points");
          },
        });
      } else {
        message.error(msg, 1.5);
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
      setItem((prev) => (prev ? { ...prev, like_count: res.like_count } : prev));
      queryClient.invalidateQueries({ queryKey: ["site-experiences", siteId] });
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t("操作失败"), 1.5);
    } finally {
      setLiking(false);
    }
  };

  const handleDelete = () => {
    if (!item) return;
    const target = item;
    setConfirm({
      title: t("删除经验"),
      message: t(
        "确认删除「{{title}}」？将扣除 {{cost}} 积分（3 倍购买定价），购买与点赞记录将保留。",
        { title: target.title, cost: target.price * 3 },
      ),
      confirmText: t("确认删除"),
      destructive: true,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteExperience(siteId, experienceId);
          message.success(t("已删除"), 1.5);
          refreshRelated();
          goBack();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : t("删除失败");
          if (String(msg).includes("积分不足")) {
            setConfirm({
              title: t("积分不足"),
              message: t("当前积分不足以删除该经验（需 {{cost}} 积分），去积分中心赚取积分后再来吧。", {
                cost: target.price * 3,
              }),
              confirmText: t("去积分中心"),
              onConfirm: () => {
                setConfirm(null);
                router.push("/points");
              },
            });
          } else {
            message.error(msg, 1.5);
          }
        }
      },
    });
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ErrorState message={t("加载失败")} onRetry={reload} />
      </div>
    );
  }

  const unlocked = item.has_purchased || item.is_mine;
  const canLike = unlocked;

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
          <SeoHeading
            level={1}
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "var(--fn-text)",
              flex: 1,
              textAlign: "center",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {item.title}
          </SeoHeading>
          {item.is_mine ? (
            <button
              type="button"
              onClick={handleDelete}
              aria-label={t("删除")}
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                backgroundColor: "var(--fn-surface)",
                border: "1px solid var(--fn-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Ionicons name="trash-outline" size={22} color="var(--fn-error)" />
            </button>
          ) : (
            <div style={{ width: 42 }} />
          )}
        </div>

        <div style={{ paddingTop: 8 }}>
          {item.cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- 远程用户上传图片，无需 next/image 优化
            <img
              src={item.cover}
              alt={item.title}
              style={{ width: "100%", height: 200, objectFit: "cover", display: "block", borderRadius: 14, marginBottom: 14 }}
            />
          ) : null}

          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--fn-text)" }}>{item.title}</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--fn-text-tertiary)" }}>
            {t("作者：{{name}}", { name: item.author_name })} · {formatDateTime(item.created_at)}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              marginTop: 12,
              paddingBottom: 14,
              borderBottom: "1px solid rgba(128,128,128,0.25)",
            }}
          >
            <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="heart-outline" size={14} color="var(--fn-text-tertiary)" />
              <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>
                {t("{{count}} 个赞", { count: item.like_count })}
              </span>
            </span>
            <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="cart-outline" size={14} color="var(--fn-text-tertiary)" />
              <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>
                {t("{{count}} 人已购买", { count: item.sales_count })}
              </span>
            </span>
            <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="star-outline" size={14} color="var(--fn-primary)" />
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fn-primary)" }}>
                {item.price} {t("积分")}
              </span>
            </span>
          </div>

          {unlocked ? (
            <div
              className="fn-card"
              style={{ padding: 20, marginTop: 16, boxShadow: "var(--fn-shadow-sm)" }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "var(--fn-text-secondary)" }}>
                {t("正文")}
              </div>
              <div style={{ fontSize: 15, lineHeight: "24px", whiteSpace: "pre-wrap", color: "var(--fn-text)" }}>
                {item.content}
              </div>

              {item.images.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                  {item.images.map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element -- 远程用户上传图片，无需 next/image 优化
                    <img
                      key={img.id}
                      src={img.url}
                      alt=""
                      style={{ width: "100%", height: 220, objectFit: "cover", display: "block", borderRadius: 12 }}
                    />
                  ))}
                </div>
              ) : null}

              <div style={{ display: "flex", flexDirection: "row", gap: 10, marginTop: 24 }}>
                <Button
                  block
                  icon={<Ionicons name={liked ? "heart" : "heart-outline"} size={18} color={liked ? "var(--fn-primary)" : "var(--fn-text-secondary)"} />}
                  onClick={handleLike}
                  disabled={liking || !canLike}
                  style={{
                    height: 46,
                    borderRadius: 10,
                    color: liked ? "var(--fn-primary)" : "var(--fn-text-secondary)",
                    borderColor: liked ? "var(--fn-primary)" : "var(--fn-border)",
                    backgroundColor: liked ? "var(--fn-primary-light)" : "var(--fn-chip-bg)",
                  }}
                >
                  {liked ? t("已点赞") : t("点赞")}
                </Button>
                {item.is_mine ? (
                  <Button
                    block
                    icon={<Ionicons name="pencil-outline" size={16} color="var(--fn-primary)" />}
                    onClick={() => router.push(`/site/${siteId}/experiences/${experienceId}/edit`)}
                    style={{ height: 46, borderRadius: 10, borderColor: "var(--fn-border)" }}
                  >
                    <span style={{ color: "var(--fn-primary)", fontWeight: 600 }}>{t("编辑")}</span>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              className="fn-card"
              style={{
                marginTop: 18,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxShadow: "var(--fn-shadow-sm)",
              }}
            >
              <Ionicons name="lock-closed-outline" size={32} color="var(--fn-text-tertiary)" />
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12, color: "var(--fn-text)" }}>
                {t("购买后解锁全文")}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 12, color: "var(--fn-primary)" }}>
                {item.price} {t("积分")}
              </div>
              <Button
                type="primary"
                block
                loading={purchasing}
                onClick={handleBuy}
                style={{ marginTop: 16, height: 48, borderRadius: 10, fontSize: 15, fontWeight: 700 }}
              >
                {loggedIn ? t("{{price}} 积分解锁", { price: item.price }) : t("登录后购买解锁")}
              </Button>
            </div>
          )}
        </div>

        <ConfirmModal
          visible={!!confirm}
          onClose={() => setConfirm(null)}
          onConfirm={() => confirm?.onConfirm()}
          title={confirm?.title ?? ""}
          message={confirm?.message ?? ""}
          confirmText={confirm?.confirmText}
          destructive={confirm?.destructive}
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