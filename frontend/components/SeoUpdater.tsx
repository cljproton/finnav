import { useEffect } from "react";
import { Platform } from "react-native";
import { useSettings } from "../lib/api";

/**
 * Web 端 SEO 元信息注入：
 * - document.title = seo_title ?? site_title
 * - meta description / keywords
 * - link rel=canonical 站点标题
 * - 动态 favicon（settings.logo）
 *
 * 仅在有 DOM 的 Web 平台生效（native 端直接跳过）。
 */
export default function SeoUpdater() {
  const { data: settings } = useSettings();

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (!settings) return;

    const title = settings.seo_title || settings.site_title || "FinNav";
    if (document.title !== title) document.title = title;

    upsertMeta("description", settings.seo_description);
    upsertMeta("keywords", settings.seo_keywords);

    if (settings.logo) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.logo;
    }
  }, [settings]);

  return null;
}

function upsertMeta(name: string, content: string) {
  if (!content) return;
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}