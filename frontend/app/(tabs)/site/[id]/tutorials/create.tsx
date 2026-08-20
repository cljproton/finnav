import React from "react";
import { useLocalSearchParams } from "expo-router";
import TutorialShareEditor from "../../../../../components/TutorialShareEditor";
import type { TutorialStatus, TutorialType } from "../../../../../lib/types";

export default function CreateTutorialScreen() {
  const { id, edit, type, url, title, status } = useLocalSearchParams<{
    id: string;
    edit?: string;
    type?: string;
    url?: string;
    title?: string;
    status?: string;
  }>();
  const siteId = Number(id);
  if (edit) {
    const initial = {
      id: Number(edit),
      type: (type as TutorialType) || "text",
      url: url ?? "",
      title: title ?? "",
      status: (status as TutorialStatus) || "rejected",
    } as any;
    return <TutorialShareEditor siteId={siteId} mode="edit" initial={initial} />;
  }
  return <TutorialShareEditor siteId={siteId} mode="create" />;
}