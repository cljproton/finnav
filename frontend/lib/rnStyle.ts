import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

const UNITLESS = new Set([
  "zIndex",
  "opacity",
  "flex",
  "flexGrow",
  "flexShrink",
  "lineHeight",
  "fontWeight",
  "scale",
]);

const EXPAND: Record<string, (v: number | string) => [string, unknown][]> = {
  paddingHorizontal: (v) => [
    ["paddingLeft", v],
    ["paddingRight", v],
  ],
  paddingVertical: (v) => [
    ["paddingTop", v],
    ["paddingBottom", v],
  ],
  marginHorizontal: (v) => [
    ["marginLeft", v],
    ["marginRight", v],
  ],
  marginVertical: (v) => [
    ["marginTop", v],
    ["marginBottom", v],
  ],
};

const SHADOW: Record<string, (v: unknown) => void> = {
  shadowColor: (v) => {},
  shadowOpacity: (v) => {},
  shadowRadius: (v) => {},
  shadowOffset: (v) => {},
};

let shadowColor = "0,0,0";
let shadowOpacity = 0.2;
let shadowRadius = 4;
let shadowOffset = { width: 0, height: 2 };

function px(v: number | string): string | number {
  if (typeof v === "number") return `${v}px`;
  return v;
}

/** 将 React Native 风格对象转换为 Web CSSProperties。 */
export function rn(style: Record<string, unknown> | undefined | null): CSSProperties {
  if (!style) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) {
    if (v === undefined || v === null) continue;
    if (k === "shadowColor") {
      shadowColor = String(v);
      continue;
    }
    if (k === "shadowOpacity") {
      shadowOpacity = Number(v);
      continue;
    }
    if (k === "shadowRadius") {
      shadowRadius = Number(v);
      continue;
    }
    if (k === "shadowOffset") {
      shadowOffset = v as { width: number; height: number };
      continue;
    }
    if (k === "boxShadow" || k === "elevation") continue;
    if (k in EXPAND) {
      const entries = EXPAND[k](v as number | string);
      for (const [ek, ev] of entries) out[ek] = px(ev as number | string);
      continue;
    }
    if (typeof v === "number" && !UNITLESS.has(k) && !String(k).endsWith("Transform")) {
      out[k] = px(v);
      continue;
    }
    out[k] = v;
  }
  if (style.shadowColor !== undefined || shadowRadius > 0) {
    out.boxShadow = `${shadowOffset.width}px ${shadowOffset.height}px ${shadowRadius}px rgba(${shadowColor}, ${shadowOpacity})`;
  }
  return out as CSSProperties;
}

/** 兼容 RN StyleSheet API。 */
export const StyleSheet = {
  create: <T extends Record<string, Record<string, unknown>>>(obj: T): T => obj,
  flatten: (style: unknown): Record<string, unknown> => {
    if (Array.isArray(style)) {
      const merged: Record<string, unknown> = {};
      for (const s of style) {
        if (s && typeof s === "object") Object.assign(merged, s);
      }
      return merged;
    }
    return (style as Record<string, unknown>) ?? {};
  },
};

export function useSafeAreaInsets() {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

export function useWindowDimensions() {
  const [dimensions, setDimensions] = useState({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return dimensions;
}