import { useEffect } from "react";
import { Platform } from "react-native";
import { usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSettings } from "../lib/api";
import { brandOf, composeTitle, NOINDEX_ROBOTS } from "../lib/seoCopy";
import { canonicalFromPath, currentPageSeo, useSeoVersion } from "../lib/seo";

/**
 * Web 端 SEO 元信息的唯一写入者。
 *
 * 输入：全局设置（AppSetting）+ 页面声明的覆盖项（lib/seo.ts 的 usePageSeo）。
 * 输出：document.title、description/keywords/robots、canonical、OG/Twitter、favicon。
 *
 * 之所以集中在这里写 DOM：多处各自写入会互相覆盖（详情页 vs 全站默认），
 * 曾经导致 canonical/描述在某些时序下缺失，从而触发 ahrefs
 * 「Duplicate pages without canonical」「Meta description missing」。
 */
export default function SeoUpdater() {
  const { data: settings } = useSettings();
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  useSeoVersion();

  const page = currentPageSeo();

  const brand = brandOf(settings);
  let title = page.title || settings?.seo_title || settings?.site_title || brand;
  // 兜底：后台只填了品牌名时标题过短（ahrefs「Title too short」）。
  if (!page.title && title.trim().length < 20) {
    title = composeTitle(t, brand);
  }

  const description =
    page.description ||
    settings?.seo_description ||
    t("{{brand}}提供金融与 Web3 站点导航：官网入口、APP 下载、教程与真实用户评价。", { brand });
  const keywords = page.keywords || settings?.seo_keywords || "";
  const canonical = page.canonical || canonicalFromPath(pathname);
  const robots = page.robots || (canonical ? "index,follow" : NOINDEX_ROBOTS);
  const ogType = page.ogType ?? "website";
  const image = page.image || settings?.logo || "";

  const signature = JSON.stringify({
    title,
    description,
    keywords,
    canonical,
    robots,
    ogType,
    image,
  });

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    if (document.title !== title) document.title = title;
    upsertMeta("description", description);
    upsertMeta("keywords", keywords);
    upsertMeta("robots", robots);

    upsertOg("og:site_name", brand);
    upsertOg("og:title", title);
    upsertOg("og:description", description);
    upsertOg("og:type", ogType);
    upsertOg("og:locale", i18n.language?.startsWith("en") ? "en_US" : "zh_CN");
    if (canonical) upsertOg("og:url", canonical);
    if (image) upsertOg("og:image", image);

    upsertMeta("twitter:card", "summary_large_image");
    upsertMeta("twitter:title", title);
    upsertMeta("twitter:description", description);
    if (image) upsertMeta("twitter:image", image);

    if (canonical) upsertLink("canonical", canonical);
    if (settings?.logo) {
      upsertLink("icon", settings.logo);
    }

    // 文档语言与当前界面语言保持一致（导出模板写死 lang="en"，中文站会被误判）。
    document.documentElement.setAttribute(
      "lang",
      i18n.language?.startsWith("en") ? "en" : "zh-CN",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, settings?.logo]);

  return null;
}

function upsertMeta(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  // 允许空值时删除标签（例如 keywords 未配置），但 description 始终有兜底值。
  if (content) {
    meta.content = content;
  } else if (meta.parentNode) {
    meta.parentNode.removeChild(meta);
  }
}

function upsertOg(property: string, content: string) {
  if (!content) return;
  let meta = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function upsertLink(rel: string, href: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}
