import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "@ant-design/react-native/es/toast";
import { useThemeColors } from "../constants/colors";
import { fetchTFAStatus, fetchTFASetup, confirmTFA, disableTFA } from "../lib/api";
import { useTranslation } from "react-i18next";

export default function TwoFactorManager() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [status, setStatus] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"setup" | "disable" | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchTFAStatus()
      .then((r) => mounted && setStatus(r.enabled))
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const openSetup = async () => {
    setBusy(true);
    try {
      const r = await fetchTFASetup();
      setSetup({ secret: r.secret, qr: r.qr });
      setModal("setup");
    } catch (e) {
      Toast.fail(String(e instanceof Error ? e.message : t("获取失败")));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (code.length < 6) {
      Toast.fail(t("请输入 6 位动态码"));
      return;
    }
    setBusy(true);
    try {
      const r = await confirmTFA(code);
      setStatus(r.enabled);
      setModal(null);
      setCode("");
      Toast.success(t("两步验证已开启"));
    } catch (e) {
      Toast.fail(String(e instanceof Error ? e.message : t("验证码错误")));
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    if (code.length < 6) {
      Toast.fail(t("请输入 6 位动态码"));
      return;
    }
    setBusy(true);
    try {
      const r = await disableTFA(code);
      setStatus(r.enabled);
      setModal(null);
      setCode("");
      Toast.success(t("已停用两步验证"));
    } catch (e) {
      Toast.fail(String(e instanceof Error ? e.message : t("验证码错误")));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.row, { borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={status ? () => setModal("disable") : openSetup}
        disabled={busy}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name={status ? "shield-checkmark" : "shield-checkmark-outline"}
          size={20}
          color={status ? colors.primary : colors.textTertiary}
        />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t("两步验证 (2FA)")}</Text>
          <Text style={[styles.rowSub, { color: colors.textTertiary }]}>
            {status ? t("已开启 · 登录需动态码") : t("未开启 · 登录更安全")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Pressable>

      <Modal visible={modal === "setup"} transparent animationType="fade">
        <View style={styles.mask}>
          <ScrollView
            style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            contentContainerStyle={{ padding: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t("开启两步验证")}</Text>
            {setup && (
              <>
                <Text style={[styles.modalDesc, { color: colors.textTertiary }]}>
                  {t("用 Authenticator 应用（如 Google Authenticator、Microsoft Authenticator）扫描下方二维码，或手动输入密钥：")}
                </Text>
                {setup.qr ? (
                  <View style={[styles.qrWrap, { borderColor: colors.border }]}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={setup.qr} alt="2FA QR" style={{ width: 180, height: 180 }} />
                  </View>
                ) : (
                  <View style={[styles.secretBox, { backgroundColor: colors.chipBg, borderColor: colors.border }]}>
                    <Text selectable style={[styles.secret, { color: colors.text }]}>
                      {setup.secret}
                    </Text>
                  </View>
                )}
                <Text style={[styles.secretLabel, { color: colors.textTertiary }]}>
                  {t("密钥：{{secret}}", { secret: setup.secret })}
                </Text>
                <Text style={[styles.modalDesc, { color: colors.textTertiary }]}>
                  {t("输入应用显示的 6 位动态码以完成开启：")}
                </Text>
              </>
            )}
            <TextInput
              value={code}
              onChangeText={(t: string) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("6 位动态码")}
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              maxLength={6}
              style={[
                styles.input,
                { backgroundColor: colors.chipBg, borderColor: colors.border, color: colors.text },
              ]}
            />
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.actionText, { color: colors.surfaceSolid }]}>
                {busy ? t("请稍候...") : t("确认开启")}
              </Text>
            </Pressable>
            <Pressable onPress={() => { setModal(null); setCode(""); }} disabled={busy} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.textTertiary }]}>{t("取消")}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={modal === "disable"} transparent animationType="fade">
        <View style={styles.mask}>
          <View
            style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t("停用两步验证")}</Text>
            <Text style={[styles.modalDesc, { color: colors.textTertiary }]}>
              {t("请输入当前动态码以确认停用：")}
            </Text>
            <TextInput
              value={code}
              onChangeText={(t: string) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("6 位动态码")}
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              maxLength={6}
              style={[
                styles.input,
                { backgroundColor: colors.chipBg, borderColor: colors.border, color: colors.text },
              ]}
            />
            <Pressable
              onPress={onDisable}
              disabled={busy}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.error, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.actionText, { color: colors.surfaceSolid }]}>
                {busy ? t("请稍候...") : t("确认停用")}
              </Text>
            </Pressable>
            <Pressable onPress={() => { setModal(null); setCode(""); }} disabled={busy} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.textTertiary }]}>{t("取消")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  mask: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 10,
  },
  modalDesc: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  qrWrap: {
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  secretBox: {
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 10,
  },
  secret: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 1,
  },
  secretLabel: {
    fontSize: 12,
    marginBottom: 10,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 16,
  },
  actionBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  actionText: {
    fontSize: 15,
    fontWeight: "700",
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
  },
});
