import type { ReactNode } from "react";

export type SituationSceneProps = {
  width: number;
  height: number;
  characterLayer: ReactNode;
  chartLayer: ReactNode;
  captionLayer?: ReactNode;
  layout?: SituationSceneLayout;
  simpleMode?: boolean;
};

export type SituationSceneLayout = {
  chart: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export const situationSceneLayout: SituationSceneLayout = {
  chart: {
    x: 1000,
    y: 120,
    width: 840,
    height: 620
  }
};

export const SituationScene = ({
  width,
  height,
  characterLayer,
  chartLayer,
  captionLayer,
  layout,
  simpleMode = false
}: SituationSceneProps) => {
  const activeLayout = layout ?? situationSceneLayout;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: simpleMode
            ? "linear-gradient(180deg, #3b4b68 0%, #202b42 42%, #131a2a 100%)"
            : "radial-gradient(circle at 18% 8%, #53698c 0%, #27334c 40%, #161e2f 100%)"
        }}
      />

      {!simpleMode ? (
        <div
          style={{
            position: "absolute",
            left: 102,
            top: 92,
            width: 396,
            height: 232,
            borderRadius: 18,
            border: "7px solid #b88d54",
            background: "linear-gradient(180deg, rgba(126, 162, 206, 0.54) 0%, rgba(63, 91, 131, 0.26) 100%)",
            boxShadow: "0 12px 28px rgba(0, 0, 0, 0.3)"
          }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: simpleMode ? 234 : 266,
          background: simpleMode
            ? "linear-gradient(180deg, #33271d 0%, #241b14 100%)"
            : "linear-gradient(180deg, #3a2f24 0%, #2a2218 100%)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: activeLayout.chart.x,
          top: activeLayout.chart.y,
          width: activeLayout.chart.width,
          height: activeLayout.chart.height,
          borderRadius: simpleMode ? 16 : 22,
          border: "2px solid rgba(255, 255, 255, 0.12)",
          background: "linear-gradient(180deg, rgba(11, 19, 33, 0.85) 0%, rgba(10, 16, 26, 0.94) 100%)",
          boxShadow: "0 26px 38px rgba(0, 0, 0, 0.35)"
        }}
      >
        {chartLayer}
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0
        }}
      >
        {characterLayer}
      </div>

      {captionLayer ? (
        <div
          style={{
            position: "absolute",
            left: 1080,
            top: 760,
            width: 680
          }}
        >
          {captionLayer}
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: simpleMode ? 768 : 742,
          top: simpleMode ? 102 : 84,
          width: simpleMode ? 190 : 232,
          height: simpleMode ? 796 : 820,
          borderRadius: 12,
          background: simpleMode
            ? "linear-gradient(180deg, #302319 0%, #221a13 100%)"
            : "linear-gradient(180deg, #372a20 0%, #241b15 100%)",
          boxShadow: "6px 0 22px rgba(0, 0, 0, 0.32)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: simpleMode ? 680 : 642,
          right: simpleMode ? 84 : 56,
          bottom: 0,
          height: simpleMode ? 212 : 248,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          background: simpleMode
            ? "linear-gradient(180deg, #4f3828 0%, #3a2a1e 70%, #2a2017 100%)"
            : "linear-gradient(180deg, #5a3f2d 0%, #3f2d20 70%, #2f2218 100%)",
          boxShadow: "0 -10px 28px rgba(0, 0, 0, 0.2)"
        }}
      />
    </div>
  );
};
