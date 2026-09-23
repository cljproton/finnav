"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Spin, Button } from "antd";
import { Ionicons } from "./ui/icons";
import { Input, message } from "@/components/antd-wrapper";
import {
  fetchTutorialTitle,
  shareTutorial,
  updateTutorial,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import type { TutorialStatus, TutorialType } from "../lib/types";
import AuthModal from "./AuthModal";
import SeoHeading from "./SeoHeading";

export interface TutorialEditorInitial {
  id: number;
  type: TutorialType;
  url: string;
  title: string;
  status: TutorialStatus;
}

const URL_RE = /^https?:\/\/[^\s]+$/i;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

const TYPE_OPTIONS: {
  type: TutorialType;
  label: string;
  icon: string;
  sample: string;
  desc: string;
}[] = [
  {
    type: "text",
    label: "文字教程",
    icon: "document-text-outline",
    sample: "https://example.com/guide",
    desc: "博客文章、图文教程这类页面",
  },
  {
    type: "video",
    label: "视频教程",
    icon: "play-circle-outline",
    sample: "https://www.bilibili.com/video/...",
    desc: "讲解视频、录屏教程（B站/YouTube 等）",
  },
  {
    type: "agent",
    label: "辅助/代办",
    icon: "people-outline",
    sample: "https://example.com/tool",
    desc: "工具、代跑腿这类辅助小服务",
  },
];

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function friendlyError(e: unknown, t: (key: string) => string): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const lower = msg.toLowerCase();
  if (/already|重复|已存在|已提交|unique|exist/i.test(lower)) {
    return t("看起来这个链接已经分享过了，试试换个链接");
  }
  if (/url|invalid|格式|无效|must be|enter a valid/i.test(lower)) {
    return t("链接格式好像不太对，检查一下是不是完整的网址");
  }
  if (/network|failed to fetch|timeout|超时|服务器|server|50[0-9]/i.test(lower)) {
    return t("网络好像开小差了，稍后再试一次吧");
  }
  return msg || t("提交失败了，请稍后再试");
}

