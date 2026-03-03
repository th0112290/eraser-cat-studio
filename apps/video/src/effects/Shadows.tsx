import type { CSSProperties, ReactNode } from "react";

export type LightDirection = {
  x: number;
  y: number;
};

export type ContactShadowProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  blur?: number;
  opacity?: number;
  color?: string;
  lightDirection?: LightDirection;
  distance?: number;
  style?: CSSProperties;
};

export type DropShadowProps = {
  children: ReactNode;
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  opacity?: number;
  color?: string;
  style?: CSSProperties;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeLightDirection(direction: LightDirection): LightDirection {
  const length = Math.hypot(direction.x, direction.y);
  if (length <= 0.0001) {
    return { x: 0, y: 1 };
  }

  return {
    x: direction.x / length,
    y: direction.y / length
  };
}

function hexToRgba(hex: string, alpha: number): string | null {
  const normalized = hex.trim();
  if (!normalized.startsWith("#")) {
    return null;
  }

  const raw = normalized.slice(1);
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((token) => `${token}${token}`)
          .join("")
      : raw;

  if (full.length !== 6) {
    return null;
  }

  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) {
    return null;
  }

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

function resolveShadowColor(color: string, opacity: number): string {
  const hex = hexToRgba(color, opacity);
  if (hex) {
    return hex;
  }

  if (color.startsWith("rgb") || color.startsWith("hsl") || color.startsWith("var(")) {
    return color;
  }

  return `rgba(0, 0, 0, ${clamp(opacity, 0, 1).toFixed(3)})`;
}

export function computeShadowShift(
  lightDirection: LightDirection = { x: 0.55, y: 1 },
  distance: number = 12
): { dx: number; dy: number } {
  const normalized = normalizeLightDirection(lightDirection);

  return {
    dx: normalized.x * distance,
    dy: normalized.y * distance
  };
}

export const ContactShadow = ({
  x,
  y,
  width,
  height,
  blur = 18,
  opacity = 0.3,
  color = "#000000",
  lightDirection = { x: 0.55, y: 1 },
  distance = 12,
  style
}: ContactShadowProps) => {
  const shift = computeShadowShift(lightDirection, distance);
  const safeWidth = Math.max(2, width);
  const safeHeight = Math.max(2, height);
  const shadowColor = resolveShadowColor(color, opacity);

  return (
    <div
      style={{
        position: "absolute",
        left: x + shift.dx,
        top: y + shift.dy,
        width: safeWidth,
        height: safeHeight,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        background: `radial-gradient(ellipse at center, ${shadowColor} 0%, rgba(0, 0, 0, 0) 74%)`,
        filter: `blur(${Math.max(0, blur)}px)`,
        mixBlendMode: "multiply",
        pointerEvents: "none",
        ...style
      }}
    />
  );
};

export const DropShadow = ({
  children,
  offsetX = 0,
  offsetY = 8,
  blur = 18,
  opacity = 0.38,
  color = "#000000",
  style
}: DropShadowProps) => {
  const shadowColor = resolveShadowColor(color, opacity);

  return (
    <div
      style={{
        filter: `drop-shadow(${offsetX}px ${offsetY}px ${Math.max(0, blur)}px ${shadowColor})`,
        ...style
      }}
    >
      {children}
    </div>
  );
};