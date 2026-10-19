import type { Site, SiteSettings } from "./types";

/**
 * 服务端专用：SSR / generateMetadata 直接访问后端。
 * 浏览器侧走同源 /api（由 next.config rewrites 代理），服务端走直连地址。
 */
const SERVER_API = (process.env.BACKEND_API_URL || "http://127.0.0.1:8000/api").replace(/\/+$/, "");

/**
 * 后端请求失败时抛出，保留 HTTP 状态码。
 *
 * 调用方需要区分「查无此站（404）」与「后端暂时异常（超时/5xx）」：
 * 前者应返回 404，后者必须继续抛出让页面返回 5xx（可重试），
 * 否则后端抖动会把全站页面错误地标记成 404，被搜索引擎永久移除。
 */
export class ServerFetchError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ServerFetchError";
    this.status = status;
  }
}

export async function serverFetchJSON<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_API}${path}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ServerFetchError(`serverFetch ${path} failed: ${reason}`);
  }
  if (!res.ok) {
    throw new ServerFetchError(`serverFetch ${path} failed: ${res.status}`, res.status);
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

/**
 * 取站点详情。
 *
 * 仅「后端明确返回 404」时才返回 null（→ 页面 notFound）；
 * 超时/5xx 继续抛出，避免后端异常期间把有效页面判成 404。
 */
export async function fetchSite(id: number): Promise<Site | null> {
  try {
    return await serverFetchJSON<Site>(`/sites/${id}/`);
  } catch (error) {
    if (error instanceof ServerFetchError && error.status === 404) return null;
    throw error;
  }
}

export function settingsText(s: SiteSettings | null, fallback: string): string {
  return (s?.site_title || s?.seo_title || fallback).trim();
}
