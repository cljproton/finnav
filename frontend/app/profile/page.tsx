import type { Metadata } from "next";
import { Suspense } from "react";
import ProfileClient from "../../components/pages/ProfileClient";

export const metadata: Metadata = {
  title: "个人中心",
  description: "管理你的账户、收藏与积分",
  robots: "noindex,follow",
};

function ProfileClientWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>加载中…</div>}>
      <ProfileClient />
    </Suspense>
  );
}

export default function ProfilePage() {
  return <ProfileClientWrapper />;
}