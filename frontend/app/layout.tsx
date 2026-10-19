import '@ant-design/v5-patch-for-react-19';
import "./globals.css";
import type { Metadata } from "next";
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProviderWrapper } from "@/components/ConfigProvider";
import Providers from "./providers";
import { AppShell } from "../components/AppShell";
import { FontLoader } from "../components/FontLoader";
import HeadScripts from "../components/HeadScripts";

export const metadata: Metadata = {
  metadataBase: new URL("https://fn.9418666.xyz"),
  title: {
    default: "FinNav - 金融与 Web3 站点导航",
    template: "%s | FinNav",
  },
  description: "FinNav 金融与 Web3 站点导航，聚合优质金融网站、投资工具、APP 下载、新手教程、实战经验与真实用户评价，助你高效浏览与发现。",
  keywords: ["金融导航", "Web3", "DeFi", "交易所", "钱包", "投资工具", "区块链", "APP下载"],
  authors: [{ name: "FinNav" }],
  creator: "FinNav",
  publisher: "FinNav",
  robots: "index, follow",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://fn.9418666.xyz",
    siteName: "FinNav",
    title: "FinNav - 金融与 Web3 站点导航",
    description: "聚合优质金融网站、投资工具、APP 下载、新手教程、实战经验与真实用户评价",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "FinNav - 金融与 Web3 站点导航",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FinNav - 金融与 Web3 站点导航",
    description: "聚合优质金融网站、投资工具、APP 下载、新手教程、实战经验与真实用户评价",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="scroll-smooth">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="style"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          />
        </noscript>
      </head>
      <body>
        <AntdRegistry>
          <ConfigProviderWrapper>
            <Providers>
              <FontLoader />
              <HeadScripts />
              <AppShell>{children}</AppShell>
            </Providers>
          </ConfigProviderWrapper>
        </AntdRegistry>
      </body>
    </html>
  );
}