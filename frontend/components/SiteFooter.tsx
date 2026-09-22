"use client";

import React from "react";
import { Typography } from "@/components/antd-wrapper";
import { useTranslation } from "react-i18next";
import { useSettings } from "../lib/api";
import { footerIntro } from "../lib/seoCopy";
import InternalLink from "./InternalLink";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "首页" },
  { href: "/search", label: "搜索站点" },
  { href: "/submit-site", label: "提交新站点" },
  { href: "/points", label: "积分与邀请" },
];

export default function SiteFooter({
  showNav = true,
  className,
  style,
}: { showNav?: boolean; className?: string; style?: React.CSSProperties }) {
  const { t } = useTranslation();
  const { data: settings } = useSettings();

  const copyright = settings?.footer_copyright?.trim();
  const intro = footerIntro(t, settings);

  return (
    <div
      className={`fn-px-5 fn-py-3 fn-flex fn-flex-col fn-items-center fn-gap-1.5 fn-border-t ${className ?? ""}`}
      style={{
        borderTopColor: "var(--fn-border)",
        maxWidth: 720,
        marginInline: "auto",
        width: "100%",
        ...style,
      }}
    >
      <Typography.Text className="fn-text-sm fn-text-center fn-text-secondary" style={{ lineHeight: 1.6, maxWidth: 640 }}>
        {intro}
      </Typography.Text>
      {showNav && (
        <div className="fn-flex fn-flex-wrap fn-items-center fn-justify-center fn-gap-1">
          {NAV_ITEMS.map((item, idx) => (
            <React.Fragment key={item.href}>
              {idx > 0 && <span className="fn-text-tertiary">·</span>}
              <a
                href={item.href}
                className="fn-text-sm fn-text-link"
                style={{ color: "var(--fn-link-item-text)", textDecoration: "none" }}
              >
                {t(item.label)}
              </a>
            </React.Fragment>
          ))}
        </div>
      )}
      {copyright ? (
        <Typography.Text className="fn-text-xs fn-text-center fn-text-tertiary">
          {copyright}
        </Typography.Text>
      ) : null}
    </div>
  );
}