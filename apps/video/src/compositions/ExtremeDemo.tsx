import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatRig, lookAt, move, pointAt } from "../character/EraserCatRig";
import { CameraRig, type CameraPreset } from "../effects/CameraRig";
import { KineticText } from "../effects/KineticText";
import { MotionBlurGhost } from "../effects/MotionBlurGhost";
import { ParallaxScene } from "../effects/ParallaxScene";
import { CoinBurst } from "../effects/Particles";
import { ScreenFx } from "../effects/ScreenFx";
import { ScribbleHighlight } from "../effects/ScribbleHighlight";
import { FlashCut, GlitchOverlay } from "../effects/Transitions";
import { createBarChartLayout } from "../templates/BarChart";
import type { BarDatum } from "../templates/chartTypes";

const WIDTH = 1920;
const HEIGHT = 1080;

const DATA: BarDatum[] = [
  { label: "Alpha", value: 44, color: "#38BDF8" },
  { label: "Beta", value: 71, color: "#4ADE80" },
  { label: "Gamma", value: 128, color: "#FACC15" },
  { label: "Delta", value: 82, color: "#FB7185" },
  { label: "Omega", value: 63, color: "#A78BFA" }
];

const layout = createBarChartLayout({
  width: WIDTH,
  height: HEIGHT,
  data: DATA,
  maxValue: 140,
  safeArea: {
    top: 54,
    right: 110,
    bottom: 64,
    left: 110
  },
  barGap: 36
});

const TARGET_INDEX = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const BackgroundLayer = () => {
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 16%, rgba(115, 208, 255, 0.24) 0%, rgba(115, 208, 255, 0) 52%), radial-gradient(circle at 84% 82%, rgba(255, 210, 80, 0.18) 0%, rgba(255, 210, 80, 0) 48%), linear-gradient(160deg, #102445 0%, #0a1730 44%, #070c1d 100%)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: -120,
          top: 90,
          width: 760,
          height: 760,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 0 120px rgba(80, 158, 255, 0.16)"
        }}
      />

      <div
        style={{
          position: "absolute",
          right: -160,
          top: 200,
          width: 680,
          height: 680,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.05)"
        }}
      />
    </AbsoluteFill>
  );
};

const ForegroundMaskLayer = () => {
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 710,
          top: 0,
          width: 170,
          height: HEIGHT,
          background: "linear-gradient(180deg, rgba(54,39,27,0.92) 0%, rgba(39,28,20,0.95) 100%)",
          boxShadow: "10px 0 20px rgba(0, 0, 0, 0.38)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 114,
          background: "linear-gradient(180deg, rgba(18, 15, 9, 0) 0%, rgba(22, 18, 12, 0.88) 100%)"
        }}
      />
    </AbsoluteFill>
  );
};

