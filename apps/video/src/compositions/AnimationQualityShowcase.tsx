import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatRig, lookAt, move, pointAt } from "../character/EraserCatRig";
import { EraserCatViewBlend } from "../character/EraserCatViewBlend";
import { turningCharacterPack } from "../character/pack";
import { CameraRig, type CameraRigKeyframe } from "../effects/CameraRig";
import { KineticText } from "../effects/KineticText";
import { MotionBlurGhost } from "../effects/MotionBlurGhost";
import { CoinBurst } from "../effects/Particles";
import { ScreenFx } from "../effects/ScreenFx";
import { ScribbleHighlight } from "../effects/ScribbleHighlight";
import { Smear } from "../effects/Smear";
import { CrossFade, FlashCut, GlitchOverlay } from "../effects/Transitions";
import { createBarChartLayout } from "../templates/BarChart";
import { barDemoData } from "../templates/fixtures/barDemoData";

const WIDTH = 1920;
const HEIGHT = 1080;

const INTRO_END = 180;
const TURN_END = 360;
const CHART_END = 570;
const OUTRO_END = 720;
const TARGET_BAR_INDEX = 2;

const TALK_LINE =
  "Eraser Cat tracks the data, turns on cue, and points right when the highlight lands.";

const chartLayout = createBarChartLayout({
  width: WIDTH,
  height: HEIGHT,
  data: barDemoData,
  maxValue: 100,
  safeArea: {
    top: 58,
    right: 120,
    bottom: 70,
    left: 106
  },
  barGap: 34
});

