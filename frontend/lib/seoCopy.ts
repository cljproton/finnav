/**
 * SEO 文案与元信息模板（中文为主，i18n key 预留英文翻译）。
 *
 * 用途：
 * - 前端运行时（lib/seo.ts + components/SeoUpdater.tsx）为每个路由生成
 *   足够长度的 title / description，避免出现「Title too short」「Meta description missing」。
 * - 站点详情页生成「关于 / 使用建议 / 常见问题」可见文案块，解决「Low word count」。
 *
 * 后端 templates/seo/*.html 使用同一套措辞（Django 侧独立实现），保证
 * 原始 HTML 与 JS 渲染后的文案一致。
 */

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export const BRAND_FALLBACK = "FinNav";

/** noindex 但允许爬虫继续跟踪页内链接。 */
export const NOINDEX_ROBOTS = "noindex,follow";
export const INDEX_ROBOTS = "index,follow";

export interface SeoSiteLike {
  name: string;
  description: string;
  category_name?: string;
  tags?: string[];
  rating_count?: number;
  rating_avg?: number;
  app_android_url?: string;
  app_google_play_url?: string;
  app_ios_url?: string;
  app_android_has_cache?: boolean;
}

export interface SeoSettingsLike {
  site_title?: string;
  site_subtitle?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
}

/** 品牌名（后台「网站标题」优先）。 */
export function brandOf(settings?: SeoSettingsLike | null): string {
  return (settings?.site_title || settings?.seo_title || BRAND_FALLBACK).trim();
}

/** 品牌主张（用于拼接足够长度的标题）。 */
export function brandTagline(t: Translate): string {
  return t("金融与 Web3 站点导航");
}

/**
 * 拼接标题：主标题 + 副标题 + 品牌。
 * 结果长度控制在 20–60 字符，过短时补足品牌主张，避免 ahrefs「Title too short」。
 */
export function composeTitle(t: Translate, brand: string, ...parts: (string | null | undefined)[]): string {
  const clean = parts.map((p) => (p || "").trim()).filter(Boolean);
  const head = clean.filter((p) => p !== brand);
  let title = head.length ? `${head.join(" - ")} | ${brand}` : brand;
  if (title.length < 20) {
    title = `${brand}｜${brandTagline(t)}${clean.length ? ` - ${clean.join(" · ")}` : ""}`;
  }
  return title.length > 90 ? `${title.slice(0, 88)}…` : title;
}

/* ---------- 首页 ---------- */

export function homeTitle(t: Translate, settings?: SeoSettingsLike | null): string {
  const brand = brandOf(settings);
  const subtitle = (settings?.site_subtitle || "").trim();
  return composeTitle(t, brand, brandTagline(t), subtitle || null);
}

export function homeDescription(t: Translate, settings?: SeoSettingsLike | null, siteCount?: number): string {
  const brand = brandOf(settings);
  const configured = (settings?.seo_description || "").trim();
  if (configured.length >= 40) return configured;
  const countText = siteCount ? t("已收录 {{count}} 个", { count: siteCount }) : t("收录多个");
  return t(
    "{{brand}}是一个金融与 Web3 站点导航：{{countText}}优质网站与 APP，提供官网入口、APP 下载、新手教程、实战经验和真实用户评价，帮你少走弯路。",
    { brand, countText },
  );
}

/* ---------- 搜索页 ---------- */

export function searchTitle(t: Translate, settings?: SeoSettingsLike | null): string {
  return composeTitle(t, brandOf(settings), t("搜索站点"), brandTagline(t));
}

export function searchDescription(t: Translate, settings?: SeoSettingsLike | null, siteCount?: number): string {
  const brand = brandOf(settings);
  const countText = siteCount ? t("已收录的 {{count}} 个", { count: siteCount }) : t("已收录的");
  return t(
    "在 {{brand}} 中按名称、描述或标签搜索{{countText}}金融与 Web3 站点，快速进入官网、APP 下载页与用户评价。",
    { brand, countText },
  );
}

/* ---------- 站点详情页 ---------- */

