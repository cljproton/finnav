"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Ionicons } from "../ui/icons";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import LoginPanel from "../LoginPanel";
import SeoHeading from "../SeoHeading";

export default function LoginPageClient() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const auth = useAuth();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const bypassAuthPanels = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) =>
      auth.login(email, password, captcha),
    [auth],
  );
  const bypassRegister = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) =>
      auth.register(email, password, captcha),
    [auth],
  );
  const bypassVerify = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.verify(email, code, password);
    },
    [auth],
  );
  const bypassResetRequest = useCallback(
    async (email: string) => {
      await auth.requestPasswordReset(email);
    },
    [auth],
  );
  const bypassResetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.resetPassword(email, code, password);
    },
    [auth],
);

  useEffect(() => {
    document.title = `${t("登录 / 注册")} | FinNav`;
  }, [i18n.language, t]);

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
            {t("登录 / 注册")}
          </SeoHeading>
          <div style={{ width: 42 }} />
        </div>

        <div
          className="fn-card"
          style={{
            maxWidth: 400,
            margin: "28px auto 0",
            padding: 0,
            boxShadow: "var(--fn-shadow-sm)",
            overflow: "hidden",
          }}
        >
          <LoginPanel
            onLogin={bypassAuthPanels}
            onRegister={bypassRegister}
            onVerify={bypassVerify}
            onRequestReset={bypassResetRequest}
            onResetPassword={bypassResetPassword}
            onClose={goBack}
            onSuccess={goBack}
            closable={false}
          />
        </div>
      </div>
    </div>
  );
}