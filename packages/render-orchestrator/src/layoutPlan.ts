import type {
  ChartDataRow,
  DeterministicInsertAsset,
  DeterministicLayoutPlan,
  DeterministicLayoutRect,
  DeterministicSequence,
  DeterministicVisualObject,
  RenderSafeArea
} from "./types";

export const DEFAULT_PRIMARY_VISUAL_BOX: DeterministicLayoutRect = {
  x: 1030,
  y: 168,
  width: 760,
  height: 510
};

export const DEFAULT_NARRATION_BOX: DeterministicLayoutRect = {
  x: 88,
  y: 760,
  width: 840,
  height: 160
};

export const DEFAULT_OCCLUDER_BOX: DeterministicLayoutRect = {
  x: 760,
  y: 0,
  width: 180,
  height: 1080
};

type LayoutPlanInput = {
  width: number;
  height: number;
  safeArea: RenderSafeArea;
  chartData: ChartDataRow[];
  hasChart: boolean;
  visualMode: "chart" | "table";
  primaryVisualKind?: string;
  visualObjects?: DeterministicVisualObject[];
  insertAsset?: DeterministicInsertAsset;
  characterX: number;
  characterY: number;
  pointerEnabled: boolean;
  pointerTargetIndex: number;
  expectOcclusion: boolean;
  visualIntentFamily?: string;
  previousVisualIntentFamily?: string;
  previousLayoutPlan?: Pick<DeterministicLayoutPlan, "narrationBox" | "primaryVisualBox" | "insertBox">;
};

type PrimaryVisualFootprint = {
  width: number;
  height: number;
  minHeight: number;
  topOffset: number;
  centerYOffset: number;
};

