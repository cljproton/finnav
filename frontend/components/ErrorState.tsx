import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Button from "@ant-design/react-native/es/button";
import { useThemeColors } from "../constants/colors";
import { useTranslation } from "react-i18next";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message,
  onRetry,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const msg = message ?? t("加载失败，请稍后重试");

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconRing,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Ionicons name="cloud-offline-outline" size={40} color={colors.error} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{msg}</Text>
      {onRetry && (
        <Pressable onPress={onRetry}>
          <View
            style={[
              styles.btn,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.borderGlow,
              },
            ]}
          >
            <Ionicons name="refresh" size={16} color={colors.primary} />
            <Text style={[styles.btnText, { color: colors.primary }]}>{t("重试")}</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "500",
    marginTop: 18,
    textAlign: "center",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
