import React from "react";
import { Platform, Pressable, type StyleProp, type ViewStyle } from "react-native";
import * as Linking from "expo-linking";
import { flattenLinkStyle } from "../lib/utils";

/**
 * 跨平台「外链」组件：
 * - Web 端渲染为真实 `<a href target="_blank" rel=...>`，让搜索引擎（Ahrefs 等）
 *   能抓取到出站链接，并默认在新标签页打开。
 * - 原生端渲染为 Pressable，点击打开外链（并触发可选的回调）。
 *
 * @param url      目标外链
 * @param onPress  点击附加回调（打开外链后触发，常用于上报计数）
 * @param rel      出站 rel 属性（默认 nofollow noopener noreferrer）
 */
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
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const handleClick = () => {
      // 不阻止默认跳转，仅触发附加回调（如下载计数上报）
      onPress?.();
    };
    return (
      <a
        href={url}
        target="_blank"
        rel={rel}
        // 重置浏览器默认锚链样式（去掉蓝色下划线），先压平避免数组样式
        // 触发 react-native-web 的 DOM 运行时错误
        style={{ textDecorationLine: "none", color: "inherit", ...flattenLinkStyle(style) } as any}
        onClick={handleClick}
        aria-label={accessibilityLabel}
      >
        {children}
      </a>
    );
  }

  return (
    <Pressable
      onPress={() => {
        Linking.openURL(url);
        onPress?.();
      }}
      style={style}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}
