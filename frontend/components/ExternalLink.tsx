/**
 * 外链组件：渲染为真实的 `<a href target="_blank" rel=...>`，
 * 让搜索引擎（Ahrefs 等）能抓取到出站链接，并默认在新标签页打开。
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

export default function ExternalLink({
  url,
  onPress,
  rel = "nofollow noopener noreferrer",
  style,
  children,
  accessibilityLabel,
}: {
  url: string;
  onPress?: () => void;
  rel?: string;
  style?: StyleInput;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const handleClick = () => {
    // 不阻止默认跳转，仅触发附加回调（如下载计数上报）
    onPress?.();
  };
  return (
    <a
      href={url}
      target="_blank"
      rel={rel}
      // 重置浏览器默认锚链样式（去掉蓝色下划线）
      style={{ textDecorationLine: "none", color: "inherit", ...flattenStyle(style) }}
      onClick={handleClick}
      aria-label={accessibilityLabel}
    >
      {children}
    </a>
  );
}