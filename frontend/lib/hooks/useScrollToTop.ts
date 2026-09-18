"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseScrollToTopOptions {
  threshold?: number;
  onScroll?: (y: number) => void;
}

export interface UseScrollToTopReturn {
  ref: React.RefObject<HTMLDivElement | null>;
  showButton: boolean;
  scrollToTop: () => void;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function useScrollToTop(
  options: UseScrollToTopOptions = {}
): UseScrollToTopReturn {
  const { threshold = 200, onScroll } = options;
  const ref = useRef<HTMLDivElement | null>(null);
  const [showButton, setShowButton] = useState(false);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const y = target?.scrollTop ?? window.scrollY ?? 0;
      setShowButton(y > threshold);
      onScroll?.(y);
    },
    [threshold, onScroll]
  );

  const scrollToTop = useCallback(() => {
    if (ref.current) {
      ref.current.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const y = window.scrollY;
      setShowButton(y > threshold);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [threshold]);

  return { ref, showButton, scrollToTop, handleScroll };
}