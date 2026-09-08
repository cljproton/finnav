import { Platform } from "react-native";
import * as Linking from "expo-linking";

/** 复制文本到剪贴板（Web 优先 Clipboard API，失败回退 execCommand）。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy copy
  }
  try {
    if (typeof document !== "undefined") {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    }
  } catch {
    // ignore
  }
  return false;
}

/** 打开外部链接：Web 新标签页，原生用系统浏览器。 */
export function openExternal(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  Linking.openURL(url);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 格式化日期为 YYYY-MM-DD。 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 格式化日期时间为 YYYY-MM-DD HH:mm。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 字节数格式化为可读大小（MB/GB）。 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** 站点详情页地址：Web 用当前 origin，原生优先后端转发域名，否则回退深链。 */
export function siteDetailUrl(id: number, shareBaseUrl?: string | null): string {
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location?.origin
  ) {
    return `${window.location.origin}/site/${id}`;
  }
  // 后端配置了转发来源域名时用 https/http 链接（装了 App 打开网页版、没装也能看）；否则保持 finnav 深链。
  if (shareBaseUrl) {
    return `${shareBaseUrl.replace(/\/+$/, "")}/site/${id}`;
  }
  return Linking.createURL(`/site/${id}`);
}

/** 邀请链接：优先后端配置的转发域名，Web 回退当前 origin，原生回退深链。 */
export function inviteUrl(shareUrl: string, code: string): string {
  if (shareUrl) return shareUrl;
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/?ref=${code}`;
  }
  try {
    return `${Linking.createURL("/")}?ref=${code}`;
  } catch {
    return `finnav:///?ref=${code}`;
  }
}