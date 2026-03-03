import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";

export type ParallaxCamera = {
  x: number;
  y: number;
  zoom: number;
};

export type ParallaxLayer = {
  depth: number;
  render: ReactNode;
  key?: string;
  style?: CSSProperties;
  opacity?: number;
};

export type ParallaxSceneProps = {
  camera: ParallaxCamera;
  layers: ParallaxLayer[];
  className?: string;
  style?: CSSProperties;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveLayerTransform(camera: ParallaxCamera, depth: number): string {
  const safeDepth = clamp(depth, 0.05, 2.5);
  const shiftX = -camera.x * safeDepth;
  const shiftY = -camera.y * safeDepth;
  const zoomEffect = 1 + (camera.zoom - 1) * (0.35 + safeDepth * 0.65);

  return `translate3d(${shiftX.toFixed(2)}px, ${shiftY.toFixed(2)}px, 0) scale(${zoomEffect.toFixed(5)})`;
}

export const ParallaxScene = ({ camera, layers, className, style }: ParallaxSceneProps) => {
  return (
    <AbsoluteFill className={className} style={style}>
      {layers.map((layer, index) => {
        return (
          <AbsoluteFill
            key={layer.key ?? `parallax-layer-${index}`}
            style={{
              transform: resolveLayerTransform(camera, layer.depth),
              transformOrigin: "50% 50%",
              willChange: "transform",
              opacity: layer.opacity ?? 1,
              ...layer.style
            }}
          >
            {layer.render}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};