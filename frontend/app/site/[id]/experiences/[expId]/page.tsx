import type { Metadata } from "next";
import { Suspense } from "react";
import { NOINDEX_ROBOTS } from "../../../../../lib/seoCopy";
import ExperienceDetailClient from "../../../../../components/pages/ExperienceDetailClient";

export const metadata: Metadata = {
  title: "经验详情",
  robots: NOINDEX_ROBOTS,
};

export async function generateStaticParams() {
  return [{ id: "1", expId: "1" }];
}

export default function ExperienceDetailPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <ExperienceDetailClient />
    </Suspense>
  );
}