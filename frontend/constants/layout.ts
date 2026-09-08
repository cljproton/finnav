import { StyleSheet } from "react-native";

// 内容最大宽度：桌面 Web 上限制卡片/文字行宽，避免被拉满全屏。
// Mobile/平板宽度小于该值时 width:100% 不产生任何影响。
export const CONTENT_MAX_WIDTH = 720;

// 与页面 contentContainerStyle 配合：内容区居中并封顶宽度。
export const centeredContent = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
  },
});