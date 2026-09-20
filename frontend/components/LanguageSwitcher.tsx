"use client";

import { Ionicons } from "./ui/icons";
import { useTranslation } from "react-i18next";
import { getEffectiveLanguage, setAppLanguage, type AppLanguage } from "../lib/i18n";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = getEffectiveLanguage();

  const languages: Array<{ code: AppLanguage; label: string }> = [
    { code: "zh", label: "中" },
    { code: "en", label: "EN" },
  ];

  return (
    <div className="fn-fixed fn-top-4 fn-right-4 fn-z-50 fn-pointer-events-none">
      <div
        className="fn-flex fn-rounded-full fn-border-default fn-overflow-hidden"
        style={{
          borderColor: "var(--fn-chip-border)",
          backgroundColor: "var(--fn-chip-bg)",
          pointerEvents: "auto",
        }}
      >
        {languages.map((lang) => {
          const active = lang.code === current;
          return (
            <button
              key={lang.code}
              onClick={async () => {
                if (lang.code === current) return;
                await setAppLanguage(lang.code);
              }}
              className="fn-px-2.5 fn-py-1.25 fn-rounded-full fn-text-sm fn-font-semibold fn-transition-fast fn-cursor-pointer"
              style={{
                paddingInline: 10,
                paddingBlock: 5,
                backgroundColor: active ? "var(--fn-primary)" : "transparent",
                color: active ? "var(--fn-surface-solid)" : "var(--fn-text-secondary)",
              }}
            >
              {lang.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}