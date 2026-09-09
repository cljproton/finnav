import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useSettings } from "../lib/api";
import { useThemeColors } from "../constants/colors";
import { centeredContent } from "../constants/layout";
import { footerIntro } from "../lib/seoCopy";
import InternalLink from "./InternalLink";

/**
 * 页脚：站点简介 + 站内导航锚链 + 版权。
 *
 * 导航链接在 Web 端渲染为真正的 <a href>，让 /search、/submit-site、/points、
 * /favorites 等页面拥有全站入口内链（解决 ahrefs「Orphan page」），
 * 同时让每个页面都有出站站内链接（解决「Page has no outgoing links」）。
 *
 * @param showNav 是否渲染站内导航行。部分页面（搜索/个人中心/详情页）的
 *                冗余导航被隐藏以精简布局，首页保留。
 */
const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "首页" },
  { href: "/search", label: "搜索站点" },
  { href: "/submit-site", label: "提交新站点" },
  { href: "/points", label: "积分与邀请" },
  { href: "/favorites", label: "我的收藏" },
];

export default function SiteFooter({ showNav = true }: { showNav?: boolean }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { data: settings } = useSettings();

  const copyright = settings?.footer_copyright?.trim();
  const intro = footerIntro(t, settings);

  return (
    <View
      style={[
        styles.container,
        centeredContent.container,
        { borderTopColor: colors.border },
      ]}
    >
      <Text style={[styles.intro, { color: colors.textSecondary }]}>{intro}</Text>
      {showNav ? (
        <View style={styles.nav}>
          {NAV_ITEMS.map((item, idx) => (
            <React.Fragment key={item.href}>
              {idx > 0 ? (
                <Text style={[styles.separator, { color: colors.textTertiary }]}>·</Text>
              ) : null}
              <InternalLink href={item.href}>
                <Text style={[styles.navLink, { color: colors.linkItemText }]}>{t(item.label)}</Text>
              </InternalLink>
            </React.Fragment>
          ))}
        </View>
      ) : null}
      {copyright ? (
        <Text style={[styles.text, { color: colors.textTertiary }]}>{copyright}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    borderTopWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  intro: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 640,
  },
  nav: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  navLink: {
    fontSize: 13,
  },
  separator: {
    fontSize: 13,
  },
  text: {
    fontSize: 12,
    textAlign: "center",
  },
});
