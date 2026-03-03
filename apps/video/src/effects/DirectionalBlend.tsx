import { Children, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

type Direction = "left" | "right";

type LayerProps = {
  children?: ReactNode;
};

type DirectionalBlendProps = {
  t: number;
  direction: Direction;
  featherPx?: number;
  children: ReactNode;
};

type ParsedLayers = {
  fromLayer: ReactNode;
  toLayer: ReactNode;
};

const CANVAS_WIDTH = 1920;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const DirectionalBlendFrom = ({ children }: LayerProps) => <>{children}</>;
DirectionalBlendFrom.displayName = "DirectionalBlend.From";

const DirectionalBlendTo = ({ children }: LayerProps) => <>{children}</>;
DirectionalBlendTo.displayName = "DirectionalBlend.To";

function parseLayers(children: ReactNode): ParsedLayers {
  const childArray = Children.toArray(children);
  let fromLayer: ReactNode = null;
  let toLayer: ReactNode = null;

  for (const child of childArray) {
    if (!isValidElement(child)) {
      continue;
    }

    if (child.type === DirectionalBlendFrom) {
      fromLayer = child.props.children;
      continue;
    }

    if (child.type === DirectionalBlendTo) {
      toLayer = child.props.children;
    }
  }

  if (fromLayer == null || toLayer == null) {
    fromLayer = fromLayer ?? childArray[0] ?? null;
    toLayer = toLayer ?? childArray[1] ?? null;
  }

  return {
    fromLayer,
    toLayer
  };
}

function buildMask(t: number, direction: Direction, featherPx: number): string {
  const progress = clamp(t, 0, 1);
  const featherPercent = clamp((featherPx / CANVAS_WIDTH) * 100, 0.2, 22);

  if (direction === "right") {
    const pivot = progress * 100;
    const start = clamp(pivot - featherPercent * 0.5, 0, 100);
    const end = clamp(pivot + featherPercent * 0.5, 0, 100);
    return `linear-gradient(to right, #000 0%, #000 ${start}%, transparent ${end}%, transparent 100%)`;
  }

  const pivot = 100 - progress * 100;
  const start = clamp(pivot - featherPercent * 0.5, 0, 100);
  const end = clamp(pivot + featherPercent * 0.5, 0, 100);
  return `linear-gradient(to right, transparent 0%, transparent ${start}%, #000 ${end}%, #000 100%)`;
}

const layerStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%"
};

type DirectionalBlendComponent = ((props: DirectionalBlendProps) => ReactElement) & {
  From: typeof DirectionalBlendFrom;
  To: typeof DirectionalBlendTo;
};

const DirectionalBlendBase = ({ t, direction, featherPx = 72, children }: DirectionalBlendProps) => {
  const progress = clamp(t, 0, 1);
  const { fromLayer, toLayer } = parseLayers(children);

  if (toLayer == null || progress <= 0) {
    return <>{fromLayer}</>;
  }

  if (fromLayer == null || progress >= 1) {
    return <>{toLayer}</>;
  }

  const maskImage = buildMask(progress, direction, featherPx);

  return (
    <div style={layerStyle}>
      <div style={layerStyle}>{fromLayer}</div>
      <div
        style={{
          ...layerStyle,
          maskImage,
          WebkitMaskImage: maskImage,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
          willChange: "mask-image, -webkit-mask-image"
        }}
      >
        {toLayer}
      </div>
    </div>
  );
};

export const DirectionalBlend = DirectionalBlendBase as DirectionalBlendComponent;
DirectionalBlend.From = DirectionalBlendFrom;
DirectionalBlend.To = DirectionalBlendTo;
