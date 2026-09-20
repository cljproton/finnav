"use client";

import { useEffect, useState } from "react";

/**
 * Replacement for primitives.tsx useSafeAreaInsets
 * Uses CSS env() for safe area insets (works on iOS Safari, Android Chrome)
 * Falls back to 0 on SSR and unsupported browsers
 */
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateInsets = () => {
      const style = getComputedStyle(document.documentElement);
      setInsets({
        top: parseInt(style.getPropertyValue("--safe-area-inset-top")) || 0,
        bottom: parseInt(style.getPropertyValue("--safe-area-inset-bottom")) || 0,
        left: parseInt(style.getPropertyValue("--safe-area-inset-left")) || 0,
        right: parseInt(style.getPropertyValue("--safe-area-inset-right")) || 0,
      });
    };

    // Initial read
    updateInsets();

    // Listen for changes (e.g., orientation change, notch visibility)
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => updateInsets();
    mediaQuery.addEventListener("change", handleChange);

    // Also listen for orientation/resize
    window.addEventListener("resize", updateInsets);
    window.addEventListener("orientationchange", updateInsets);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      window.removeEventListener("resize", updateInsets);
      window.removeEventListener("orientationchange", updateInsets);
    };
  }, []);

  return insets;
}

/**
 * Replacement for primitives.tsx useWindowDimensions
 * Returns current window dimensions, updates on resize
 */
export function useWindowDimensions() {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });

    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return dimensions;
}

/**
 * Media query hook for responsive logic
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    if (media.matches !== matches) setMatches(media.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [matches, query]);

  return matches;
}

// Breakpoint hooks
export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
export const useIsTablet = () => useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
export const useIsLargeDesktop = () => useMediaQuery("(min-width: 1200px)");