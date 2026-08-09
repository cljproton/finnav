import React from "react";
import { View, StyleSheet } from "react-native";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import { useThemeColors } from "../constants/colors";

export default function SkeletonCard() {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.logo,
          { backgroundColor: colors.skeleton },
        ]}
      />
      <View style={styles.lines}>
        <View
          style={[styles.line, styles.lineWide, { backgroundColor: colors.skeleton }]}
        />
        <View
          style={[styles.line, styles.lineMedium, { backgroundColor: colors.skeleton }]}
        />
        <View style={styles.tagRow}>
          <View style={[styles.tag, { backgroundColor: colors.skeleton }]} />
          <View style={[styles.tag, { backgroundColor: colors.skeleton }]} />
        </View>
      </View>
      <View style={styles.spinnerWrap}>
        <ActivityIndicator
          size="small"
          color={colors.primary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 11,
    marginRight: 12,
  },
  lines: {
    flex: 1,
  },
  line: {
    height: 13,
    borderRadius: 6,
    marginBottom: 8,
  },
  lineWide: {
    width: "70%",
  },
  lineMedium: {
    width: "50%",
  },
  tagRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  tag: {
    width: 48,
    height: 18,
    borderRadius: 5,
  },
  spinnerWrap: {
    marginLeft: 8,
  },
});
