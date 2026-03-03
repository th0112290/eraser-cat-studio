import type { CSSProperties, SVGProps } from "react";

type SvgPathMorphProps = {
  fromPath: string;
  toPath: string;
  t: number;
  width: number;
  height: number;
  fill?: string;
  viewBox?: string;
  style?: CSSProperties;
  pathProps?: Omit<SVGProps<SVGPathElement>, "d" | "fill">;
};

const NUMBER_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function extractNumbers(path: string): number[] {
  const matches = path.match(NUMBER_RE);
  if (!matches) {
    return [];
  }

  return matches.map((token) => Number.parseFloat(token));
}

export function morphPath(fromPath: string, toPath: string, t: number): string {
  const progress = clamp(t, 0, 1);
  if (progress <= 0) {
    return fromPath;
  }
  if (progress >= 1) {
    return toPath;
  }

  const fromNums = extractNumbers(fromPath);
  const toNums = extractNumbers(toPath);

  if (fromNums.length === 0 || toNums.length === 0 || fromNums.length !== toNums.length) {
    return progress < 0.5 ? fromPath : toPath;
  }

  let index = 0;
  return fromPath.replace(NUMBER_RE, () => {
    const from = fromNums[index];
    const to = toNums[index];
    index += 1;
    return formatNumber(from + (to - from) * progress);
  });
}

export const SvgPathMorph = ({
  fromPath,
  toPath,
  t,
  width,
  height,
  fill = "#ffffff",
  viewBox = "0 0 100 100",
  style,
  pathProps
}: SvgPathMorphProps) => {
  const d = morphPath(fromPath, toPath, t);

  return (
    <svg
      style={{
        width,
        height,
        display: "block",
        overflow: "visible",
        ...style
      }}
      viewBox={viewBox}
      aria-hidden
    >
      <path d={d} fill={fill} {...pathProps} />
    </svg>
  );
};
