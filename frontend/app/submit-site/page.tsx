import type { Metadata } from "next";
import { Suspense } from "react";
import SubmitSiteClient from "../../components/pages/SubmitSiteClient";

export const metadata: Metadata = {
  title: "提交新站点",
  description: "提交金融与 Web3 站点供审核收录",
  robots: "noindex,follow",
};

function SubmitSiteClientWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <SubmitSiteClient />
    </Suspense>
  );
}

export default function SubmitSitePage() {
  return <SubmitSiteClientWrapper />;
}