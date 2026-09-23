"use client";

import { Typography } from "@/components/antd-wrapper";
import { Ionicons } from "./ui/icons";
import { useTranslation } from "react-i18next";

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
}

export default function EmptyState({
  icon = "folder-open-outline",
  title,
  message,
}: EmptyStateProps) {
  return (
    <div className="fn-flex fn-flex-col fn-items-center fn-justify-center fn-px-10 fn-py-15" style={{ minHeight: "50vh" }}>
      <div
        className="fn-flex fn-items-center fn-justify-center fn-rounded-xl fn-border-default"
        style={{ width: 80, height: 80, borderRadius: 20, backgroundColor: "var(--fn-surface)" }}
      >
        <Ionicons name={icon} size={36} color="var(--fn-primary)" />
      </div>
      <Typography.Text className="fn-mt-4.5 fn-text-lg fn-font-semibold fn-text-center fn-text-primary" style={{ letterSpacing: 0.1 }}>
        {title}
      </Typography.Text>
      {message && (
        <Typography.Text className="fn-mt-2 fn-text-sm fn-text-center fn-text-tertiary fn-leading-relaxed" style={{ lineHeight: "18px" }}>
          {message}
        </Typography.Text>
      )}
    </div>
  );
}