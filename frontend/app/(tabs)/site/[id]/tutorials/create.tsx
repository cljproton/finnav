import React from "react";
import { usePageSeo } from "../../../../../lib/seo";
import { NOINDEX_ROBOTS } from "../../../../../lib/seoCopy";
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
  // 私有或内容较薄的页面：不参与索引，但允许爬虫继续跟踪页内链接
  usePageSeo({ robots: NOINDEX_ROBOTS });
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