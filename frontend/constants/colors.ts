"use client";

import { useSyncExternalStore } from "react";

/**
 * Design tokens — Modern Fintech palette
 * Aligned with globals.css CSS variables
 *
 * Light mode: cool slate, indigo primary
 * Dark mode: deep navy, luminous indigo
 */

const shared = {
  /** Primary: indigo */
  cyan: "#4F46E5",
  cyanMuted: "#4F46E5",
  /** Secondary accent: violet */
  purple: "#7C3AED",
  purpleMuted: "#7C3AED",
  /** Warm amber for stars / highlights */
  amber: "#F59E0B",
  /** Feedback */
  success: "#059669",
  error: "#DC2626",
  warning: "#F59E0B",
} as const;

const light = {
  ...shared,
  background: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceSolid: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  text: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  primary: "#4F46E5",
  primaryLight: "rgba(79,70,229,0.08)",
  accent: "#F59E0B",
  border: "#E2E8F0",
  borderGlow: "rgba(79,70,229,0.18)",
  divider: "#E2E8F0",
  skeleton: "#E2E8F0",
  skeletonHighlight: "#F1F5F9",
  starActive: "#FBBF24",
  starInactive: "#CBD5E1",
  tagBg: "rgba(15,23,42,0.04)",
  tagText: "#475569",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E2E8F0",
  chipActiveBg: "#4F46E5",
  chipActiveText: "#FFFFFF",
  chipBg: "#FFFFFF",
  chipText: "#334155",
  chipBorder: "#E2E8F0",
  chipGlow: "rgba(79,70,229,0.08)",
  emptyIcon: "#CBD5E1",
  cardGlow: "rgba(15,23,42,0.03)",
  /** Link sections */
  linkSectionBg: "rgba(15,23,42,0.03)",
  linkSectionBorder: "rgba(15,23,42,0.05)",
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
  surface: "#111A2E",
  surfaceSolid: "#111A2E",
  surfaceElevated: "#1C2740",
  text: "#F1F5F9",
  textSecondary: "#94A3B8",
  textTertiary: "#64748B",
  primary: "#818CF8",
  primaryLight: "rgba(129,140,248,0.12)",
  accent: "#FBBF24",
  border: "rgba(148,163,184,0.14)",
  borderGlow: "rgba(129,140,248,0.25)",
  divider: "rgba(148,163,184,0.12)",
  skeleton: "rgba(148,163,184,0.08)",
  skeletonHighlight: "rgba(148,163,184,0.14)",
  starActive: "#FBBF24",
  starInactive: "#334155",
  tagBg: "rgba(255,255,255,0.04)",
  tagText: "#94A3B8",
  tabBar: "#111A2E",
  tabBarBorder: "rgba(148,163,184,0.12)",
  chipActiveBg: "#818CF8",
  chipActiveText: "#0B1120",
  chipBg: "#151E31",
  chipText: "#CBD5E1",
  chipBorder: "rgba(148,163,184,0.14)",
  chipGlow: "rgba(129,140,248,0.12)",
  emptyIcon: "#1E293B",
  cardGlow: "rgba(0,0,0,0.2)",
  linkSectionBg: "rgba(255,255,255,0.03)",
  linkSectionBorder: "rgba(255,255,255,0.06)",
  linkItemText: "#818CF8",
  downloadBg: "#818CF8",
  downloadText: "#0B1120",
  gridLine: "rgba(255,255,255,0.02)",
} as const;

// Widen from literal strings to general strings so dark & light are assignable
type ColorValue = string;
export type Colors = { [K in keyof typeof light]: ColorValue };

function subscribeToPrefersDark(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getPrefersDarkSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useThemeColors() {
  const dark = useSyncExternalStore(subscribeToPrefersDark, getPrefersDarkSnapshot, () => false);
  return (dark ? dark : light) as Colors;
}