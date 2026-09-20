/**
 * 工具函数集合：纯 Web 实现，不依赖任何原生模块。
 */

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
    // fall through to legacy copy
  }
  return false;
}

/** 打开外部链接：Web 新标签页。 */
export function openExternal(url: string) {
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 格式化日期为 YYYY-MM-DD。 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 格式化日期时间为 YYYY-MM-DD HH:mm。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 字节数格式化为可读大小（MB/GB）。 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** 从错误对象中提取用户友好的错误信息。 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null) {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.detail === "string") return obj.detail;
    if (typeof obj.error === "string") return obj.error;
    if (obj.errors) return String(obj.errors);
    try {
      return JSON.stringify(obj);
    } catch {
      return "未知错误";
    }
  }
  return "未知错误";
}

/** 站点详情页地址：Web 用当前 origin。 */
export function siteDetailUrl(id: number, shareBaseUrl?: string | null): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/site/${id}`;
  }
  // 后端配置了转发来源域名时用 https/http 链接（装了 App 打开网页版、没装也能看）；否则保持 finnav 深链。
  if (shareBaseUrl) {
    return `${shareBaseUrl.replace(/\/+$/, "")}/site/${id}`;
  }
  return `/site/${id}`;
}

/** 邀请链接：优先后端配置的转发域名，Web 回退当前 origin。 */
export function inviteUrl(shareUrl: string, code: string): string {
  if (shareUrl) return shareUrl;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/?ref=${code}`;
  }
  return `/?ref=${code}`;
}

/**
 * 压平传给渲染为真实 DOM（<a> 等）的样式，并把 RN 简写属性
 * （paddingHorizontal/paddingVertical、marginHorizontal/marginVertical）
 * 展开为浏览器可识别的长手 CSS 属性。
 */
export function flattenLinkStyle<T>(style: Record<string, unknown> | undefined): Record<string, unknown> {
  const flat = style ?? {};
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
  if (
    !("borderStyle" in out) &&
    (("borderWidth" in out) || ("borderColor" in out) ||
      ("borderTopWidth" in out) || ("borderBottomWidth" in out) ||
      ("borderLeftWidth" in out) || ("borderRightWidth" in out))
  ) {
    out.borderStyle = "solid";
    if (!("borderWidth" in out)) {
      const sides = [
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
      for (const [key, side] of [["borderLeftWidth", "left"], ["borderRightWidth", "right"], ["borderTopWidth", "top"], ["borderBottomWidth", "bottom"]]) {
        if (!out[key] && !Object.keys(out).includes(key)) {
          out[key] = 0;
        }
      }
    }
  }
  return out;
}