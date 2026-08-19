import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "@ant-design/react-native/es/modal";
import Input from "@ant-design/react-native/es/input";
import Toast from "@ant-design/react-native/es/toast";
import { useThemeColors } from "../constants/colors";
import CaptchaInput from "./CaptchaInput";
import type { CaptchaPayload, LoginResult } from "../lib/auth";
import { useSettings } from "../lib/api";
import { useTranslation } from "react-i18next";

type Step = "form" | "verify" | "reset-form" | "reset-verify" | "otp";

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string, captcha: CaptchaPayload) => Promise<LoginResult>;
  onLoginTFA: (email: string, totpToken: string, code: string) => Promise<void>;
  onRegister: (email: string, password: string, captcha: CaptchaPayload) => Promise<boolean>;
  onVerify: (email: string, code: string, password: string) => Promise<void>;
  onRequestReset: (email: string) => Promise<void>;
  onResetPassword: (email: string, code: string, password: string) => Promise<void>;
}

export default function AuthModal({
  visible,
  onClose,
  onLogin,
  onLoginTFA,
  onRegister,
  onVerify,
  onRequestReset,
  onResetPassword,
}: AuthModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { data: settings } = useSettings();
  const requireVerification = settings?.require_email_verification ?? true;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resetFields = () => {
    setEmail("");
    setPassword("");
    setCode("");
    setOtpCode("");
    setTotpToken("");
    setCaptcha("");
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    resetFields();
    setStep("form");
    onClose();
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
        Toast.success(t("注册成功，欢迎加入！"));
        resetFields();
        setStep("form");
        onClose();
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
      Toast.success(t("注册成功，欢迎加入！"));
      resetFields();
      setStep("form");
      onClose();
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
        // 重发验证码同样需要图形验证码
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
      const result = await onLogin(email.trim(), password, {
        token: captchaToken,
        answer: captcha,
      });
      if (result && result.needsTfa) {
        setTotpToken(result.totpToken);
        setStep("otp");
        return;
      }
      resetFields();
      onClose();
    } catch (e: any) {
      setError(e?.message || t("操作失败"));
      setCaptcha("");
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async () => {
    setError("");
    if (!otpCode.trim()) {
      setError(t("请输入 6 位动态码"));
      return;
    }
    setLoading(true);
    try {
      await onLoginTFA(email.trim(), totpToken, otpCode.trim());
      resetFields();
      onClose();
    } catch (e: any) {
      setError(e?.message || t("操作失败"));
      setStep("form");
      setOtpCode("");
      setTotpToken("");
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
      onClose();
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
        : step === "otp"
          ? t("二次验证")
          : mode === "login"
            ? t("登录")
            : t("注册");
  const stepHint =
    step === "verify"
      ? t("验证码已发送至 {{email}}，请查收邮件", { email })
      : step === "reset-verify"
        ? t("验证码已发送至 {{email}}，请查收邮件后设置新密码", { email })
        : step === "otp"
          ? t("请在认证器中输入当前动态码")
          : "";

  const handleSubmit = () => {
    if (step === "verify") return handleVerifySubmit();
    if (step === "reset-verify") return handleResetConfirm();
    if (step === "reset-form") return handleResetRequest();
    if (step === "otp") return handleOtpSubmit();
    return mode === "register" ? handleRegisterSubmit() : handleLoginSubmit();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onClose={handleClose}
      maskClosable
      title={null}
      footer={[]}
      style={styles.modal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.surfaceSolid,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Close button */}
          <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={colors.textTertiary} />
          </Pressable>

          {/* Tabs — 仅在登录/注册主流程显示 */}
          {step === "form" ? (
            <View style={styles.tabRow}>
              <Pressable
                onPress={() => switchMode("login")}
                style={[
                  styles.tab,
                  mode === "login" && {
                    borderBottomColor: colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color: mode === "login" ? colors.primary : colors.textTertiary,
                      fontWeight: mode === "login" ? "700" : "500",
                    },
                  ]}
                >
                  {t("登录")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => switchMode("register")}
                style={[
                  styles.tab,
                  mode === "register" && {
                    borderBottomColor: colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color: mode === "register" ? colors.primary : colors.textTertiary,
                      fontWeight: mode === "register" ? "700" : "500",
                    },
                  ]}
                >
                  {t("注册")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.tabRow}>
              <Text style={[styles.stepTitle, { color: colors.text }]}>
                {stepTitle}
              </Text>
            </View>
          )}

          {stepHint ? (
            <Text style={[styles.stepHint, { color: colors.textTertiary }]}>
              {stepHint}
            </Text>
          ) : null}

          {/* Fields */}
          <View style={styles.fields}>
            {(step === "form" || step === "reset-form") && (
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.chipBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons name="mail-outline" size={18} color={colors.textTertiary} />
                <Input
                  value={email}
                  onChangeText={(text: string) => setEmail(text)}
                  placeholder={t("邮箱")}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.inputContainer}
                  inputStyle={[styles.inputText, { color: colors.text }]}
                />
              </View>
            )}

            {step === "form" && (
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.chipBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} />
                <Input
                  value={password}
                  onChangeText={(text: string) => setPassword(text)}
                  placeholder={t("密码")}
                  placeholderTextColor={colors.textTertiary}
                  type="password"
                  style={styles.inputContainer}
                  inputStyle={[styles.inputText, { color: colors.text }]}
                />
              </View>
            )}

            {step === "form" && (
              <CaptchaInput
                key={captchaKey}
                colors={colors}
                value={captcha}
                onChangeText={setCaptcha}
                onResolved={(token, _answer) => setCaptchaToken(token)}
              />
            )}

            {step === "verify" && (
              <CaptchaInput
                key={`${captchaKey}-verify`}
                colors={colors}
                value={captcha}
                onChangeText={setCaptcha}
                onResolved={(token, _answer) => setCaptchaToken(token)}
              />
            )}

            {step === "otp" && (
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.chipBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.textTertiary} />
                <Input
                  value={otpCode}
                  onChangeText={(text: string) => setOtpCode(text)}
                  placeholder={t("6 位动态码")}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.inputContainer}
                  inputStyle={[styles.inputText, { color: colors.text }]}
                />
              </View>
            )}

            {(step === "verify" || step === "reset-verify") && (
              <>
                <View
                  style={[
                    styles.inputWrap,
                    {
                      backgroundColor: colors.chipBg,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons name="key-outline" size={18} color={colors.textTertiary} />
                  <Input
                    value={code}
                    onChangeText={(text: string) => setCode(text)}
                    placeholder={t("6 位验证码")}
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={styles.inputContainer}
                    inputStyle={[styles.inputText, { color: colors.text }]}
                  />
                </View>
                {step === "reset-verify" && (
                  <View
                    style={[
                      styles.inputWrap,
                      {
                        backgroundColor: colors.chipBg,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} />
                    <Input
                      value={password}
                      onChangeText={(text: string) => setPassword(text)}
                      placeholder={t("新密码")}
                      placeholderTextColor={colors.textTertiary}
                      type="password"
                      style={styles.inputContainer}
                      inputStyle={[styles.inputText, { color: colors.text }]}
                    />
                  </View>
                )}
              </>
            )}
          </View>

          {/* Error */}
          {error ? (
            <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
          ) : null}

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor: colors.primary,
                opacity: loading ? 0.6 : pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Text style={[styles.submitText, { color: colors.surfaceSolid }]}>
              {loading
                ? t("请稍候...")
                : step === "otp"
                  ? t("验证并登录")
                  : step === "verify" || step === "reset-verify"
                    ? t("确认")
                    : step === "reset-form"
                      ? t("发送验证码")
                      : mode === "login"
                        ? t("登录")
                        : requireVerification
                          ? t("获取验证码")
                          : t("注册")}
            </Text>
          </Pressable>

          {/* Secondary actions */}
          {step === "verify" || step === "reset-verify" ? (
            <Pressable onPress={handleResendCode} disabled={loading} style={styles.linkRow}>
              <Text style={[styles.linkText, { color: colors.primary }]}>
                {t("没有收到？重新发送")}
              </Text>
            </Pressable>
          ) : step === "form" && mode === "login" ? (
            <Pressable
              onPress={() => {
                setStep("reset-form");
                setError("");
              }}
              style={styles.linkRow}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>
                {t("忘记密码？")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 28,
  },
  keyboardView: {
    width: "100%",
  },
  modalContent: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  tabRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 24,
    marginTop: 4,
  },
  tab: {
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: {
    fontSize: 16,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  stepHint: {
    fontSize: 13,
    marginBottom: 12,
    marginTop: -16,
    color: "#6b7280",
  },
  fields: {
    gap: 12,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  inputContainer: {
    flex: 1,
  },
  inputText: {
    fontSize: 15,
    borderWidth: 0,
  },
  error: {
    fontSize: 13,
    marginTop: 10,
    textAlign: "center",
  },
  submitBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  submitText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  linkRow: {
    alignItems: "center",
    marginTop: 14,
  },
  linkText: {
    fontSize: 13,
  },
});