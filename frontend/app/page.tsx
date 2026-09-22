import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchSettings, serverFetchJSON } from "../lib/serverFetch";
import { homeTitle, homeDescription } from "../lib/seoCopy";
import { serverI18n } from "../lib/i18nServer";
import HomeClient from "../components/pages/HomeClient";
import type { Category, SitePage } from "../lib/types";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await fetchSettings();
    const t = serverI18n();
    const title = homeTitle(t, settings);
    const description = homeDescription(t, settings, settings?.sites_per_page);
    return {
      title: { absolute: title },
      description,
      robots: "index,follow",
      openGraph: {
        title,
        description,
        type: "website",
      },
    };
  } catch {
    return {
      title: { absolute: "FinNav - 金融导航工具" },
      description: "发现优质的金融与 Web3 工具",
    };
  }
}

export default async function HomePage() {
  const [settings, sitePage, categories] = await Promise.all([
    fetchSettings(),
    serverFetchJSON<SitePage>("/sites/").catch(() => null),
    serverFetchJSON<Category[]>("/categories/").catch(() => null),
  ]);
  const base = settings?.share_base_url || process.env.NEXT_PUBLIC_DEFAULT_DOMAIN || 'https://fn.9418666.xyz'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings?.site_title || 'FinNav',
    url: base,
    description: settings?.seo_description || '聚合优质金融网站、投资工具、APP 下载、新手教程、实战经验与真实用户评价',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${base}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
        <HomeClient initialSitePage={sitePage ?? undefined} initialCategories={categories ?? undefined} />
      </Suspense>
    </>
  )
}