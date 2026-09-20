"use client";

import { useState } from "react";

function getInitialColor(name: string): string {
  const palette = [
    "#4F46E5",
    "#7C3AED",
    "#2563EB",
    "#0891B2",
    "#059669",
    "#D97706",
    "#DC2626",
    "#DB2777",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

interface LogoProps {
  uri?: string | null;
  name?: string;
  size?: number;
  style?: React.CSSProperties;
}

export const Logo: React.FC<LogoProps> = ({ uri, name, size = 48, style }) => {
  const [loadError, setLoadError] = useState(false);
  const radius = size * 0.22;
  const baseStyle: React.CSSProperties = { width: size, height: size, borderRadius: radius };

  const fallback = name ? (
    <div
      style={{
        ...baseStyle,
        borderRadius: radius,
        backgroundColor: getInitialColor(name),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <span style={{ color: "#FFFFFF", fontWeight: "700", fontSize: size * 0.42 }}>
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  ) : (
    <img src="/icon.png" style={{ ...baseStyle, objectFit: "contain", ...style }} alt="" />
  );

  if (!uri || loadError) return fallback;

  return (
    <img
      src={uri}
      alt={name || ""}
      style={{ ...baseStyle, objectFit: "cover", ...style }}
      onError={() => setLoadError(true)}
    />
  );
};