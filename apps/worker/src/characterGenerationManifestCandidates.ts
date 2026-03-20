import fs from "node:fs";
import path from "node:path";
import type { CharacterCandidateProviderMeta, CharacterView } from "@ec/image-gen";

type CandidateScoreBreakdownLike = {
  alphaScore: number;
  occupancyScore: number;
  sharpnessScore: number;
  noiseScore: number;
  watermarkScore: number;
  resolutionScore: number;
  referenceScore: number;
  styleScore: number;
  qualityScore: number;
  targetStyleScore?: number;
  speciesScore?: number;
  speciesEarScore?: number;
  speciesMuzzleScore?: number;
  speciesHeadShapeScore?: number;
  speciesSilhouetteScore?: number;
  monochromeScore?: number;
  paletteSimplicityScore?: number;
  headRatioScore?: number;
  headSquarenessScore?: number;
  silhouetteScore?: number;
  frontSymmetryScore?: number;
  contrastScore?: number;
  pawStabilityScore?: number;
  pawRoundnessScore?: number;
  pawSymmetryScore?: number;
  fingerSafetyScore?: number;
  handRegionDensityScore?: number;
  subjectFillRatio?: number;
  subjectIsolationScore?: number;
  largestComponentShare?: number;
  significantComponentCount?: number;
  dogFrontReadabilityScore?: number;
  runtimeQualityScore?: number;
  runtimePenalty?: number;
  structureCoverageScore?: number;
  routeQualityScore?: number;
  runtimeWarningCount?: number;
  runtimeRejectionCount?: number;
  consistencyScore: number | null;
  consistencyParts?: {
    phash: number;
    palette: number;
    bboxCenter: number;
    bboxScale: number;
    alphaDensity: number;
    upperAlpha: number;
    headAspect: number;
    upperFace: number;
    monochrome: number;
    paletteComplexity: number;
  };
  generationRound: number;
};

export type ParsedManifestCandidate = {
  id: string;
  provider?: string;
  view: CharacterView;
  candidateIndex: number;
  seed: number;
  mimeType: string;
  filePath: string;
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  consistencyScore: number | null;
  warnings: string[];
  rejections: string[];
  breakdown?: CandidateScoreBreakdownLike;
  providerMeta?: CharacterCandidateProviderMeta;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseManifestCandidate(manifestPath: string, candidate: unknown): ParsedManifestCandidate | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const id = asString(candidate.id).trim();
  const viewRaw = asString(candidate.view).trim();
  const provider = asString(candidate.provider).trim();
  const candidateIndex = typeof candidate.candidateIndex === "number" ? candidate.candidateIndex : 0;
  const seed = typeof candidate.seed === "number" ? candidate.seed : 0;
  const mimeType = asString(candidate.mimeType).trim() || "image/png";
  const filePathRaw = asString(candidate.filePath).trim();
  if (!id || !filePathRaw) {
    return null;
  }

  let view: CharacterView;
  if (viewRaw === "front" || viewRaw === "threeQuarter" || viewRaw === "profile") {
    view = viewRaw;
  } else {
    return null;
  }

  const filePath = path.resolve(path.dirname(manifestPath), filePathRaw);
  const score = typeof candidate.score === "number" ? candidate.score : 0.5;
  const styleScore = typeof candidate.styleScore === "number" ? candidate.styleScore : 0.5;
  const referenceSimilarity = typeof candidate.referenceSimilarity === "number" ? candidate.referenceSimilarity : null;
  const consistencyScore = typeof candidate.consistencyScore === "number" ? candidate.consistencyScore : null;
  const warnings = Array.isArray(candidate.warnings)
    ? candidate.warnings.filter((item): item is string => typeof item === "string")
    : [];
  const rejections = Array.isArray(candidate.rejections)
    ? candidate.rejections.filter((item): item is string => typeof item === "string")
    : [];
  const breakdown = isRecord(candidate.breakdown) ? (candidate.breakdown as CandidateScoreBreakdownLike) : undefined;
  const providerMeta = isRecord(candidate.providerMeta)
    ? (candidate.providerMeta as CharacterCandidateProviderMeta)
    : undefined;

  return {
    id,
    ...(provider ? { provider } : {}),
    view,
    candidateIndex,
    seed,
    mimeType,
    filePath,
    score,
    styleScore,
    referenceSimilarity,
    consistencyScore,
    warnings,
    rejections,
    ...(breakdown ? { breakdown } : {}),
    ...(providerMeta ? { providerMeta } : {})
  };
}

export async function resolveFrontReferenceFromManifest(manifestPath: string): Promise<{
  referenceImageBase64: string;
  referenceMimeType: string;
} | undefined> {
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    return undefined;
  }

  if (!isRecord(parsedRaw)) {
    return undefined;
  }

  const manifestCandidates = Array.isArray(parsedRaw.candidates) ? parsedRaw.candidates : [];
  const parsedCandidates = manifestCandidates
    .map((candidate) => parseManifestCandidate(manifestPath, candidate))
    .filter((candidate): candidate is ParsedManifestCandidate => candidate !== null)
    .filter((candidate) => candidate.view === "front")
    .sort((a, b) => b.score - a.score);

  const selectedByView = isRecord(parsedRaw.selectedByView) ? parsedRaw.selectedByView : null;
  const selectedFrontCandidateId =
    selectedByView &&
    isRecord(selectedByView.front) &&
    typeof selectedByView.front.candidateId === "string" &&
    selectedByView.front.candidateId.trim().length > 0
      ? selectedByView.front.candidateId.trim()
      : null;

  const selected = selectedFrontCandidateId
    ? parsedCandidates.find((candidate) => candidate.id === selectedFrontCandidateId)
    : null;
  const chosen = selected ?? parsedCandidates[0];
  if (!chosen) {
    return undefined;
  }

  if (!fs.existsSync(chosen.filePath)) {
    return undefined;
  }

  const data = fs.readFileSync(chosen.filePath);
  return {
    referenceImageBase64: data.toString("base64"),
    referenceMimeType: chosen.mimeType
  };
}