export const ExtremeDemoComposition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introEnd = Math.round(2 * fps);
  const chartEnd = introEnd + Math.round(8 * fps);
  const emphasisEnd = chartEnd + Math.round(3 * fps);
  const outroStart = emphasisEnd;

  const targetTop = layout.getBarAnchor(TARGET_INDEX, "top");
  const targetBar = layout.bars[TARGET_INDEX];

  const introZoom = interpolate(frame, [0, introEnd], [1.32, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const introPanX = interpolate(frame, [0, introEnd], [110, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const introPanY = interpolate(frame, [0, introEnd], [-46, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const inWhipWindow = frame >= outroStart && frame <= outroStart + 20;
  const inShakeWindow = frame >= chartEnd && frame < emphasisEnd;
  const inWalkWindow = frame >= introEnd + 40 && frame < chartEnd;

  let cameraPreset: CameraPreset = "slow_push";
  if (inWhipWindow) {
    cameraPreset = "whip-pan-right";
  } else if (inShakeWindow) {
    cameraPreset = "shake";
  }

  const whipProgress = inWhipWindow ? clamp((frame - outroStart) / 20, 0, 1) : 0;

  const enterSpring = spring({
    frame,
    fps,
    config: {
      damping: 9,
      stiffness: 118,
      mass: 0.7
    }
  });

  const enterT = clamp(enterSpring, 0, 1);
  const introBounce = Math.sin(Math.PI * enterT * 3.4) * (1 - enterT) * 118;
  const walkProgress = clamp((frame - (introEnd + 40)) / Math.max(1, chartEnd - (introEnd + 40)), 0, 1);

  const baseCatX = layout.plot.x - 240;
  const baseCatY = layout.plot.baselineY + 106;

  const walkX = lerp(baseCatX - 36, baseCatX + 34, walkProgress);

  const catX =
    frame < introEnd
      ? baseCatX + interpolate(enterT, [0, 1], [-420, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })
      : inWalkWindow
        ? walkX + Math.sin(frame * 0.38) * 8
        : baseCatX + Math.sin((frame - introEnd) * 0.06) * 6;

  const catY =
    frame < introEnd
      ? baseCatY - introBounce
      : baseCatY + Math.sin(frame * 0.22) * (inWalkWindow ? 9 : 4);

  const handTarget = {
    x: targetTop.x + Math.sin(frame * 0.17) * 3,
    y: targetTop.y - 20 + Math.cos(frame * 0.21) * 2
  };

  const catPose =
    frame >= introEnd + 18
      ? pointAt(handTarget, lookAt(handTarget, move(catX, catY)))
      : lookAt({ x: WIDTH * 0.55, y: HEIGHT * 0.37 }, move(catX, catY));

  const laserOpacity = interpolate(frame, [introEnd + 24, introEnd + 50, emphasisEnd, emphasisEnd + 12], [0, 0.95, 0.95, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const overlayOpacity = interpolate(frame, [outroStart + 6, outroStart + 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const parallaxCamera = {
    x: introPanX * 0.35 + Math.sin(frame * 0.03) * 12,
    y: introPanY * 0.35 + Math.cos(frame * 0.027) * 8,
    zoom: 1 + (introZoom - 1) * 0.18 + Math.sin(frame * 0.012) * 0.01
  };

  const chartLayer = (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: layout.plot.x,
          top: layout.plot.y,
          width: layout.plot.width,
          height: layout.plot.height,
          borderRadius: 22,
          border: "2px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.04)"
        }}
      />

      {[0.2, 0.4, 0.6, 0.8].map((lineRatio) => (
        <div
          key={`grid-${lineRatio}`}
          style={{
            position: "absolute",
            left: layout.plot.x,
            top: layout.plot.y + layout.plot.height * lineRatio,
            width: layout.plot.width,
            height: 2,
            background: "rgba(255, 255, 255, 0.08)"
          }}
        />
      ))}

      {layout.bars.map((bar, index) => {
        const growth = spring({
          frame: frame - (introEnd + 8 + index * 6),
          fps,
          config: {
            damping: 10,
            stiffness: 120,
            mass: 0.62
          }
        });

        const growthRatio = clamp(growth, 0, 1.18);
        const valueRatio = clamp(growth, 0, 1);
        const grownHeight = bar.height * growthRatio;
        const top = layout.plot.baselineY - grownHeight;
        const isTarget = index === TARGET_INDEX;
        const pulse = isTarget ? 1 + Math.sin(frame * 0.24) * 0.04 : 1;

        return (
          <div key={`${bar.label}-${index}`}>
            <div
              style={{
                position: "absolute",
                left: bar.x,
                top,
                width: bar.width,
                height: grownHeight,
                transform: `scale(${pulse.toFixed(4)})`,
                transformOrigin: "50% 100%",
                borderRadius: 16,
                background: isTarget
                  ? `linear-gradient(180deg, ${bar.color}, rgba(255, 255, 255, 0.95) 200%)`
                  : `linear-gradient(180deg, ${bar.color}, rgba(11, 15, 32, 0.5) 180%)`,
                boxShadow: isTarget
                  ? "0 0 0 3px rgba(255,255,255,0.45), 0 24px 50px rgba(250, 208, 32, 0.3)"
                  : "0 20px 40px rgba(0, 0, 0, 0.3)"
              }}
            />
            <div
              style={{
                position: "absolute",
                left: bar.x + bar.width / 2,
                top: top - 42,
                transform: "translateX(-50%)",
                fontSize: 34,
                letterSpacing: 0.8,
                color: "#FFFFFF",
                textShadow: "0 4px 18px rgba(0, 0, 0, 0.5)"
              }}
            >
              {Math.round(bar.value * valueRatio)}
            </div>
            <div
              style={{
                position: "absolute",
                left: bar.x + bar.width / 2,
                top: layout.plot.baselineY + 20,
                transform: "translateX(-50%)",
                color: isTarget ? "#FFE48C" : "#CAD6F6",
                fontSize: 28,
                letterSpacing: 0.6,
                textTransform: "uppercase"
              }}
            >
              {bar.label}
            </div>
          </div>
        );
      })}

      <ScribbleHighlight
        width={WIDTH}
        height={HEIGHT}
        startFrame={chartEnd + 6}
        durationInFrames={54}
        rect={{
          x: targetBar.x - 26,
          y: targetBar.y - 14,
          width: targetBar.width + 52,
          height: targetBar.height + 28
        }}
      />
    </AbsoluteFill>
  );

  const characterLayer = (
    <AbsoluteFill>
      <MotionBlurGhost
        strength={inWalkWindow || inWhipWindow ? 0.68 : 0.24}
        samples={inWalkWindow || inWhipWindow ? 5 : 3}
        dx={inWalkWindow ? 24 : inWhipWindow ? 34 : 8}
        dy={inWalkWindow ? 3 : 0}
      >
        <EraserCatRig pose={catPose} targetPoint={handTarget} animationMode="alive" seed="extreme-demo" />
      </MotionBlurGhost>

      <svg
        width={WIDTH}
        height={HEIGHT}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          overflow: "visible",
          pointerEvents: "none"
        }}
      >
        <line
          x1={catX + 180}
          y1={catY - 26}
          x2={targetTop.x}
          y2={targetTop.y - 4}
          stroke="url(#laser)"
          strokeWidth={6}
          strokeLinecap="round"
          opacity={laserOpacity}
        />
        <circle cx={targetTop.x} cy={targetTop.y - 4} r={11} fill="#FFFFFF" opacity={laserOpacity * 0.75} />
        <defs>
          <linearGradient id="laser" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(86, 252, 255, 0.25)" />
            <stop offset="46%" stopColor="rgba(86, 252, 255, 1)" />
            <stop offset="100%" stopColor="rgba(255, 248, 166, 0.96)" />
          </linearGradient>
        </defs>
      </svg>
    </AbsoluteFill>
  );

  return (
    <AbsoluteFill
      style={{
        color: "#F8FBFF",
        fontFamily: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
        overflow: "hidden"
      }}
    >
      <CameraRig
        pan={{ x: frame < introEnd ? introPanX : 0, y: frame < introEnd ? introPanY : 0 }}
        zoom={frame < introEnd ? introZoom : 1.01}
        rotateDeg={Math.sin(frame * 0.03) * 0.25}
        shake={inShakeWindow ? { intensity: 6, speed: 1.25, rotationIntensityDeg: 0.8 } : undefined}
        preset={cameraPreset}
        presetProgress={whipProgress}
      >
        <ParallaxScene
          camera={parallaxCamera}
          layers={[
            {
              depth: 0.2,
              render: <BackgroundLayer />
            },
            {
              depth: 0.92,
              render: chartLayer
            },
            {
              depth: 1.05,
              render: characterLayer
            },
            {
              depth: 1.62,
              render: <ForegroundMaskLayer />
            }
          ]}
        />

        <AbsoluteFill>
          <div
            style={{
              position: "absolute",
              left: layout.safeArea.left,
              top: layout.safeArea.top - 2,
              fontSize: 58,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              textShadow: "0 8px 30px rgba(0, 0, 0, 0.45)"
            }}
          >
            Extreme Profit Burst
          </div>

          <div
            style={{
              position: "absolute",
              left: layout.safeArea.left,
              top: layout.safeArea.top + 62,
              color: "#C6D6F4",
              fontSize: 28,
              letterSpacing: 0.6
            }}
          >
            CINEMATIC MOTION TOOLKIT DEMO
          </div>

          <KineticText
            text="ERASER CAT GOES MAX MODE"
            fromFrame={8}
            emphasisWords={["MAX", "MODE"]}
            fontSize={84}
            style={{
              position: "absolute",
              left: layout.safeArea.left,
              top: 180,
              maxWidth: 1180,
              opacity: interpolate(frame, [0, introEnd - 8, introEnd + 20], [0, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp"
              })
            }}
          />

          <CoinBurst
            startFrame={chartEnd + 20}
            durationInFrames={56}
            origin={{ x: targetTop.x, y: targetTop.y - 14 }}
            count={44}
            gravity={0.5}
            spreadDeg={152}
            seed={11}
          />

          <FlashCut startFrame={0} durationInFrames={8} maxOpacity={1} />
          <FlashCut startFrame={outroStart} durationInFrames={7} maxOpacity={0.9} />
          <GlitchOverlay startFrame={chartEnd + 2} durationInFrames={24} intensity={1.15} bars={15} />
        </AbsoluteFill>
      </CameraRig>

      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: overlayOpacity,
          justifyContent: "center",
          alignItems: "center",
          background:
            "linear-gradient(140deg, rgba(7, 12, 24, 0.92) 0%, rgba(15, 17, 38, 0.92) 58%, rgba(43, 20, 7, 0.9) 100%)"
        }}
      >
        <KineticText
          text="SUBSCRIBE FOR THE NEXT BREAKDOWN"
          fromFrame={outroStart + 10}
          emphasisWords={["SUBSCRIBE", "NEXT"]}
          fontSize={92}
          style={{
            maxWidth: 1600,
            justifyContent: "center"
          }}
        />

        <div
          style={{
            position: "absolute",
            bottom: 160,
            fontSize: 34,
            letterSpacing: 1.2,
            color: "#E9F0FF",
            textTransform: "uppercase"
          }}
        >
          Build fast. Render loud.
        </div>
      </AbsoluteFill>

      <ScreenFx grainOpacity={0.14} scanlineOpacity={0.2} vignetteOpacity={0.48} tintOpacity={0.07} />
    </AbsoluteFill>
  );
};
