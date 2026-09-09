/**
 * 页面级 SEO 注册中心（Web 端生效）。
 *
 * 设计动机：SPA 里多个页面都可能写 title / meta / canonical，若各自直接操作 DOM
 * 会互相覆盖（例如全局 SeoUpdater 与详情页文案打架）。这里让页面只「声明」自己的
 * SEO（usePageSeo），由唯一写入者 components/SeoUpdater.tsx 合并全局设置后写 DOM，
 * 后声明的字段优先，页面卸载自动回落到全局默认。
 */
import { useEffect, useId, useSyncExternalStore } from "react";

export interface PageSeo {
  /** 完整标题（含品牌后缀），缺省用全局 seo_title/site_title。 */
  title?: string;
  /** meta description；缺省用全局 seo_description。 */
  description?: string;
  /** meta keywords；缺省用全局 seo_keywords。 */
  keywords?: string;
  /** canonical 绝对地址；缺省由当前路由 pathname 推导（不含查询串）。 */
  canonical?: string;
  /** robots 指令；私有/薄页传 "noindex,follow"。 */
  robots?: string;
  /** og:type，默认 website。 */
  ogType?: "website" | "article";
  /** og:image 绝对地址；缺省用全局 logo。 */
  image?: string;
}

const claims = new Map<string, PageSeo>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

/** 订阅注册表变化（供 useSyncExternalStore 使用）。 */
export function subscribeSeo(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 注册表版本号（快照值，变化即触发重渲染）。 */
export function getSeoVersion(): number {
  return version;
}

/**
 * 当前生效的 SEO：按注册顺序合并，后注册（通常是更内层/最新的页面）的同名字段优先。
 */
export function currentPageSeo(): PageSeo {
  const merged: PageSeo = {};
  for (const claim of claims.values()) {
    for (const [key, value] of Object.entries(claim)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/** 页面声明自身 SEO；组件卸载时自动撤销。 */
export function usePageSeo(page: PageSeo): void {
  const key = useId();
  // 以内容签名作为依赖：内容不变则不重复注册，避免无谓的 DOM 写入。
  const signature = JSON.stringify(page);
  useEffect(() => {
    claims.set(key, page);
    emit();
    return () => {
      claims.delete(key);
      emit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, signature]);
}

/** 供 SeoUpdater 订阅注册表变化。 */
export function useSeoVersion(): number {
  return useSyncExternalStore(subscribeSeo, getSeoVersion, getSeoVersion);
}

/**
 * canonical 归一：去掉查询串/锚点与多余尾斜杠，避免
 * `/site/1?from=/search`、`/site/1/` 之类的重复页。
 */
export function normalizePath(pathname: string): string {
  let path = (pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "") || "/";
  return path || "/";
}

/** 当前 origin（仅 Web）。 */
export function siteOrigin(): string {
  if (typeof window === "undefined" || !window.location) return "";
  return window.location.origin;
}

/** 由 pathname 生成绝对 canonical（详情页可不传，由路由推导）。 */
export function canonicalFromPath(pathname: string): string {
  const origin = siteOrigin();
  if (!origin) return "";
  return `${origin}${normalizePath(pathname)}`;
}
