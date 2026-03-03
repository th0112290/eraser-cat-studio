import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export type CoinBurstProps = {
  startFrame: number;
  origin: { x: number; y: number };
  count?: number;
  durationInFrames?: number;
  gravity?: number;
  spreadDeg?: number;
  minSpeed?: number;
  maxSpeed?: number;
  seed?: number;
  colorA?: string;
  colorB?: string;
};

type Particle = {
  angleRad: number;
  speed: number;
  radius: number;
  spin: number;
  wobble: number;
  hueMix: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash(seed: number): number {
  const raw = Math.sin(seed * 91.337 + 17.13) * 43758.5453;
  return raw - Math.floor(raw);
}

function mixColorHex(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const normalized = hex.replace("#", "");
    const full = normalized.length === 3
      ? normalized
          .split("")
          .map((c) => `${c}${c}`)
          .join("")
      : normalized;
    const value = Number.parseInt(full, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };

  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = lerp(ar, br);
  const g = lerp(ag, bg);
  const bl = lerp(ab, bb);
  return `rgb(${r}, ${g}, ${bl})`;
}

function buildParticles(count: number, spreadDeg: number, minSpeed: number, maxSpeed: number, seed: number): Particle[] {
  const halfSpread = spreadDeg / 2;

  return Array.from({ length: count }).map((_, index) => {
    const t = count <= 1 ? 0.5 : index / (count - 1);
    const baseDeg = -90 - halfSpread + spreadDeg * t;
    const jitterDeg = (hash(seed + index * 2.7) - 0.5) * 16;
    const angleRad = ((baseDeg + jitterDeg) * Math.PI) / 180;
    const speed = minSpeed + (maxSpeed - minSpeed) * (0.35 + hash(seed + index * 5.1) * 0.65);
    const radius = 7 + hash(seed + index * 7.9) * 8;
    const spin = (hash(seed + index * 9.7) - 0.5) * 24;
    const wobble = (hash(seed + index * 12.3) - 0.5) * 1.4;
    const hueMix = hash(seed + index * 15.1);

    return {
      angleRad,
      speed,
      radius,
      spin,
      wobble,
      hueMix
    };
  });
}

export const CoinBurst = ({
  startFrame,
  origin,
  count = 36,
  durationInFrames = 52,
  gravity = 0.52,
  spreadDeg = 140,
  minSpeed = 9,
  maxSpeed = 21,
  seed = 1,
  colorA = "#FFE08A",
  colorB = "#F6A623"
}: CoinBurstProps) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  if (local < 0 || local > durationInFrames) {
    return null;
  }

  const normalized = clamp(local / Math.max(1, durationInFrames), 0, 1);
  const particleCount = clamp(Math.round(count), 20, 60);
  const particles = buildParticles(particleCount, spreadDeg, minSpeed, maxSpeed, seed);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width="100%" height="100%" style={{ overflow: "visible" }}>
        {particles.map((particle, index) => {
          const vx = Math.cos(particle.angleRad) * particle.speed;
          const vy = Math.sin(particle.angleRad) * particle.speed;
          const x = origin.x + vx * local + Math.sin(local * 0.12 + index) * particle.wobble * local;
          const y = origin.y + vy * local + 0.5 * gravity * local * local;
          const opacity = interpolate(normalized, [0, 0.08, 0.75, 1], [0, 1, 0.9, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          });
          const scale = interpolate(normalized, [0, 0.2, 1], [0.35, 1, 0.62], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          });
          const rotation = particle.spin * local;
          const fill = mixColorHex(colorA, colorB, particle.hueMix);

          return (
            <g
              key={`coin-${index}`}
              transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rotation.toFixed(2)}) scale(${scale.toFixed(3)})`}
              opacity={opacity}
            >
              <ellipse
                cx={0}
                cy={0}
                rx={particle.radius}
                ry={Math.max(3, particle.radius * 0.72)}
                fill={fill}
                stroke="rgba(255, 255, 255, 0.6)"
                strokeWidth={1.6}
              />
              <ellipse
                cx={0}
                cy={-particle.radius * 0.2}
                rx={Math.max(1, particle.radius * 0.45)}
                ry={Math.max(1, particle.radius * 0.25)}
                fill="rgba(255, 255, 255, 0.25)"
              />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
