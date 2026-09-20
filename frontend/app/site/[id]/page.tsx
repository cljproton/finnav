import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchSite, fetchSettings, serverFetchJSON } from "../../../lib/serverFetch";
import { siteTitle, siteDescription } from "../../../lib/seoCopy";
import { serverI18n } from "../../../lib/i18nServer";
import SiteDetailClient from "../../../components/pages/SiteDetailClient";

interface DetailsPageProps {
  params: Promise<{ id: string }>;
}

interface TutorialsTopJson {
  text: unknown[];
  video: unknown[];
  agent: unknown[];
}

interface ExperienceListJson {
  count?: number;
}

async function fetchCounts(
  siteId: number,
): Promise<{ tutorials?: number; experiences?: number }> {
  const [tutorials, experiences] = await Promise.all([
    serverFetchJSON<TutorialsTopJson>(`/sites/${siteId}/tutorials/top/`).catch(() => null),
    serverFetchJSON<ExperienceListJson>(`/sites/${siteId}/experiences/`).catch(() => null),
  ]);
  const tutorialCount = tutorials
    ? tutorials.text.length + tutorials.video.length + tutorials.agent.length
    : undefined;
  return {
    tutorials: tutorialCount,
    experiences: experiences?.count ?? undefined,
  };
}

export async function generateStaticParams() {
  return [{ id: "1" }];
}

export async function generateMetadata({ params }: DetailsPageProps): Promise<Metadata> {
  const { id } = await params;
  const siteId = Number(id);
  if (!Number.isFinite(siteId) || siteId <= 0) {
    return { robots: "noindex,follow" };
  }
  try {
    const [settings, site, counts] = await Promise.all([
      fetchSettings(),
      fetchSite(siteId),
      fetchCounts(siteId),
    ]);
    if (!site) {
      return { robots: "noindex,follow" };
    }
    const t = serverI18n();
    const title = siteTitle(t, settings, site);
    const description = siteDescription(t, settings, site, counts);
    return {
      title: { absolute: title },
      description,
      robots: "index,follow",
      alternates: { canonical: `/site/${siteId}` },
      openGraph: {
        title,
        description,
        type: "article",
        url: `/site/${siteId}`,
        images: site.logo ? [{ url: site.logo }] : undefined,
      },
    };
  } catch {
    return { robots: "noindex,follow" };
  }
}

function SiteDetailClientWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <SiteDetailClient />
    </Suspense>
  );
}

export default async function SiteDetailPage({ params }: DetailsPageProps) {
  const { id } = await params;
  const siteId = Number(id);
  if (!Number.isFinite(siteId) || siteId <= 0) {
    notFound();
  }

  const [settings, site, counts] = await Promise.all([
    fetchSettings(),
    fetchSite(siteId),
    fetchCounts(siteId),
  ]);

  const base = settings?.share_base_url || process.env.NEXT_PUBLIC_DEFAULT_DOMAIN || 'https://fn.9418666.xyz'
  const platforms: string[] = []
  if (site?.app_android_url || site?.app_android_has_cache) platforms.push('Android')
  if (site?.app_ios_url || site?.app_google_play_url) platforms.push('iOS')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site?.name,
    url: site?.url,
    description: site?.description,
    publisher: {
      '@type': 'Organization',
      name: settings?.site_title || 'FinNav',
      url: base,
    },
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
      <SiteDetailClientWrapper />
    </>
  )
}