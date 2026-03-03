import type { CSSProperties, ReactNode } from "react";

export type MotionBlurGhostProps = {
  children: ReactNode;
  strength?: number;
  samples?: number;
  dx?: number;
  dy?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const MotionBlurGhost = ({
  children,
  strength = 0.6,
  samples = 4,
  dx = 0,
  dy = 0
}: MotionBlurGhostProps) => {
  const safeStrength = clamp(strength, 0, 1);
  const safeSamples = clamp(Math.round(samples), 2, 6);

  if (safeStrength <= 0) {
    return <>{children}</>;
  }

  const layers = Array.from({ length: safeSamples });

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%"
      }}
    >
      {layers.map((_, index) => {
        const rank = index + 1;
        const t = rank / safeSamples;
        const opacity = (1 - t) * safeStrength * 0.5;
        const offsetX = -dx * t * safeStrength;
        const offsetY = -dy * t * safeStrength;

        const style: CSSProperties = {
          position: "absolute",
          inset: 0,
          opacity,
          transform: `translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px)`,
          pointerEvents: "none"
        };

        return (
          <div key={`ghost-${rank}`} style={style}>
            {children}
          </div>
        );
      })}

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