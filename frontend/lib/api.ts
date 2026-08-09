import { useCallback } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "./config";
import { authedFetch } from "./auth";
import i18n, { withLanguageHeaders } from "./i18n";
import type { Category, ReviewPage, Site, SitePage, SiteSettings, SiteSubmission, Tag, UserSiteInvite } from "./types";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: withLanguageHeaders() });
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
  return res.json();
}

// 站点列表/详情含登录可见字段（本站缓存地址、SHA-256），需携带鉴权头
// （无令牌时 authedFetch 退化为普通请求，行为与匿名一致）。
async function fetchSiteJSON<T>(url: string): Promise<T> {
  const res = await authedFetch(url);
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
  return res.json();
}

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => fetchJSON<Category[]>(`${API_URL}/categories/`),
  });
}

interface SitesParams {
  q?: string;
  category?: string;
}

function buildSitesUrl(params?: SitesParams, page?: number): string {
  // API_URL 可能为相对路径（同源单端口部署，如 /api），不能用 new URL，
  // 改为手工拼接查询串。
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.category) qs.set("category", params.category);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  if (!page || page <= 1) return `${API_URL}/sites/${suffix}`;
  const pageSuffix = suffix ? `${suffix}&page=${page}` : `?page=${page}`;
  return `${API_URL}/sites/${pageSuffix}`;
}

export function useSitesInfinite(params?: SitesParams) {
  return useInfiniteQuery<SitePage>({
    queryKey: ["sites", params],
    queryFn: ({ pageParam }) =>
      fetchSiteJSON<SitePage>(buildSitesUrl(params, pageParam as number | undefined)),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.next) {
        const u = new URL(lastPage.next, "http://placeholder");
        const p = u.searchParams.get("page");
        const n = p ? Number(p) : NaN;
        return Number.isFinite(n) && n > 0 ? n : undefined;
      }
      return undefined;
    },
  });
}

// 全部启用站点 id（轻量，供收藏剪枝等场景，不分页）。
export function useSiteIds() {
  return useQuery<number[]>({
    queryKey: ["site-ids"],
    queryFn: async () => {
      const res = await fetchSiteJSON<{ ids: number[] }>(`${API_URL}/sites/ids/`);
      return res.ids;
    },
  });
}

export function useSiteDetail(id: number) {
  return useQuery<Site>({
    queryKey: ["site", id],
    queryFn: () => fetchSiteJSON<Site>(`${API_URL}/sites/${id}/`),
  });
}

export function useSettings() {
  return useQuery<SiteSettings>({
    queryKey: ["settings"],
    queryFn: () => fetchJSON<SiteSettings>(`${API_URL}/settings/`),
  });
}

export function useTags() {
  return useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: () => fetchJSON<Tag[]>(`${API_URL}/tags/`),
  });
}

export function useMySubmissions() {
  return useQuery<SiteSubmission[]>({
    queryKey: ["site-submissions"],
    queryFn: async () => {
      const res = await authedFetch(`${API_URL}/site-submissions/`);
      if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
      return res.json();
    },
  });
}

export async function submitSite(payload: {
  name: string;
  url: string;
  description?: string;
  category: number;
  tags?: string[];
}): Promise<SiteSubmission> {
  const res = await authedFetch(`${API_URL}/site-submissions/`, {
    method: "POST",
    headers: withLanguageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" && body !== null
        ? body.detail || body.non_field_errors?.[0] || JSON.stringify(body)
        : i18n.t("请求失败 ({{status}})", { status: res.status });
    throw new Error(String(msg));
  }
  return res.json();
}

export async function reportAppDownload(
  siteId: number,
  platform: "android_cache" | "android_original" | "google_play" | "ios",
): Promise<void> {
  try {
    await fetch(`${API_URL}/sites/${siteId}/download/`, {
      method: "POST",
      headers: withLanguageHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ platform }),
    });
  } catch {
    // best-effort
  }
}

/* ---------- 2FA ---------- */

export interface TwoFAStatus {
  enabled: boolean;
}

export interface TwoFASetup {
  enabled: boolean;
  secret: string;
  otpauth_url: string;
  qr: string;
}

export async function fetchTFAStatus(): Promise<TwoFAStatus> {
  const res = await authedFetch(`${API_URL}/auth/twofa/status/`);
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
  return res.json();
}

