import type { Metadata } from "next";
import { Suspense } from "react";
import { NOINDEX_ROBOTS } from "../../../../lib/seoCopy";
import SiteTutorialsClient from "../../../../components/pages/SiteTutorialsClient";

export const metadata: Metadata = {
  title: "教程",
  robots: NOINDEX_ROBOTS,
};

export default function TutorialsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <SiteTutorialsClient />
    </Suspense>
  );
}