import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "../../../../../lib/seoCopy";
import TutorialShareEditor, {
  type TutorialEditorInitial,
} from "../../../../../components/TutorialShareEditor";
import type { TutorialStatus, TutorialType } from "../../../../../lib/types";

export const metadata: Metadata = {
  title: "分享教程",
  robots: NOINDEX_ROBOTS,
};

interface CreateTutorialPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CreateTutorialPage({
  params,
  searchParams,
}: CreateTutorialPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const siteId = Number(id);
  const edit = first(sp.edit);

  if (edit) {
    const initial: TutorialEditorInitial = {
      id: Number(edit),
      type: (first(sp.type) as TutorialType) || "text",
      url: first(sp.url) ?? "",
      title: first(sp.title) ?? "",
      status: (first(sp.status) as TutorialStatus) || "rejected",
    };
    return <TutorialShareEditor siteId={siteId} mode="edit" initial={initial} />;
  }
  return <TutorialShareEditor siteId={siteId} mode="create" />;
}