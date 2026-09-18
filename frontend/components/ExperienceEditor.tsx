"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "./ui/primitives";
import { Ionicons } from "./ui/icons";
import { Toast, Modal } from "./ui/antd";
import { storage } from "../lib/storage";
import {
  createExperience,
  deleteExperienceImage,
  updateExperience,
  uploadExperienceImage,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useThemeColors } from "../constants/colors";
import { centeredContent } from "../constants/layout";
import { formatDateTime, errorMessage } from "../lib/utils";
import type { Experience } from "../lib/types";
import AuthModal from "./AuthModal";
import { ConfirmModal } from "./ConfirmModal";
import { StyleSheet, rn } from "../lib/rnStyle";

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
  const colors = useThemeColors();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const queryClient = useQueryClient();
  const { width: winWidth, height: winHeight } = useWindowDimensions();

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
      Toast.info(t("最多上传 {{max}} 张图片", { max: MAX_IMAGES }), 1.5);
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
        Toast.success(t("保存修改"), 1.5);
      } else {
        await createExperience(siteId, payload);
        await storage.removeItem(draftKey(siteId)).catch(() => {});
        Toast.success(t("发布成功"), 1.5);
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

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={onFileInputChange}
      />

      <View style={styles.topBar}>
        <Pressable onPress={goBack} style={styles.backBtn} accessibilityLabel={t("返回")}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          {mode === "edit" ? t("编辑经验") : t("发布经验")}
        </Text>
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitTopBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitTopText}>
              {mode === "edit" ? t("保存") : t("发布")}
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, centeredContent.container]}
      >
        {/* 封面（第一张图） */}
        <Pressable
          onPress={() => (cover ? setPreviewIndex(0) : pickImages())}
          style={({ pressed }) => [
            styles.coverWrap,
            {
              borderColor: cover ? "transparent" : colors.border,
              backgroundColor: cover ? "transparent" : colors.chipBg,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- 远程/本地用户图片，无需 next/image 优化
            <img
              src={cover.url || cover.localUri}
              alt=""
              style={{ ...styles.cover, objectFit: "cover", display: "block" }}
            />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="camera-outline" size={36} color={colors.textTertiary} />
              <Text style={[styles.coverPlaceholderText, { color: colors.textTertiary }]}>
                {t("添加封面图片")}
              </Text>
            </View>
          )}
          {cover ? (
            <View style={[styles.coverBadge, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
              <Text style={styles.coverBadgeText}>{t("封面")}</Text>
            </View>
          ) : null}
        </Pressable>

        <input
          value={title}
          onChange={(e) => {
            userEditedRef.current = true;
            setTitle(e.target.value);
          }}
          placeholder={t("请输入标题")}
          maxLength={80}
          style={{
            ...rn(styles.titleInput),
            color: colors.text,
            background: "transparent",
            border: "none",
            outline: "none",
            width: "100%",
            fontFamily: "var(--fn-font)",
            boxSizing: "border-box",
          }}
        />

        <textarea
          value={content}
          onChange={(e) => {
            userEditedRef.current = true;
            setContent(e.target.value);
          }}
          placeholder={t("请输入经验内容")}
          style={{
            ...rn(styles.contentInput),
            color: colors.text,
            background: "transparent",
            border: "none",
            outline: "none",
            width: "100%",
            resize: "vertical",
            fontFamily: "var(--fn-font)",
            boxSizing: "border-box",
          }}
        />

        <View style={[styles.priceRow, { borderColor: colors.border }]}>
          <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
            {t("价格（积分）")}
          </Text>
          <input
            value={price}
            onChange={(e) => {
              userEditedRef.current = true;
              setPrice(e.target.value);
            }}
            inputMode="numeric"
            placeholder={`${PRICE_MIN} ~ ${PRICE_MAX}`}
            style={{
              ...rn(styles.priceInput),
              color: colors.text,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "var(--fn-font)",
              boxSizing: "border-box",
            }}
          />
        </View>

        {mode === "edit" && initial ? (
          <View style={styles.feeBanner}>
            <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
            <Text style={[styles.feeBannerText, { color: colors.warning }]}>
              {t("保存修改将扣除 {{price}} 积分", { price: initial.price })}
            </Text>
          </View>
        ) : null}

        {/* 图片预览列表 */}
        <View style={styles.galleryWrap}>
          <Text style={[styles.galleryLabel, { color: colors.textSecondary }]}>
            {t("配图（可选，最多 {{max}} 张）", { max: MAX_IMAGES })}
          </Text>
          <View style={styles.gallery}>
            {images.map((img, idx) => (
              <View key={idx} style={styles.galleryItem}>
                {img.url || img.localUri ? (
                  <Pressable onPress={() => setPreviewIndex(idx)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 远程/本地用户图片，无需 next/image 优化 */}
                    <img
                      src={img.url || img.localUri}
                      alt=""
                      style={{ ...styles.galleryThumb, objectFit: "cover", display: "block" }}
                    />
                  </Pressable>
                ) : (
                  <View
                    style={[
                      styles.galleryThumb,
                      styles.galleryThumbEmpty,
                      { backgroundColor: colors.chipBg },
                    ]}
                  />
                )}
                {img.uploading ? (
                  <View style={styles.galleryOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                ) : img.error ? (
                  <View style={[styles.galleryOverlay, { backgroundColor: "rgba(220,38,38,0.7)" }]}>
                    <Ionicons name="alert-circle" size={18} color="#FFFFFF" />
                  </View>
                ) : null}
                {idx === 0 ? (
                  <View style={[styles.thumbBadge, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                    <Text style={styles.thumbBadgeText}>{t("封面")}</Text>
                  </View>
                ) : null}
                <Pressable onPress={() => removeImage(idx)} style={styles.thumbDelete}>
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGES ? (
              <Pressable
                onPress={pickImages}
                style={({ pressed }) => [
                  styles.galleryAdd,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.chipBg,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons name="add" size={26} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {mode === "create" ? (
          <View style={styles.draftRow}>
            {draftStatus === "saving" ? (
              <Text style={[styles.draftText, { color: colors.textTertiary }]}>
                {t("正在保存…")}
              </Text>
            ) : draftStatus === "saved" && lastSavedAt ? (
              <Text style={[styles.draftText, { color: colors.success }]}>
                {t("草稿已保存 {{time}}", {
                  time: formatDateTime(new Date(lastSavedAt).toISOString()),
                })}
              </Text>
            ) : draftStatus === "error" ? (
              <Text style={[styles.draftText, { color: colors.error }]}>
                {t("草稿保存失败")}
              </Text>
            ) : (
              <Text style={[styles.draftText, { color: colors.textTertiary }]}>
                {t("每 30 秒自动保存草稿")}
              </Text>
            )}
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              {mode === "edit" ? t("保存修改") : t("发布")}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {/* 大图预览 */}
      <Modal visible={previewIndex !== null} transparent animationType="fade" onClose={() => setPreviewIndex(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewIndex(null)}>
          {previewIndex !== null && images[previewIndex] ? (
            // eslint-disable-next-line @next/next/no-img-element -- 远程/本地用户图片，无需 next/image 优化
            <img
              src={images[previewIndex].url || images[previewIndex].localUri}
              alt=""
              style={{
                ...styles.previewImage,
                width: Math.round(winWidth * 0.92),
                height: Math.round(winHeight * 0.8),
                objectFit: "contain",
                display: "block",
              }}
            />
          ) : null}
        </Pressable>
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
  screen: { flex: 1, minHeight: "100vh" },
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
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  submitTopBtn: {
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  submitTopText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  coverWrap: {
    width: "100%",
    height: 320,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    overflow: "hidden",
    marginBottom: 16,
  },
  cover: {
    width: "100%",
    height: 320,
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  coverPlaceholderText: {
    fontSize: 13,
    marginTop: 8,
  },
  coverBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  coverBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  titleInput: {
    fontSize: 20,
    fontWeight: "700",
    paddingVertical: 4,
  },
  contentInput: {
    fontSize: 15,
    lineHeight: 24,
    minHeight: 140,
    marginTop: 12,
    paddingVertical: 4,
    fontFamily: "inherit",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 12,
    marginTop: 12,
  },
  priceLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  priceInput: {
    fontSize: 15,
    fontWeight: "600",
    minWidth: 90,
    textAlign: "right",
  },
  feeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(217,119,6,0.10)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 12,
  },
  feeBannerText: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  galleryWrap: {
    marginTop: 16,
  },
  galleryLabel: {
    fontSize: 13,
    marginBottom: 10,
  },
  gallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  galleryItem: {
    width: 96,
    height: 96,
    borderRadius: 12,
    overflow: "hidden",
  },
  galleryThumb: {
    width: 96,
    height: 96,
  },
  galleryThumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  galleryOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  thumbBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  thumbBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  thumbDelete: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  galleryAdd: {
    width: 96,
    height: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  draftRow: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  draftText: {
    fontSize: 12,
  },
  error: {
    fontSize: 13,
    marginTop: 12,
    lineHeight: 18,
  },
  submitBtn: {
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    borderRadius: 8,
  },
});
