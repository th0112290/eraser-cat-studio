import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CameraRig, type CinematicCameraPreset } from "../effects/CameraRig";
import { CrossFade, FlashCut, GlitchOverlay, whipPan } from "../effects/Transitions";

const WIDTH = 1920;
const HEIGHT = 1080;
const SCENE_DURATION = 96;
const TRANSITION_DURATION = 14;

type SceneSpec = {
  preset: CinematicCameraPreset;
  title: string;
  subtitle: string;
  accentColor: string;
};

const SCENES: SceneSpec[] = [
  {
    preset: "static",
    title: "STATIC",
    subtitle: "clean baseline framing",
    accentColor: "#8FB7FF"
  },
  {
    preset: "slow_push",
    title: "SLOW PUSH",
    subtitle: "gradual cinematic pressure",
    accentColor: "#8FFFD9"
  },
  {
    preset: "handheld",
    title: "HANDHELD",
    subtitle: "micro energy from deterministic shake",
    accentColor: "#FFE28F"
  },
  {
    preset: "whip_pan",
    title: "WHIP PAN",
    subtitle: "aggressive directional transition",
    accentColor: "#FFB08F"
  },
  {
    preset: "snap_zoom",
    title: "SNAP ZOOM",
    subtitle: "impact zoom with settle",
    accentColor: "#D4A0FF"
  }
];

const CHART_VALUES = [58, 92, 77, 122, 68];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getSceneWindow(index: number): { start: number; end: number } {
  const start = index * SCENE_DURATION;
  return {
    start,
    end: start + SCENE_DURATION - 1
  };
}

function resolveActiveScene(frame: number): number {
  return clamp(Math.floor(frame / SCENE_DURATION), 0, SCENES.length - 1);
}

type ShowcaseLayerProps = {
  scene: SceneSpec;
  t: number;
};

const ShowcaseLayer = ({ scene, t }: ShowcaseLayerProps) => {
  const maxValue = Math.max(...CHART_VALUES);

  return (
    <CameraRig width={WIDTH} height={HEIGHT} preset={scene.preset} seed={`camera-showcase-${scene.preset}`} t={t}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 20% 18%, rgba(124, 184, 255, 0.18), transparent 44%), linear-gradient(160deg, #0A1020 0%, #111A30 54%, #07111F 100%)",
          color: "#F3F7FF",
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 90,
            top: 76,
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: 1.2,
            color: scene.accentColor,
            textShadow: "0 8px 28px rgba(0, 0, 0, 0.45)"
          }}
        >
          {scene.title}
        </div>

        <div
          style={{
            position: "absolute",
            left: 92,
            top: 152,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: 0.4,
            color: "#CFDCF5"
          }}
        >
          {scene.subtitle}
        </div>

        <div
          style={{
            position: "absolute",
            left: 94,
            top: 210,
            fontSize: 24,
            color: "#8EA5CC"
          }}
        >
          same layout, different camera behavior
        </div>

        <div
          style={{
            position: "absolute",
            left: 740,
            top: 190,
            width: 1050,
            height: 620,
            borderRadius: 24,
            border: "2px solid rgba(255, 255, 255, 0.18)",
            background: "linear-gradient(180deg, rgba(7, 13, 24, 0.8), rgba(9, 15, 26, 0.92))"
          }}
        >
          {CHART_VALUES.map((value, index) => {
            const ratio = value / maxValue;
            const barWidth = 130;
            const gap = 52;
            const height = 460 * ratio;
            const x = 80 + index * (barWidth + gap);
            const y = 112 + (460 - height);
            const isTarget = index === 2;

            return (
              <div key={`bar-${index}`}>
                <div
                  style={{
                    position: "absolute",
                    left: x,
                    top: y,
                    width: barWidth,
                    height,
                    borderRadius: 14,
                    background: isTarget
                      ? "linear-gradient(180deg, #FFE883 0%, #FFBA53 100%)"
                      : "linear-gradient(180deg, #7FB8FF 0%, #28507C 100%)",
                    boxShadow: isTarget
                      ? "0 0 0 2px rgba(255, 241, 179, 0.75), 0 0 30px rgba(255, 186, 83, 0.35)"
                      : "0 18px 28px rgba(0, 0, 0, 0.32)"
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: x + barWidth / 2,
                    top: y - 42,
                    transform: "translateX(-50%)",
                    fontSize: 32,
                    fontWeight: 700,
                    color: "#EEF5FF"
                  }}
                >
                  {value}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            left: 300,
            top: 596,
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, #FFF2CF 0%, #F7C35D 55%, #B16C29 100%)",
            boxShadow: "0 24px 42px rgba(0, 0, 0, 0.35)"
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 340,
            top: 720,
            width: 240,
            height: 130,
            borderRadius: 80,
            background: "#334663"
          }}
        />

        <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <line x1={520} y1={652} x2={1124} y2={346} stroke="rgba(255,255,255,0.7)" strokeWidth={4} strokeDasharray="8 8" />
          <circle cx={1124} cy={346} r={10} fill="#FFFFFF" fillOpacity={0.9} />
        </svg>
      </AbsoluteFill>
    </CameraRig>
  );
};

