import { useRouter } from "next/navigation";

/**
 * 站内链接组件：Web 端渲染真正的 `<a href>`。
 *
 * 爬虫看得到 href，点击时阻止默认跳转并走 Next.js router，保持 SPA 无刷新体验；
 * 带修饰键（Ctrl/Cmd/Shift）或中键点击时交给浏览器新标签打开。
 *
 * 注意：不要在 InternalLink 内部再嵌套 InternalLink / ExternalLink
 * （HTML 不允许 <a> 套 <a>），需要并列时把它们做成兄弟节点。
 */

type StyleInput = React.CSSProperties | Array<StyleInput | undefined | null>;

/**
 * 把 RN 遗留的「数组样式」扁平化成单个对象。
 * 数组若直接 spread 进 style 会产生数字下标 key，
 * React 对 CSSStyleDeclaration 赋索引属性会抛
 * "Indexed property setter is not supported"。
 */
function flattenStyle(style: StyleInput | undefined): React.CSSProperties | undefined {
  if (!style || !Array.isArray(style)) return style;
  const out: React.CSSProperties = {};
  const walk = (s: StyleInput | undefined | null) => {
    if (!s) return;
    if (Array.isArray(s)) s.forEach(walk);
    else Object.assign(out, s);
  };
  style.forEach(walk);
  return out;
}

export default function InternalLink({
  href,
  navigate,
  style,
  className,
  children,
  accessibilityLabel,
}: {
  /** 爬虫可见的目标地址（干净 URL，不带 ?from= 之类的跟踪参数）。 */
  href: string;
  /** 自定义跳转（默认 router.push(href)）；用于保留 replace、带参跳转等原有行为。 */
  navigate?: () => void;
  style?: StyleInput;
  className?: string;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const router = useRouter();

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // 始终阻断冒泡：外层卡片的 Pressable 不应同时触发一次跳转
    event.stopPropagation();
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    (navigate ?? (() => router.push(href)))();
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      style={{ textDecorationLine: "none", color: "inherit", ...flattenStyle(style) }}
      className={className}
      aria-label={accessibilityLabel}
    >
      {children}
    </a>
  );
}