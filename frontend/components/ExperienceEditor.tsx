"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Spin, Button, Modal } from "antd";
import { Ionicons } from "./ui/icons";
import { Input, message } from "@/components/antd-wrapper";
import { storage } from "../lib/storage";
import {
  createExperience,
  deleteExperienceImage,
  updateExperience,
  uploadExperienceImage,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime, errorMessage } from "../lib/utils";
import type { Experience } from "../lib/types";
import AuthModal from "./AuthModal";
import { ConfirmModal } from "./ConfirmModal";
import SeoHeading from "./SeoHeading";

const MAX_IMAGES = 5;
const PRICE_MIN = 5;
const PRICE_MAX = 500;
const AUTO_SAVE_MS = 30_000;

const draftKey = (siteId: number) => `experience-draft:${siteId}`;

interface DraftData {
  title: string;
  content: string;
  price: string;
  image_ids: number[];
  image_urls: (string | null)[];
  updated_at: string;
}

interface PendingImage {
  id?: number;
  url?: string;
  localUri?: string;
  uploading: boolean;
  error?: boolean;
}

interface DraftPrompt {
  data: DraftData;
}

function useViewportSize() {
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  useEffect(() => {
    const update = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

export default function ExperienceEditor({
  siteId,
  mode,
  initial,
}: {
  siteId: number;
  mode: "create" | "edit";
  initial?: Experience | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const queryClient = useQueryClient();
  const { width: winWidth, height: winHeight } = useViewportSize();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [price, setPrice] = useState(String(initial?.price ?? 10));
  const [images, setImages] = useState<PendingImage[]>(
    (initial?.images ?? []).map((img) => ({
      id: img.id,
      url: img.url,
      uploading: false,
    })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [authVisible, setAuthVisible] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState<DraftPrompt | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dirtyRef = useRef(false);
  const userEditedRef = useRef(false);
  const saveDraftRef = useRef<() => Promise<void>>(async () => {});
  const draftImagesRef = useRef<number[]>([]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [title, content, price, images]);

  /* ---------- 草稿：新建模式每 30 秒自动保存 ---------- */

  const saveDraft = useCallback(async () => {
    if (mode !== "create") return;
    const data: DraftData = {
      title,
      content,
      price,
      image_ids: images
        .filter((i) => typeof i.id === "number")
        .map((i) => i.id as number),
      image_urls: images.map((i) => i.url ?? i.localUri ?? null),
      updated_at: new Date().toISOString(),
    };
    setDraftStatus("saving");
    try {
      await storage.setItem(draftKey(siteId), data);
      dirtyRef.current = false;
      setDraftStatus("saved");
      setLastSavedAt(Date.now());
    } catch {
      setDraftStatus("error");
    }
  }, [mode, siteId, title, content, price, images]);

  useEffect(() => {
    saveDraftRef.current = saveDraft;
  });

  useEffect(() => {
    if (mode !== "create") return;
    const timer = setInterval(() => {
      if (dirtyRef.current && userEditedRef.current) saveDraftRef.current();
    }, AUTO_SAVE_MS);
    return () => clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode !== "create") return;
    return () => {
      if (dirtyRef.current && userEditedRef.current) saveDraftRef.current();
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "create") return;
    const handler = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible" &&
        dirtyRef.current &&
        userEditedRef.current
      ) {
        saveDraftRef.current();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [mode]);

  /* ---------- 草稿恢复提示 ---------- */

  const discardDraft = useCallback(() => {
    storage.removeItem(draftKey(siteId)).catch(() => {});
    draftImagesRef.current.forEach((id) => {
      deleteExperienceImage(id).catch(() => {});
    });
    draftImagesRef.current = [];
  }, [siteId]);

  useEffect(() => {
    if (mode !== "create") return;
    let mounted = true;
    (async () => {
      try {
        const data = await storage.getItem<DraftData>(draftKey(siteId));
        if (!data) return;
        if (!data.title && !data.content && !(data.image_ids?.length)) return;
        if (!mounted) return;
        draftImagesRef.current = data.image_ids ?? [];
        setDraftPrompt({ data });
      } catch {
        /* 草稿损坏则忽略 */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [mode, siteId]);

  const handleContinueDraft = useCallback(() => {
    const data = draftPrompt?.data;
    if (!data) return;
    userEditedRef.current = true;
    setTitle(data.title ?? "");
    setContent(data.content ?? "");
    setPrice(data.price ?? "10");
    setImages(
      (data.image_ids ?? []).map((id, idx) => ({
        id,
        url: data.image_urls?.[idx] ?? undefined,
        uploading: false,
      })),
    );
    setDraftPrompt(null);
  }, [draftPrompt]);

  const handleDiscardDraft = useCallback(() => {
    discardDraft();
    setDraftPrompt(null);
  }, [discardDraft]);

  /* ---------- 批量上传 + 预览 ---------- */

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      message.info(t("最多上传 {{max}} 张图片", { max: MAX_IMAGES }), 1.5);
      return;
    }
    userEditedRef.current = true;
    setError("");

    const chosen = files.slice(0, remaining);
    const pending: PendingImage[] = chosen.map((file) => ({
      localUri: URL.createObjectURL(file),
      uploading: true,
    }));
    setImages((prev) => [...prev, ...pending].slice(0, MAX_IMAGES));

    await Promise.all(
      pending.map(async (p, idx) => {
        try {
          const uploaded = await uploadExperienceImage(chosen[idx]);
          setImages((prev) =>
            prev.map((item) =>
              item === p
                ? { id: uploaded.id, url: uploaded.url, uploading: false }
                : item,
            ),
          );
        } catch {
          setImages((prev) =>
            prev.map((item) =>
              item === p ? { ...item, uploading: false, error: true } : item,
            ),
          );
        }
      }),
    );
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void handleFiles(files);
  };

  const pickImages = () => {
    fileInputRef.current?.click();
  };

  const removeImage = (idx: number) => {
    userEditedRef.current = true;
    setImages((prev) => {
      const target = prev[idx];
      if (mode === "create" && target && typeof target.id === "number") {
        deleteExperienceImage(target.id).catch(() => {});
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  /* ---------- 发布 / 保存 ---------- */

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace(`/site/${siteId}/experiences`);
    }
  };

  const handleSubmit = async () => {
    if (!loggedIn) {
      setAuthVisible(true);
      return;
    }
    const titleTrim = title.trim();
    if (!titleTrim) {
      setError(t("请输入标题"));
      return;
    }
    if (!content.trim()) {
      setError(t("请输入经验内容"));
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < PRICE_MIN || priceNum > PRICE_MAX) {
      setError(t("价格需在 {{min}} ~ {{max}} 积分之间", { min: PRICE_MIN, max: PRICE_MAX }));
      return;
    }
    if (images.some((i) => i.uploading)) {
      setError(t("图片上传中…"));
      return;
    }
    if (images.some((i) => i.error)) {
      setError(t("上传失败，请删除或重试该图片"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        title: titleTrim,
        content: content.trim(),
        price: Math.round(priceNum),
        image_ids: images
          .filter((i) => typeof i.id === "number")
          .map((i) => i.id as number),
      };
      if (mode === "edit" && initial) {
        await updateExperience(siteId, initial.id, payload);
        message.success(t("保存修改"), 1.5);
      } else {
        await createExperience(siteId, payload);
        await storage.removeItem(draftKey(siteId)).catch(() => {});
        message.success(t("发布成功"), 1.5);
      }
      queryClient.invalidateQueries({ queryKey: ["site-experiences", siteId] });
      queryClient.invalidateQueries({ queryKey: ["site", siteId] });
      queryClient.invalidateQueries({ queryKey: ["me-points"] });
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.replace(`/site/${siteId}/experiences`);
      }
    } catch (e: unknown) {
      setError(errorMessage(e) || t("发布失败"));
      setSubmitting(false);
    }
  };

  const cover = images[0];

  const borderlessStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    outline: "none",
    boxShadow: "none",
    fontWeight: 600,
    color: "var(--fn-text)",
    fontFamily: "var(--fn-font)",
  };

  return (
    <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={onFileInputChange}
      />

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
            style={{ fontSize: 17, fontWeight: 700, color: "var(--fn-text)", flex: 1, textAlign: "center" }}
          >
            {mode === "edit" ? t("编辑经验") : t("发布经验")}
          </SeoHeading>
          <Button type="primary" loading={submitting} onClick={handleSubmit} style={{ borderRadius: 18, minWidth: 56 }}>
            {mode === "edit" ? t("保存") : t("发布")}
          </Button>
        </div>

        <div style={{ paddingTop: 8 }}>
          {/* 封面（第一张图） */}
          <button
            type="button"
            onClick={() => (cover ? setPreviewIndex(0) : pickImages())}
            style={{
              width: "100%",
              height: 320,
              borderRadius: 16,
              border: `1px dashed ${cover ? "transparent" : "var(--fn-border)"}`,
              backgroundColor: cover ? "transparent" : "var(--fn-chip-bg)",
              overflow: "hidden",
              marginBottom: 16,
              padding: 0,
              position: "relative",
              cursor: "pointer",
            }}
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- 远程/本地用户图片，无需 next/image 优化
              <img
                src={cover.url || cover.localUri}
                alt=""
                style={{ width: "100%", height: 320, objectFit: "cover", display: "block" }}
              />
            ) : (
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <Ionicons name="camera-outline" size={36} color="var(--fn-text-tertiary)" />
                <span style={{ fontSize: 13, marginTop: 8, color: "var(--fn-text-tertiary)" }}>
                  {t("添加封面图片")}
                </span>
              </span>
            )}
            {cover ? (
              <span
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  borderRadius: 8,
                  paddingLeft: 8,
                  paddingRight: 8,
                  paddingTop: 3,
                  paddingBottom: 3,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  color: "#FFFFFF",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {t("封面")}
              </span>
            ) : null}
          </button>

          <Input
            value={title}
            onChange={(e) => {
              userEditedRef.current = true;
              setTitle(e.target.value);
            }}
            placeholder={t("请输入标题")}
            maxLength={80}
            variant="borderless"
            style={{ ...borderlessStyle, fontSize: 20, fontWeight: 700, padding: 0, width: "100%", height: "auto", lineHeight: "24px" }}
          />

          <Input.TextArea
            value={content}
            onChange={(e) => {
              userEditedRef.current = true;
              setContent(e.target.value);
            }}
            placeholder={t("请输入经验内容")}
            autoSize
            variant="borderless"
            style={{ ...borderlessStyle, fontSize: 15, lineHeight: "24px", width: "100%", padding: "0 0 4px" }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid var(--fn-border)",
              borderBottom: "1px solid var(--fn-border)",
              paddingTop: 12,
              paddingBottom: 12,
              marginTop: 12,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fn-text-secondary)" }}>
              {t("价格（积分）")}
            </span>
            <Input
              value={price}
              onChange={(e) => {
                userEditedRef.current = true;
                setPrice(e.target.value);
              }}
              inputMode="numeric"
              placeholder={`${PRICE_MIN} ~ ${PRICE_MAX}`}
              variant="borderless"
              style={{ ...borderlessStyle, fontSize: 15, minWidth: 90, textAlign: "right", height: "auto" }}
            />
          </div>

          {mode === "edit" && initial ? (
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: "rgba(217,119,6,0.10)",
                borderRadius: 8,
                paddingLeft: 10,
                paddingRight: 10,
                paddingTop: 8,
                paddingBottom: 8,
                marginTop: 12,
              }}
            >
              <Ionicons name="information-circle-outline" size={15} color="var(--fn-warning)" />
              <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 1, color: "var(--fn-warning)" }}>
                {t("保存修改将扣除 {{price}} 积分", { price: initial.price })}
              </span>
            </div>
          ) : null}

          {/* 图片预览列表 */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, marginBottom: 10, color: "var(--fn-text-secondary)" }}>
              {t("配图（可选，最多 {{max}} 张）", { max: MAX_IMAGES })}
            </div>
            <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {images.map((img, idx) => (
                <div key={idx} style={{ width: 96, height: 96, borderRadius: 12, overflow: "hidden", position: "relative" }}>
                  {img.url || img.localUri ? (
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(idx)}
                      style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- 远程/本地用户图片，无需 next/image 优化 */}
                      <img
                        src={img.url || img.localUri}
                        alt=""
                        style={{ width: 96, height: 96, objectFit: "cover", display: "block" }}
                      />
                    </button>
                  ) : (
                    <div style={{ width: 96, height: 96, backgroundColor: "var(--fn-chip-bg)" }} />
                  )}
                  {img.uploading ? (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(0,0,0,0.45)",
                      }}
                    >
                      <Spin size="small" />
                    </div>
                  ) : img.error ? (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(220,38,38,0.7)",
                      }}
                    >
                      <Ionicons name="alert-circle" size={18} color="#FFFFFF" />
                    </div>
                  ) : null}
                  {idx === 0 ? (
                    <span
                      style={{
                        position: "absolute",
                        left: 6,
                        bottom: 6,
                        borderRadius: 6,
                        paddingLeft: 6,
                        paddingRight: 6,
                        paddingTop: 2,
                        paddingBottom: 2,
                        backgroundColor: "rgba(0,0,0,0.55)",
                        color: "#FFFFFF",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {t("封面")}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    aria-label={t("删除图片")}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      border: "none",
                      backgroundColor: "rgba(0,0,0,0.55)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <Ionicons name="close" size={14} color="#FFFFFF" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES ? (
                <button
                  type="button"
                  onClick={pickImages}
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 12,
                    border: "1px dashed var(--fn-border)",
                    backgroundColor: "var(--fn-chip-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Ionicons name="add" size={26} color="var(--fn-primary)" />
                </button>
              ) : null}
            </div>
          </div>

          {mode === "create" ? (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              {draftStatus === "saving" ? (
                <span style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>{t("正在保存…")}</span>
              ) : draftStatus === "saved" && lastSavedAt ? (
                <span style={{ fontSize: 12, color: "var(--fn-success)" }}>
                  {t("草稿已保存 {{time}}", {
                    time: formatDateTime(new Date(lastSavedAt).toISOString()),
                  })}
                </span>
              ) : draftStatus === "error" ? (
                <span style={{ fontSize: 12, color: "var(--fn-error)" }}>{t("草稿保存失败")}</span>
              ) : (
                <span style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>{t("每 30 秒自动保存草稿")}</span>
              )}
            </div>
          ) : null}

          {error ? <div style={{ fontSize: 13, marginTop: 12, lineHeight: "18px", color: "var(--fn-error)" }}>{error}</div> : null}

          <Button
            type="primary"
            block
            loading={submitting}
            onClick={handleSubmit}
            style={{ marginTop: 20, height: 50, borderRadius: 12, fontSize: 16, fontWeight: 700 }}
          >
            {mode === "edit" ? t("保存修改") : t("发布")}
          </Button>
        </div>

        {/* 大图预览 */}
        <Modal open={previewIndex !== null} onCancel={() => setPreviewIndex(null)} destroyOnHidden footer={null} width={Math.round((winWidth || 320) * 0.92)} styles={{ body: { padding: 0, backgroundColor: "rgba(0,0,0,0.9)", borderRadius: 8 } }}>
          <button
            type="button"
            onClick={() => setPreviewIndex(null)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            {previewIndex !== null && images[previewIndex] ? (
              // eslint-disable-next-line @next/next/no-img-element -- 远程/本地用户图片，无需 next/image 优化
              <img
                src={images[previewIndex].url || images[previewIndex].localUri}
                alt=""
                style={{
                  width: "100%",
                  height: Math.round((winHeight || 600) * 0.8),
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : null}
          </button>
        </Modal>

        <ConfirmModal
          visible={!!draftPrompt}
          onClose={handleDiscardDraft}
          onConfirm={handleContinueDraft}
          title={t("检测到未发布的草稿，是否继续？")}
          message={t("上次编辑于 {{time}}", {
            time: draftPrompt ? formatDateTime(draftPrompt.data.updated_at) : "",
          })}
          confirmText={t("继续")}
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