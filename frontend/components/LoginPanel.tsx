"use client";

import { useState } from "react";
import { Ionicons } from "../components/ui/icons";
import { Input, Button, message } from "@/components/antd-wrapper";
import { useSettings } from "../lib/api";
import { useTranslation } from "react-i18next";
import CaptchaInput from "./CaptchaInput";
import type { CaptchaPayload } from "../lib/auth";

type Step = "form" | "verify" | "reset-form" | "reset-verify";

interface LoginPanelProps {
  onLogin: (email: string, password: string, captcha: CaptchaPayload) => Promise<{ access: string; refresh: string }>;
  onRegister: (email: string, password: string, captcha: CaptchaPayload) => Promise<boolean>;
  onVerify: (email: string, code: string, password: string) => Promise<void>;
  onRequestReset: (email: string) => Promise<void>;
  onResetPassword: (email: string, code: string, password: string) => Promise<void>;
  onClose?: () => void;
  onSuccess?: () => void;
  closable?: boolean;
}

const fieldBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  paddingLeft: 14,
  paddingRight: 14,
  paddingTop: 8,
  paddingBottom: 8,
  borderRadius: "var(--fn-radius-md)",
  border: "1px solid var(--fn-border)",
  backgroundColor: "var(--fn-chip-bg)",
};

const borderedlessInput: React.CSSProperties = { flex: 1, backgroundColor: "transparent" };

