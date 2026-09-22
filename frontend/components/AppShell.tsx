"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Ionicons } from "./ui/icons";
import { Logo } from "./Logo";
import TabBar from "./TabBar";
import AnnouncementBar from "./AnnouncementBar";
import { useSettings } from "../lib/api";
import { normalizeLanguage, setAppLanguage } from "../lib/i18n";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const { data: settings } = useSettings();

  const navLinks = [
    { href: "/", label: t("首页"), icon: "home", exact: true },
    { href: "/sites", label: t("全部站点"), icon: "list-outline", exact: false },
    { href: "/search", label: t("搜索"), icon: "search", exact: false },
    { href: "/favorites", label: t("收藏"), icon: "star", exact: false },
    { href: "/profile", label: t("我的"), icon: "person", exact: false },
  ];

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const toggleLang = async () => {
    const current = normalizeLanguage(i18n.language);
    await setAppLanguage(current === "zh" ? "en" : "zh");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AnnouncementBar />
      {/* Sticky glass header (desktop) */}
      <header className="fn-header" role="banner">
        <div className="fn-header-inner">
          {/* Brand */}
          <Link
            href="/"
            className="fn-header-brand"
            aria-label="FinNav 首页"
          >
            <Logo uri="/brand.png" name="FinNav" size={28} />
            <span className="fn-header-brand-text">FinNav</span>
            {settings?.site_subtitle ? (
              <span
                className="fn-text-sm"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 13,
                  color: "var(--fn-text-secondary)",
                  whiteSpace: "nowrap",
                }}
              >
                <span className="fn-text-tertiary" style={{ color: "var(--fn-text-tertiary)" }}>|</span>
                {settings.site_subtitle}
              </span>
            ) : null}
          </Link>

          {/* Desktop navigation */}
          <nav className="fn-header-nav fn-hide-mobile" aria-label="主导航">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`fn-nav-link ${isActive(item.href, item.exact) ? "active" : ""}`}
                aria-current={isActive(item.href, item.exact) ? "page" : undefined}
              >
                <Ionicons name={item.icon} size={18} color="currentColor" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* Language switcher (top-right, all screens) */}
          <button
            type="button"
            onClick={toggleLang}
            className="fn-flex fn-items-center fn-gap-1 fn-rounded-full fn-border-default fn-px-2.5 fn-py-1.5 fn-transition-fast fn-cursor-pointer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              paddingInline: 10,
              paddingBlock: 6,
              borderRadius: "var(--fn-radius-full)",
              backgroundColor: "var(--fn-chip-bg)",
              borderWidth: 1,
              borderColor: "var(--fn-chip-border)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Ionicons name="globe-outline" size={14} color="var(--fn-text-secondary)" />
            <span className="fn-text-sm fn-font-medium fn-text-primary" style={{ fontSize: 13, fontWeight: 500 }}>
              {normalizeLanguage(i18n.language) === "zh" ? "中" : "EN"}
            </span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, paddingBottom: 84, WebkitFontSmoothing: "antialiased" }}>
        {children}
      </main>

      {/* Mobile bottom Tab Bar */}
      <TabBar />
    </div>
  );
}