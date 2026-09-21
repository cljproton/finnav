"use client";

import { Ionicons } from "../components/ui/icons";
import { useSettings } from "../lib/api";

/**
 * 网站公告横条——放置在页面最上端（吸顶）。
 * 仅当后台「显示公告」开启且已填写公告内容时才渲染。
 */
export default function AnnouncementBar() {
  const { data: settings } = useSettings();

  const show = settings?.announcement_enabled && settings?.announcement?.trim();
  if (!show) return null;

  return (
    <div className="fn-px-4" style={{ backgroundColor: "var(--fn-primary)", paddingTop: 4, paddingBottom: 4 }}>
      <div className="fn-flex fn-items-center fn-justify-center fn-gap-2">
        <Ionicons name="megaphone" size={15} color="#FFFFFF" />
        <span className="fn-text-sm fn-font-medium fn-text-inverse fn-truncate" style={{ flexShrink: 1, textAlign: "center", lineHeight: 1.5, color: "#FFFFFF" }}>
          {settings.announcement}
        </span>
      </div>
    </div>
  );
}