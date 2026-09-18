import type { Metadata } from "next";
import { Suspense } from "react";
import FavoritesClient from "../../components/pages/FavoritesClient";

export const metadata: Metadata = {
  title: "我的收藏",
  description: "管理你收藏的金融与 Web3 站点",
  robots: "noindex,follow",
};

function FavoritesClientWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <FavoritesClient />
    </Suspense>
  );
}

export default function FavoritesPage() {
  return <FavoritesClientWrapper />;
}