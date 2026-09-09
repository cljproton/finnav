import React from "react";
import {
  Platform,
  Pressable,
  type Insets,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { flattenLinkStyle } from "../lib/utils";

/**
 * 站内链接组件：Web 端渲染真正的 `<a href>`。
 *
 * react-native-web 的 Pressable + router.push 只产生 onclick 的 <div>，
 * 爬虫看不到 href，导致「Orphan page」与「Page has no outgoing links」。
 * 这里在 Web 端输出真实锚链（锚文本与目标 URL 对爬虫可见），
 * 点击时阻止默认跳转并走 expo-router，保持 SPA 无刷新体验；
 * 带修饰键（Ctrl/Cmd/Shift）或中键点击时交给浏览器新标签打开。
 *
 * 注意：不要在 InternalLink 内部再嵌套 InternalLink / ExternalLink
 * （HTML 不允许 <a> 套 <a>），需要并列时把它们做成兄弟节点。
 */
export default function InternalLink({
  href,
  navigate,
  style,
  children,
  accessibilityLabel,
  hitSlop,
}: {
  /** 爬虫可见的目标地址（干净 URL，不带 ?from= 之类的跟踪参数）。 */
  href: string;
  /** 自定义跳转（默认 router.push(href)）；用于保留 replace、带参跳转等原有行为。 */
  navigate?: () => void;
  style?: StyleProp<ViewStyle | TextStyle>;
  children: React.ReactNode;
  accessibilityLabel?: string;
  /** 原生端命中区域，Web 端 <a> 忽略此属性。 */
  hitSlop?: number | Insets;
}) {
  const router = useRouter();

  if (Platform.OS === "web" && typeof document !== "undefined") {
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
    // 重置浏览器默认锚链样式，保持与 <Text> 一致的观感（颜色由调用方样式决定）。
    // 注意：style 必须先压平，react-native-web 对原生 DOM 标签不会像 RN 组件那样
    // 自动展平数组，直接传数组会在运行时抛
    // "Failed to set an indexed property [0] on 'CSSStyleDeclaration'"。
    const flatStyle = flattenLinkStyle(style);
    return (
      <a
        href={href}
        onClick={handleClick}
        style={{ textDecorationLine: "none", color: "inherit", ...flatStyle } as any}
        aria-label={accessibilityLabel}
      >
        {children}
      </a>
    );
  }

  return (
    <Pressable
      onPress={(event) => {
        event?.stopPropagation?.();
        (navigate ?? (() => router.push(href)))();
      }}
      style={style}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
    >
      {children}
    </Pressable>
  );
}
