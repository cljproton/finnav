import type { Metadata } from "next";
import { Suspense } from "react";
import PointsClient from "../../components/pages/PointsClient";

export const metadata: Metadata = {
  title: "积分中心",
  description: "查看积分余额、邀请好友、积分转赠与流水记录",
  robots: "noindex,follow",
};

function PointsClientWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <PointsClient />
    </Suspense>
  );
}

export default function PointsPage() {
  return <PointsClientWrapper />;
}