"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, Search, Star, User } from "lucide-react";
import { useSafeAreaInsets } from "@/lib/hooks/useDevice";
import { useTranslation } from "react-i18next";

type TabKey = "home" | "search" | "favorites" | "me";

interface TabItem {
  key: TabKey;
  href: string;
}

const TABS: TabItem[] = [
  { key: "home", href: "/" },
  { key: "search", href: "/search" },
  { key: "favorites", href: "/favorites" },
  { key: "me", href: "/profile" },
];

const ACTIVE_COLOR = "var(--fn-star-active)";
const INACTIVE_COLOR = "var(--fn-text-tertiary)";

export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const getActiveKey = () => {
    if (pathname === "/") return "home";
    if (pathname.startsWith("/search")) return "search";
    if (pathname.startsWith("/favorites")) return "favorites";
    if (pathname.startsWith("/profile") || pathname.startsWith("/points") || pathname.startsWith("/submit-site")) return "me";
    return "home";
  };

  const activeKey = getActiveKey();
  const safeBottom = insets.bottom > 0 ? insets.bottom : 10;

  const iconProps = (isActive: boolean) => ({
    size: isActive ? 26 : 24,
    color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
    fill: isActive ? ACTIVE_COLOR : "none",
    strokeWidth: isActive ? 1.5 : 2,
    style: {
      transition: "all 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      transform: isActive ? "translateY(-2px) scale(1.1)" : "translateY(0) scale(1)",
    },
    "aria-hidden": true,
  });

  return (
    <div
      className="fn-fixed fn-bottom-0 fn-left-0 fn-right-0 fn-z-40 fn-show-mobile"
      style={{
        bottom: 0,
        paddingBottom: safeBottom,
        pointerEvents: "none",
      }}
    >
      <nav
        role="tablist"
        aria-label="主导航"
        className="fn-flex fn-backdrop-blur fn-shadow-lg"
        style={{
          display: "flex",
          width: "100%",
          borderRadius: "22px 22px 0 0",
          backgroundColor: "var(--fn-tabbar)",
          boxShadow: "0 -8px 24px rgba(15, 23, 42, 0.08)",
          pointerEvents: "auto",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeKey === tab.key;
          const Icon = tab.key === "home" ? Home : tab.key === "search" ? Search : tab.key === "favorites" ? Star : User;
          const tabLabels = {
            home: t("首页"),
            search: t("搜索"),
            favorites: t("收藏"),
            me: t("我的"),
          };
          return (
            <button
              key={tab.key}
              onClick={() => router.push(tab.href)}
              className="fn-flex-1 fn-flex fn-flex-col fn-items-center fn-justify-center fn-cursor-pointer fn-transition-fast fn-bg-transparent"
              style={{
                paddingTop: 10,
                paddingBottom: 10,
                background: "transparent",
                border: "none",
              }}
              role="tab"
              aria-selected={isActive}
              aria-label={tabLabels[tab.key]}
            >
              <Icon {...iconProps(isActive)} />
              <span
                className="fn-mt-0.5 fn-text-xs fn-font-medium fn-transition-fast"
                style={{
                  fontSize: 10,
                  marginTop: 2,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
                  transition: "all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {tabLabels[tab.key]}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}