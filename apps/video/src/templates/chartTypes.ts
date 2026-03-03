export type Vec2 = {
  x: number;
  y: number;
};

export type SafeArea = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type BarDatum = {
  label: string;
  value: number;
  color?: string;
};

export type BarAnchorKind = "top" | "center" | "label";

export type BarRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  label: string;
  color: string;
};

export type ChartLayout = {
  safeArea: SafeArea;
  plot: {
    x: number;
    y: number;
    width: number;
    height: number;
    baselineY: number;
  };
  bars: BarRect[];
  getBarAnchor(index: number, kind?: BarAnchorKind): Vec2;
};

