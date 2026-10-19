import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchSettings, serverFetchJSON } from "../../lib/serverFetch";
import { searchTitle, searchDescription } from "../../lib/seoCopy";
import { serverI18n } from "../../lib/i18nServer";
import SearchClient from "../../components/pages/SearchClient";
import type { SitePage } from "../../lib/types";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  try {
    const settings = await fetchSettings();
    const t = serverI18n();
    const title = searchTitle(t, settings);
    const description = searchDescription(t, settings);
    return {
      title: { absolute: title },
      description,
      // 站内搜索结果页是无限 URL 变体，不提交索引，但允许爬虫继续跟踪页内链接。
      robots: "noindex,follow",
      openGraph: {
        title,
        description,
        type: "website",
      },
    };
  } catch {
    return {
      title: "搜索站点",
      description: "搜索金融与 Web3 站点",
      robots: "noindex,follow",
    };
  }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim();
  const initialSitePage = q ? null : (await serverFetchJSON<SitePage>("/sites/").catch(() => null));
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <SearchClient initialSitePage={initialSitePage ?? undefined} />
    </Suspense>
  );
}