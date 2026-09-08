import { useEffect } from "react";
import { Platform } from "react-native";
import { usePathname } from "expo-router";
import { useSettings } from "../lib/api";

/**
 * Web 端 SEO 元信息注入：
 * - document.title = seo_title ?? site_title
 * - meta description / keywords
 * - link rel=canonical（基于当前 URL 的 pathname，去除查询串）
 * - Open Graph 基础标签（og:title/description/type/url/image，image 用 settings.logo）
 * - 动态 favicon（settings.logo）
 *
 * 站点详情页（/site/:id）的标题/描述/canonical/OG 由详情页组件结合站点数据覆盖，
 * 详见 app/(tabs)/site/[id]/index.tsx 中的 useEffect。
 * 仅在有 DOM 的 Web 平台生效（native 端直接跳过）。
 */
export default function SeoUpdater() {
  const { data: settings } = useSettings();
  const pathname = usePathname();
  // 站点详情页（/site/<数字id>）由详情页单独注入 SEO，这里跳过避免互相覆盖。
  const isSiteDetail = /^\/site\/\d+$/.test(pathname);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (!settings) return;

    const title = settings.seo_title || settings.site_title || "FinNav";
    if (document.title !== title) document.title = title;

    // 详情页会以站点信息覆盖，此处仅为兜底（settings 加载先于站点数据）。
    upsertMeta("description", settings.seo_description);
    upsertMeta("keywords", settings.seo_keywords);

    upsertOgProperty("og:title", title);
    upsertOgProperty("og:description", settings.seo_description);
    upsertOgProperty("og:type", "website");

    if (isSiteDetail) {
      return;
    }

    // canonical 基于真实浏览器地址（去掉查询参数），便于搜索引擎独立 URL 归一。
    const canonical = canonicalUrl();
    if (canonical) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = canonical;
      upsertOgProperty("og:url", canonical);
    }

    if (settings.logo) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.logo;
      upsertOgProperty("og:image", settings.logo);
    }
  }, [settings, isSiteDetail]);

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

function upsertOgProperty(property: string, content: string) {
  if (!content) return;
  let meta = document.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`,
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function canonicalUrl(): string {
  if (typeof window === "undefined" || typeof document === "undefined") return "";
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}