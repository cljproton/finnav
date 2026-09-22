import type { Metadata } from "next";
import { fetchSettings, serverFetchJSON } from "../../lib/serverFetch";
import { sitesIndexTitle, sitesIndexDescription } from "../../lib/seoCopy";
import { serverI18n } from "../../lib/i18nServer";
import SitesIndexClient from "../../components/pages/SitesIndexClient";
import type { SitePage } from "../../lib/types";

interface SitesPageProps {
  searchParams: Promise<{ page?: string }>;
}

async function resolvePage(searchParams: Promise<{ page?: string }>): Promise<number> {
  const { page } = await searchParams;
  return Math.max(1, Number(page) || 1);
}

export async function generateMetadata({ searchParams }: SitesPageProps): Promise<Metadata> {
  const page = await resolvePage(searchParams);
  try {
    const [settings, sitePage] = await Promise.all([
      fetchSettings(),
      serverFetchJSON<SitePage>(page === 1 ? "/sites/" : `/sites/?page=${page}`),
    ]);
    const t = serverI18n();
    const title = sitesIndexTitle(t, settings, page);
    const description = sitesIndexDescription(t, settings, sitePage?.count ?? 0);
    return {
      title: { absolute: title },
      description,
      robots: "index,follow",
      alternates: { canonical: page > 1 ? `/sites?page=${page}` : "/sites" },
    };
  } catch {
    return {
      title: "全部站点",
      description: "浏览全部金融与 Web3 站点",
      robots: "index,follow",
    };
  }
}

export default async function SitesIndexPage({ searchParams }: SitesPageProps) {
  const page = await resolvePage(searchParams);
  const [settings, sitePage] = await Promise.all([
    fetchSettings(),
    serverFetchJSON<SitePage>(page === 1 ? "/sites/" : `/sites/?page=${page}`).catch(() => null),
  ]);
  return (
    <SitesIndexClient settings={settings} sitePage={sitePage} page={page} />
  );
}