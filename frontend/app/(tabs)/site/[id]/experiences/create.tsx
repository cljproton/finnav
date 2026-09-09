import React from "react";
import { usePageSeo } from "../../../../../lib/seo";
import { NOINDEX_ROBOTS } from "../../../../../lib/seoCopy";
import { useLocalSearchParams } from "expo-router";
import ExperienceEditor from "../../../../../components/ExperienceEditor";

export default function CreateExperienceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = Number(id);
  // 私有或内容较薄的页面：不参与索引，但允许爬虫继续跟踪页内链接
  usePageSeo({ robots: NOINDEX_ROBOTS });
  return <ExperienceEditor siteId={siteId} mode="create" />;
}