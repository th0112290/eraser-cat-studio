import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatViewBlend } from "../character/EraserCatViewBlend";
import { lookAt, move, pointAt } from "../character/EraserCatRig";
import { turningCharacterPack } from "../character/pack";
import { ParallaxScene } from "../effects/ParallaxScene";
import { ScreenFx } from "../effects/ScreenFx";
import { ContactShadow, DropShadow } from "../effects/Shadows";
import { ScribbleHighlight } from "../effects/ScribbleHighlight";
import { FlashCut } from "../effects/Transitions";
import { createBarChartLayout } from "../templates/BarChart";
import { barDemoData } from "../templates/fixtures/barDemoData";

const WIDTH = 1920;
const HEIGHT = 1080;
const TARGET_BAR_INDEX = 2;

const chartLayout = createBarChartLayout({
  width: WIDTH,
  height: HEIGHT,
  data: barDemoData,
  maxValue: 100,
  safeArea: {
    top: 56,
    right: 122,
    bottom: 68,
    left: 106
  },
  barGap: 36
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pulse(frame: number, center: number, radius: number): number {
  return clamp(1 - Math.abs(frame - center) / Math.max(1, radius), 0, 1);
}

export const DepthAndShadowShowcaseComposition = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const introEnd = Math.round(4 * fps);
  const turnEnd = Math.round(8.5 * fps);
  const pointEnd = Math.round(15 * fps);
  const outroStart = Math.round(17.5 * fps);

  const pointTarget = chartLayout.getBarAnchor(TARGET_BAR_INDEX, "top");

  const walkT = clamp(frame / Math.max(1, pointEnd), 0, 1);
  const catX =
    interpolate(walkT, [0, 1], [chartLayout.plot.x - 320, chartLayout.plot.x - 132], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }) + Math.sin(frame * 0.18) * 4;
  const catY = chartLayout.plot.baselineY + 118 + Math.abs(Math.sin(frame * 0.4)) * 6 + Math.sin(frame * 0.08) * 2;

  const turnSpring = spring({
    frame: frame - introEnd,
    fps,
    config: {
      damping: 14,
      stiffness: 105,
      mass: 0.8
    }
  });

  let yaw = 0;
  if (frame < introEnd) {
    yaw = 0;
  } else if (frame < turnEnd) {
    yaw = interpolate(clamp(turnSpring, 0, 1), [0, 1], [0, 0.92], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
  } else if (frame < pointEnd) {
    yaw = interpolate(frame, [turnEnd, pointEnd], [0.92, 0.12], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
  } else {
    yaw = 0.12 + Math.sin(frame * 0.07) * 0.03;
  }

  const isPointing = frame >= turnEnd + 24;

  const pose = isPointing
    ? pointAt(
        {
          x: pointTarget.x,
          y: pointTarget.y - 10
        },
        lookAt(
          {
            x: pointTarget.x,
            y: pointTarget.y - 10
          },
          move(catX, catY)
        )
      )
    : lookAt(
        {
          x: WIDTH * 0.62,
          y: HEIGHT * 0.42
        },
        move(catX, catY)
      );

  const camera = {
    x: interpolate(frame, [0, durationInFrames - 1], [0, 28], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }),
    y: interpolate(frame, [0, durationInFrames - 1], [0, -12], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }),
    zoom: interpolate(frame, [0, durationInFrames - 1], [1, 1.07], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    })
  };

  const titleOpacity = interpolate(frame, [0, 12, introEnd - 24, introEnd + 14], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const chartAppear = interpolate(frame, [introEnd - 20, introEnd + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const emphasisFrame = turnEnd + 78;
  const ctaOpacity = interpolate(frame, [outroStart + 8, durationInFrames - 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const backgroundLayer = (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 18% 18%, rgba(131, 196, 255, 0.16), transparent 44%), radial-gradient(circle at 84% 84%, rgba(250, 216, 126, 0.14), transparent 42%), linear-gradient(160deg, #0F1A30 0%, #131F38 56%, #0B1224 100%)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 120,
          top: 110,
          width: 420,
          height: 220,
          borderRadius: 999,
          background: "rgba(149, 213, 255, 0.08)",
          filter: "blur(22px)"
        }}
      />

      <div
        style={{
          position: "absolute",
          right: 180,
          bottom: 200,
          width: 340,
          height: 160,
          borderRadius: 999,
          background: "rgba(255, 212, 133, 0.08)",
          filter: "blur(20px)"
        }}
      />
    </AbsoluteFill>
  );

  const midLayer = (
    <AbsoluteFill>
      <DropShadow offsetY={12} blur={20} opacity={0.45}>
        <div
          style={{
            position: "absolute",
            left: chartLayout.safeArea.left,
            top: 82,
            fontSize: 66,
            fontWeight: 800,
            letterSpacing: 1.1,
            color: "#EEF4FF",
            opacity: titleOpacity
          }}
        >
          Depth + Shadow Showcase
        </div>
      </DropShadow>

      <div
        style={{
          position: "absolute",
          left: chartLayout.safeArea.left,
          top: 166,
          color: "#C5D4EF",
          fontSize: 30,
          opacity: titleOpacity
        }}
      >
        contact shadow, cast depth, parallax layers
      </div>

      <div
        style={{
          position: "absolute",
          left: chartLayout.plot.x,
          top: chartLayout.plot.y,
          width: chartLayout.plot.width,
          height: chartLayout.plot.height,
          borderRadius: 24,
          border: "2px solid rgba(255, 255, 255, 0.16)",
          background: "linear-gradient(180deg, rgba(8, 13, 24, 0.58), rgba(8, 13, 22, 0.76))",
          opacity: chartAppear
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
            background: "rgba(255, 255, 255, 0.08)",
            opacity: chartAppear
          }}
        />
      ))}

      {chartLayout.bars.map((bar, index) => {
        const grow = spring({
          frame: frame - (introEnd + index * 5),
          fps,
          config: {
            damping: 11,
            stiffness: 126,
            mass: 0.7
          }
        });

        const growth = clamp(grow, 0, 1.14);
        const count = clamp(grow, 0, 1);
        const h = bar.height * growth;
        const y = chartLayout.plot.baselineY - h;

        const isTarget = index === TARGET_BAR_INDEX;
        const targetPulse = isTarget ? 1 + pulse(frame, emphasisFrame, 20) * 0.1 : 1;

        return (
          <div key={`${bar.label}-${index}`}>
            <div
              style={{
                position: "absolute",
                left: bar.x,
                top: y,
                width: bar.width,
                height: h,
                borderRadius: 14,
                background: isTarget
                  ? `linear-gradient(180deg, ${bar.color}, rgba(255, 255, 255, 0.94) 190%)`
                  : `linear-gradient(180deg, ${bar.color}, rgba(24, 34, 52, 0.7) 180%)`,
                boxShadow: isTarget
                  ? "0 0 0 3px rgba(255, 244, 180, 0.76), 0 20px 38px rgba(255, 209, 111, 0.35)"
                  : "0 16px 28px rgba(0, 0, 0, 0.28)",
                transform: `scale(${targetPulse.toFixed(4)})`,
                transformOrigin: "50% 100%",
                opacity: chartAppear
              }}
            />

            <div
              style={{
                position: "absolute",
                left: bar.x + bar.width * 0.5,
                top: y - 34,
                transform: "translateX(-50%)",
                color: "#EEF4FF",
                fontSize: 30,
                fontWeight: 700,
                opacity: chartAppear
              }}
            >
              {Math.round(bar.value * count)}
            </div>

            <div
              style={{
                position: "absolute",
                left: bar.x + bar.width * 0.5,
                top: chartLayout.plot.baselineY + 22,
                transform: "translateX(-50%)",
                color: "#C5D3EE",
                fontSize: 25,
                opacity: chartAppear
              }}
            >
              {bar.label}
            </div>
          </div>
        );
      })}

      <ContactShadow
        x={catX}
        y={catY + 48}
        width={186}
        height={44}
        blur={20}
        opacity={0.34}
        lightDirection={{ x: 0.62, y: 1 }}
        distance={10}
      />

      {isPointing ? (
        <ContactShadow
          x={pointTarget.x + 4}
          y={pointTarget.y + 12}
          width={62}
          height={20}
          blur={10}
          opacity={0.24}
          lightDirection={{ x: 0.62, y: 1 }}
          distance={5}
        />
      ) : null}

      <EraserCatViewBlend
        pose={pose}
        yaw={yaw}
        pack={turningCharacterPack}
        targetPoint={isPointing ? { x: pointTarget.x, y: pointTarget.y - 10 } : undefined}
        useOpacityBlend={false}
        featherPx={90}
        animationMode="alive"
        seed="depth-shadow-showcase"
        talkText="Shadows ground the character while parallax adds depth."
      />

      <ScribbleHighlight
        width={WIDTH}
        height={HEIGHT}
        rect={{
          x: chartLayout.bars[TARGET_BAR_INDEX].x - 18,
          y: chartLayout.bars[TARGET_BAR_INDEX].y - 14,
          width: chartLayout.bars[TARGET_BAR_INDEX].width + 36,
          height: chartLayout.bars[TARGET_BAR_INDEX].height + 26
        }}
        startFrame={emphasisFrame}
        durationInFrames={20}
        color="#FFF08C"
        strokeWidth={7}
      />

      <DropShadow offsetY={8} blur={18} opacity={0.42}>
        <div
          style={{
            position: "absolute",
            right: 96,
            top: 96,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.2)",
            background: "rgba(8, 12, 22, 0.58)",
            color: "#D8E7FF",
            fontSize: 22,
            opacity: chartAppear
          }}
        >
          Target: {barDemoData[TARGET_BAR_INDEX]?.label}
        </div>
      </DropShadow>

      <DropShadow offsetY={10} blur={20} opacity={0.45}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 124,
            textAlign: "center",
            color: "#F2F7FF",
            fontSize: 72,
            fontWeight: 900,
            letterSpacing: 1.3,
            opacity: ctaOpacity
          }}
        >
          DEPTH MAKES MOTION FEEL REAL
        </div>
      </DropShadow>
    </AbsoluteFill>
  );

  const foregroundLayer = (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 136,
          height: HEIGHT,
          background: "linear-gradient(180deg, rgba(54, 38, 28, 0.88), rgba(35, 24, 18, 0.92))",
          boxShadow: "8px 0 22px rgba(0, 0, 0, 0.35)"
        }}
      />

      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 126,
          height: HEIGHT,
          background: "linear-gradient(180deg, rgba(50, 35, 26, 0.88), rgba(34, 24, 18, 0.92))",
          boxShadow: "-8px 0 22px rgba(0, 0, 0, 0.35)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: WIDTH,
          height: 170,
          background: "linear-gradient(180deg, rgba(40, 30, 24, 0.82), rgba(31, 23, 18, 0.92))",
          boxShadow: "0 -8px 28px rgba(0, 0, 0, 0.35)"
        }}
      />
    </AbsoluteFill>
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <ParallaxScene
        camera={camera}
        layers={[
          { depth: 0.22, render: backgroundLayer },
          { depth: 1.0, render: midLayer },
          { depth: 1.62, render: foregroundLayer }
        ]}
      />

      <FlashCut startFrame={0} durationInFrames={8} maxOpacity={0.95} />
      <FlashCut startFrame={outroStart} durationInFrames={8} maxOpacity={0.75} />

      <ScreenFx grainOpacity={0.11} scanlineOpacity={0.15} vignetteOpacity={0.4} tintOpacity={0.06} />
    </AbsoluteFill>
  );
};