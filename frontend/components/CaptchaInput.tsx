"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "../components/ui/icons";
import { Input } from "@/components/antd-wrapper";
import { fetchCaptcha } from "../lib/captcha";
import type { useThemeColors } from "../constants/colors";
import { useTranslation } from "react-i18next";

interface Props {
  colors: ReturnType<typeof useThemeColors>;
  value: string;
  onChangeText: (text: string) => void;
  onResolved: (token: string | null, answer: string) => void;
}

/**
 * 图形验证码：展示图片 + 输入框 + 刷新按钮。
 * 拿到 token 后通过 onResolved 交给父组件在提交时附带。
 */
export default function CaptchaInput({
  colors: _colors,
  value,
  onChangeText,
  onResolved,
}: Props) {
  const { t } = useTranslation();
  const [image, setImage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 父组件传入的回调每次渲染都会重新创建，用 ref 持有最新引用，
  // 避免因身份变化触发 load 的 useEffect 反复执行（导致验证码不断刷新）。
  const onChangeTextRef = useRef(onChangeText);
  const onResolvedRef = useRef(onResolved);
  onChangeTextRef.current = onChangeText;
  onResolvedRef.current = onResolved;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCaptcha();
      setImage(data.image);
      setToken(data.token);
      onChangeTextRef.current("");
      onResolvedRef.current(data.token, "");
    } catch {
      setImage(null);
      setToken(null);
      onChangeTextRef.current("");
      onResolvedRef.current(null, "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleText = (text: string) => {
    onChangeTextRef.current(text);
    onResolvedRef.current(token, text);
  };

  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: "var(--fn-radius-md)",
          border: "1px solid var(--fn-border)",
          backgroundColor: "var(--fn-chip-bg)",
          flex: 1,
          minWidth: 0,
        }}
      >
        <Ionicons name="shield-checkmark-outline" size={18} color="var(--fn-text-tertiary)" />
        <Input
          value={value}
          onChange={(e) => handleText(e.target.value)}
          placeholder={t("图形验证码")}
          maxLength={6}
          variant="borderless"
          style={{ flex: 1, backgroundColor: "transparent" }}
        />
      </div>
      <button
        type="button"
        onClick={load}
        disabled={loading}
        aria-label={t("刷新验证码")}
        style={{
          width: 96,
          height: 46,
          flexShrink: 0,
          borderRadius: "var(--fn-radius-md)",
          border: "1px solid var(--fn-border)",
          backgroundColor: "var(--fn-surface)",
          opacity: loading ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          cursor: loading ? "not-allowed" : "pointer",
          padding: 0,
        }}
      >
        {image ? (
          <img
            src={image}
            alt="Captcha"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 11, color: "var(--fn-text-tertiary)" }}>{t("加载中…")}</span>
        )}
      </button>
    </div>
  );
}