import { forwardRef, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { rn } from "../../lib/rnStyle";

type StyleValue = Record<string, unknown> | CSSProperties;
type StyleArray = (StyleValue | false | null | undefined)[];
type StyleInput = StyleValue | StyleArray | undefined;

function filterStyles(style: StyleInput): StyleValue[] {
  if (!Array.isArray(style)) return style ? [style] : [];
  return style.filter((s): s is StyleValue => Boolean(s) && typeof s === "object");
}

function flattenStyles(style: StyleInput): CSSProperties {
  if (Array.isArray(style)) {
    const flat: Record<string, unknown> = {};
    for (const s of style) {
      if (s && typeof s === "object") Object.assign(flat, s as Record<string, unknown>);
    }
    return rn(flat);
  }
  if (style && typeof style === "object" && !Array.isArray(style)) {
    return rn(style as Record<string, unknown>);
  }
  return {} as CSSProperties;
}

interface ViewProps {
  children?: ReactNode;
  style?: StyleInput;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onScroll?: (e: React.UIEvent) => void;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  testID?: string;
  id?: string;
  ref?: React.Ref<HTMLDivElement>;
}

export const View = forwardRef<HTMLDivElement, ViewProps>(function View(
  { children, style, className, onClick, onScroll, onPress, ...rest },
  ref,
) {
  const resolved = flattenStyles(style);
  if (onPress) {
    (resolved as Record<string, unknown>).cursor = "pointer";
  }
  const mergedClass = ["fn-view", className ?? ""].join(" ").trim();
  return (
    <div
      ref={ref}
      style={resolved}
      className={mergedClass}
      onClick={onClick ?? (onPress ? () => onPress() : undefined)}
      onScroll={onScroll}
      data-testid={rest.testID}
      id={rest.id}
      aria-label={rest.accessibilityLabel}
      role={rest.accessibilityRole}
    >
      {children}
    </div>
  );
});

interface TextProps {
  children?: ReactNode;
  style?: StyleInput;
  className?: string;
  numberOfLines?: number;
  onClick?: () => void;
  accessibilityLabel?: string;
  id?: string;
}

export const Text = forwardRef<HTMLSpanElement, TextProps>(function Text(
  { children, style, className, numberOfLines, onClick, accessibilityLabel, id },
  ref,
) {
  let resolved = flattenStyles(style);
  if (numberOfLines === 1) {
    resolved = {
      ...resolved,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    };
  } else if (numberOfLines && numberOfLines > 1) {
    resolved = {
      ...resolved,
      display: "-webkit-box",
      WebkitLineClamp: numberOfLines,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
    } as CSSProperties;
  }
  const mergedClass = ["fn-text", className ?? ""].join(" ").trim();
  return (
    <span
      ref={ref}
      style={resolved}
      className={mergedClass}
      onClick={onClick}
      aria-label={accessibilityLabel}
      id={id}
    >
      {children}
    </span>
  );
});

interface PressableProps {
  children?: ReactNode;
  style?: StyleInput | ((state: { pressed: boolean }) => StyleInput);
  onPress?: () => void;
  className?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  hitSlop?: unknown;
}

export function Pressable({
  children,
  style,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityRole,
}: PressableProps) {
  const base = typeof style === "function" ? style({ pressed: false }) : style;
  const filtered = filterStyles(base);
  const resolved: CSSProperties = { ...flattenStyles(filtered), cursor: "pointer" };
  if (disabled) {
    resolved.opacity = 0.5;
    resolved.cursor = "not-allowed";
  }
  const role = accessibilityRole ?? (accessibilityLabel ? "button" : undefined);
  return (
    <button
      type="button"
      style={resolved}
      className="fn-pressable"
      onClick={onPress}
      disabled={disabled}
      aria-label={accessibilityLabel}
      role={role}
    >
      {children}
    </button>
  );
}

interface ScrollViewProps {
  children?: ReactNode;
  style?: StyleInput;
  contentContainerStyle?: StyleInput;
  horizontal?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function ScrollView({
  children,
  style,
  contentContainerStyle,
  horizontal,
  onScroll,
}: ScrollViewProps) {
  const resolved = flattenStyles(style);
  const content = flattenStyles(contentContainerStyle);
  const outer: CSSProperties = horizontal
    ? { ...resolved, overflowX: "auto", overflowY: "hidden" }
    : { ...resolved, overflowX: "hidden", overflowY: "auto" };
  if (horizontal) {
    content.display = "inline-flex";
  }
  return (
    <div style={outer} className="fn-scrollview" onScroll={onScroll}>
      <div style={content}>{children}</div>
    </div>
  );
}

export function ActivityIndicator({
  size = "small",
  color,
  style,
}: {
  size?: "small" | "large";
  color?: string;
  style?: StyleInput;
}) {
  const resolved = flattenStyles(style);
  const cssSize = size === "large" ? 32 : 20;
  const spinnerColor = color ?? "var(--fn-primary)";
  return (
    <div
      style={{ ...resolved, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      role="status"
      aria-label="加载中"
    >
      <span
        style={{
          width: cssSize,
          height: cssSize,
          borderRadius: "50%",
          borderWidth: 3,
          borderStyle: "solid",
          borderColor: `${spinnerColor}33`,
          borderTopColor: spinnerColor,
          animation: "fn-spin 0.8s linear infinite",
          display: "inline-block",
        }}
      />
      <style>{`@keyframes fn-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

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