export async function fetchTFASetup(): Promise<TwoFASetup> {
  const res = await authedFetch(`${API_URL}/auth/twofa/setup/`);
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
  return res.json();
}

export async function confirmTFA(code: string): Promise<TwoFAStatus> {
  const res = await authedFetch(`${API_URL}/auth/twofa/confirm/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(String(body?.code || i18n.t("启用失败")));
  }
  return res.json();
}

export async function disableTFA(code: string): Promise<TwoFAStatus> {
  const res = await authedFetch(`${API_URL}/auth/twofa/disable/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(String(body?.code || i18n.t("停用失败")));
  }
  return res.json();
}

export interface InvitePayload {
  invite_code?: string;
  invite_link?: string;
}

export async function fetchSiteInvite(
  siteId: number,
): Promise<UserSiteInvite> {
  const res = await authedFetch(`${API_URL}/sites/${siteId}/invite/`);
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
  return res.json();
}

export async function saveSiteInvite(
  siteId: number,
  payload: InvitePayload,
): Promise<UserSiteInvite> {
  const res = await authedFetch(`${API_URL}/sites/${siteId}/invite/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" && body !== null
        ? body.detail || body.non_field_errors?.[0] || JSON.stringify(body)
        : i18n.t("请求失败 ({{status}})", { status: res.status });
    throw new Error(String(msg));
  }
  return res.json();
}

export async function deleteSiteInvite(siteId: number): Promise<void> {
  const res = await authedFetch(`${API_URL}/sites/${siteId}/invite/`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
}

export function useSiteInvite(siteId: number, enabled: boolean) {
  return useQuery<UserSiteInvite>({
    queryKey: ["site-invite", siteId],
    queryFn: () => fetchSiteInvite(siteId),
    enabled,
    staleTime: 30_000,
  });
}

export function fetchSiteReviews(
  siteId: number,
  page: number,
): Promise<ReviewPage> {
  const suffix = page > 1 ? `?page=${page}` : "";
  return authedFetch(`${API_URL}/sites/${siteId}/ratings/${suffix}`).then(
    (res) => {
      if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
      return res.json();
    },
  );
}

export function useSiteReviews(siteId: number, enabled: boolean) {
  return useInfiniteQuery<ReviewPage>({
    queryKey: ["site-reviews", siteId],
    queryFn: ({ pageParam }) =>
      fetchSiteReviews(siteId, pageParam as number),
    initialPageParam: 1,
    enabled,
    staleTime: 30_000,
    getNextPageParam: (lastPage) => {
      if (lastPage.next) {
        const u = new URL(lastPage.next, "http://placeholder");
        const p = u.searchParams.get("page");
        const n = p ? Number(p) : NaN;
        return Number.isFinite(n) && n > 0 ? n : undefined;
      }
      return undefined;
    },
  });
}

/* ---------- mutations ---------- */

export async function reportVisit(siteId: number): Promise<void> {
  try {
    await fetch(`${API_URL}/sites/${siteId}/visit/`, {
      method: "POST",
      headers: withLanguageHeaders(),
    });
  } catch {
    // best-effort
  }
}

export interface RateResponse {
  id: number;
  score: number;
  comment: string;
  rating_count: number;
  rating_avg: number;
}

export interface MyRating {
  score: number | null;
  comment: string;
}

export async function fetchMyRating(siteId: number): Promise<MyRating> {
  const res = await authedFetch(`${API_URL}/sites/${siteId}/rate/`);
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
  return res.json();
}

export async function submitRating(
  siteId: number,
  payload: { score: number; comment?: string },
): Promise<RateResponse> {
  const res = await authedFetch(`${API_URL}/sites/${siteId}/rate/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" && body !== null
        ? body.detail || body.score || JSON.stringify(body)
        : i18n.t("请求失败 ({{status}})", { status: res.status });
    throw new Error(String(msg));
  }
  return res.json();
}

export async function removeRating(siteId: number): Promise<void> {
  try {
    await authedFetch(`${API_URL}/sites/${siteId}/rate/`, {
      method: "DELETE",
    });
  } catch {
    // best-effort
  }
}

export function useUpdateSiteCache() {
  const queryClient = useQueryClient();
  return useCallback((siteId: number, patch: Partial<Site>) => {
    queryClient.setQueryData<Site>(["site", siteId], (old) =>
      old ? { ...old, ...patch } : old,
    );
  }, [queryClient]);
}
