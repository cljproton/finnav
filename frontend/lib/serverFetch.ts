import type { Site, SiteSettings } from "./types";

/**
 * 服务端专用：SSR / generateMetadata 直接访问后端。
 * 浏览器侧走同源 /api（由 next.config rewrites 代理），服务端走直连地址。
 */
const SERVER_API = (process.env.BACKEND_API_URL || "http://127.0.0.1:8000/api").replace(/\/+$/, "");

export async function serverFetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER_API}${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`serverFetch ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSettings(): Promise<SiteSettings | null> {
  try {
    return await serverFetchJSON<SiteSettings>("/settings/");
  } catch {
    return null;
  }
}

export async function fetchSite(id: number): Promise<Site | null> {
  try {
    return await serverFetchJSON<Site>(`/sites/${id}/`);
  } catch {
    return null;
  }
}

export function settingsText(s: SiteSettings | null, fallback: string): string {
  return (s?.site_title || s?.seo_title || fallback).trim();
}