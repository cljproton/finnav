import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchSettings } from "../lib/serverFetch";
import { homeTitle, homeDescription } from "../lib/seoCopy";
import { serverI18n } from "../lib/i18nServer";
import HomeClient from "../components/pages/HomeClient";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ category?: string }> }): Promise<Metadata> {
  const params = await searchParams;
  const selectedSlug = params.category;
  try {
    const settings = await fetchSettings();
    const t = serverI18n();
    const title = homeTitle(t, settings);
    const description = homeDescription(t, settings, selectedSlug ? undefined : settings?.sites_per_page);
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

function HomeClientWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <HomeClient />
    </Suspense>
  );
}

export default function HomePage() {
  return <HomeClientWrapper />;
}