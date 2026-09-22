"use client";

import { Ionicons } from "./ui/icons";
import InternalLink from "./InternalLink";
import type { Site } from "../lib/types";

interface IoniconsProps {
  name: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
  "aria-label"?: string;
  "aria-hidden"?: string;
}

interface SiteListItemProps {
  site: Site;
  index?: number;
  isLast?: boolean;
}

export default function SiteListItem({ site, index = 0, isLast = false }: SiteListItemProps) {
  const animationDelay = `${index * 30}ms`;

  return (
    <InternalLink
      href={`/site/${site.id}`}
      className="fn-flex fn-items-center fn-gap-3 fn-px-4 fn-py-3 fn-transition-fast
        hover:fn-bg-surface hover:fn-shadow-sm
        active:scale-[0.995] focus-visible:fn-outline-primary
        group site-list-item"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--fn-divider)",
        animation: "fn-fade-in-up 300ms ease-out both",
        animationDelay,
      }}
      aria-label={`${site.name}${site.description ? `，${site.description}` : ""}${site.category_name ? `，分类：${site.category_name}` : ""}`}
    >
      <div
        className="fn-flex-shrink-0 fn-flex fn-items-center fn-justify-center fn-rounded-lg fn-shadow-sm"
        style={{
          width: 32,
          height: 32,
          borderRadius: "var(--fn-radius-sm)",
          backgroundColor: site.logo ? "transparent" : "var(--fn-primary-light)",
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        {site.logo ? (
          <img
            src={site.logo}
            alt=""
            width={32}
            height={32}
            style={{ objectFit: "cover" }}
            loading="lazy"
          />
        ) : (
          <Ionicons name="globe" size={18} color="var(--fn-primary)" />
        )}
      </div>

      <div className="fn-flex-1 fn-min-w-0 fn-flex fn-flex-col fn-gap-1">
        <div className="fn-flex fn-items-center fn-gap-2">
          <h3 className="fn-font-medium fn-text-primary fn-truncate"
              style={{ fontSize: 15, fontWeight: 500, color: "var(--fn-text)" }}>
            {site.name}
          </h3>
        </div>

        {site.description && (
          <p className="fn-text-sm fn-text-secondary fn-truncate site-desc"
             style={{ fontSize: 13, color: "var(--fn-text-secondary)", lineHeight: 1.4 }}>
            {site.description}
          </p>
        )}
      </div>

      <div className="fn-flex fn-items-center fn-gap-2 fn-flex-shrink-0">
        {site.category_name && (
          <span className="fn-px-2 fn-py-0.5 fn-rounded-full fn-text-xs fn-font-medium
            fn-bg-brand/10 fn-text-brand fn-whitespace-nowrap
            group-hover:fn-bg-brand/20 group-hover:fn-text-brand-dark
            transition-colors site-tag"
                style={{
                  paddingInline: 8,
                  paddingTop: 2,
                  paddingBottom: 2,
                  borderRadius: "var(--fn-radius-full)",
                  fontSize: 11,
                  fontWeight: 500,
                  backgroundColor: "rgba(79, 70, 229, 0.1)",
                  color: "var(--fn-primary)",
                }}>
            {site.category_name}
          </span>
        )}
        <span className="fn-flex-shrink-0 group-hover:fn-text-primary transition-colors">
          <Ionicons name="chevron-forward" size={18} color="var(--fn-text-tertiary)" />
        </span>
      </div>
    </InternalLink>
  );
}