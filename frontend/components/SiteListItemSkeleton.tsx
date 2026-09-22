"use client";

export default function SiteListItemSkeleton() {
  return (
    <div className="fn-flex fn-items-center fn-gap-3 fn-px-4 fn-py-3 site-list-item"
         style={{ borderBottom: "1px solid var(--fn-divider)" }}>
      <div className="fn-animate-pulse fn-flex-shrink-0 fn-rounded-lg"
           style={{ width: 32, height: 32, borderRadius: "var(--fn-radius-sm)",
                    background: "linear-gradient(90deg, var(--fn-divider) 25%, var(--fn-border) 50%, var(--fn-divider) 75%)",
                    backgroundSize: "200% 100%" }} />
      <div className="fn-flex-1 fn-flex fn-flex-col fn-gap-2">
        <div className="fn-animate-pulse fn-rounded"
             style={{ height: 16, width: "40%", background: "linear-gradient(90deg, var(--fn-divider) 25%, var(--fn-border) 50%, var(--fn-divider) 75%)", backgroundSize: "200% 100%" }} />
        <div className="fn-animate-pulse fn-rounded"
             style={{ height: 12, width: "60%", background: "linear-gradient(90deg, var(--fn-divider) 25%, var(--fn-border) 50%, var(--fn-divider) 75%)", backgroundSize: "200% 100%" }} />
      </div>
      <div className="fn-animate-pulse fn-flex-shrink-0 fn-rounded-full"
           style={{ width: 60, height: 20, background: "linear-gradient(90deg, var(--fn-divider) 25%, var(--fn-border) 50%, var(--fn-divider) 75%)", backgroundSize: "200% 100%" }} />
      <div className="fn-animate-pulse fn-flex-shrink-0 fn-rounded"
           style={{ width: 18, height: 18, background: "linear-gradient(90deg, var(--fn-divider) 25%, var(--fn-border) 50%, var(--fn-divider) 75%)", backgroundSize: "200% 100%" }} />
    </div>
  );
}