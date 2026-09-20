"use client";

import { Card, Tag, Typography } from "@/components/antd-wrapper";
import { Star } from "lucide-react";
import { Ionicons } from "./ui/icons";
import { useTranslation } from "react-i18next";
import { Logo } from "./Logo";
import { useRouter } from "next/navigation";
import type { Site } from "../lib/types";
import { useFavorites } from "../lib/favorites";
import ExternalLink from "./ExternalLink";
import InternalLink from "./InternalLink";
import { getCategoryIcon } from "../lib/categoryIcons";

interface SiteCardProps {
  site: Site;
  showFavorite?: boolean;
}

export default function SiteCard({ site, showFavorite = true }: SiteCardProps) {
  const { t } = useTranslation();
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(site.id);
  const router = useRouter();

  const from = window.location.pathname.startsWith("/search")
    ? "/search"
    : window.location.pathname.startsWith("/favorites")
    ? "/favorites"
    : "/";

  const handlePress = () => {
    router.replace(`/site/${site.id}?from=${encodeURIComponent(from)}`);
  };

  const categoryIcon = getCategoryIcon(site.category_slug);

  return (
    <Card
      className="fn-card"
      style={{
        cursor: "pointer",
      }}
      styles={{
        body: {
          padding: 12,
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
        },
      }}
      onClick={handlePress}
    >
      <Logo uri={site.logo} name={site.name} size={40} style={{ flexShrink: 0 }} />
      <div className="fn-flex-1 fn-min-w-0 fn-flex fn-flex-col fn-gap-1">
        <div className="fn-flex fn-items-center fn-gap-1.5 fn-mb-0.5">
          <InternalLink
            href={`/site/${site.id}?from=${encodeURIComponent(window.location.pathname)}`}
            style={{ minWidth: 0, flexShrink: 1 }}
          >
            <Typography.Text
              className="fn-text-sm fn-font-semibold fn-text-primary fn-truncate"
              style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.1 }}
            >
              {site.name}
            </Typography.Text>
          </InternalLink>
          <ExternalLink
            url={site.url}
            style={{ marginLeft: 2, padding: 4 }}
          >
            <Ionicons name="open-outline" size={12} color="var(--fn-text-tertiary)" />
          </ExternalLink>
        </div>
        <Typography.Text className="fn-text-xs fn-text-secondary fn-text-2lines" style={{ fontSize: 12, lineHeight: "18px" }}>
          {site.description}
        </Typography.Text>
        <div className="fn-flex fn-flex-wrap fn-gap-1 fn-mt-1">
          <Tag
            className="fn-flex fn-items-center fn-gap-0.5 fn-rounded-full"
            style={{
              paddingInline: 8,
              paddingBlock: 2,
              backgroundColor: "var(--fn-primary-light)",
              borderWidth: 1,
              borderColor: "var(--fn-border-glow)",
              color: "var(--fn-primary)",
            }}
          >
            <span style={{ fontSize: 10 }}>{categoryIcon}</span>
            <Typography.Text className="fn-text-xs fn-font-medium" style={{ fontSize: 10 }}>
              {site.category_name}
            </Typography.Text>
          </Tag>
          {site.tags.slice(0, 2).map((tag, idx) => (
            <Tag
              key={`${tag}-${idx}`}
              className="fn-rounded-full fn-text-xs fn-font-medium"
              style={{ paddingInline: 8, paddingBlock: 2, backgroundColor: "var(--fn-tag-bg)", color: "var(--fn-tag-text)" }}
            >
              {tag}
            </Tag>
          ))}
        </div>
      </div>
      {showFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggle(site);
          }}
          className="fn-flex fn-items-center fn-justify-center fn-rounded-full fn-transition-fast fn-cursor-pointer"
          style={{
            padding: 6,
            background: "transparent",
            border: "none",
            borderRadius: "var(--fn-radius-full)",
            transition: "background-color 120ms cubic-bezier(0.16, 1, 0.3, 1), transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
          aria-label={fav ? t("取消收藏") : t("收藏站点")}
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              e.preventDefault();
              toggle(site);
            }
          }}
        >
          <Star
            size={18}
            color={fav ? "var(--fn-star-active)" : "var(--fn-star-inactive)"}
            fill={fav ? "var(--fn-star-active)" : "none"}
            strokeWidth={fav ? 1.5 : 2}
            style={{
              transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), color 150ms cubic-bezier(0.16, 1, 0.3, 1)",
              transform: fav ? "scale(1.15)" : "scale(1)",
            }}
            aria-hidden="true"
          />
        </button>
      )}
    </Card>
  );
}