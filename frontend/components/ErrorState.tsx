"use client";

import { Button, Typography } from "@/components/antd-wrapper";
import { Ionicons } from "./ui/icons";
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
  const msg = message ?? t("加载失败，请稍后重试");

  return (
    <div className="fn-card fn-max-w-md fn-w-full fn-p-8 fn-text-center">
      <div
        className="fn-flex fn-items-center fn-justify-center fn-mx-auto fn-rounded-xl fn-border-default"
        style={{ width: 80, height: 80, borderRadius: 20, backgroundColor: "var(--fn-surface)" }}
      >
        <Ionicons name="cloud-offline-outline" size={40} color="var(--fn-error)" />
      </div>
      <Typography.Text className="fn-mt-4.5 fn-text-md fn-font-medium fn-text-primary">
        {msg}
      </Typography.Text>
      {onRetry && (
        <Button
          onClick={onRetry}
          type="dashed"
          className="fn-mt-5"
          style={{
            gap: 6,
            paddingInline: 22,
            paddingBlock: 10,
            borderRadius: "var(--fn-radius-full)",
            backgroundColor: "var(--fn-primary-light)",
            borderColor: "var(--fn-border-glow)",
            color: "var(--fn-primary)",
          }}
        >
          <Ionicons name="refresh" size={16} color="var(--fn-primary)" />
          <span>{t("重试")}</span>
        </Button>
      )}
    </div>
  );
}