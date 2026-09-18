import type { Metadata } from "next";
import { Suspense } from "react";
import { NOINDEX_ROBOTS } from "../../../../lib/seoCopy";
import SiteReviewsClient from "../../../../components/pages/SiteReviewsClient";

export const metadata: Metadata = {
  title: "大家的评价",
  robots: NOINDEX_ROBOTS,
};

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <SiteReviewsClient />
    </Suspense>
  );
}