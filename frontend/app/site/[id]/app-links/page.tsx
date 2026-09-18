import type { Metadata } from "next";
import { Suspense } from "react";
import { NOINDEX_ROBOTS } from "../../../../lib/seoCopy";
import SiteAppLinksClient from "../../../../components/pages/SiteAppLinksClient";

export const metadata: Metadata = {
  title: "提交下载链接",
  robots: NOINDEX_ROBOTS,
};

export default function AppLinksPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <SiteAppLinksClient />
    </Suspense>
  );
}