export const CameraShowcaseComposition = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const activeIndex = resolveActiveScene(frame);
  const activeWindow = getSceneWindow(activeIndex);
  const activeLocalT = clamp((frame - activeWindow.start) / Math.max(1, SCENE_DURATION - 1), 0, 1);

  const whipBoundary = getSceneWindow(3).start;
  const whipStart = whipBoundary - TRANSITION_DURATION;
  const whipEnd = whipBoundary + 2;
  const inWhipOverlay = frame >= whipStart && frame <= whipEnd;
  const whipT = clamp((frame - whipStart) / Math.max(1, whipEnd - whipStart), 0, 1);
  const whipFx = whipPan(whipT, "right");

  return (
    <AbsoluteFill style={{ backgroundColor: "#050B16", overflow: "hidden" }}>
      <ShowcaseLayer scene={SCENES[activeIndex]} t={activeLocalT} />

      {SCENES.slice(1).map((scene, offset) => {
        const index = offset + 1;
        const boundary = getSceneWindow(index).start;
        const start = boundary - TRANSITION_DURATION;
        const end = boundary;

        if (frame < start || frame > end) {
          return null;
        }

        return (
          <CrossFade
            key={`cross-${scene.preset}`}
            startFrame={start}
            durationInFrames={TRANSITION_DURATION}
            from={<ShowcaseLayer scene={SCENES[index - 1]} t={1} />}
            to={<ShowcaseLayer scene={scene} t={0} />}
          />
        );
      })}

      <FlashCut startFrame={getSceneWindow(1).start - 5} durationInFrames={7} maxOpacity={0.75} />
      <FlashCut startFrame={getSceneWindow(4).start - 4} durationInFrames={7} maxOpacity={0.7} />
      <GlitchOverlay
        startFrame={getSceneWindow(3).start - 6}
        durationInFrames={18}
        intensity={1.05}
        bars={15}
      />

      {inWhipOverlay ? (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            opacity: whipFx.opacity * 0.55,
            transform: `translateX(${whipFx.x.toFixed(1)}px) rotate(${whipFx.rotDeg.toFixed(2)}deg)`,
            filter: `blur(${whipFx.blurPx.toFixed(2)}px)`
          }}
        >
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.42), rgba(255,255,255,0))",
              mixBlendMode: "screen"
            }}
          />
        </AbsoluteFill>
      ) : null}

      <div
        style={{
          position: "absolute",
          right: 34,
          bottom: 28,
          padding: "10px 14px",
          borderRadius: 10,
          background: "rgba(5, 10, 19, 0.62)",
          color: "#A8BEDF",
          fontSize: 20,
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
        }}
      >
        CAMERA-SHOWCASE | frame {frame + 1} / {durationInFrames}
      </div>
    </AbsoluteFill>
  );
};