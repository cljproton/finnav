import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "../../../../../lib/seoCopy";
import ExperienceEditor from "../../../../../components/ExperienceEditor";

export const metadata: Metadata = {
  title: "发布经验",
  robots: NOINDEX_ROBOTS,
};

export async function generateStaticParams() {
  return [{ id: "1" }];
}

interface CreateExperiencePageProps {
  params: Promise<{ id: string }>;
}

export default async function CreateExperiencePage({ params }: CreateExperiencePageProps) {
  const { id } = await params;
  const siteId = Number(id);
  return <ExperienceEditor siteId={siteId} mode="create" />;
}