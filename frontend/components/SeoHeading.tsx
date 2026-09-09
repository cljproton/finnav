import React from "react";
import { Platform, StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

/**
 * 带真实语义标题标签的文本组件。
 *
 * react-native-web 的 <Text> 渲染成 <div>，爬虫看不到 H1/H2，导致
 * 「H1 tag missing or empty」。这里在 Web 端渲染真正的 <h1>~<h6>，
 * 原生端保持 <Text> 并补上 header 无障碍语义。
 *
 * 样式上把 `font: inherit` 放在最前，让浏览器默认字体被 RN 字体栈继承，
 * 再叠加传入样式；margin/padding 归零以保持与原来 <Text> 的视觉一致。
 */
export default function SeoHeading({
  level = 1,
  style,
  children,
  numberOfLines,
}: {
  level?: 1 | 2 | 3 | 4;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  /** 仅原生端生效（Web 端由 CSS 控制换行）。 */
  numberOfLines?: number;
}) {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
    const webStyle = { font: "inherit", margin: 0, padding: 0, ...flat } as any;
    const Tag = `h${Math.min(Math.max(level, 1), 6)}` as unknown as React.ElementType;
    return <Tag style={webStyle}>{children}</Tag>;
  }

  return (
    <Text
      accessibilityRole="header"
      numberOfLines={numberOfLines}
      style={style}
    >
      {children}
    </Text>
  );
}
