"use client";

import { useTranslation } from "react-i18next";
import { useThemeColors } from "../constants/colors";
import { View, Text } from "./ui/primitives";
import { Modal, Button } from "./ui/antd";

interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  destructive?: boolean;
}

export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  destructive = false,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onClose={onClose} closeOnMaskClick>
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          zIndex: 1000,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: 20,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: colors.text }}>{title}</Text>
          <Text style={{ fontSize: 13, lineHeight: 20, marginBottom: 16, color: colors.textTertiary }}>
            {message}
          </Text>
          <View style={{ display: "flex", flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
            <Button onPress={onClose} type="ghost" style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8 }}>
              <Text style={{ color: colors.textSecondary }}>{t("取消")}</Text>
            </Button>
            <Button
              onPress={onConfirm}
              type={destructive ? "warning" : "primary"}
              style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8 }}
            >
              <Text style={{ color: colors.surfaceSolid }}>{confirmText ?? t("确认")}</Text>
            </Button>
          </View>
        </View>
      </div>
    </Modal>
  );
}