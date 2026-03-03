import type { CSSProperties, ReactNode } from "react";

export type SmearProps = {
  active: boolean;
  amount: number;
  direction: {
    x: number;
    y: number;
  };
  children: ReactNode;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= 0.0001) {
    return { x: 1, y: 0 };
  }

  return {
    x: x / len,
    y: y / len
  };
}

export const Smear = ({ active, amount, direction, children }: SmearProps) => {
  if (!active || amount <= 0) {
    return <>{children}</>;
  }

  const safeAmount = clamp(amount, 0, 160);
  const dir = normalize(direction.x, direction.y);

  const baseStretchX = 1 + Math.abs(dir.x) * safeAmount * 0.012;
  const baseStretchY = 1 + Math.abs(dir.y) * safeAmount * 0.012;

  const layerA: CSSProperties = {
    position: "absolute",
    inset: 0,
    opacity: 0.34,
    transform: `translate(${(-dir.x * safeAmount * 0.42).toFixed(2)}px, ${(-dir.y * safeAmount * 0.42).toFixed(
      2
    )}px) scale(${baseStretchX.toFixed(3)}, ${baseStretchY.toFixed(3)})`,
    transformOrigin: `${dir.x >= 0 ? "0%" : "100%"} ${dir.y >= 0 ? "0%" : "100%"}`,
    pointerEvents: "none"
  };

  const layerB: CSSProperties = {
    position: "absolute",
    inset: 0,
    opacity: 0.2,
    transform: `translate(${(-dir.x * safeAmount * 0.65).toFixed(2)}px, ${(-dir.y * safeAmount * 0.65).toFixed(
      2
    )}px) scale(${(baseStretchX + 0.04).toFixed(3)}, ${(baseStretchY + 0.04).toFixed(3)})`,
    transformOrigin: `${dir.x >= 0 ? "0%" : "100%"} ${dir.y >= 0 ? "0%" : "100%"}`,
    pointerEvents: "none"
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%"
      }}
    >
      <div style={layerB}>{children}</div>
      <div style={layerA}>{children}</div>
      <div
        style={{
          position: "absolute",
          inset: 0
        }}
      >
        {children}
      </div>
    </div>
  );
};