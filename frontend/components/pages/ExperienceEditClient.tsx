"use client";

import { useEffect, useState } from "react";
import { message, Spin, Button } from "@/components/antd-wrapper";
import ExperienceEditor from "../ExperienceEditor";
import { fetchExperienceDetail } from "../../lib/api";
import type { Experience } from "../../lib/types";
import { useTranslation } from "react-i18next";

export default function ExperienceEditClient({
  siteId,
  experienceId,
}: {
  siteId: number;
  experienceId: number;
}) {
  const { t } = useTranslation();
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
          message.error(t("只能编辑自己发布的经验"), 1.5);
          return;
        }
        setItem(data);
      } catch (e: unknown) {
        if (mounted) {
          message.error(e instanceof Error ? e.message : t("加载失败"), 1.5);
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
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        {loading ? (
          <Spin size="large" />
        ) : (
          <>
            <span style={{ fontSize: 14, color: "var(--fn-text-secondary)" }}>{t("加载失败")}</span>
            <Button
              type="primary"
              onClick={() => {
                setLoading(true);
                setReloadToken((v) => v + 1);
              }}
            >
              {t("重试")}
            </Button>
          </>
        )}
      </div>
    );
  }

  return <ExperienceEditor siteId={siteId} mode="edit" initial={item} />;
}