/** 下载渠道文案片段。 */
export function platformLabels(t: Translate, site: SeoSiteLike): string[] {
  const labels: string[] = [];
  if (site.app_android_has_cache) labels.push(t("安卓版（本站缓存）"));
  else if (site.app_android_url) labels.push(t("安卓版（原始链接）"));
  if (site.app_google_play_url) labels.push("Google Play");
  if (site.app_ios_url) labels.push(t("App Store"));
  return labels;
}

export function siteTitle(t: Translate, settings: SeoSettingsLike | null | undefined, site: SeoSiteLike): string {
  return composeTitle(
    t,
    brandOf(settings),
    t("{{name}}官网", { name: site.name }),
    t("APP下载"),
    t("新手教程"),
    t("用户评价"),
  );
}

export function siteDescription(
  t: Translate,
  settings: SeoSettingsLike | null | undefined,
  site: SeoSiteLike,
  counts?: { tutorials?: number; experiences?: number },
): string {
  const brand = brandOf(settings);
  const desc = (site.description || "").trim();
  const platforms = platformLabels(t, site);
  const parts = [
    t("{{name}}{{category}}站点导航页", {
      name: site.name,
      category: site.category_name ? `（${site.category_name}）` : "",
    }),
    desc || null,
    t("汇总官网入口与{{platforms}}下载渠道", {
      platforms: platforms.length ? platforms.join("、") : t("各平台"),
    }),
    counts?.tutorials
      ? t("以及 {{count}} 篇用户教程", { count: counts.tutorials })
      : null,
    counts?.experiences ? t("{{count}} 条实战经验", { count: counts.experiences }) : null,
    (site.rating_count ?? 0) > 0
      ? t("与 {{count}} 条用户评价", { count: site.rating_count })
      : null,
    t("信息由 {{brand}} 整理维护。", { brand }),
  ]
    .map((p) => (p || "").trim())
    .filter(Boolean);
  return parts.join("，").replace(/。?，?(信息由)/, "。$1");
}

/** 详情页「关于」段落。 */
export function siteAboutParagraphs(
  t: Translate,
  settings: SeoSettingsLike | null | undefined,
  site: SeoSiteLike,
  counts?: { tutorials?: number; experiences?: number },
): string[] {
  const brand = brandOf(settings);
  const desc = (site.description || "").trim();
  const paragraphs: string[] = [];

  paragraphs.push(
    t("{{name}}是 {{brand}}收录的{{category}}站点。{{desc}}", {
      name: site.name,
      brand,
      category: site.category_name || t("金融/Web3"),
      desc: desc ? `${desc}` : t("本站整理了它的基础资料与访问入口。"),
    }),
  );

  const tags = (site.tags ?? []).filter(Boolean);
  const platforms = platformLabels(t, site);
  paragraphs.push(
    t(
      "本页汇总了 {{name}} 的官网入口{{platforms}}{{tutorials}}{{experiences}}{{rating}}，方便你在一处完成核实与跳转；标签包括{{tags}}，点击标签可以看到同类站点。",
      {
        name: site.name,
        platforms: platforms.length ? t("、{{labels}} 下载渠道", { labels: platforms.join("、") }) : "",
        tutorials: counts?.tutorials ? t("、{{count}} 篇用户上传的教程", { count: counts.tutorials }) : "",
        experiences: counts?.experiences ? t("、{{count}} 条实战经验", { count: counts.experiences }) : "",
        rating:
          (site.rating_count ?? 0) > 0
            ? t("、{{count}} 条评价（平均 {{score}} 分）", { count: site.rating_count, score: site.rating_avg })
            : "",
        tags: tags.length ? tags.join("、") : t("暂无标签"),
      },
    ),
  );

  return paragraphs;
}

/** 详情页「使用建议」段落。 */
export function siteUsageTipsParagraph(t: Translate, site: SeoSiteLike): string {
  const cacheNote = site.app_android_has_cache
    ? t(
        "使用本站缓存的安卓安装包时，可在详情页核对 SHA-256 校验值是否与官方一致，不一致时请改用官网原始链接。",
      )
    : t("安装包请优先选择官网、Google Play 或 App Store 等官方渠道下载。");
  return t(
    "使用前建议：先确认 {{name}} 的域名与官方公告再注册；涉及资产时开启双重验证、小额尝试；{{cacheNote}}教程与经验由用户提供，仅代表个人经历，不构成投资建议。",
    { name: site.name, cacheNote },
  );
}