type InsertLayoutIntent = {
  layout: "lower_third" | "sidebar";
  kind?: DeterministicVisualObject["kind"];
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rectRight(rect: DeterministicLayoutRect): number {
  return rect.x + rect.width;
}

function rectBottom(rect: DeterministicLayoutRect): number {
  return rect.y + rect.height;
}

function rectIntersects(left: DeterministicLayoutRect, right: DeterministicLayoutRect): boolean {
  return !(
    rectRight(left) <= right.x ||
    rectRight(right) <= left.x ||
    rectBottom(left) <= right.y ||
    rectBottom(right) <= left.y
  );
}

function intersectionArea(left: DeterministicLayoutRect, right: DeterministicLayoutRect): number {
  const overlapX = Math.max(0, Math.min(rectRight(left), rectRight(right)) - Math.max(left.x, right.x));
  const overlapY = Math.max(0, Math.min(rectBottom(left), rectBottom(right)) - Math.max(left.y, right.y));
  return overlapX * overlapY;
}

function rectDelta(left: DeterministicLayoutRect | undefined, right: DeterministicLayoutRect | undefined): number {
  if (!left || !right) {
    return 0;
  }
  return (
    Math.abs(left.x - right.x) +
    Math.abs(left.y - right.y) +
    Math.abs(left.width - right.width) +
    Math.abs(left.height - right.height)
  );
}

function classifyIntentFamily(family: string | undefined): "summary" | "data" | "diagram" | "risk" | "generic" {
  switch (family) {
    case "summary_focus":
      return "summary";
    case "chart_primary":
    case "timeline_metric":
    case "comparison_focus":
      return "data";
    case "diagram_primary":
      return "diagram";
    case "risk_focus":
      return "risk";
    default:
      return "generic";
  }
}

function resolveNarrationContinuityWeight(currentFamily: string | undefined, previousFamily: string | undefined): number {
  if (!currentFamily || !previousFamily) {
    return 0;
  }
  if (currentFamily === previousFamily) {
    return currentFamily === "diagram_primary" ? 1.05 : 0.9;
  }
  const currentClass = classifyIntentFamily(currentFamily);
  const previousClass = classifyIntentFamily(previousFamily);
  if (currentClass === previousClass) {
    return 0.82;
  }
  if (
    (currentClass === "summary" && (previousClass === "data" || previousClass === "diagram")) ||
    (previousClass === "summary" && (currentClass === "data" || currentClass === "diagram"))
  ) {
    return 0.7;
  }
  if (
    (currentClass === "diagram" && previousClass === "risk") ||
    (currentClass === "risk" && previousClass === "diagram")
  ) {
    return 0.58;
  }
  return 0.34;
}

function resolvePrimaryVisualContinuityWeight(currentFamily: string | undefined, previousFamily: string | undefined): number {
  if (!currentFamily || !previousFamily) {
    return 0;
  }
  if (currentFamily === previousFamily) {
    return currentFamily === "diagram_primary" ? 0.28 : 0.18;
  }
  const currentClass = classifyIntentFamily(currentFamily);
  const previousClass = classifyIntentFamily(previousFamily);
  if (currentClass === previousClass) {
    return 0.16;
  }
  if (
    (currentClass === "diagram" && previousClass === "risk") ||
    (currentClass === "risk" && previousClass === "diagram")
  ) {
    return 0.1;
  }
  if (
    (currentClass === "summary" && previousClass === "data") ||
    (currentClass === "data" && previousClass === "summary")
  ) {
    return 0.08;
  }
  return 0.04;
}

function fitsSafeArea(
  rect: DeterministicLayoutRect,
  width: number,
  height: number,
  safeArea: RenderSafeArea
): boolean {
  return (
    rect.x >= safeArea.left &&
    rect.y >= safeArea.top &&
    rectRight(rect) <= width - safeArea.right &&
    rectBottom(rect) <= height - safeArea.bottom
  );
}

function gapPenalty(left: DeterministicLayoutRect, right: DeterministicLayoutRect, desiredGap: number): number {
  const horizontalGap = Math.max(0, Math.max(left.x - rectRight(right), right.x - rectRight(left)));
  const verticalGap = Math.max(0, Math.max(left.y - rectBottom(right), right.y - rectBottom(left)));
  const gap = Math.max(horizontalGap, verticalGap);
  return gap >= desiredGap ? 0 : (desiredGap - gap) * 12;
}

function scoreCandidate(input: {
  rect: DeterministicLayoutRect;
  width: number;
  height: number;
  safeArea: RenderSafeArea;
  avoid: DeterministicLayoutRect[];
  subtitleSafeZone?: DeterministicLayoutRect;
  preferred?: "left" | "right" | "center";
  candidateSide: "left" | "right" | "center";
  previousRect?: DeterministicLayoutRect;
  continuityWeight?: number;
}): number {
  let score = 0;
  if (!fitsSafeArea(input.rect, input.width, input.height, input.safeArea)) {
    score += 5000;
  }
  for (const obstacle of input.avoid) {
    score += intersectionArea(input.rect, obstacle) * 0.02;
    score += gapPenalty(input.rect, obstacle, 24);
  }
  if (input.subtitleSafeZone && rectIntersects(input.rect, input.subtitleSafeZone)) {
    score += 3000;
  }
  if (input.preferred && input.preferred !== input.candidateSide) {
    score += input.preferred === "center" || input.candidateSide === "center" ? 60 : 18;
  }
  if (input.previousRect && (input.continuityWeight ?? 0) > 0) {
    score += rectDelta(input.rect, input.previousRect) * (input.continuityWeight ?? 0);
  }
  return score;
}

function scoreNarrationCandidate(input: {
  rect: DeterministicLayoutRect;
  width: number;
  height: number;
  safeArea: RenderSafeArea;
  mascotBlockingZone: DeterministicLayoutRect;
  primaryVisualBox: DeterministicLayoutRect;
  insertBox?: DeterministicLayoutRect;
  subtitleSafeZone: DeterministicLayoutRect;
  previousRect?: DeterministicLayoutRect;
  continuityWeight?: number;
}): number {
  let score = 0;
  if (!fitsSafeArea(input.rect, input.width, input.height, input.safeArea)) {
    score += 5000;
  }
  score += intersectionArea(input.rect, input.mascotBlockingZone) * 0.04;
  score += gapPenalty(input.rect, input.mascotBlockingZone, 36);
  score += intersectionArea(input.rect, input.primaryVisualBox) * 0.05;
  if (input.insertBox) {
    score += intersectionArea(input.rect, input.insertBox) * 0.06;
    score += gapPenalty(input.rect, input.insertBox, 22);
  }
  if (rectIntersects(input.rect, input.subtitleSafeZone)) {
    score += 2600;
  }
  if (input.previousRect && (input.continuityWeight ?? 0) > 0) {
    score += rectDelta(input.rect, input.previousRect) * (input.continuityWeight ?? 0);
  }
  return score;
}

function pickBestCandidate<T extends { rect: DeterministicLayoutRect }>(
  candidates: T[],
  score: (candidate: T) => number
): T {
  return [...candidates]
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .sort((left, right) => left.score - right.score)[0].candidate;
}

function resolvePrimaryVisualObject(input: LayoutPlanInput): DeterministicVisualObject | undefined {
  return input.visualObjects?.find((object) => object.semanticRole === "primary_explainer") ?? input.visualObjects?.[0];
}

function pickSecondaryVisualObject(
  visualObjects: DeterministicVisualObject[] | undefined,
  primaryVisualObject?: DeterministicVisualObject
): DeterministicVisualObject | undefined {
  const candidates = visualObjects?.filter((object) => object.objectId !== primaryVisualObject?.objectId) ?? [];
  if (candidates.length === 0) {
    return undefined;
  }

  return [...candidates].sort((left, right) => {
    const score = (object: DeterministicVisualObject) =>
      (object.preferredRegion === "sidebar" || object.preferredRegion === "lower_third" ? 4 : 0) +
      (object.semanticRole === "supporting_explainer" ? 2 : 0) +
      (object.semanticRole === "accent" ? 1 : 0);
    return score(right) - score(left);
  })[0];
}

function resolvePrimaryVisualFootprint(input: LayoutPlanInput): PrimaryVisualFootprint {
  const kind = resolvePrimaryVisualObject(input)?.kind ?? input.primaryVisualKind;

  switch (kind) {
    case "line_chart":
    case "area_chart":
      return { width: 800, height: 470, minHeight: 300, topOffset: 126, centerYOffset: 12 };
    case "pie_or_donut":
      return { width: 620, height: 620, minHeight: 360, topOffset: 112, centerYOffset: 12 };
    case "heatmap":
      return { width: 760, height: 520, minHeight: 320, topOffset: 118, centerYOffset: 14 };
    case "scatter":
      return { width: 780, height: 500, minHeight: 320, topOffset: 120, centerYOffset: 16 };
    case "boxplot":
      return { width: 760, height: 460, minHeight: 300, topOffset: 132, centerYOffset: 14 };
    case "map":
      return { width: 700, height: 560, minHeight: 360, topOffset: 116, centerYOffset: 12 };
    case "table":
      return { width: 720, height: 520, minHeight: 320, topOffset: 116, centerYOffset: 16 };
    case "kpi_card":
      return { width: 860, height: 400, minHeight: 280, topOffset: 128, centerYOffset: 18 };
    case "timeline":
    case "process_flow":
      return { width: 900, height: 340, minHeight: 240, topOffset: 146, centerYOffset: 18 };
    case "comparison_board":
      return { width: 900, height: 460, minHeight: 300, topOffset: 126, centerYOffset: 14 };
    case "icon_grid":
      return { width: 780, height: 430, minHeight: 280, topOffset: 136, centerYOffset: 16 };
    case "callout_card":
    case "summary_card":
      return { width: 760, height: 420, minHeight: 260, topOffset: 136, centerYOffset: 14 };
    case "anatomy_diagram":
      return { width: 620, height: 620, minHeight: 420, topOffset: 112, centerYOffset: 10 };
    case "risk_meter":
      return { width: 760, height: 300, minHeight: 220, topOffset: 186, centerYOffset: 20 };
    case "bar_chart":
    default:
      return { width: 760, height: 510, minHeight: 280, topOffset: 108, centerYOffset: 18 };
  }
}

function resolveSecondaryVisualObject(input: LayoutPlanInput): DeterministicVisualObject | undefined {
  return pickSecondaryVisualObject(input.visualObjects, resolvePrimaryVisualObject(input));
}

function resolveLegacyInsertKind(insertAsset?: DeterministicInsertAsset): DeterministicVisualObject["kind"] | undefined {
  if (!insertAsset) {
    return undefined;
  }

  switch (insertAsset.type) {
    case "diagram":
      return "anatomy_diagram";
    case "board":
      return "comparison_board";
    case "caption_card":
      return "summary_card";
    case "callout_card":
      return "callout_card";
    case "icon_explainer":
      return "icon_grid";
    case "caution_card":
      return "risk_meter";
    case "chart":
      return "bar_chart";
    default:
      return undefined;
  }
}

function resolveInsertLayoutIntent(input: {
  insertAsset?: DeterministicInsertAsset;
  visualObjects?: DeterministicVisualObject[];
}): InsertLayoutIntent | undefined {
  const primaryVisualObject =
    input.visualObjects?.find((object) => object.semanticRole === "primary_explainer") ?? input.visualObjects?.[0];
  const secondaryVisualObject = pickSecondaryVisualObject(input.visualObjects, primaryVisualObject);
  const kind = secondaryVisualObject?.kind ?? resolveLegacyInsertKind(input.insertAsset);
  const layout =
    input.insertAsset?.layout ??
    (secondaryVisualObject?.preferredRegion === "lower_third" ? "lower_third" : secondaryVisualObject ? "sidebar" : undefined);

  if (!layout) {
    return undefined;
  }

  if (layout === "lower_third") {
    switch (kind) {
      case "risk_meter":
        return { layout, kind, width: 760, height: 144 };
      case "timeline":
      case "process_flow":
        return { layout, kind, width: 860, height: 156 };
      case "summary_card":
      case "callout_card":
        return { layout, kind, width: 780, height: 170 };
      case "kpi_card":
        return { layout, kind, width: 780, height: 158 };
      default:
        return { layout, kind, width: 820, height: 184 };
    }
  }

  switch (kind) {
    case "anatomy_diagram":
      return { layout, kind, width: 520, height: 300 };
    case "comparison_board":
      return { layout, kind, width: 560, height: 260 };
    case "icon_grid":
      return { layout, kind, width: 520, height: 260 };
    case "risk_meter":
      return { layout, kind, width: 520, height: 210 };
    case "summary_card":
    case "callout_card":
      return { layout, kind, width: 540, height: 236 };
    case "timeline":
    case "process_flow":
      return { layout, kind, width: 540, height: 226 };
    default:
      return { layout, kind, width: 640, height: 226 };
  }
}

function resolvePrimaryPreferredSide(input: LayoutPlanInput): "left" | "right" | "center" {
  const preferredRegion =
    input.visualObjects?.find((object) => object.semanticRole === "primary_explainer")?.preferredRegion ??
    input.visualObjects?.[0]?.preferredRegion;
  if (preferredRegion === "center_stage") {
    return "center";
  }
  if (preferredRegion === "main_left") {
    return "left";
  }
  if (preferredRegion === "main_right") {
    return "right";
  }
  return input.characterX <= 0.5 ? "right" : "left";
}

function buildSubtitleSafeZone(width: number, height: number, safeArea: RenderSafeArea): DeterministicLayoutRect {
  return {
    x: safeArea.left,
    y: height - safeArea.bottom - 84,
    width: Math.max(320, width - safeArea.left - safeArea.right),
    height: 64
  };
}

function buildMascotBlockingZone(input: LayoutPlanInput): DeterministicLayoutRect {
  const mascotX = clamp(input.characterX, 0, 1) * input.width;
  const mascotY = clamp(input.characterY, 0, 1) * input.height;
  const width = 430;
  const height = 420;
  return {
    x: clamp(Math.round(mascotX - width * 0.45), input.safeArea.left, input.width - input.safeArea.right - width),
    y: clamp(
      Math.round(mascotY - height * 0.55),
      input.safeArea.top + 90,
      input.height - input.safeArea.bottom - height - 120
    ),
    width,
    height
  };
}

function buildPrimaryVisualBox(
  input: LayoutPlanInput,
  subtitleSafeZone: DeterministicLayoutRect,
  mascotBlockingZone: DeterministicLayoutRect
): DeterministicLayoutRect {
  const footprint = resolvePrimaryVisualFootprint(input);
  const top = input.safeArea.top + footprint.topOffset;
  const width = Math.min(footprint.width, input.width - input.safeArea.left - input.safeArea.right - 120);
  const height = clamp(
    Math.min(footprint.height, input.height - subtitleSafeZone.height - input.safeArea.bottom - top - 96),
    footprint.minHeight,
    footprint.height
  );
  const leftBox: DeterministicLayoutRect = {
    x: input.safeArea.left + 28,
    y: top,
    width,
    height
  };
  const rightBox: DeterministicLayoutRect = {
    x: input.width - input.safeArea.right - width,
    y: top,
    width,
    height
  };
  const centerBox: DeterministicLayoutRect = {
    x: Math.round((input.width - width) / 2),
    y: top + footprint.centerYOffset,
    width,
    height: clamp(
      Math.min(height, input.height - subtitleSafeZone.height - input.safeArea.bottom - top - 128),
      footprint.minHeight,
      footprint.height
    )
  };

  const preferred = resolvePrimaryPreferredSide(input);
  const candidates = [
    { rect: leftBox, side: "left" as const },
    { rect: rightBox, side: "right" as const },
    { rect: centerBox, side: "center" as const }
  ];

  return pickBestCandidate(candidates, (candidate) =>
    scoreCandidate({
      rect: candidate.rect,
      width: input.width,
      height: input.height,
      safeArea: input.safeArea,
      avoid: [mascotBlockingZone],
      subtitleSafeZone,
      preferred,
      candidateSide: candidate.side,
      previousRect: input.previousLayoutPlan?.primaryVisualBox,
      continuityWeight: resolvePrimaryVisualContinuityWeight(input.visualIntentFamily, input.previousVisualIntentFamily)
    }) +
    (input.hasChart && candidate.side === (input.characterX <= 0.5 ? "left" : "right") ? 150 : 0)
  ).rect;
}

function buildInsertBox(input: {
  width: number;
  height: number;
  safeArea: RenderSafeArea;
  insertAsset?: DeterministicInsertAsset;
  visualObjects?: DeterministicVisualObject[];
  subtitleSafeZone: DeterministicLayoutRect;
  mascotBlockingZone: DeterministicLayoutRect;
  primaryVisualBox: DeterministicLayoutRect;
}): DeterministicLayoutRect | undefined {
  const intent = resolveInsertLayoutIntent({
    insertAsset: input.insertAsset,
    visualObjects: input.visualObjects
  });
  if (!intent) {
    return undefined;
  }

  if (intent.layout === "lower_third") {
    const boxWidth = Math.min(intent.width, input.width - input.safeArea.left - input.safeArea.right - 120);
    const boxHeight = intent.height;
    const top = input.subtitleSafeZone.y - boxHeight - 18;
    const candidates = [
      {
        rect: {
          x: input.safeArea.left + 18,
          y: top,
          width: boxWidth,
          height: boxHeight
        },
        side: "left" as const
      },
      {
        rect: {
          x: Math.round((input.width - boxWidth) / 2),
          y: top,
          width: boxWidth,
          height: boxHeight
        },
        side: "center" as const
      },
      {
        rect: {
          x: input.width - input.safeArea.right - boxWidth - 18,
          y: top,
          width: boxWidth,
          height: boxHeight
        },
        side: "right" as const
      }
    ];

    return pickBestCandidate(candidates, (candidate) =>
      scoreCandidate({
        rect: candidate.rect,
        width: input.width,
        height: input.height,
        safeArea: input.safeArea,
        avoid: [input.mascotBlockingZone, input.primaryVisualBox],
        subtitleSafeZone: input.subtitleSafeZone,
        preferred: input.primaryVisualBox.x < input.width / 2 ? "right" : "left",
        candidateSide: candidate.side
      })
    ).rect;
  }

  const sidebarWidth = Math.min(input.primaryVisualBox.width, intent.width);
  const sidebarHeight = intent.height;
  const topCandidate = rectBottom(input.primaryVisualBox) + 20;
  const stackedBelowPrimary: DeterministicLayoutRect = {
    x: input.primaryVisualBox.x,
    y: topCandidate,
    width: sidebarWidth,
    height: sidebarHeight
  };
  const oppositeSideX =
    input.primaryVisualBox.x < input.width / 2
      ? input.width - input.safeArea.right - sidebarWidth - 18
      : input.safeArea.left + 18;
  const oppositeSidebar: DeterministicLayoutRect = {
    x: oppositeSideX,
    y: input.primaryVisualBox.y + 26,
    width: sidebarWidth,
    height: sidebarHeight
  };

  const candidates = [
    {
      rect: stackedBelowPrimary,
      side: input.primaryVisualBox.x < input.width / 2 ? ("left" as const) : ("right" as const)
    },
    {
      rect: oppositeSidebar,
      side: input.primaryVisualBox.x < input.width / 2 ? ("right" as const) : ("left" as const)
    }
  ];

  return pickBestCandidate(candidates, (candidate) =>
    scoreCandidate({
      rect: candidate.rect,
      width: input.width,
      height: input.height,
      safeArea: input.safeArea,
      avoid: [input.mascotBlockingZone, input.primaryVisualBox],
      subtitleSafeZone: input.subtitleSafeZone,
      preferred: input.primaryVisualBox.x < input.width / 2 ? "left" : "right",
      candidateSide: candidate.side
    })
  ).rect;
}

function buildNarrationBox(input: {
  width: number;
  height: number;
  safeArea: RenderSafeArea;
  subtitleSafeZone: DeterministicLayoutRect;
  mascotBlockingZone: DeterministicLayoutRect;
  primaryVisualBox: DeterministicLayoutRect;
  insertBox?: DeterministicLayoutRect;
  visualIntentFamily?: string;
  previousVisualIntentFamily?: string;
  previousLayoutPlan?: Pick<DeterministicLayoutPlan, "narrationBox">;
}): DeterministicLayoutRect {
  const minNarrationWidth = 280;
  const fitAwayFromMascot = (rect: DeterministicLayoutRect): DeterministicLayoutRect => {
    const next = { ...rect };
    if (next.x < input.mascotBlockingZone.x && rectRight(next) > input.mascotBlockingZone.x - 24) {
      next.width = clamp(input.mascotBlockingZone.x - next.x - 24, minNarrationWidth, next.width);
    }
    if (
      next.x >= input.mascotBlockingZone.x &&
      next.x < rectRight(input.mascotBlockingZone) + 24
    ) {
      next.x = clamp(
        rectRight(input.mascotBlockingZone) + 24,
        input.safeArea.left,
        input.width - input.safeArea.right - minNarrationWidth
      );
      next.width = clamp(
        Math.min(next.width, input.width - input.safeArea.right - next.x),
        minNarrationWidth,
        next.width
      );
    }
    return next;
  };
  const boxHeight = 164;
  const topBoxHeight = 148;
  const bottom = input.subtitleSafeZone.y - boxHeight - 24;
  const leftRect = fitAwayFromMascot({
    x: input.safeArea.left + 12,
    y: bottom,
    width: 820,
    height: boxHeight
  });
  const centerRect = fitAwayFromMascot({
    x: Math.round((input.width - 860) / 2),
    y: bottom,
    width: 860,
    height: boxHeight
  });
  const rightRect = fitAwayFromMascot({
    x: input.width - input.safeArea.right - 832,
    y: bottom,
    width: 820,
    height: boxHeight
  });

  const topY = input.safeArea.top + 16;
  const leftColumnWidth = Math.max(
    0,
    input.primaryVisualBox.x - (input.safeArea.left + 12) - 24
  );
  const rightColumnX = rectRight(input.primaryVisualBox) + 24;
  const rightColumnWidth = Math.max(
    0,
    input.width - input.safeArea.right - rightColumnX - 12
  );

  const candidates = [
    { rect: leftRect },
    { rect: centerRect },
    { rect: rightRect }
  ];

  if (leftColumnWidth >= minNarrationWidth) {
    candidates.push({
      rect: fitAwayFromMascot({
        x: input.safeArea.left + 12,
        y: topY,
        width: Math.min(620, leftColumnWidth),
        height: topBoxHeight
      })
    });
  }

  if (rightColumnWidth >= minNarrationWidth) {
    candidates.push({
      rect: fitAwayFromMascot({
        x: rightColumnX,
        y: topY,
        width: Math.min(620, rightColumnWidth),
        height: topBoxHeight
      })
    });
  }

  return pickBestCandidate(candidates, (candidate) =>
    scoreNarrationCandidate({
      rect: candidate.rect,
      width: input.width,
      height: input.height,
      safeArea: input.safeArea,
      mascotBlockingZone: input.mascotBlockingZone,
      primaryVisualBox: input.primaryVisualBox,
      insertBox: input.insertBox,
      subtitleSafeZone: input.subtitleSafeZone,
      previousRect: input.previousLayoutPlan?.narrationBox,
      continuityWeight: resolveNarrationContinuityWeight(input.visualIntentFamily, input.previousVisualIntentFamily)
    })
  ).rect;
}

function buildNegativeSpaceBox(input: {
  width: number;
  height: number;
  safeArea: RenderSafeArea;
  mascotBlockingZone: DeterministicLayoutRect;
  primaryVisualBox: DeterministicLayoutRect;
  narrationBox: DeterministicLayoutRect;
}): DeterministicLayoutRect | undefined {
  const leftGapX = rectRight(input.mascotBlockingZone) + 20;
  const leftGapWidth = input.primaryVisualBox.x - leftGapX - 20;
  if (leftGapWidth >= 120) {
    return {
      x: leftGapX,
      y: input.safeArea.top + 120,
      width: leftGapWidth,
      height: Math.max(80, input.narrationBox.y - input.safeArea.top - 220)
    };
  }

  const fallbackWidth = Math.max(0, input.width - input.safeArea.left - input.safeArea.right - input.primaryVisualBox.width - 80);
  if (fallbackWidth < 120) {
    return undefined;
  }

  return {
    x: input.primaryVisualBox.x < input.width / 2 ? rectRight(input.primaryVisualBox) + 20 : input.safeArea.left + 20,
    y: input.safeArea.top + 120,
    width: fallbackWidth,
    height: Math.max(80, input.narrationBox.y - input.safeArea.top - 220)
  };
}

function buildOccluderBox(input: {
  width: number;
  height: number;
  characterX: number;
  expectOcclusion: boolean;
}): DeterministicLayoutRect | undefined {
  if (!input.expectOcclusion) {
    return undefined;
  }

  const occluderWidth = 180;
  const mascotCenterX = clamp(input.characterX, 0, 1) * input.width;
  const x = clamp(
    Math.round(mascotCenterX - occluderWidth * 0.5),
    120,
    input.width - occluderWidth - 40
  );
  return {
    x,
    y: 0,
    width: occluderWidth,
    height: input.height
  };
}

export function computeChartAnchorInRect(
  rows: ChartDataRow[],
  targetIndex: number,
  rect: DeterministicLayoutRect
): { x: number; y: number } {
  const count = Math.max(1, rows.length);
  const clampedIndex = clamp(targetIndex, 0, Math.max(0, count - 1));
  const left = rect.x + 56;
  const top = rect.y + 86;
  const plotWidth = Math.max(120, rect.width - 112);
  const plotHeight = Math.max(120, rect.height - 156);
  const gap = 20;
  const barWidth = (plotWidth - gap * (count - 1)) / count;
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  const value = rows[clampedIndex]?.value ?? 0;
  const normalized = clamp(value / maxValue, 0, 1);
  const barHeight = Math.max(6, plotHeight * normalized);
  return {
    x: left + clampedIndex * (barWidth + gap) + barWidth * 0.5,
    y: top + plotHeight - barHeight
  };
}

function buildLineChartPointsInRect(rows: ChartDataRow[], rect: DeterministicLayoutRect): Array<{ x: number; y: number }> {
  const safeRows =
    rows.length > 1 ? rows : [{ label: "-", value: 0 }, { label: "+", value: Math.max(1, rows[0]?.value ?? 1) }];
  const left = rect.x + 58;
  const top = rect.y + 78;
  const plotWidth = Math.max(120, rect.width - 116);
  const plotHeight = Math.max(120, rect.height - 174);
  const maxValue = Math.max(1, ...safeRows.map((row) => row.value));

  return safeRows.map((row, index) => ({
    x: left + (plotWidth * index) / Math.max(1, safeRows.length - 1),
    y: top + plotHeight - plotHeight * clamp(row.value / maxValue, 0, 1)
  }));
}

function resolveDefaultPointerTargetCount(kind?: string): number {
  switch (kind) {
    case "pie_or_donut":
      return 5;
    case "heatmap":
      return 6;
    case "scatter":
    case "boxplot":
    case "map":
      return 4;
    case "comparison_board":
      return 2;
    case "anatomy_diagram":
      return 4;
    case "risk_meter":
      return 3;
    case "timeline":
    case "process_flow":
      return 4;
    case "icon_grid":
      return 6;
    case "kpi_card":
      return 4;
    case "summary_card":
    case "callout_card":
      return 2;
    case "table":
      return 4;
    case "area_chart":
    case "line_chart":
    case "bar_chart":
      return 4;
    default:
      return 1;
  }
}

export function resolvePrimaryVisualPointerTargetCount(input: {
  kind?: string;
  chartData: ChartDataRow[];
  pointerTargetIds?: string[];
  anchors?: DeterministicVisualObject["anchors"];
}): number {
  const pointerAnchorCount =
    input.anchors?.filter((anchor) => anchor.type === "pointer_anchor").length ?? 0;
  const pointerTargetIdsCount = input.pointerTargetIds?.length ?? 0;
  const chartDataCount = input.chartData.length;
  const defaultCount = resolveDefaultPointerTargetCount(input.kind);
  return Math.max(pointerAnchorCount, pointerTargetIdsCount, chartDataCount, defaultCount);
}

function projectAnchorToRect(
  anchor: NonNullable<DeterministicVisualObject["anchors"]>[number],
  rect: DeterministicLayoutRect
): { x: number; y: number } {
  return {
    x: rect.x + rect.width * clamp(anchor.x, 0, 1),
    y: rect.y + rect.height * clamp(anchor.y, 0, 1)
  };
}

export function computePrimaryVisualAnchorInRect(input: {
  kind?: string;
  chartData: ChartDataRow[];
  pointerTargetIds?: string[];
  anchors?: DeterministicVisualObject["anchors"];
  targetIndex: number;
  rect: DeterministicLayoutRect;
}): { x: number; y: number } {
  const pointerAnchors = input.anchors?.filter((anchor) => anchor.type === "pointer_anchor") ?? [];
  if (pointerAnchors.length > 0) {
    return projectAnchorToRect(pointerAnchors[clamp(input.targetIndex, 0, pointerAnchors.length - 1)], input.rect);
  }
  const count = Math.max(
    1,
    resolvePrimaryVisualPointerTargetCount({
      kind: input.kind,
      chartData: input.chartData,
      pointerTargetIds: input.pointerTargetIds,
      anchors: input.anchors
    })
  );
  const clampedIndex = clamp(input.targetIndex, 0, Math.max(0, count - 1));

  switch (input.kind) {
    case "bar_chart":
      return computeChartAnchorInRect(input.chartData, clampedIndex, input.rect);
    case "line_chart": {
      const points = buildLineChartPointsInRect(input.chartData, input.rect);
      return points[clamp(clampedIndex, 0, Math.max(0, points.length - 1))] ?? {
        x: input.rect.x + input.rect.width * 0.65,
        y: input.rect.y + input.rect.height * 0.42
      };
    }
    case "area_chart": {
      const points = buildLineChartPointsInRect(input.chartData, input.rect);
      return points[clamp(clampedIndex, 0, Math.max(0, points.length - 1))] ?? {
        x: input.rect.x + input.rect.width * 0.64,
        y: input.rect.y + input.rect.height * 0.5
      };
    }
    case "pie_or_donut": {
      const angle = -Math.PI / 2 + (Math.PI * 2 * clampedIndex) / Math.max(1, count);
      return {
        x: input.rect.x + input.rect.width * (0.5 + Math.cos(angle) * 0.24),
        y: input.rect.y + input.rect.height * (0.54 + Math.sin(angle) * 0.24)
      };
    }
    case "heatmap": {
      const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
      const rows = Math.max(1, Math.ceil(count / columns));
      const cellWidth = (input.rect.width - 88) / columns;
      const cellHeight = (input.rect.height - 132) / rows;
      return {
        x: input.rect.x + 44 + cellWidth * ((clampedIndex % columns) + 0.5),
        y: input.rect.y + 78 + cellHeight * (Math.floor(clampedIndex / columns) + 0.5)
      };
    }
    case "scatter": {
      const pointX = input.rect.x + input.rect.width * (0.18 + (clampedIndex / Math.max(1, count - 1)) * 0.64);
      const pointY = input.rect.y + input.rect.height * (0.72 - (((clampedIndex * 37) % 100) / 100) * 0.44);
      return { x: pointX, y: pointY };
    }
    case "boxplot":
      return {
        x: input.rect.x + input.rect.width * (0.18 + (clampedIndex / Math.max(1, count - 1)) * 0.64),
        y: input.rect.y + input.rect.height * 0.5
      };
    case "map": {
      const anchors = [
        { x: 0.3, y: 0.28 },
        { x: 0.64, y: 0.34 },
        { x: 0.48, y: 0.48 },
        { x: 0.34, y: 0.64 },
        { x: 0.66, y: 0.62 },
        { x: 0.52, y: 0.76 }
      ];
      const anchor = anchors[clamp(clampedIndex, 0, anchors.length - 1)] ?? { x: 0.5, y: 0.52 };
      return {
        x: input.rect.x + input.rect.width * anchor.x,
        y: input.rect.y + input.rect.height * anchor.y
      };
    }
    case "table": {
      const rowCount = Math.max(1, count);
      const rowHeight = Math.max(44, (input.rect.height - 118) / rowCount);
      return {
        x: input.rect.x + input.rect.width * 0.72,
        y: input.rect.y + 104 + rowHeight * clamp(clampedIndex + 0.5, 0.5, rowCount - 0.5)
      };
    }
    case "kpi_card": {
      const columns = Math.min(3, Math.max(1, count));
      const rows = Math.ceil(count / columns);
      const cellWidth = (input.rect.width - 88) / columns;
      const cellHeight = (input.rect.height - 132) / rows;
      return {
        x: input.rect.x + 44 + cellWidth * ((clampedIndex % columns) + 0.5),
        y: input.rect.y + 96 + cellHeight * (Math.floor(clampedIndex / columns) + 0.5)
      };
    }
    case "timeline":
    case "process_flow": {
      const stepCount = Math.max(1, count);
      return {
        x: input.rect.x + 72 + ((input.rect.width - 144) * clampedIndex) / Math.max(1, stepCount - 1),
        y: input.rect.y + input.rect.height * 0.52
      };
    }
    case "comparison_board": {
      const column = clampedIndex % 2;
      const row = Math.floor(clampedIndex / 2);
      const rowCount = Math.max(1, Math.ceil(count / 2));
      return {
        x: input.rect.x + input.rect.width * (column === 0 ? 0.28 : 0.72),
        y: input.rect.y + 132 + ((input.rect.height - 188) * row) / Math.max(1, rowCount - 1)
      };
    }
    case "icon_grid": {
      const columns = count >= 5 ? 3 : 2;
      const rows = Math.max(1, Math.ceil(count / columns));
      const cellWidth = (input.rect.width - 72) / columns;
      const cellHeight = (input.rect.height - 112) / rows;
      return {
        x: input.rect.x + 36 + cellWidth * ((clampedIndex % columns) + 0.5),
        y: input.rect.y + 86 + cellHeight * (Math.floor(clampedIndex / columns) + 0.5)
      };
    }
    case "anatomy_diagram": {
      const anchors = [
        { x: input.rect.x + input.rect.width * 0.28, y: input.rect.y + input.rect.height * 0.34 },
        { x: input.rect.x + input.rect.width * 0.72, y: input.rect.y + input.rect.height * 0.29 },
        { x: input.rect.x + input.rect.width * 0.36, y: input.rect.y + input.rect.height * 0.7 },
        { x: input.rect.x + input.rect.width * 0.7, y: input.rect.y + input.rect.height * 0.76 }
      ];
      return anchors[clamp(clampedIndex, 0, anchors.length - 1)];
    }
    case "risk_meter": {
      const markerPositions = [0.2, 0.5, 0.82];
      return {
        x: input.rect.x + 20 + (input.rect.width - 40) * markerPositions[clamp(clampedIndex, 0, markerPositions.length - 1)],
        y: input.rect.y + input.rect.height * 0.52
      };
    }
    case "summary_card":
    case "callout_card": {
      const laneCount = Math.max(1, Math.min(3, count));
      return {
        x: input.rect.x + input.rect.width * 0.5,
        y: input.rect.y + 132 + ((input.rect.height - 184) * clampedIndex) / Math.max(1, laneCount - 1)
      };
    }
    default:
      return {
        x: input.rect.x + input.rect.width * 0.5,
        y: input.rect.y + input.rect.height * 0.5
      };
  }
}

export function resolveSequenceLayoutPlan(input: LayoutPlanInput): DeterministicLayoutPlan {
  const subtitleSafeZone = buildSubtitleSafeZone(input.width, input.height, input.safeArea);
  const mascotBlockingZone = buildMascotBlockingZone(input);
  const primaryVisualBox = buildPrimaryVisualBox(input, subtitleSafeZone, mascotBlockingZone);
  const insertBox = buildInsertBox({
    width: input.width,
    height: input.height,
    safeArea: input.safeArea,
    insertAsset: input.insertAsset,
    visualObjects: input.visualObjects,
    subtitleSafeZone,
    mascotBlockingZone,
    primaryVisualBox
  });
  const narrationBox = buildNarrationBox({
    width: input.width,
    height: input.height,
    safeArea: input.safeArea,
    subtitleSafeZone,
    mascotBlockingZone,
    primaryVisualBox,
    insertBox,
    visualIntentFamily: input.visualIntentFamily,
    previousVisualIntentFamily: input.previousVisualIntentFamily,
    previousLayoutPlan: input.previousLayoutPlan
  });
  const negativeSpaceBox = buildNegativeSpaceBox({
    width: input.width,
    height: input.height,
    safeArea: input.safeArea,
    mascotBlockingZone,
    primaryVisualBox,
    narrationBox
  });
  const occluderBox = buildOccluderBox({
    width: input.width,
    height: input.height,
    characterX: input.characterX,
    expectOcclusion: input.expectOcclusion
  });
  const primaryVisualObject = resolvePrimaryVisualObject(input);
  const pointerTargetCount = resolvePrimaryVisualPointerTargetCount({
    kind: primaryVisualObject?.kind ?? input.primaryVisualKind,
    chartData: input.chartData,
    pointerTargetIds: primaryVisualObject?.pointerTargetIds,
    anchors: primaryVisualObject?.anchors
  });

  const pointerReachability =
    input.pointerEnabled && pointerTargetCount > 0
      ? (() => {
          const targetPoint = computePrimaryVisualAnchorInRect({
            kind: primaryVisualObject?.kind ?? input.primaryVisualKind,
            chartData: input.chartData,
            pointerTargetIds: primaryVisualObject?.pointerTargetIds,
            anchors: primaryVisualObject?.anchors,
            targetIndex: input.pointerTargetIndex,
            rect: primaryVisualBox
          });
          const mascotCenter = {
            x: clamp(input.characterX, 0, 1) * input.width,
            y: clamp(input.characterY, 0, 1) * input.height
          };
          const distance = Math.hypot(targetPoint.x - mascotCenter.x, targetPoint.y - mascotCenter.y);
          const sameSide = (targetPoint.x < input.width / 2) === (mascotCenter.x < input.width / 2);
          if (sameSide) {
            return {
              reachable: false,
              reason: "visual_same_side_as_mascot",
              mascotToTargetDistancePx: distance,
              targetPoint
            };
          }
          if (distance < 180) {
            return {
              reachable: false,
              reason: "target_too_close",
              mascotToTargetDistancePx: distance,
              targetPoint
            };
          }
          if (distance > 1500) {
            return {
              reachable: false,
              reason: "target_too_far",
              mascotToTargetDistancePx: distance,
              targetPoint
            };
          }
          return {
            reachable: true,
            reason: "reachable",
            mascotToTargetDistancePx: distance,
            targetPoint
          };
        })()
      : {
          reachable: true,
          reason: "not_applicable",
          mascotToTargetDistancePx: null
        };

  return {
    subtitleSafeZone,
    narrationBox,
    primaryVisualBox,
    chartSafeZone: input.hasChart || !!primaryVisualObject ? primaryVisualBox : undefined,
    mascotBlockingZone,
    insertBox,
    negativeSpaceBox,
    occluderBox,
    pointerReachability
  };
}

function applyResolvedLayoutPlan(
  sequence: DeterministicSequence,
  layoutPlan: DeterministicLayoutPlan
): DeterministicSequence {
  return {
    ...sequence,
    layoutPlan,
    visualBox: layoutPlan.primaryVisualBox,
    narrationBox: layoutPlan.narrationBox,
    pointerReachableZone: layoutPlan.pointerReachability
  };
}

export function applyLayoutContinuityToSequences(input: {
  width: number;
  height: number;
  safeArea: RenderSafeArea;
  sequences: DeterministicSequence[];
}): DeterministicSequence[] {
  let previousSequence: DeterministicSequence | undefined;
  return input.sequences.map((sequence) => {
    const layoutPlan = resolveSequenceLayoutPlan({
      width: input.width,
      height: input.height,
      safeArea: input.safeArea,
      chartData: sequence.chartData,
      hasChart: sequence.hasChart,
      visualMode: sequence.visualMode,
      primaryVisualKind: sequence.primaryVisualKind,
      visualObjects: sequence.visualObjects,
      insertAsset: sequence.insertAsset,
      characterX: sequence.characterX,
      characterY: sequence.characterY,
      pointerEnabled: sequence.pointerEnabled,
      pointerTargetIndex: sequence.pointerTargetIndex,
      expectOcclusion: sequence.expectOcclusion,
      visualIntentFamily: sequence.visualPlan?.selected_intent_family,
      previousVisualIntentFamily: previousSequence?.visualPlan?.selected_intent_family,
      previousLayoutPlan: previousSequence?.layoutPlan
    });
    const resolved = applyResolvedLayoutPlan(sequence, layoutPlan);
    previousSequence = resolved;
    return resolved;
  });
}
