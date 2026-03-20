import fs from "node:fs";
import path from "node:path";
import type { RigReviewState } from "./uiRouteRigReviewState";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function candidateCompareStem(filePath: string): string {
  const name = path.basename(filePath);
  const suffixes = [
    ".premium_candidate_judge.json",
    ".premium_actual_judge.json",
    ".plan.json",
    ".request.json",
    ".prompt.txt"
  ];
  for (const suffix of suffixes) {
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length);
    }
  }
  return path.basename(filePath, path.extname(filePath));
}

export function collectReferenceLineageWithResolvers(input: {
  baseDir: string;
  readJsonFileSafe: (filePath: string) => unknown | null;
  normalizeJsonArtifactPath: (candidatePath: unknown) => string | null;
  createEmptyRigReviewState: () => RigReviewState;
  mergeRigReviewStates: (...states: RigReviewState[]) => RigReviewState;
  extractRigReviewState: (doc: unknown) => RigReviewState;
}): { manifestPaths: string[]; selectedImagePaths: string[]; rig: RigReviewState } {
  const shotSidecarDir =
    path.basename(input.baseDir).toLowerCase() === "shot_sidecar"
      ? input.baseDir
      : path.join(input.baseDir, "shot_sidecar");
  if (!fs.existsSync(shotSidecarDir)) {
    return { manifestPaths: [], selectedImagePaths: [], rig: input.createEmptyRigReviewState() };
  }

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(shotSidecarDir)
      .filter((name) => name.endsWith(".request.json") || name.endsWith(".plan.json"))
      .map((name) => path.join(shotSidecarDir, name))
      .slice(0, 12);
  } catch {
    return { manifestPaths: [], selectedImagePaths: [], rig: input.createEmptyRigReviewState() };
  }

  const manifestPaths: string[] = [];
  const selectedImagePaths: string[] = [];
  let rig = input.createEmptyRigReviewState();
  for (const filePath of entries) {
    const doc = input.readJsonFileSafe(filePath);
    if (!isRecord(doc)) {
      continue;
    }
    rig = input.mergeRigReviewStates(rig, input.extractRigReviewState(doc));
    const referenceBundle = isRecord(doc.reference_bundle) ? doc.reference_bundle : {};
    const candidateManifest = str(referenceBundle.generation_manifest_path);
    const candidateImage = str(referenceBundle.selected_image_path) ?? str(doc.first_frame);
    if (candidateManifest) {
      manifestPaths.push(candidateManifest);
    }
    if (candidateImage) {
      selectedImagePaths.push(candidateImage);
    }
    const requestPath = input.normalizeJsonArtifactPath(doc.request_path);
    if (requestPath && requestPath !== filePath) {
      const requestDoc = input.readJsonFileSafe(requestPath);
      if (isRecord(requestDoc) && isRecord(requestDoc.reference_bundle)) {
        rig = input.mergeRigReviewStates(rig, input.extractRigReviewState(requestDoc));
        const nestedReference = requestDoc.reference_bundle;
        const nestedManifest = str(nestedReference.generation_manifest_path);
        const nestedImage = str(nestedReference.selected_image_path) ?? str(requestDoc.first_frame);
        if (nestedManifest) {
          manifestPaths.push(nestedManifest);
        }
        if (nestedImage) {
          selectedImagePaths.push(nestedImage);
        }
      }
    }
  }

  return {
    manifestPaths: uniqueStrings(manifestPaths),
    selectedImagePaths: uniqueStrings(selectedImagePaths),
    rig
  };
}

export function buildCandidateCompareMapFromItems(
  items: Array<{ label: string; path: string }>,
  readJsonFileSafe: (filePath: string) => unknown | null
): Map<string, string> {
  const candidateMap = new Map<string, string>();
  for (const item of items) {
    const doc = readJsonFileSafe(item.path);
    const shotId = str(isRecord(doc) ? doc.shot_id : undefined) ?? candidateCompareStem(item.path);
    candidateMap.set(shotId, item.path);
  }
  return candidateMap;
}
