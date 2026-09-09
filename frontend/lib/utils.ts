import { Platform, StyleSheet } from "react-native";
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

/**
 * 压平传给渲染为真实 DOM（<a> 等）的 RN 样式，并把 RN 简写属性
 * （paddingHorizontal/paddingVertical、marginHorizontal/marginVertical）
 * 展开为浏览器可识别的长手 CSS 属性。
 *
 * react-native-web 的 StyleSheet.flatten 不会做这套展开，而原生 DOM 元素
 * 又只认 padding-left 之类属性，导致传 paddingHorizontal 到 <a> 上被静默丢弃。
 */
export function flattenLinkStyle<T>(style: T): Record<string, unknown> {
  const flat = StyleSheet.flatten(style) ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (key === "paddingHorizontal" && value != null) {
      out.paddingLeft = value;
      out.paddingRight = value;
    } else if (key === "paddingVertical" && value != null) {
      out.paddingTop = value;
      out.paddingBottom = value;
    } else if (key === "marginHorizontal" && value != null) {
      out.marginLeft = value;
      out.marginRight = value;
    } else if (key === "marginVertical" && value != null) {
      out.marginTop = value;
      out.marginBottom = value;
    } else {
      out[key] = value;
    }
  }
  // CSS 规范：border-style 缺省为 none 时，border-width 的计算值恒为 0。
  // 原生 <a> 没有 RNW 组件的代理规范化，必须显式补 solid 边框才会渲染。
  // 注意：若只设了某一边的宽度（如 borderTopWidth），border-style 会作用到四边，
  // 其余三边宽度回落到 CSS 默认 medium(3px)、颜色黑色——需显式把它们归零。
  if (
    (!("borderStyle" in out)) &&
    (("borderWidth" in out) || ("borderColor" in out) ||
      ("borderTopWidth" in out) || ("borderBottomWidth" in out) ||
      ("borderLeftWidth" in out) || ("borderRightWidth" in out))
  ) {
    out.borderStyle = "solid";
    if (!("borderWidth" in out)) {
      const sides: [string, string][] = [
        ["borderLeftWidth", "left"],
        ["borderRightWidth", "right"],
        ["borderTopWidth", "top"],
        ["borderBottomWidth", "bottom"],
      ];
      const bySide: Record<string, string> = Object.fromEntries(
        Object.keys(out)
          .filter((k) => k.startsWith("border") && k.endsWith("Width"))
          .map((k) => [k.replace("border", "").replace("Width", "").toLowerCase(), k]),
      );
      for (const [key, side] of sides) {
        if (!bySide[side] && out[key] == null) {
          out[key] = 0;
        }
      }
    }
  }
  return out;
}