const cameraKeyframes: CameraRigKeyframe[] = [
  { f: 0, x: -14, y: -12, zoom: 1.01, rot: 0.1, shake: 0.08 },
  { f: INTRO_END - 8, x: -34, y: -18, zoom: 1.09, rot: 0.08, shake: 0.11 },
  { f: INTRO_END + 52, x: -10, y: -6, zoom: 1.04, rot: 0.15, shake: 0.28 },
  { f: TURN_END - 8, x: 2, y: -10, zoom: 1.03, rot: -0.05, shake: 0.3 },
  { f: CHART_END - 20, x: 20, y: -14, zoom: 1.08, rot: -0.16, shake: 0.18 },
  { f: CHART_END + 18, x: 760, y: -26, zoom: 1.11, rot: 8.3, shake: 1.2 },
  { f: CHART_END + 52, x: -170, y: 12, zoom: 1.03, rot: -1.4, shake: 0.42 },
  { f: OUTRO_END - 1, x: 0, y: 0, zoom: 1.06, rot: 0, shake: 0.12 }
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pulseAt(frame: number, center: number, radius: number): number {
  return clamp(1 - Math.abs(frame - center) / Math.max(1, radius), 0, 1);
}

export const AnimationQualityShowcaseComposition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introCatX = chartLayout.plot.x - 252;
  const introCatY = chartLayout.plot.baselineY + 116;

  const turnT = clamp((frame - INTRO_END) / Math.max(1, TURN_END - INTRO_END), 0, 1);
  const turnYaw = interpolate(turnT, [0, 0.72, 1], [0, 1.08, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const turnX = introCatX + interpolate(turnT, [0, 1], [0, 156], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const turnY = introCatY + Math.sin((frame - INTRO_END) * 0.17) * 8;

  const turnDx =
    frame >= INTRO_END && frame <= TURN_END
      ? 6.8 + Math.cos(frame * 0.31) * 3.6
      : 0;
  const turnDy =
    frame >= INTRO_END && frame <= TURN_END
      ? Math.sin(frame * 0.29) * 2.2
      : 0;
  const turnSpeed = Math.hypot(turnDx, turnDy);

  const highlightAnchor = chartLayout.getBarAnchor(TARGET_BAR_INDEX, "top");
  const pointTarget = {
    x: highlightAnchor.x,
    y: highlightAnchor.y - 10
  };

  const chartCatX = chartLayout.plot.x - 128;
  const chartCatY = chartLayout.plot.baselineY + 116;
  const chartBreath = Math.sin(frame * 0.11) * 3;

  const introPose = lookAt(
    {
      x: WIDTH * 0.58,
      y: HEIGHT * 0.36
    },
    move(introCatX + Math.sin(frame * 0.06) * 8, introCatY + chartBreath)
  );

  const turnPose = lookAt(
    {
      x: WIDTH * 0.76,
      y: HEIGHT * 0.42
    },
    move(turnX, turnY)
  );

  const chartPose = pointAt(
    pointTarget,
    lookAt(
      pointTarget,
      move(chartCatX + Math.sin((frame - TURN_END) * 0.05) * 5, chartCatY + chartBreath)
    )
  );

  const introOpacity = interpolate(frame, [0, INTRO_END - 16, INTRO_END + 14], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const turnOpacity = interpolate(
    frame,
    [INTRO_END - 14, INTRO_END + 8, TURN_END - 14, TURN_END + 12],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }
  );

  const chartOpacity = interpolate(frame, [TURN_END - 10, TURN_END + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const chartLayerOpacity = interpolate(frame, [TURN_END - 20, TURN_END + 18, CHART_END + 24], [0, 1, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const barsAppearStart = TURN_END + 12;
  const emphasisFrame = TURN_END + 92;

  const titleOpacity = interpolate(frame, [0, 16, INTRO_END - 20, INTRO_END + 10], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const ctaOpacity = interpolate(frame, [CHART_END + 10, CHART_END + 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 24% 20%, #2C4067 0%, #17223D 54%, #0A1122 100%)",
        color: "#EFF4FF",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        overflow: "hidden"
      }}
    >
      <CameraRig width={WIDTH} height={HEIGHT} keyframes={cameraKeyframes} seed="animation-quality-showcase" preset="static">
        <AbsoluteFill>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 84% 16%, rgba(255, 216, 118, 0.08), transparent 42%), radial-gradient(circle at 16% 74%, rgba(121, 203, 255, 0.12), transparent 48%)"
            }}
          />

          <div
            style={{
              position: "absolute",
              left: chartLayout.plot.x,
              top: chartLayout.plot.y,
              width: chartLayout.plot.width,
              height: chartLayout.plot.height,
              borderRadius: 24,
              border: "2px solid rgba(255, 255, 255, 0.16)",
              background: "linear-gradient(180deg, rgba(8, 14, 26, 0.3), rgba(8, 13, 23, 0.54))",
              opacity: chartLayerOpacity
            }}
          />

          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <div
              key={`grid-${ratio}`}
              style={{
                position: "absolute",
                left: chartLayout.plot.x,
                top: chartLayout.plot.y + chartLayout.plot.height * ratio,
                width: chartLayout.plot.width,
                height: 2,
                background: "rgba(255, 255, 255, 0.09)",
                opacity: chartLayerOpacity
              }}
            />
          ))}

          {chartLayout.bars.map((bar, index) => {
            const grow = spring({
              frame: frame - (barsAppearStart + index * 4),
              fps,
              config: {
                damping: 11,
                stiffness: 130,
                mass: 0.68
              }
            });
            const growRatio = clamp(grow, 0, 1.16);
            const valueRatio = clamp(grow, 0, 1);
            const grownHeight = bar.height * growRatio;
            const top = chartLayout.plot.baselineY - grownHeight;
            const isTarget = index === TARGET_BAR_INDEX;
            const emphasisPulse = isTarget ? 1 + pulseAt(frame, emphasisFrame, 20) * 0.1 : 1;

            return (
              <div key={`${bar.label}-${index}`}>
                <div
                  style={{
                    position: "absolute",
                    left: bar.x,
                    top,
                    width: bar.width,
                    height: grownHeight,
                    borderRadius: 14,
                    background: isTarget
                      ? `linear-gradient(180deg, ${bar.color}, rgba(255, 255, 255, 0.92) 190%)`
                      : `linear-gradient(180deg, ${bar.color}, rgba(16, 28, 46, 0.62) 175%)`,
                    boxShadow: isTarget
                      ? "0 0 0 3px rgba(255, 245, 189, 0.75), 0 20px 36px rgba(255, 201, 89, 0.38)"
                      : "0 18px 30px rgba(0, 0, 0, 0.28)",
                    transform: `scale(${emphasisPulse.toFixed(4)})`,
                    transformOrigin: "50% 100%",
                    opacity: chartLayerOpacity
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: bar.x + bar.width / 2,
                    top: top - 36,
                    transform: "translateX(-50%)",
                    fontSize: 32,
                    fontWeight: 700,
                    color: "#EEF5FF",
                    opacity: chartLayerOpacity
                  }}
                >
                  {Math.round(bar.value * valueRatio)}
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: bar.x + bar.width / 2,
                    top: chartLayout.plot.baselineY + 22,
                    transform: "translateX(-50%)",
                    fontSize: 25,
                    color: "#C9D8F2",
                    opacity: chartLayerOpacity
                  }}
                >
                  {bar.label}
                </div>
              </div>
            );
          })}

          <svg
            width={WIDTH}
            height={HEIGHT}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              pointerEvents: "none"
            }}
          >
            <line
              x1={chartCatX + 170}
              y1={chartCatY - 52}
              x2={pointTarget.x}
              y2={pointTarget.y}
              stroke="rgba(255, 255, 255, 0.74)"
              strokeWidth={3}
              strokeDasharray="8 8"
              opacity={chartOpacity}
            />
            <circle cx={pointTarget.x} cy={pointTarget.y} r={9} fill="#FFFFFF" fillOpacity={0.9 * chartOpacity} />
          </svg>

          <ScribbleHighlight
            width={WIDTH}
            height={HEIGHT}
            rect={{
              x: chartLayout.bars[TARGET_BAR_INDEX].x - 22,
              y: chartLayout.bars[TARGET_BAR_INDEX].y - 16,
              width: chartLayout.bars[TARGET_BAR_INDEX].width + 44,
              height: chartLayout.bars[TARGET_BAR_INDEX].height + 32
            }}
            startFrame={emphasisFrame}
            durationInFrames={20}
            color="#FFF08C"
            strokeWidth={7}
          />

          <CoinBurst
            startFrame={emphasisFrame + 10}
            origin={{ x: pointTarget.x, y: pointTarget.y - 8 }}
            durationInFrames={58}
            count={42}
            gravity={0.52}
            spreadDeg={150}
            seed={17}
          />

          <AbsoluteFill style={{ opacity: introOpacity }}>
            <EraserCatRig
              pose={introPose}
              animationMode="alive"
              seed="showcase-intro"
              talkText={TALK_LINE}
            />
          </AbsoluteFill>

          <AbsoluteFill style={{ opacity: turnOpacity }}>
            <MotionBlurGhost
              strength={clamp(turnSpeed / 14, 0, 1)}
              samples={4}
              dx={turnDx}
              dy={turnDy}
            >
              <Smear
                active={turnOpacity > 0.08 && turnSpeed > 1.8}
                amount={clamp(turnSpeed * 8.2, 0, 96)}
                direction={{ x: turnDx, y: turnDy }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0
                  }}
                >
                  <EraserCatViewBlend
                    pose={turnPose}
                    yaw={turnYaw}
                    pack={turningCharacterPack}
                    useOpacityBlend={false}
                    featherPx={90}
                  />
                </div>
              </Smear>
            </MotionBlurGhost>
          </AbsoluteFill>

          <AbsoluteFill style={{ opacity: chartOpacity }}>
            <EraserCatRig
              pose={chartPose}
              targetPoint={pointTarget}
              animationMode="alive"
              seed="showcase-chart"
              talkText={TALK_LINE}
            />
          </AbsoluteFill>

          <AbsoluteFill
            style={{
              opacity: titleOpacity,
              pointerEvents: "none"
            }}
          >
            <KineticText
              text="ANIMATION QUALITY SHOWCASE"
              fromFrame={12}
              emphasisWords={["QUALITY", "SHOWCASE"]}
              fontSize={86}
              style={{
                position: "absolute",
                left: chartLayout.safeArea.left,
                top: 92,
                maxWidth: 1400
              }}
            />
            <div
              style={{
                position: "absolute",
                left: chartLayout.safeArea.left,
                top: 210,
                color: "#BED0F1",
                fontSize: 30
              }}
            >
              cinematic camera + alive rig + chart emphasis
            </div>
          </AbsoluteFill>

          <AbsoluteFill
            style={{
              opacity: ctaOpacity,
              pointerEvents: "none",
              justifyContent: "center",
              alignItems: "center"
            }}
          >
            <KineticText
              text="BUILD FAST. RENDER LOUD."
              fromFrame={CHART_END + 16}
              emphasisWords={["BUILD", "RENDER"]}
              fontSize={94}
              style={{
                maxWidth: 1600,
                justifyContent: "center"
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 152,
                color: "#EAF1FF",
                fontSize: 34,
                letterSpacing: 1.1,
                textTransform: "uppercase"
              }}
            >
              ANIMATION-QUALITY-SHOWCASE
            </div>
          </AbsoluteFill>
        </AbsoluteFill>
      </CameraRig>

      <CrossFade
        startFrame={CHART_END + 10}
        durationInFrames={22}
        from={<AbsoluteFill style={{ backgroundColor: "rgba(6, 10, 18, 0)" }} />}
        to={
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(140deg, rgba(7, 11, 22, 0.72) 0%, rgba(18, 18, 39, 0.64) 62%, rgba(36, 20, 10, 0.68) 100%)"
            }}
          />
        }
      />

      <FlashCut startFrame={0} durationInFrames={8} maxOpacity={1} />
      <FlashCut startFrame={INTRO_END - 6} durationInFrames={7} maxOpacity={0.72} />
      <FlashCut startFrame={TURN_END - 6} durationInFrames={7} maxOpacity={0.78} />
      <FlashCut startFrame={CHART_END} durationInFrames={8} maxOpacity={0.9} />
      <GlitchOverlay startFrame={CHART_END - 4} durationInFrames={18} intensity={1.1} bars={14} />

      <ScreenFx grainOpacity={0.13} scanlineOpacity={0.17} vignetteOpacity={0.44} tintOpacity={0.08} />
    </AbsoluteFill>
  );
};