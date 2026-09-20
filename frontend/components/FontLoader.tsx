"use client";

import { useEffect } from "react";

export function FontLoader() {
  useEffect(() => {
    const links = document.querySelectorAll('link[rel="preload"][as="style"]');
    links.forEach((link) => {
      if (link.getAttribute("href")?.includes("fonts.googleapis.com")) {
        const stylesheet = document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = link.getAttribute("href")!;
        stylesheet.media = "print";
        stylesheet.onload = () => {
          stylesheet.media = "all";
        };
        document.head.appendChild(stylesheet);
      }
    });
  }, []);

  return null;
}