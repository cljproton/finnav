import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import Toast from "@ant-design/react-native/es/toast";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import { useThemeColors } from "../../constants/colors";
import PageHero from "../../components/PageHero";
import AuthModal from "../../components/AuthModal";
import SiteFooter from "../../components/SiteFooter";
import TwoFactorManager from "../../components/TwoFactorManager";
import { useMyPoints } from "../../lib/api";
import { useRouter } from "expo-router";
import BackToTopButton, {
  type BackToTopHandle,
} from "../../components/BackToTopButton";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const router = useRouter();
  const { data: points } = useMyPoints(!!auth.user);
  const [authVisible, setAuthVisible] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const backToTopRef = useRef<BackToTopHandle>(null);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      backToTopRef.current?.handleScroll(e);
    },
    [],
  );

  const handleLogin = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) => {
      return auth.login(email, password, captcha);
    },
    [auth],
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
      return auth.register(email, password, captcha);
    },
    [auth],
  );

  const handleVerify = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.verify(email, code, password);
    },
    [auth],
  );

  const handleRequestReset = useCallback(
    async (email: string) => {
      await auth.requestPasswordReset(email);
    },
    [auth],
  );

  const handleResetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.resetPassword(email, code, password);
    },
    [auth],
  );

  const handleLogout = useCallback(async () => {
    await auth.logout();
    Toast.success(t("已退出登录"));
  }, [auth, t]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View style={{ paddingTop: insets.top + 16 }}>
          <PageHero title={t("个人中心")} />
        </View>

        <View style={styles.body}>
          {auth.user ? (
            <>
              {/* 用户信息卡片 */}
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: colors.primaryLight,
                      borderColor: colors.borderGlow,
                    },
                  ]}
                >
                  <Ionicons name="person" size={28} color={colors.primary} />
                </View>
                <View style={styles.userInfo}>
                  <Text style={[styles.userEmail, { color: colors.text }]}>
                    {auth.user.email}
                  </Text>
                  <Text style={[styles.userHint, { color: colors.textTertiary }]}>
                    {t("已登录 · 收藏与搜索记录已同步")}
                  </Text>
                  <View
                    style={[
                      styles.pointsBadge,
                      {
                        backgroundColor: colors.primaryLight,
                        borderColor: colors.borderGlow,
                      },
                    ]}
                  >
                    <Ionicons name="trophy-outline" size={14} color={colors.primary} />
                    <Text style={[styles.pointsBadgeText, { color: colors.primary }]}>
                      {t("积分 {{balance}}", { balance: points?.balance ?? 0 })}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 提交站点 */}
              <Pressable
                onPress={() => router.push("/submit-site")}
                style={({ pressed }) => [
                  styles.menuBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={[styles.menuText, { color: colors.text }]}>
                  {t("提交新站点")}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>

              {/* 积分与邀请 */}
              <Pressable
                onPress={() => router.push("/points")}
                style={({ pressed }) => [
                  styles.menuBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons name="trophy-outline" size={20} color={colors.primary} />
                <Text style={[styles.menuText, { color: colors.text }]}>
                  {t("积分与邀请")}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>

              {/* 两步验证设置 */}
              <TwoFactorManager />

              {/* 退出登录 */}
              <Pressable
                onPress={handleLogout}
                style={({ pressed }) => [
                  styles.logoutBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.error} />
                <Text style={[styles.logoutText, { color: colors.error }]}>
                  {t("退出登录")}
                </Text>
              </Pressable>
            </>
          ) : (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.emptyIconWrap}>
                <Ionicons name="person-outline" size={36} color={colors.textTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {t("登录后同步你的收藏与搜索记录")}
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                {t("换设备也不丢失，保持个性化体验")}
              </Text>
              <Pressable
                onPress={() => setAuthVisible(true)}
                style={({ pressed }) => [
                  styles.loginBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.loginBtnText, { color: colors.surfaceSolid }]}>
                  {t("立即登录 / 注册")}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <SiteFooter />
      </ScrollView>

      <BackToTopButton scrollRef={scrollRef} ref={backToTopRef} />

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  userInfo: {
    marginTop: 12,
    alignItems: "center",
  },
  userEmail: {
    fontSize: 16,
    fontWeight: "600",
  },
  userHint: {
    fontSize: 13,
    marginTop: 6,
  },
  pointsBadge: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  pointsBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  logoutBtn: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "600",
  },
  menuBtn: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuText: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  emptyIconWrap: {
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  loginBtn: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
