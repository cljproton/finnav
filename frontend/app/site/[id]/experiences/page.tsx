import type { Metadata } from "next";
import { Suspense } from "react";
import { NOINDEX_ROBOTS } from "../../../../lib/seoCopy";
import SiteExperiencesClient from "../../../../components/pages/SiteExperiencesClient";

export const metadata: Metadata = {
  title: "个人经验",
  robots: NOINDEX_ROBOTS,
};

export async function generateStaticParams() {
  return [{ id: "1" }];
}

export default function ExperiencesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <SiteExperiencesClient />
    </Suspense>
  );
}