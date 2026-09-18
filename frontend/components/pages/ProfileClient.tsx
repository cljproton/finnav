"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import { useMyPoints } from "../../lib/api";
import { useThemeColors } from "../../constants/colors";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "../../components/ui/primitives";
import { Ionicons } from "../../components/ui/icons";
import { Button, Toast } from "../../components/ui/antd";
import PageHero from "../PageHero";
import AuthModal from "../AuthModal";
import TwoFactorManager from "../TwoFactorManager";
import InternalLink from "../InternalLink";
import SiteFooter from "../SiteFooter";
import BackToTopButton from "../BackToTopButton";
import { centeredContent } from "../../constants/layout";
import { useScrollToTop } from "../../lib/hooks/useScrollToTop";

export default function ProfileClient() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const auth = useAuth();
  const { data: points } = useMyPoints(!!auth.user);
  const [authVisible, setAuthVisible] = useState(false);

  const handleLogin = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) => {
      const res = await auth.login(email, password, captcha);
      Toast.success(t("登录成功"));
      return res;
    },
    [auth, t],
  );

  const handleLoginTFA = useCallback(
    async (email: string, totpToken: string, code: string) => {
      await auth.loginTFA(email, totpToken, code);
      Toast.success(t("登录成功"));
    },
    [auth, t],
  );

  const handleRegister = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) => {
      const res = await auth.register(email, password, captcha);
      Toast.success(t("注册成功"));
      return res;
    },
    [auth, t],
  );

  const handleVerify = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.verify(email, code, password);
      Toast.success(t("验证成功"));
    },
    [auth, t],
  );

  const handleRequestReset = useCallback(
    async (email: string) => {
      await auth.requestPasswordReset(email);
      Toast.success(t("重置邮件已发送"));
    },
    [auth, t],
  );

  const handleResetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.resetPassword(email, code, password);
      Toast.success(t("密码重置成功"));
    },
    [auth, t],
  );

  const handleLogout = useCallback(async () => {
    await auth.logout();
    Toast.success(t("已退出登录"));
  }, [auth, t]);

  const { ref: scrollRef, showButton } = useScrollToTop({ threshold: 200 });

  return (
    <div style={{ backgroundColor: colors.background, minHeight: "100vh" }}>
      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}>
        <div style={{ paddingTop: 16 }}>
          <PageHero title={t("个人中心")} />
        </div>

        <div style={{ ...centeredContent.container, paddingLeft: 20, paddingRight: 20, paddingTop: 20 }}>
          {auth.user ? (
            <>
              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 20,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    borderWidth: 1,
                    backgroundColor: colors.primaryLight,
                    borderColor: colors.borderGlow,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="person" size={28} color={colors.primary} />
                </View>
                <View style={{ marginTop: 12, alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>{auth.user.email}</Text>
                  <Text style={{ fontSize: 13, marginTop: 6, color: colors.textTertiary }}>{t("已登录 · 收藏与搜索记录已同步")}</Text>
                  <View
                    style={{
                      marginTop: 10,
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingLeft: 12,
                      paddingRight: 12,
                      paddingTop: 5,
                      paddingBottom: 5,
                      borderRadius: 999,
                      borderWidth: 1,
                      backgroundColor: colors.primaryLight,
                      borderColor: colors.borderGlow,
                    }}
                  >
                    <Ionicons name="trophy-outline" size={14} color={colors.primary} />
                    <Text style={{ fontSize: 13, fontWeight: 600, color: colors.primary }}>{t("积分 {{balance}}", { balance: points?.balance ?? 0 })}</Text>
                  </View>
                </View>
              </View>

              <InternalLink
                href="/submit-site"
                style={{
                  marginTop: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingTop: 14,
                  paddingBottom: 14,
                  paddingLeft: 16,
                  paddingRight: 16,
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={{ fontSize: 15, fontWeight: 500, flex: 1, color: colors.text }}>{t("提交新站点")}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </InternalLink>

              <InternalLink
                href="/points"
                style={{
                  marginTop: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingTop: 14,
                  paddingBottom: 14,
                  paddingLeft: 16,
                  paddingRight: 16,
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Ionicons name="trophy-outline" size={20} color={colors.primary} />
                <Text style={{ fontSize: 15, fontWeight: 500, flex: 1, color: colors.text }}>{t("积分与邀请")}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </InternalLink>

              <TwoFactorManager />

              <Pressable
                onPress={handleLogout}
                style={({ pressed }) => [
                  {
                    marginTop: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    paddingVertical: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.error} />
                <Text style={{ fontSize: 15, fontWeight: 600, color: colors.error }}>{t("退出登录")}</Text>
              </Pressable>
            </>
          ) : (
            <View
              style={[
                {
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 20,
                  alignItems: "center",
                },
              ]}
            >
              <View style={{ marginBottom: 12 }}>
                <Ionicons name="person-outline" size={36} color={colors.textTertiary} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: 600, textAlign: "center", color: colors.text }}>{t("登录后同步你的收藏与搜索记录")}</Text>
              <Text style={{ fontSize: 13, marginTop: 8, textAlign: "center", color: colors.textTertiary }}>{t("换设备也不丢失，保持个性化体验")}</Text>
              <Button
                onPress={() => setAuthVisible(true)}
                style={{ marginTop: 20, paddingTop: 14, paddingBottom: 14, paddingLeft: 32, paddingRight: 32, borderRadius: 10, backgroundColor: colors.primary }}
                type="primary"
              >
                <Text style={{ fontSize: 15, fontWeight: 700, color: colors.surfaceSolid }}>{t("立即登录 / 注册")}</Text>
              </Button>
            </View>
          )}
        <SiteFooter showNav={false} />
      </div>
      {showButton && <BackToTopButton scrollRef={scrollRef} threshold={200} />}
      <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onLogin={handleLogin}
        onLoginTFA={handleLoginTFA}
        onRegister={handleRegister}
        onVerify={handleVerify}
        onRequestReset={handleRequestReset}
        onResetPassword={handleResetPassword}
      />
    </ScrollView>
    </div>
  );
}