function StepIndicator({ current }: { current: number }) {
  const { t } = useTranslation();
  const steps = [t("选择类型"), t("粘贴链接"), t("确认标题")];
  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", marginBottom: 18 }}>
      {steps.map((label, idx) => {
        const n = idx + 1;
        const done = n < current;
        const active = n === current;
        const filled = done || active;
        return (
          <React.Fragment key={label}>
            {idx > 0 ? (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  marginTop: 12,
                  marginLeft: 4,
                  marginRight: 4,
                  backgroundColor: done ? "var(--fn-primary)" : "var(--fn-border)",
                }}
              />
            ) : null}
            <div style={{ alignItems: "center", width: 72, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `2px solid ${active ? "var(--fn-primary)" : "transparent"}`,
                  backgroundColor: filled ? "var(--fn-primary)" : "var(--fn-chip-bg)",
                }}
              >
                {done ? (
                  <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 700, color: filled ? "#FFFFFF" : "var(--fn-text-tertiary)" }}>
                    {n}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, marginTop: 6, textAlign: "center", color: filled ? "var(--fn-primary)" : "var(--fn-text-tertiary)" }}>
                {label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function TutorialShareEditor({
  siteId,
  mode,
  initial,
}: {
  siteId: number;
  mode: "create" | "edit";
  initial?: TutorialEditorInitial | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const queryClient = useQueryClient();

  // 处理 edit 模式：从 URL searchParams 读取参数
  const [editId, setEditId] = useState<number | null>(initial?.id ?? null);
  const [editType, setEditType] = useState<TutorialType | null>(initial?.type ?? null);
  const [editUrl, setEditUrl] = useState<string>(initial?.url ?? "");
  const [editTitle, setEditTitle] = useState<string>(initial?.title ?? "");
  const [editStatus, setEditStatus] = useState<TutorialStatus | null>(initial?.status ?? null);

  useEffect(() => {
    if (mode === "edit" && !initial) {
      const sp = searchParams;
      const edit = sp.get("edit");
      const type = sp.get("type");
      const url = sp.get("url");
      const title = sp.get("title");
      const status = sp.get("status");
      if (edit) setEditId(Number(edit));
      if (type) setEditType(type as TutorialType);
      if (url) setEditUrl(url);
      if (title) setEditTitle(title);
      if (status) setEditStatus(status as TutorialStatus);
    }
  }, [mode, initial, searchParams]);

  const [type, setType] = useState<TutorialType>(editType ?? initial?.type ?? "text");
  const [url, setUrl] = useState(editUrl ?? initial?.url ?? "");
  const [title, setTitle] = useState(editTitle ?? initial?.title ?? "");
  const [titleEdited, setTitleEdited] = useState(
    mode === "edit" && !!initial?.title,
  );
  const [titleFetching, setTitleFetching] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    fallback: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [authVisible, setAuthVisible] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = TYPE_OPTIONS.find((o) => o.type === type)!;
  const sample = selected.sample;

  const currentEditId = initial?.id ?? editId;
  const currentEditType = initial?.type ?? editType;
  const currentEditUrl = initial?.url ?? editUrl;
  const currentEditTitle = initial?.title ?? editTitle;
  const currentEditStatus = initial?.status ?? editStatus;

  const runFetch = useCallback(async () => {
    const u = url.trim();
    if (!loggedIn || titleEdited || !URL_RE.test(u)) return;
    setTitleFetching(true);
    try {
      const res = await fetchTutorialTitle(siteId, u);
      setPreview(res);
      if (!res.fallback) {
        setTitle(res.title);
      }
    } catch {
      setPreview(null);
    } finally {
      setTitleFetching(false);
    }
  }, [loggedIn, titleEdited, url, siteId]);

  useEffect(() => {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }
    const u = url.trim();
    if (!loggedIn || titleEdited || !URL_RE.test(u)) {
      previewTimer.current = setTimeout(() => setTitleFetching(false), 0);
    } else {
      previewTimer.current = setTimeout(() => {
        setTitleFetching(true);
        runFetch();
      }, 600);
    }
    return () => {
      if (previewTimer.current) {
        clearTimeout(previewTimer.current);
        previewTimer.current = null;
      }
    };
  }, [url, loggedIn, titleEdited, siteId, runFetch]);

  const handleRefetch = useCallback(() => {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }
    runFetch();
  }, [runFetch]);

  const handleUrlBlur = () => {
    const normalized = normalizeUrl(url);
    if (normalized !== url) setUrl(normalized);
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace(`/site/${siteId}/tutorials`);
    }
  };

  const handleSubmit = async () => {
    if (!loggedIn) {
      setAuthVisible(true);
      return;
    }
    const normalized = normalizeUrl(url);
    if (normalized !== url) setUrl(normalized);
    if (!normalized) {
      setSubmitError(t("请输入链接，或粘贴后我们也会帮你自动补全"));
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = { type, url: normalized, title };
      if (mode === "edit" && currentEditId) {
        await updateTutorial(siteId, currentEditId, payload);
        message.success(t("已更新，等待重新审核"), 1.5);
      } else {
        await shareTutorial(siteId, payload);
        message.success(t("提交成功！审核通过后就会公开啦"), 1.5);
      }
      queryClient.invalidateQueries({ queryKey: ["site-tutorials", siteId] });
      queryClient.invalidateQueries({ queryKey: ["site-tutorials-top", siteId] });
      queryClient.invalidateQueries({ queryKey: ["site", siteId] });
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.replace(`/site/${siteId}/tutorials`);
      }
    } catch (e: unknown) {
      setSubmitError(friendlyError(e, t));
    } finally {
      setSubmitting(false);
    }
  };

  const urlFilled = url.trim().length > 0;
  const titleFilled = title.trim().length > 0;
  const currentStep = urlFilled ? (titleFilled ? 4 : 3) : 2;

  const inputStyle: React.CSSProperties = {
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: "var(--fn-text)",
    backgroundColor: "var(--fn-chip-bg)",
    borderColor: "var(--fn-border)",
    boxShadow: "none",
  };

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
            style={{ fontSize: 17, fontWeight: 700, color: "var(--fn-text)", flex: 1, textAlign: "center" }}
          >
            {mode === "edit" ? t("编辑教程") : t("分享教程")}
          </SeoHeading>
          <Button
            type="primary"
            loading={submitting}
            onClick={handleSubmit}
            style={{ borderRadius: 18, minWidth: 56 }}
          >
            {mode === "edit" ? t("保存") : t("提交")}
          </Button>
        </div>

        <div style={{ paddingTop: 8 }}>
          <div style={{ fontSize: 13, lineHeight: "20px", marginBottom: 16, color: "var(--fn-text-secondary)" }}>
            {t("分享你的教程链接，标题会自动获取，你只需要确认一下就好啦。审核通过后就会公开展示给其他用户。")}
          </div>

          <StepIndicator current={currentStep} />

          <div className="fn-card" style={{ padding: 16, marginBottom: 14, boxShadow: "var(--fn-shadow-sm)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--fn-text-secondary)" }}>
              {t("选择类型")}
            </div>
            {TYPE_OPTIONS.map((opt) => {
              const active = opt.type === type;
              return (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setType(opt.type)}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    borderRadius: 12,
                    border: `1px solid ${active ? "var(--fn-primary)" : "var(--fn-border)"}`,
                    backgroundColor: active ? "var(--fn-primary-light)" : "var(--fn-chip-bg)",
                    paddingLeft: 12,
                    paddingRight: 12,
                    paddingTop: 12,
                    paddingBottom: 12,
                    marginBottom: 10,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? "var(--fn-primary)" : "var(--fn-chip-bg)",
                    }}
                  >
                    <Ionicons name={opt.icon} size={18} color={active ? "#FFFFFF" : "var(--fn-text-secondary)"} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? "var(--fn-primary)" : "var(--fn-text)" }}>
                      {t(opt.label)}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 2, color: "var(--fn-text-secondary)" }}>
                      {t(opt.desc)}
                    </div>
                  </div>
                  {active ? <Ionicons name="checkmark-circle" size={18} color="var(--fn-primary)" /> : null}
                </button>
              );
            })}
          </div>

          <div className="fn-card" style={{ padding: 16, boxShadow: "var(--fn-shadow-sm)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--fn-text-secondary)" }}>
              {t("教程链接")}
            </div>
            <Input
              value={url}
              onChange={(e) => {
                const text = e.target.value;
                setUrl(text);
                setPreview(null);
                if (submitError) setSubmitError("");
              }}
              onBlur={handleUrlBlur}
              placeholder={sample}
              style={inputStyle}
            />
            <div style={{ fontSize: 12, marginTop: 8, color: "var(--fn-text-tertiary)" }}>
              {t("示例：{{sample}}", { sample })}
            </div>

            {titleFetching ? (
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                <Spin size="small" />
                <span style={{ fontSize: 12, color: "var(--fn-text-secondary)" }}>{t("自动获取标题中…")}</span>
              </div>
            ) : null}

            {preview ? (
              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${preview.fallback ? "var(--fn-border)" : "var(--fn-primary)"}`,
                  backgroundColor: preview.fallback ? "var(--fn-chip-bg)" : "var(--fn-primary-light)",
                  paddingLeft: 12,
                  paddingRight: 12,
                  paddingTop: 10,
                  paddingBottom: 10,
                  marginTop: 10,
                }}
              >
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons
                    name={preview.fallback ? "information-circle-outline" : "checkmark-circle"}
                    size={16}
                    color={preview.fallback ? "var(--fn-warning)" : "var(--fn-success)"}
                  />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: preview.fallback ? "var(--fn-warning)" : "var(--fn-success)" }}>
                    {preview.fallback ? t("暂时没能自动获取标题") : t("已自动获取标题")}
                  </span>
                  <button
                    type="button"
                    onClick={handleRefetch}
                    disabled={titleFetching}
                    style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, border: "none", background: "none", cursor: "pointer", opacity: titleFetching ? 0.6 : 1 }}
                  >
                    <Ionicons name="refresh" size={13} color="var(--fn-primary)" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fn-primary)" }}>{t("重新获取")}</span>
                  </button>
                </div>
                {preview.fallback ? (
                  <div style={{ fontSize: 12, lineHeight: "18px", marginTop: 6, color: "var(--fn-text-secondary)" }}>
                    {t("暂时没能自动获取标题，你可以手动填写，或留空由我们提交时再试一次")}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      marginTop: 6,
                      lineHeight: "20px",
                      color: "var(--fn-text)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {preview.title}
                  </div>
                )}
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 14,
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fn-text-secondary)" }}>{t("标题")}</span>
              <span style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>{t("（可选，留空自动获取）")}</span>
            </div>
            <Input
              value={title}
              onChange={(e) => {
                const text = e.target.value;
                setTitle(text);
                setTitleEdited(true);
              }}
              placeholder={t("可手动填写标题")}
              maxLength={200}
              style={inputStyle}
            />
          </div>

          {mode === "edit" && currentEditStatus === "rejected" ? (
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
                marginBottom: 14,
              }}
            >
              <Ionicons name="information-circle-outline" size={15} color="var(--fn-warning)" />
              <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 1, color: "var(--fn-warning)" }}>
                {t("这条教程之前没通过审核，修改后会自动重新提交审核。")}
              </span>
            </div>
          ) : null}

          {!loggedIn ? (
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2, marginBottom: 12 }}>
              <Ionicons name="person-circle-outline" size={16} color="var(--fn-text-tertiary)" />
              <span style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>{t("登录后就可以分享教程啦")}</span>
            </div>
          ) : null}

          {submitError ? (
            <div style={{ fontSize: 13, lineHeight: "18px", marginBottom: 12, color: "var(--fn-error)" }}>{submitError}</div>
          ) : null}

          <Button
            type="primary"
            block
            loading={submitting}
            onClick={handleSubmit}
            style={{ height: 50, borderRadius: 12, fontSize: 16, fontWeight: 700 }}
          >
            {mode === "edit" ? t("保存修改") : t("提交分享")}
          </Button>
        </div>

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