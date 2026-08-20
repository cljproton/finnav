import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import Toast from "@ant-design/react-native/es/toast";
import ExperienceEditor from "../../../../../../components/ExperienceEditor";
import { fetchExperienceDetail } from "../../../../../../lib/api";
import { useThemeColors } from "../../../../../../constants/colors";
import type { Experience } from "../../../../../../lib/types";

export default function EditExperienceScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { id, expId } = useLocalSearchParams<{ id: string; expId: string }>();
  const siteId = Number(id);
  const experienceId = Number(expId);

  const [item, setItem] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchExperienceDetail(siteId, experienceId);
        if (!mounted) return;
        if (!data.is_mine) {
          Toast.fail(t("只能编辑自己发布的经验"), 1.5);
          return;
        }
        setItem(data);
      } catch (e: any) {
        if (mounted) Toast.fail(e?.message || t("加载失败"), 1.5);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [siteId, experienceId, t]);

  if (loading || !item) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <ExperienceEditor siteId={siteId} mode="edit" initial={item} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
});