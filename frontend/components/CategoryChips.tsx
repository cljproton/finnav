"use client";

import { Button, Space } from "@/components/antd-wrapper";
import { useTranslation } from "react-i18next";
import { ClientOnly } from "./ClientOnly";
import { useIsMobile } from "../lib/hooks/useDevice";

interface CategoryChipsProps {
  categories: { name: string; slug: string; icon: string }[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}

export default function CategoryChips({ categories, selected, onSelect }: CategoryChipsProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const allActive = selected === null;

  const allCategories = [
    { slug: null, name: t("全部"), icon: "" },
    ...categories,
  ];

  return (
    <ClientOnly fallback={<Space className="fn-chip-row" size={8} wrap={isMobile} />}>
      <Space
        className="fn-chip-row"
        size={8}
        wrap={isMobile}
        style={isMobile ? { flexWrap: "wrap", overflowX: "visible" } : {}}
      >
        {allCategories.map((cat) => {
          const active = selected === cat.slug;
          return (
            <Button
              key={cat.slug ?? "all"}
              type={active ? "primary" : "default"}
              size="small"
              onClick={() => onSelect(active ? null : cat.slug)}
              style={{
                borderRadius: "var(--fn-radius-full)",
                paddingInline: 14,
                paddingBlock: 8,
                gap: 6,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                height: "auto",
                backgroundColor: active ? "var(--fn-chip-active-bg)" : "var(--fn-chip-bg)",
                borderColor: active ? "var(--fn-primary)" : "var(--fn-chip-border)",
                color: active ? "var(--fn-chip-active-text)" : "var(--fn-chip-text)",
                boxShadow: active ? "var(--fn-shadow-sm)" : "none",
                transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </Button>
          );
        })}
      </Space>
    </ClientOnly>
  );
}