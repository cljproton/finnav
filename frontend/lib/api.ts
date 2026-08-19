import { useCallback } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "./config";
import { authedFetch } from "./auth";
import i18n, { withLanguageHeaders } from "./i18n";
import type {
  AppLinkPage,
  AppLinkPlatform,
  AppLinkSubmission,
  Category,
  MyPoints,
  PointRule,
  PointTransactionPage,
  ReviewPage,
  Site,
  SitePage,
  SiteSettings,
  SiteSubmission,
  SiteTutorial,
  SiteTutorialPage,
  Tag,
  TutorialType,
  TutorialsTop,
  UserSiteInvite,
} from "./types";

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

export async function updateSiteSubmission(
  submissionId: number,
  payload: {
    name: string;
    url: string;
    description?: string;
    category: number;
    tags?: string[];
  },
): Promise<SiteSubmission> {
  const res = await authedFetch(`${API_URL}/site-submissions/${submissionId}/`, {
    method: "PUT",
    headers: withLanguageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" && body !== null
        ? body.detail || body.error || body.non_field_errors?.[0] || JSON.stringify(body)
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

/* ---------- tutorials ---------- */

function fetchSiteTutorials(
  siteId: number,
  type: TutorialType,
  page: number,
): Promise<SiteTutorialPage> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return fetchSiteJSON<SiteTutorialPage>(
    `${API_URL}/sites/${siteId}/tutorials/${suffix}`,
  );
}

export function useSiteTutorials(siteId: number, type: TutorialType) {
  return useInfiniteQuery<SiteTutorialPage>({
    queryKey: ["site-tutorials", siteId, type],
    queryFn: ({ pageParam }) =>
      fetchSiteTutorials(siteId, type, pageParam as number),
    initialPageParam: 1,
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

export function useSiteTutorialsTop(siteId: number) {
  return useQuery<TutorialsTop>({
    queryKey: ["site-tutorials-top", siteId],
    queryFn: () =>
      fetchSiteJSON<TutorialsTop>(
        `${API_URL}/sites/${siteId}/tutorials/top/`,
      ),
    staleTime: 30_000,
  });
}

export interface ShareTutorialPayload {
  type: TutorialType;
  url: string;
  title?: string;
}

export interface TutorialTitleResult {
  title: string;
  fallback: boolean;
}

export async function fetchTutorialTitle(
  siteId: number,
  url: string,
): Promise<TutorialTitleResult> {
  const res = await authedFetch(`${API_URL}/sites/${siteId}/tutorials/title/`, {
    method: "POST",
    headers: withLanguageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
  const data = await res.json();
  return {
    title: String(data?.title ?? ""),
    fallback: Boolean(data?.fallback),
  };
}

export async function shareTutorial(
  siteId: number,
  payload: ShareTutorialPayload,
): Promise<SiteTutorial> {
  const body: ShareTutorialPayload = { type: payload.type, url: payload.url };
  const title = payload.title?.trim();
  if (title) body.title = title;
  const res = await authedFetch(`${API_URL}/sites/${siteId}/tutorials/`, {
    method: "POST",
    headers: withLanguageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
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

export async function updateTutorial(
  siteId: number,
  tutorialId: number,
  payload: ShareTutorialPayload,
): Promise<SiteTutorial> {
  const body: ShareTutorialPayload = { type: payload.type, url: payload.url };
  const title = payload.title?.trim();
  if (title) body.title = title;
  const res = await authedFetch(
    `${API_URL}/sites/${siteId}/tutorials/${tutorialId}/`,
    {
      method: "PUT",
      headers: withLanguageHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" && body !== null
        ? body.detail || body.error || body.non_field_errors?.[0] || JSON.stringify(body)
        : i18n.t("请求失败 ({{status}})", { status: res.status });
    throw new Error(String(msg));
  }
  return res.json();
}

export async function reportTutorialVisit(
  siteId: number,
  tutorialId: number,
): Promise<void> {
  try {
    await fetch(`${API_URL}/sites/${siteId}/tutorials/${tutorialId}/visit/`, {
      method: "POST",
      headers: withLanguageHeaders(),
    });
  } catch {
    // best-effort
  }
}

export async function requestTutorialDelete(
  siteId: number,
  tutorialId: number,
): Promise<void> {
  const res = await authedFetch(
    `${API_URL}/sites/${siteId}/tutorials/${tutorialId}/delete-request/`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
}

export async function cancelTutorialDelete(
  siteId: number,
  tutorialId: number,
): Promise<void> {
  const res = await authedFetch(
    `${API_URL}/sites/${siteId}/tutorials/${tutorialId}/delete-cancel/`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
}

/* ---------- app link submissions ---------- */

export function useMyAppLinks(siteId: number, enabled: boolean) {
  return useInfiniteQuery<AppLinkPage>({
    queryKey: ["my-app-links", siteId],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;
      const suffix = page > 1 ? `?page=${page}` : "";
      const res = await authedFetch(
        `${API_URL}/sites/${siteId}/app-links/${suffix}`,
      );
      if (!res.ok)
        throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
      return res.json();
    },
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

export interface SubmitAppLinkPayload {
  platform: AppLinkPlatform;
  url: string;
}

export async function submitAppLink(
  siteId: number,
  payload: SubmitAppLinkPayload,
): Promise<AppLinkSubmission> {
  const res = await authedFetch(`${API_URL}/sites/${siteId}/app-links/`, {
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

export async function updateAppLink(
  siteId: number,
  submissionId: number,
  payload: SubmitAppLinkPayload,
): Promise<AppLinkSubmission> {
  const res = await authedFetch(
    `${API_URL}/sites/${siteId}/app-links/${submissionId}/`,
    {
      method: "PUT",
      headers: withLanguageHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" && body !== null
        ? body.detail || body.error || body.non_field_errors?.[0] || JSON.stringify(body)
        : i18n.t("请求失败 ({{status}})", { status: res.status });
    throw new Error(String(msg));
  }
  return res.json();
}

export async function deleteSiteSubmission(submissionId: number): Promise<void> {
  const res = await authedFetch(
    `${API_URL}/site-submissions/${submissionId}/`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
}

export async function deleteAppLink(
  siteId: number,
  submissionId: number,
): Promise<void> {
  const res = await authedFetch(
    `${API_URL}/sites/${siteId}/app-links/${submissionId}/`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
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

/* ---------- points & referral ---------- */

export function useMyPoints(enabled = true) {
  return useQuery<MyPoints>({
    queryKey: ["me-points"],
    enabled,
    queryFn: async () => {
      const res = await authedFetch(`${API_URL}/me/`);
      if (!res.ok)
        throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
      const data = await res.json();
      return {
        balance: Number(data?.points?.balance ?? 0),
        lifetime: Number(data?.points?.lifetime ?? 0),
        referral_code: String(data?.referral_code ?? ""),
        referral_share_url: String(data?.referral_share_url ?? ""),
      };
    },
    staleTime: 30_000,
  });
}

export function usePointRules() {
  return useQuery<PointRule[]>({
    queryKey: ["point-rules"],
    queryFn: () => fetchJSON<PointRule[]>(`${API_URL}/points/rules/`),
  });
}

function fetchMyPointTransactions(page: number): Promise<PointTransactionPage> {
  const suffix = page > 1 ? `?page=${page}` : "";
  return authedFetch(`${API_URL}/me/points/transactions/${suffix}`).then((res) => {
    if (!res.ok)
      throw new Error(i18n.t("请求失败 ({{status}})", { status: res.status }));
    return res.json();
  });
}

export function useMyPointTransactions(enabled: boolean) {
  return useInfiniteQuery<PointTransactionPage>({
    queryKey: ["me-points-transactions"],
    queryFn: ({ pageParam }) => fetchMyPointTransactions(pageParam as number),
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
