import type { Metadata } from "next";
import { Suspense } from "react";
import { NOINDEX_ROBOTS } from "../../../../../../lib/seoCopy";
import ExperienceEditClient from "../../../../../../components/pages/ExperienceEditClient";

export const metadata: Metadata = {
  title: "编辑经验",
  robots: NOINDEX_ROBOTS,
};

export async function generateStaticParams() {
  return [{ id: "1", expId: "1" }];
}

interface EditExperiencePageProps {
  params: Promise<{ id: string; expId: string }>;
}

export default async function EditExperiencePage({ params }: EditExperiencePageProps) {
  const { id, expId } = await params;
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <ExperienceEditClient siteId={Number(id)} experienceId={Number(expId)} />
    </Suspense>
  );
}