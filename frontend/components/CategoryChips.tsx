import React from "react";
import { Text, View, StyleSheet } from "react-native";
import Tag from "@ant-design/react-native/es/tag";
import { useThemeColors } from "../constants/colors";
import { useTranslation } from "react-i18next";

interface CategoryChipsProps {
  categories: { name: string; slug: string; icon: string }[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}

export default function CategoryChips({
  categories,
  selected,
  onSelect,
}: CategoryChipsProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const allActive = selected === null;

  return (
    <View style={styles.container}>
      <Tag
        selected={allActive}
        onChange={() => onSelect(null)}
        styles={transparentTagStyles}
        style={[
          styles.chip,
          {
            backgroundColor: allActive ? colors.chipActiveBg : colors.chipBg,
            borderColor: allActive ? colors.primary : colors.chipBorder,
          },
        ]}
      >
        <Text
          style={{
            color: allActive ? colors.chipActiveText : colors.chipText,
            fontWeight: allActive ? "600" : "500",
            fontSize: 13,
          }}
        >
          {t("全部")}
        </Text>
      </Tag>
      {categories.map((cat) => {
        const active = selected === cat.slug;
        return (
          <Tag
            key={cat.slug}
            selected={active}
            onChange={() => onSelect(active ? null : cat.slug)}
            styles={transparentTagStyles}
            style={[
              styles.chip,
              {
                backgroundColor: active
                  ? colors.chipActiveBg
                  : colors.chipBg,
                borderColor: active ? colors.primary : colors.chipBorder,
              },
            ]}
          >
            <Text
              style={{
                color: active ? colors.chipActiveText : colors.chipText,
                fontWeight: active ? "600" : "500",
                fontSize: 13,
              }}
            >
              {cat.icon} {cat.name}
            </Text>
          </Tag>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
});

// AntD Tag 的内层 wrap 默认用 fill_base 白色背景盖住外层背景，
// 通过 styles 属性将其改为透明，让外层 style 的背景色与文字色生效。
const transparentTagStyles = {
  normalWrap: { backgroundColor: "transparent", borderColor: "transparent" },
  activeWrap: { backgroundColor: "transparent", borderColor: "transparent" },
};
