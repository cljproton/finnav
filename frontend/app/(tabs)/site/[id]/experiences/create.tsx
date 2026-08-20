import React from "react";
import { useLocalSearchParams } from "expo-router";
import ExperienceEditor from "../../../../../components/ExperienceEditor";

export default function CreateExperienceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = Number(id);
  return <ExperienceEditor siteId={siteId} mode="create" />;
}