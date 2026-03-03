import { Composition } from "remotion";
import { AnimToolkitSmokeComposition } from "./compositions/AnimToolkitSmoke";
import { AnimationQualityShowcaseComposition } from "./compositions/AnimationQualityShowcase";
import { BarChartRigDemoComposition } from "./compositions/BarChartRigDemo";
import { CameraShowcaseComposition } from "./compositions/CameraShowcase";
import { CharacterPackPreviewComposition } from "./compositions/CharacterPackPreview";
import { CharacterLifeDemoComposition } from "./compositions/CharacterLifeDemo";
import { CinematicTurnDemoComposition } from "./compositions/CinematicTurnDemo";
import { DepthAndShadowShowcaseComposition } from "./compositions/DepthAndShadowShowcase";
import { ExtremeDemoComposition } from "./compositions/ExtremeDemo";
import { MotionFxShowcaseComposition } from "./compositions/MotionFxShowcase";
import { Mvp1Composition } from "./compositions/Mvp1";
import { ShotEpisodeComposition, type ShotEpisodeRenderProps } from "./compositions/ShotEpisodeComposition";
import { SituationSceneDemoComposition } from "./compositions/SituationSceneDemo";
import { TalkDemoComposition } from "./compositions/TalkDemo";

const shotEpisodeDefaults: ShotEpisodeRenderProps = {
  episodeId: "episode_demo",
  safeArea: {
    top: 54,
    right: 96,
    bottom: 54,
    left: 96
  },
  freezeCharacterPose: false,
  sequences: [
    {
      shotId: "shot_001",
      from: 0,
      duration: 180,
      setId: "studio_intro",
      cameraPreset: "host_wide_fade",
      narration: "Welcome to the upgraded shot renderer.",
      emphasisWords: ["upgraded"],
      chartData: [
        { label: "Q1", value: 48, unit: "pts" },
        { label: "Q2", value: 74, unit: "pts" },
        { label: "Q3", value: 59, unit: "pts" }
      ],
      visualMode: "chart",
      annotationsEnabled: true,
      pointerTargetIndex: 1,
      pointerEnabled: true,
      freezePose: false,
      expectOcclusion: false,
      pointerTip: { x: 1320, y: 392 },
      unit: "pts",
      hasChart: true,
      chartCallout: "Bars now overshoot and count up.",
      characterX: 0.43,
      characterY: 0.82,
      characterYawFrom: -0.2,
      characterYawTo: 0.35,
      characterYawEase: "linear",
      macroCutaway: true,
      transitionHint: "crossfade",
      emphasisAtFrame: 68
    },
    {
      shotId: "shot_002",
      from: 180,
      duration: 180,
      setId: "studio_data",
      cameraPreset: "chart_whip_right",
      narration: "Second shot adds a whip transition and stronger emphasis pulse.",
      emphasisWords: ["whip", "pulse"],
      chartData: [
        { label: "Q1", value: 52, unit: "pts" },
        { label: "Q2", value: 81, unit: "pts" },
        { label: "Q3", value: 66, unit: "pts" }
      ],
      visualMode: "chart",
      annotationsEnabled: true,
      pointerTargetIndex: 2,
      pointerEnabled: true,
      freezePose: false,
      expectOcclusion: false,
      pointerTip: { x: 1360, y: 382 },
      unit: "pts",
      hasChart: true,
      chartCallout: "Target bar receives pulse + scribble highlight.",
      characterX: 0.46,
      characterY: 0.82,
      characterYawFrom: 0.25,
      characterYawTo: 0.95,
      characterYawEase: "spring",
      macroCutaway: true,
      transitionHint: "whip",
      emphasisAtFrame: 74
    },
    {
      shotId: "shot_003",
      from: 360,
      duration: 180,
      setId: "studio_close",
      cameraPreset: "host_flash_close",
      narration: "Final shot settles with a quick flash and clean value count up.",
      emphasisWords: ["flash"],
      chartData: [
        { label: "Q1", value: 61, unit: "pts" },
        { label: "Q2", value: 88, unit: "pts" },
        { label: "Q3", value: 72, unit: "pts" }
      ],
      visualMode: "chart",
      annotationsEnabled: true,
      pointerTargetIndex: 1,
      pointerEnabled: true,
      freezePose: false,
      expectOcclusion: false,
      pointerTip: { x: 1320, y: 374 },
      unit: "pts",
      hasChart: true,
      chartCallout: "Transition defaults remain backward compatible.",
      characterX: 0.48,
      characterY: 0.82,
      characterYawFrom: 0.8,
      characterYawTo: 0.2,
      characterYawEase: "linear",
      macroCutaway: true,
      transitionHint: "flash",
      emphasisAtFrame: 72
    }
  ],
  subtitles: [
    {
      index: 1,
      startFrame: 0,
      endFrame: 179,
      text: "Welcome to the upgraded shot renderer."
    },
    {
      index: 2,
      startFrame: 180,
      endFrame: 359,
      text: "Second shot adds a whip transition and stronger emphasis pulse."
    },
    {
      index: 3,
      startFrame: 360,
      endFrame: 539,
      text: "Final shot settles with a quick flash and clean value count up."
    }
  ]
};

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="MVP1"
        component={Mvp1Composition}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Eraser Cat Studio",
          subtitle: "Remotion MVP #1"
        }}
      />

      <Composition
        id="BAR-CHART-RIG-DEMO"
        component={BarChartRigDemoComposition}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="SITUATION-SCENE-DEMO"
        component={SituationSceneDemoComposition}
        durationInFrames={420}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="SITUATION-SCENE-DEMO-FALLBACK"
        component={SituationSceneDemoComposition}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          simpleLayout: true,
          hideNonCriticalOverlays: true,
          reduceElements: true
        }}
      />

      <Composition
        id="SHOT-EPISODE"
        component={ShotEpisodeComposition}
        durationInFrames={21600}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={shotEpisodeDefaults}
      />

      <Composition
        id="EXTREME-DEMO"
        component={ExtremeDemoComposition}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="CINEMATIC-TURN-DEMO"
        component={CinematicTurnDemoComposition}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="CHARACTER-PACK-PREVIEW"
        component={CharacterPackPreviewComposition}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          characterPackId: "demo-character-pack"
        }}
      />

      <Composition
        id="ANIM-TOOLKIT-SMOKE"
        component={AnimToolkitSmokeComposition}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="CAMERA-SHOWCASE"
        component={CameraShowcaseComposition}
        durationInFrames={480}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="MOTION-FX-SHOWCASE"
        component={MotionFxShowcaseComposition}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="CHARACTER-LIFE-DEMO"
        component={CharacterLifeDemoComposition}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="TALK-DEMO"
        component={TalkDemoComposition}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="ANIMATION-QUALITY-SHOWCASE"
        component={AnimationQualityShowcaseComposition}
        durationInFrames={720}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="DEPTH-SHADOW-SHOWCASE"
        component={DepthAndShadowShowcaseComposition}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
