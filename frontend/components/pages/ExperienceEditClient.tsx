"use client";

import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "../ui/primitives";
import { Toast } from "../ui/antd";
import ExperienceEditor from "../ExperienceEditor";
import { fetchExperienceDetail } from "../../lib/api";
import { useThemeColors } from "../../constants/colors";
import type { Experience } from "../../lib/types";
import { StyleSheet } from "../../lib/rnStyle";
import { useTranslation } from "react-i18next";

export default function ExperienceEditClient({
  siteId,
  experienceId,
}: {
  siteId: number;
  experienceId: number;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [item, setItem] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

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
      } catch (e: unknown) {
        if (mounted) {
          Toast.fail(e instanceof Error ? e.message : t("加载失败"), 1.5);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [siteId, experienceId, t, reloadToken]);

  if (loading || !item) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {t("加载失败")}
            </Text>
            <Pressable
              onPress={() => {
                setLoading(true);
                setReloadToken((v) => v + 1);
              }}
              style={styles.retry}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>{t("重试")}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return <ExperienceEditor siteId={siteId} mode="edit" initial={item} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: "100vh" },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  message: { fontSize: 14 },
  retry: { marginTop: 12 },
  retryText: { fontSize: 14, fontWeight: "700" },
});