/** 详情页常见问题。 */
export function siteFaq(
  t: Translate,
  settings: SeoSettingsLike | null | undefined,
  site: SeoSiteLike,
): { q: string; a: string }[] {
  const brand = brandOf(settings);
  const platforms = platformLabels(t, site);
  return [
    {
      q: t("{{name}}的官网入口在哪里？", { name: site.name }),
      a: t(
        "点击本页「访问官网」按钮即可跳转到 {{name}} 官方站点；若该站点配置了邀请链接，按钮会自动切换为邀请入口，注册时填写邀请码可获得对应权益。",
        { name: site.name },
      ),
    },
    {
      q: t("{{name}}有手机 APP 吗？", { name: site.name }),
      a: platforms.length
        ? t("有，本页提供{{labels}}的下载入口，均来自官方渠道或官网原始链接。", {
            labels: platforms.join("、"),
          })
        : t(
            "本页暂未收录 {{name}} 的 APP 下载链接。如果你找到官方下载地址，可以在「提交下载链接」入口补充，审核通过后即对所有人可见。",
            { name: site.name },
          ),
    },
    {
      q: t("如何查看 {{name}} 的真实评价？", { name: site.name }),
      a: t(
        "进入「大家的评价」可以看到其他用户的星级与评论，登录后也能提交自己的打分；{{brand}}不对第三方站点的经营状况作担保，请结合自身判断使用。",
        { brand },
      ),
    },
  ];
}

/* ---------- 详情页子页 ---------- */

export function reviewsTitle(t: Translate, settings: SeoSettingsLike | null | undefined, siteName: string): string {
  return composeTitle(t, brandOf(settings), t("{{name}}用户评价", { name: siteName }), t("真实打分与反馈"));
}

export function reviewsDescription(t: Translate, siteName: string, count?: number): string {
  return t(
    "{{count}}位用户对 {{name}} 的打分与评论，涵盖手续费、产品体验、客服响应与充提速度等反馈，帮你判断是否值得使用。",
    { name: siteName, count: count ? `${count} ` : "" },
  );
}

export function tutorialsTitle(t: Translate, settings: SeoSettingsLike | null | undefined, siteName: string): string {
  return composeTitle(t, brandOf(settings), t("{{name}}教程", { name: siteName }), t("新手图文与视频教程"));
}

export function tutorialsDescription(t: Translate, settings: SeoSettingsLike | null | undefined, siteName: string): string {
  return t(
    "{{brand}}收录的 {{name}} 用户分享教程：注册开户、充值提现、功能使用与避坑要点，支持文字教程、视频教程与辅助代办三类入口。",
    { brand: brandOf(settings), name: siteName },
  );
}

export function experiencesTitle(t: Translate, settings: SeoSettingsLike | null | undefined, siteName: string): string {
  return composeTitle(t, brandOf(settings), t("{{name}}实战经验", { name: siteName }), t("积分解锁"));
}

export function experiencesDescription(t: Translate, siteName: string): string {
  return t(
    "真实用户撰写的 {{name}} 实战经验与踩坑记录，使用平台积分即可解锁阅读，作者获得等额积分奖励。",
    { name: siteName },
  );
}

/* ---------- 个人中心类页面（统一 noindex，仅补全元信息） ---------- */

export function accountTitle(t: Translate, settings: SeoSettingsLike | null | undefined, label: string): string {
  return composeTitle(t, brandOf(settings), label);
}

/** 页脚简介（每个页面都可见、可爬）。 */
export function footerIntro(t: Translate, settings?: SeoSettingsLike | null): string {
  return t(
    "{{brand}}是面向普通用户的金融与 Web3 站点导航，帮你更快找到官网入口、官方 APP 与真实使用经验。",
    { brand: brandOf(settings) },
  );
}
