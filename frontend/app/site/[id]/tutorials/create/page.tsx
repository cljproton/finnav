import type { Metadata } from "next";
import { Suspense } from "react";
import { NOINDEX_ROBOTS } from "../../../../../lib/seoCopy";
import TutorialShareEditor from "../../../../../components/TutorialShareEditor";

export const metadata: Metadata = {
  title: "分享教程",
  robots: NOINDEX_ROBOTS,
};

export async function generateStaticParams() {
  return [{ id: "1" }];
}

interface CreateTutorialPageProps {
  params: Promise<{ id: string }>;
}

function CreateTutorialClientWrapper({ siteId }: { siteId: number }) {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <TutorialShareEditor siteId={siteId} mode="create" />
    </Suspense>
  );
}

export default async function CreateTutorialPage({ params }: CreateTutorialPageProps) {
  const { id } = await params;
  const siteId = Number(id);
  return <CreateTutorialClientWrapper siteId={siteId} />;
}