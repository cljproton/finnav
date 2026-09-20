// @ts-nocheck
"use client";

import React from "react";
import type { StyleInput } from "./ui/primitives";

/**
 * 带真实语义标题标签的文本组件。
 *
 * 在 Web 端渲染真正的 <h1>~<h6>，爬虫能识别 H1/H2，解决
 * 「H1 tag missing or empty」。
 *
 * 注意：样式只做纯扁平合并，不得经过 rnStyle.rn()——rn() 会为
 * 任意对象注入默认 box-shadow（0 2px 4px rgba(0,0,0,.2)），
 * 导致全站标题出现边框阴影。
 */

function combineStyles(style: StyleInput | undefined): React.CSSProperties {
  const out: React.CSSProperties = {};
  if (!style) return out;
  if (Array.isArray(style)) {
    for (const s of style) {
      if (s && typeof s === "object") Object.assign(out, s);
    }
  } else if (typeof style === "object") {
    Object.assign(out, style);
  }
  return out;
}

export default function SeoHeading({
  level = 1,
  style,
  children,
}: {
  level?: 1 | 2 | 3 | 4;
  style?: StyleInput;
  children: React.ReactNode;
}) {
  const Tag = `h${Math.min(Math.max(level, 1), 6)}` as keyof JSX.IntrinsicElements;
  return (
    <Tag
      style={{
        font: "inherit",
        margin: 0,
        padding: 0,
        ...combineStyles(style),
      } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}