export default function LoginPanel({
  onLogin,
  onRegister,
  onVerify,
  onRequestReset,
  onResetPassword,
  onClose,
  onSuccess,
  closable = true,
}: LoginPanelProps) {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const requireVerification = settings?.require_email_verification ?? true;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resetFields = () => {
    setEmail("");
    setPassword("");
    setCode("");
    setCaptcha("");
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    setError("");
    setLoading(false);
  };

  const finish = () => {
    resetFields();
    setStep("form");
    onSuccess?.();
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setStep("form");
    setError("");
  };

  const handleRegisterSubmit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError(t("请填写邮箱和密码"));
      return;
    }
    if (!captchaToken || !captcha) {
      setError(t("请完成图形验证码"));
      return;
    }
    setLoading(true);
    try {
      const loggedIn = await onRegister(email.trim(), password, {
        token: captchaToken,
        answer: captcha,
      });
      setError("");
      if (loggedIn) {
        message.success(t("注册成功，欢迎加入！"));
        finish();
      } else {
        setStep("verify");
      }
    } catch (e: any) {
      setError(e?.message || t("操作失败"));
      setCaptcha("");
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async () => {
    setError("");
    if (!code.trim()) {
      setError(t("请输入验证码"));
      return;
    }
    setLoading(true);
    try {
      await onVerify(email.trim(), code.trim(), password);
      message.success(t("注册成功，欢迎加入！"));
      finish();
    } catch (e: any) {
      setError(e?.message || t("操作失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError("");
    setLoading(true);
    try {
      if (step === "verify") {
        if (!captchaToken || !captcha) {
          setError(t("请完成图形验证码"));
          return;
        }
        await onRegister(email.trim(), password, {
          token: captchaToken,
          answer: captcha,
        });
      } else {
        await onRequestReset(email.trim());
      }
      setCode("");
      setError("");
      setCaptcha("");
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    } catch (e: any) {
      setError(e?.message || t("重发失败"));
      setCaptcha("");
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError(t("请填写邮箱和密码"));
      return;
    }
    if (!captchaToken || !captcha) {
      setError(t("请完成图形验证码"));
      return;
    }
    setLoading(true);
    try {
      await onLogin(email.trim(), password, {
        token: captchaToken,
        answer: captcha,
      });
      finish();
    } catch (e: any) {
      setError(e?.message || t("操作失败"));
      setCaptcha("");
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async () => {
    setError("");
    if (!email.trim()) {
      setError(t("请输入邮箱"));
      return;
    }
    setLoading(true);
    try {
      await onRequestReset(email.trim());
      setStep("reset-verify");
      setError("");
    } catch (e: any) {
      setError(e?.message || t("操作失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async () => {
    setError("");
    if (!code.trim() || !password) {
      setError(t("请输入验证码和新密码"));
      return;
    }
    setLoading(true);
    try {
      await onResetPassword(email.trim(), code.trim(), password);
      resetFields();
      setMode("login");
      setStep("form");
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message || t("操作失败"));
    } finally {
      setLoading(false);
    }
  };

  const isVerifyStep = step === "verify" || step === "reset-verify";
  const stepTitle =
    step === "verify"
      ? t("注册验证")
      : step === "reset-verify"
        ? t("重置密码")
        : mode === "login"
          ? t("登录")
          : t("注册");
  const stepHint =
    step === "verify"
      ? t("验证码已发送至 {{email}}，请查收邮件", { email })
      : step === "reset-verify"
        ? t("验证码已发送至 {{email}}，请查收邮件后设置新密码", { email })
        : "";

  const handleSubmit = () => {
    if (step === "verify") return handleVerifySubmit();
    if (step === "reset-verify") return handleResetConfirm();
    if (step === "reset-form") return handleResetRequest();
    return mode === "register" ? handleRegisterSubmit() : handleLoginSubmit();
  };

  return (
    <div style={{ position: "relative" }}>
      {closable && onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("关闭")}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            border: "none",
            backgroundColor: "transparent",
            color: "var(--fn-text-tertiary)",
            zIndex: 10,
          }}
        >
          <Ionicons name="close" size={20} color="var(--fn-text-tertiary)" />
        </button>
      ) : null}

      <div style={{ padding: 20 }}>
        {step === "form" ? (
          <div style={{ display: "flex", gap: 24, marginBottom: 24, marginTop: 4 }}>
            {(
              [
                ["login", t("登录")],
                ["register", t("注册")],
              ] as const
            ).map(([key, label]) => {
              const active = mode === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchMode(key)}
                  style={{
                    paddingTop: 6,
                    paddingBottom: 8,
                    border: "none",
                    borderBottom: `2px solid ${active ? "var(--fn-primary)" : "transparent"}`,
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    fontSize: 16,
                    color: active ? "var(--fn-primary)" : "var(--fn-text-tertiary)",
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ marginBottom: 24, marginTop: 4 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fn-text)" }}>{stepTitle}</div>
          </div>
        )}

        {stepHint ? (
          <div style={{ fontSize: 13, color: "var(--fn-text-secondary)", marginTop: -12, marginBottom: 12 }}>
            {stepHint}
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(step === "form" || step === "reset-form") && (
            <div style={fieldBox}>
              <Ionicons name="mail-outline" size={18} color="var(--fn-text-tertiary)" />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("邮箱")}
                autoCapitalize="none"
                variant="borderless"
                style={borderedlessInput}
              />
            </div>
          )}

          {step === "form" && (
            <div style={fieldBox}>
              <Ionicons name="lock-closed-outline" size={18} color="var(--fn-text-tertiary)" />
              <Input.Password
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("密码")}
                variant="borderless"
                style={borderedlessInput}
              />
            </div>
          )}

          {step === "form" && (
            <CaptchaInput
              key={captchaKey}
              colors={{ primary: "var(--fn-primary)" } as any}
              value={captcha}
              onChangeText={setCaptcha}
              onResolved={(token, _answer) => setCaptchaToken(token)}
            />
          )}

          {step === "verify" && (
            <CaptchaInput
              key={`${captchaKey}-verify`}
              colors={{ primary: "var(--fn-primary)" } as any}
              value={captcha}
              onChangeText={setCaptcha}
              onResolved={(token, _answer) => setCaptchaToken(token)}
            />
          )}

          

          {(step === "verify" || step === "reset-verify") && (
            <>
              <div style={fieldBox}>
                <Ionicons name="key-outline" size={18} color="var(--fn-text-tertiary)" />
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t("6 位验证码")}
                  maxLength={6}
                  variant="borderless"
                  style={borderedlessInput}
                />
              </div>
              {step === "reset-verify" && (
                <div style={fieldBox}>
                  <Ionicons name="lock-closed-outline" size={18} color="var(--fn-text-tertiary)" />
                  <Input.Password
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("新密码")}
                    variant="borderless"
                    style={borderedlessInput}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {error ? (
          <div
            style={{
              fontSize: 13,
              marginTop: 10,
              textAlign: "center",
              color: "var(--fn-error)",
            }}
          >
            {error}
          </div>
        ) : null}

        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          block
          size="large"
          style={{ marginTop: 20, borderRadius: 10 }}
          onClick={handleSubmit}
        >
          {loading
            ? t("请稍候...")
            : step === "verify" || step === "reset-verify"
              ? t("确认")
              : step === "reset-form"
                ? t("发送验证码")
                : mode === "login"
                  ? t("登录")
                  : requireVerification
                    ? t("获取验证码")
                    : t("注册")}
        </Button>

        {step === "verify" || step === "reset-verify" ? (
          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading}
            style={{ display: "block", margin: "14px auto 0", padding: 8, border: "none", background: "none", cursor: "pointer" }}
          >
            <span style={{ fontSize: 13, color: "var(--fn-primary)" }}>
              {t("没有收到？重新发送")}
            </span>
          </button>
        ) : step === "form" && mode === "login" ? (
          <button
            type="button"
            onClick={() => {
              setStep("reset-form");
              setError("");
            }}
            style={{ display: "block", margin: "14px auto 0", padding: 8, border: "none", background: "none", cursor: "pointer" }}
          >
            <span style={{ fontSize: 13, color: "var(--fn-primary)" }}>{t("忘记密码？")}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}