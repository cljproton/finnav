"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import { useMyPoints } from "../../lib/api";
import { Ionicons } from "../../components/ui/icons";
import { Button, message, Modal } from "@/components/antd-wrapper";
import AuthModal from "../AuthModal";
import InternalLink from "../InternalLink";
import SiteFooter from "../SiteFooter";
import BackToTopButton from "../BackToTopButton";
import { centeredContent } from "../../constants/layout";
import { useScrollToTop } from "../../lib/hooks/useScrollToTop";

export default function ProfileClient() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const { data: points } = useMyPoints(!!auth.user);
  const [authVisible, setAuthVisible] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const handleLogin = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) => {
      const res = await auth.login(email, password, captcha);
      message.success(t("登录成功"));
      return res;
    },
    [auth, t],
  );

  const handleRegister = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) => {
      const res = await auth.register(email, password, captcha);
      message.success(t("注册成功"));
      return res;
    },
    [auth, t],
  );

  const handleVerify = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.verify(email, code, password);
      message.success(t("验证成功"));
    },
    [auth, t],
  );

  const handleResetRequest = useCallback(
    async (email: string) => {
      await auth.requestPasswordReset(email);
      message.success(t("重置邮件已发送"));
    },
    [auth, t],
  );

  const handleResetConfirm = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.resetPassword(email, code, password);
      message.success(t("密码重置成功"));
    },
    [auth, t],
  );

  const handleLogout = useCallback(() => {
    setLogoutConfirm(true);
  }, []);

  const handleLogoutConfirmed = useCallback(async () => {
    await auth.logout();
    message.success(t("已退出登录"));
    setLogoutConfirm(false);
  }, [auth, t]);

  const { ref: scrollRef, showButton } = useScrollToTop({ threshold: 200 });

  return (
    <div className="fn-min-h-screen" style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
      <div
        ref={scrollRef}
        className="fn-flex fn-flex-col fn-overflow-y-auto"
        style={{ scrollBehavior: "auto" }}
      >
        <div className="fn-px-5 fn-pt-5" style={{ ...centeredContent.container, paddingLeft: 20, paddingRight: 20, paddingTop: 20 }}>
          {auth.user ? (
            <>
              <div
                className="fn-rounded-lg fn-border-default fn-bg-surface fn-p-5 fn-shadow-sm"
                style={{
                  borderRadius: "var(--fn-radius-lg)",
                  borderWidth: 1,
                  borderColor: "var(--fn-border)",
                  backgroundColor: "var(--fn-surface)",
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  boxShadow: "var(--fn-shadow-sm)",
                }}
              >
                <div
                  className="fn-flex fn-items-center fn-justify-center fn-rounded-full fn-border fn-border-brand-light fn-bg-brand-light"
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    borderWidth: 1,
                    backgroundColor: "var(--fn-primary-light)",
                    borderColor: "var(--fn-border-glow)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="person" size={28} color="var(--fn-primary)" />
                </div>
                <div className="fn-mt-3 fn-items-center" style={{ marginTop: 12, alignItems: "center" }}>
                  <div className="fn-text-md fn-font-semibold fn-text-primary" style={{ fontSize: 16, fontWeight: 600 }}>
                    {auth.user.email}
                  </div>
                  <div className="fn-text-sm fn-text-tertiary fn-mt-1.5" style={{ fontSize: 13, marginTop: 6 }}>
                    {t("已登录 · 收藏与搜索记录已同步")}
                  </div>
                  <div
                    className="fn-flex fn-flex-col fn-items-center fn-w-full fn-mt-4 fn-p-4 fn-rounded-lg fn-border fn-bg-surface"
                    style={{
                      borderWidth: 1,
                      borderColor: "var(--fn-border)",
                      backgroundColor: "var(--fn-surface)",
                      borderRadius: "var(--fn-radius-lg)",
                      padding: 16,
                      width: "100%",
                    }}
                  >
                    <div className="fn-flex fn-items-center fn-gap-1.5 fn-mb-2 fn-justify-center">
                      <div className="fn-text-sm fn-text-tertiary" style={{ fontSize: 14, fontWeight: 500 }}>{t("当前积分")}</div>
                      <Ionicons name="trophy-outline" size={16} color="var(--fn-primary)" />
                    </div>
                    <div className="fn-text-2xl fn-font-bold fn-text-primary" style={{ fontSize: 24, fontWeight: 700 }}>
                      {points?.balance ?? 0}
                    </div>
                    <InternalLink
                      href="/points"
                      className="fn-flex fn-items-center fn-justify-center fn-gap-1.5 fn-px-4 fn-py-2 fn-rounded-md fn-font-medium fn-transition-fast fn-w-full fn-mt-3"
                      style={{
                        paddingLeft: 16,
                        paddingRight: 16,
                        paddingTop: 10,
                        paddingBottom: 10,
                        borderRadius: "var(--fn-radius-md)",
                        backgroundColor: "var(--fn-primary)",
                        color: "var(--fn-surface-solid)",
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{t("去积分页")}</span>
                      <Ionicons name="chevron-forward" size={16} color="var(--fn-surface-solid)" />
                    </InternalLink>
                  </div>
                </div>
              </div>

              <InternalLink
                href="/submit-site"
                className="fn-flex fn-items-center fn-gap-2.5 fn-rounded-md fn-border-default fn-bg-surface fn-p-3.5 fn-px-4 fn-shadow-xs"
                style={{
                  marginTop: 14,
                  borderRadius: "var(--fn-radius-md)",
                  borderWidth: 1,
                  borderColor: "var(--fn-border)",
                  backgroundColor: "var(--fn-surface)",
                  paddingTop: 14,
                  paddingBottom: 14,
                  paddingLeft: 16,
                  paddingRight: 16,
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  boxShadow: "var(--fn-shadow-xs)",
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color="var(--fn-primary)" />
                <span className="fn-text-md fn-font-medium fn-text-primary fn-flex-1" style={{ fontSize: 15, fontWeight: 500, flex: 1 }}>
                  {t("提交新站点")}
                </span>
                <Ionicons name="chevron-forward" size={18} color="var(--fn-text-tertiary)" />
              </InternalLink>

              <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 14 }}>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="fn-flex fn-items-center fn-justify-center fn-gap-2 fn-rounded-md fn-border fn-bg-surface fn-py-3.5 fn-px-6 fn-transition-fast fn-cursor-pointer"
                  style={{
                    borderRadius: "var(--fn-radius-md)",
                    borderWidth: 1,
                    borderColor: "var(--fn-error)",
                    backgroundColor: "var(--fn-surface)",
                    paddingBlock: 14,
                    paddingInline: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.opacity = "0.85")}
                  onMouseUp={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  <Ionicons name="log-out-outline" size={18} color="var(--fn-error)" />
                  <span className="fn-text-md fn-font-semibold fn-text-error" style={{ fontSize: 15, fontWeight: 600 }}>
                    {t("退出登录")}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <div
              className="fn-rounded-lg fn-border-default fn-bg-surface fn-p-5 fn-shadow-sm"
              style={{
                borderRadius: "var(--fn-radius-lg)",
                borderWidth: 1,
                borderColor: "var(--fn-border)",
                backgroundColor: "var(--fn-surface)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                boxShadow: "var(--fn-shadow-sm)",
              }}
            >
              <div className="fn-mb-3" style={{ marginBottom: 12 }}>
                <Ionicons name="person-outline" size={36} color="var(--fn-text-tertiary)" />
              </div>
              <div className="fn-text-md fn-font-semibold fn-text-center fn-text-primary" style={{ fontSize: 16, fontWeight: 600, textAlign: "center" }}>
                {t("登录后同步你的收藏与搜索记录")}
              </div>
              <div className="fn-text-sm fn-text-center fn-text-tertiary fn-mt-2" style={{ fontSize: 13, marginTop: 8, textAlign: "center" }}>
                {t("换设备也不丢失，保持个性化体验")}
              </div>
              <Button
                onClick={() => setAuthVisible(true)}
                className="fn-mt-5"
                style={{
                  marginTop: 20,
                  paddingTop: 14,
                  paddingBottom: 14,
                  paddingLeft: 32,
                  paddingRight: 32,
                  borderRadius: "var(--fn-radius-md)",
                  backgroundColor: "var(--fn-primary)",
                }}
                type="primary"
              >
                <span className="fn-text-md fn-font-bold fn-text-inverse" style={{ fontSize: 15, fontWeight: 700 }}>
                  {t("立即登录 / 注册")}
                </span>
              </Button>
            </div>
          )}
        </div>
        <SiteFooter showNav={false} />
      </div>
      {showButton && <BackToTopButton scrollRef={scrollRef} threshold={200} />}
      <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onVerify={handleVerify}
        onRequestReset={handleResetRequest}
        onResetPassword={handleResetConfirm}
      />
      <Modal
        open={logoutConfirm}
        onCancel={() => setLogoutConfirm(false)}
        onOk={handleLogoutConfirmed}
        title={t("确认退出登录？")}
        centered
        width={360}
        footer={[
          <Button key="cancel" onClick={() => setLogoutConfirm(false)} type="default" style={{ paddingInline: 12, paddingBlock: 8 }}>
            {t("取消")}
          </Button>,
          <Button key="confirm" onClick={handleLogoutConfirmed} type="primary" danger style={{ paddingInline: 12, paddingBlock: 8 }}>
            {t("退出登录")}
          </Button>,
        ]}
        styles={{ body: { padding: 24 }, mask: { backgroundColor: "rgba(0,0,0,0.5)" } }}
      >
        {t("退出后需重新登录才能同步收藏与搜索记录。")}
      </Modal>
    </div>
  );
}