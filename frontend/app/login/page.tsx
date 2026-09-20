import type { Metadata } from "next";
import LoginPageClient from "@/components/pages/LoginPageClient";

export const metadata: Metadata = {
  title: "登录 / 注册 | FinNav",
};

export default function LoginPage() {
  return <LoginPageClient />;
}