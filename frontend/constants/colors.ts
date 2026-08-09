import { useColorScheme } from "react-native";

/**
 * Design tokens — refined finance / Web3 palette
 *
 * Light mode: clean white surfaces on soft grey, deep indigo accent
 * Dark mode: deep navy surfaces, luminous indigo accent
 */

const shared = {
  /** Accent: indigo */
  cyan: "#4F46E5",
  cyanMuted: "#4F46E5",
  /** Accent: secondary purple */
  purple: "#7C3AED",
  purpleMuted: "#7C3AED",
  /** Accent: warm amber for stars / highlights */
  amber: "#F59E0B",
  /** Feedback */
  success: "#059669",
  error: "#DC2626",
  warning: "#D97706",
} as const;

const light = {
  ...shared,
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceSolid: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  text: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  primary: shared.cyanMuted,
  primaryLight: "rgba(79,70,229,0.08)",
  accent: shared.amber,
  border: "#E2E8F0",
  borderGlow: "rgba(79,70,229,0.15)",
  divider: "#E2E8F0",
  skeleton: "#E2E8F0",
  skeletonHighlight: "#F1F5F9",
  starActive: "#F59E0B",
  starInactive: "#CBD5E1",
  tagBg: "rgba(15,23,42,0.04)",
  tagText: "#475569",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E2E8F0",
  chipActiveBg: shared.cyanMuted,
  chipActiveText: "#FFFFFF",
  chipBg: "rgba(255,255,255,0.8)",
  chipText: "#334155",
  chipBorder: "#E2E8F0",
  chipGlow: "rgba(79,70,229,0.10)",
  emptyIcon: "#CBD5E1",
  cardGlow: "rgba(79,70,229,0.06)",
  /** Link sections */
  linkSectionBg: "rgba(79,70,229,0.04)",
  linkSectionBorder: "rgba(79,70,229,0.15)",
  linkItemText: "#4F46E5",
  /** Download button */
  downloadBg: "#4F46E5",
  downloadText: "#FFFFFF",
  /** Grid / texture */
  gridLine: "rgba(0,0,0,0.02)",
} as const;

const dark = {
  ...shared,
  background: "#0B1120",
  surface: "rgba(30,41,59,0.85)",
  surfaceSolid: "#1E293B",
  surfaceElevated: "#1E293B",
  text: "#F1F5F9",
  textSecondary: "#94A3B8",
  textTertiary: "#64748B",
  primary: "#818CF8",
  primaryLight: "rgba(129,140,248,0.12)",
  accent: "#FBBF24",
  border: "rgba(148,163,184,0.12)",
  borderGlow: "rgba(129,140,248,0.20)",
  divider: "rgba(148,163,184,0.10)",
  skeleton: "rgba(148,163,184,0.08)",
  skeletonHighlight: "rgba(148,163,184,0.14)",
  starActive: "#FBBF24",
  starInactive: "#334155",
  tagBg: "rgba(255,255,255,0.06)",
  tagText: "#94A3B8",
  tabBar: "#0F172A",
  tabBarBorder: "rgba(148,163,184,0.10)",
  chipActiveBg: "#818CF8",
  chipActiveText: "#0F172A",
  chipBg: "rgba(255,255,255,0.05)",
  chipText: "#CBD5E1",
  chipBorder: "rgba(148,163,184,0.12)",
  chipGlow: "rgba(129,140,248,0.15)",
  emptyIcon: "#1E293B",
  cardGlow: "rgba(129,140,248,0.06)",
  linkSectionBg: "rgba(129,140,248,0.06)",
  linkSectionBorder: "rgba(129,140,248,0.15)",
  linkItemText: "#818CF8",
  downloadBg: "#818CF8",
  downloadText: "#0F172A",
  gridLine: "rgba(255,255,255,0.02)",
} as const;

// Widen from literal strings to general strings so dark & light are assignable
type ColorValue = string;
export type Colors = { [K in keyof typeof light]: ColorValue };

export function useThemeColors(): Colors {
  const scheme = useColorScheme();
  return (scheme === "dark" ? dark : light) as Colors;
}
