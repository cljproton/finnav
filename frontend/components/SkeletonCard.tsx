"use client";

export default function SkeletonCard() {
  return (
    <div className="fn-skeleton-card fn-flex fn-items-center fn-gap-3 fn-p-4">
      <div
        className="fn-skeleton fn-shrink-0"
        style={{ width: 48, height: 48, borderRadius: 11 }}
      />
      <div className="fn-flex fn-flex-col fn-flex-1 fn-gap-2">
        <div className="fn-skeleton-text" style={{ width: "60%" }} />
        <div className="fn-skeleton-text" style={{ width: "40%" }} />
        <div className="fn-flex fn-gap-1.5 fn-mt-1">
          <div className="fn-skeleton" style={{ width: 48, height: 18, borderRadius: 5 }} />
          <div className="fn-skeleton" style={{ width: 48, height: 18, borderRadius: 5 }} />
        </div>
      </div>
    </div>
  );
}