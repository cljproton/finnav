"use client";

import { useEffect } from "react";
import { useSettings } from "../lib/api";

/**
 * 根据后台配置的 AdSense 发布商 ID 注入 adsbygoogle.js
 */
export default function HeadScripts() {
  const { data: settings } = useSettings();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const publisherId = settings?.adsense_publisher_id?.trim();
    if (!publisherId) return;

    // 避免重复注入
    if (document.querySelector(`script[src*="googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}"]`)) {
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;
    script.setAttribute("crossorigin", "anonymous");
    document.head.appendChild(script);
  }, [settings]);

  return null;
}