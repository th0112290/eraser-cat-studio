import fs from "node:fs";
import path from "node:path";
import { stableStringify } from "@ec/shared";
import type { CharacterOverrideKind, CharacterProposalApplyMode } from "./characterRouteActions";

type JsonRecord = Record<string, unknown>;

export type CharacterProposalPreviewEntry = {
  kind: CharacterOverrideKind;
  available: boolean;
  state: "missing" | "create" | "update" | "unchanged";
  tone: "bad" | "warn" | "ok" | "muted";
  stateLabel: string;
  summary: string;
  detail: string;
};

type OverrideHttpError = Error & { statusCode: number; details?: unknown };

const CHARACTER_OVERRIDE_VIEWS = ["front", "threeQuarter", "profile"] as const;
const CHARACTER_ANCHOR_OVERRIDE_IDS = [
  "head_center",
  "mouth_center",
  "eye_near",
  "eye_far",
  "ear_near",
  "ear_far",
  "paw_anchor",
  "tail_root"
] as const;
const CHARACTER_ANCHOR_OVERRIDE_STATUSES = ["present", "occluded", "missing", "not_applicable"] as const;

function createOverrideHttpError(statusCode: number, message: string, details?: unknown): OverrideHttpError {
  const error = new Error(message) as OverrideHttpError;
  error.statusCode = statusCode;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonFileSafe(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePrettyJsonDocument(value: unknown): string {
  const normalized = JSON.parse(stableStringify(value));
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function buildEmptyManualOverrideDocument(kind: CharacterOverrideKind): JsonRecord {
  if (kind === "anchors") {
    return {
      views: {
        front: {},
        threeQuarter: {},
        profile: {}
      }
    };
  }
  return {
    torso: {},
    head: {},
    eyes: {},
    mouth: {}
  };
}

function sanitizeAnchorOverridePayload(raw: unknown): JsonRecord {
  if (!isRecord(raw)) {
    throw createOverrideHttpError(400, "anchors override must be a JSON object");
  }
  const viewRoot = isRecord(raw.views) ? raw.views : raw;
  const sanitizedViews: JsonRecord = {};

  for (const view of CHARACTER_OVERRIDE_VIEWS) {
    const rawView = isRecord(viewRoot[view]) ? viewRoot[view] : null;
    if (!rawView) {
      continue;
    }
    const sanitizedView: JsonRecord = {};
    for (const anchorId of CHARACTER_ANCHOR_OVERRIDE_IDS) {
      const rawEntry = rawView[anchorId];
      if (!isRecord(rawEntry)) {
        continue;
      }
      const sanitizedEntry: JsonRecord = {};
      const x = readFiniteNumber(rawEntry.x);
      const y = readFiniteNumber(rawEntry.y);
      const confidence = readFiniteNumber(rawEntry.confidence);
      const status = typeof rawEntry.status === "string" ? rawEntry.status.trim() : "";
      const notes = typeof rawEntry.notes === "string" ? rawEntry.notes.trim() : "";
      if (x !== undefined) {
        sanitizedEntry.x = x;
      }
      if (y !== undefined) {
        sanitizedEntry.y = y;
      }
      if (confidence !== undefined) {
        sanitizedEntry.confidence = confidence;
      }
      if ((CHARACTER_ANCHOR_OVERRIDE_STATUSES as readonly string[]).includes(status)) {
        sanitizedEntry.status = status;
      }
      if (notes.length > 0) {
        sanitizedEntry.notes = notes;
      }
      if (Object.keys(sanitizedEntry).length > 0) {
        sanitizedView[anchorId] = sanitizedEntry;
      }
    }
    if (Object.keys(sanitizedView).length > 0) {
      sanitizedViews[view] = sanitizedView;
    }
  }

  if (Object.keys(sanitizedViews).length === 0) {
    throw createOverrideHttpError(400, "anchors override did not include any valid anchor entries");
  }

  return { views: sanitizedViews };
}

function sanitizeCropBoxPayload(rawBox: unknown): JsonRecord | null {
  if (!isRecord(rawBox)) {
    return null;
  }
  const sanitized: JsonRecord = {};
  const cx = readFiniteNumber(rawBox.cx);
  const cy = readFiniteNumber(rawBox.cy);
  const w = readFiniteNumber(rawBox.w);
  const h = readFiniteNumber(rawBox.h);
  if (cx !== undefined) {
    sanitized.cx = cx;
  }
  if (cy !== undefined) {
    sanitized.cy = cy;
  }
  if (w !== undefined) {
    sanitized.w = w;
  }
  if (h !== undefined) {
    sanitized.h = h;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeCropBoxOverridePayload(raw: unknown): JsonRecord {
  if (!isRecord(raw)) {
    throw createOverrideHttpError(400, "crop-boxes override must be a JSON object");
  }

  const sanitized: JsonRecord = {};
  const torsoRoot = isRecord(raw.torso) ? raw.torso : null;
  const headRoot = isRecord(raw.head) ? raw.head : null;
  const eyesRoot = isRecord(raw.eyes) ? raw.eyes : null;

  const torso: JsonRecord = {};
  const head: JsonRecord = {};
  for (const view of CHARACTER_OVERRIDE_VIEWS) {
    const torsoBox = sanitizeCropBoxPayload(torsoRoot?.[view]);
    const headBox = sanitizeCropBoxPayload(headRoot?.[view]);
    if (torsoBox) {
      torso[view] = torsoBox;
    }
    if (headBox) {
      head[view] = headBox;
    }
  }
  if (Object.keys(torso).length > 0) {
    sanitized.torso = torso;
  }
  if (Object.keys(head).length > 0) {
    sanitized.head = head;
  }

  const eyes: JsonRecord = {};
  const leftEye = sanitizeCropBoxPayload(eyesRoot?.left);
  const rightEye = sanitizeCropBoxPayload(eyesRoot?.right);
  if (leftEye) {
    eyes.left = leftEye;
  }
  if (rightEye) {
    eyes.right = rightEye;
  }
  if (Object.keys(eyes).length > 0) {
    sanitized.eyes = eyes;
  }

  const mouth = sanitizeCropBoxPayload(raw.mouth);
  if (mouth) {
    sanitized.mouth = mouth;
  }

  if (Object.keys(sanitized).length === 0) {
    throw createOverrideHttpError(400, "crop-boxes override did not include any valid crop boxes");
  }

  return sanitized;
}

export function readManualOverrideSeed(input: {
  overridePath: string | null;
  proposalPath: string | null;
  kind: CharacterOverrideKind;
}): { text: string; source: "override" | "proposal" | "empty" } {
  const overrideRaw =
    input.overridePath && fs.existsSync(input.overridePath) ? readJsonFileSafe(input.overridePath) : null;
  if (overrideRaw !== null) {
    return {
      text: normalizePrettyJsonDocument(overrideRaw),
      source: "override"
    };
  }

  const proposalRaw =
    input.proposalPath && fs.existsSync(input.proposalPath) ? readJsonFileSafe(input.proposalPath) : null;
  const proposal = isRecord(proposalRaw) ? proposalRaw : null;
  const autoProposal = proposal && isRecord(proposal.auto_proposal) ? proposal.auto_proposal : null;
  const proposalSeed =
    input.kind === "anchors"
      ? autoProposal && isRecord(autoProposal.anchors)
        ? autoProposal.anchors
        : null
      : autoProposal && isRecord(autoProposal.crop_boxes)
        ? autoProposal.crop_boxes
        : null;
  if (proposalSeed) {
    return {
      text: normalizePrettyJsonDocument(proposalSeed),
      source: "proposal"
    };
  }

  return {
    text: normalizePrettyJsonDocument(buildEmptyManualOverrideDocument(input.kind)),
    source: "empty"
  };
}

function readProposalOverrideSeed(input: {
  proposalPath: string | null;
  kind: CharacterOverrideKind;
}): string | null {
  const proposalRaw =
    input.proposalPath && fs.existsSync(input.proposalPath) ? readJsonFileSafe(input.proposalPath) : null;
  const proposal = isRecord(proposalRaw) ? proposalRaw : null;
  const autoProposal = proposal && isRecord(proposal.auto_proposal) ? proposal.auto_proposal : null;
  const proposalSeed =
    input.kind === "anchors"
      ? autoProposal && isRecord(autoProposal.anchors)
        ? autoProposal.anchors
        : null
      : autoProposal && isRecord(autoProposal.crop_boxes)
        ? autoProposal.crop_boxes
        : null;
  if (!proposalSeed) {
    return null;
  }
  return normalizePrettyJsonDocument(
    input.kind === "anchors" ? sanitizeAnchorOverridePayload(proposalSeed) : sanitizeCropBoxOverridePayload(proposalSeed)
  );
}

function readExistingOverrideDocumentText(input: {
  overridePath: string | null;
  kind: CharacterOverrideKind;
}): string | null {
  if (!input.overridePath || !fs.existsSync(input.overridePath)) {
    return null;
  }
  const raw = readJsonFileSafe(input.overridePath);
  if (!isRecord(raw)) {
    return null;
  }
  return normalizePrettyJsonDocument(
    input.kind === "anchors" ? sanitizeAnchorOverridePayload(raw) : sanitizeCropBoxOverridePayload(raw)
  );
}

function countAnchorEntries(value: unknown): { viewCount: number; anchorCount: number } {
  const root = isRecord(value) ? value : null;
  const views = root && isRecord(root.views) ? root.views : root;
  if (!views || !isRecord(views)) {
    return { viewCount: 0, anchorCount: 0 };
  }
  let viewCount = 0;
  let anchorCount = 0;
  for (const viewValue of Object.values(views)) {
    if (!isRecord(viewValue)) {
      continue;
    }
    const ids = Object.values(viewValue).filter((entry) => isRecord(entry));
    if (ids.length > 0) {
      viewCount += 1;
      anchorCount += ids.length;
    }
  }
  return { viewCount, anchorCount };
}

function isCropBoxLeaf(value: unknown): boolean {
  return isRecord(value) && typeof value.w === "number" && typeof value.h === "number";
}

function countCropBoxEntries(value: unknown): { groupCount: number; boxCount: number } {
  const root = isRecord(value) ? value : null;
  if (!root) {
    return { groupCount: 0, boxCount: 0 };
  }
  let groupCount = 0;
  let boxCount = 0;
  for (const groupValue of Object.values(root)) {
    if (!isRecord(groupValue)) {
      continue;
    }
    let localCount = 0;
    for (const entry of Object.values(groupValue)) {
      if (isCropBoxLeaf(entry)) {
        localCount += 1;
      }
    }
    if (localCount > 0) {
      groupCount += 1;
      boxCount += localCount;
    }
  }
  return { groupCount, boxCount };
}

function summarizeProposalPreviewDocument(input: {
  kind: CharacterOverrideKind;
  proposalText: string | null;
  overrideText: string | null;
}): CharacterProposalPreviewEntry {
  if (!input.proposalText) {
    return {
      kind: input.kind,
      available: false,
      state: "missing",
      tone: "bad",
      stateLabel: "unavailable",
      summary:
        input.kind === "anchors" ? "proposal.json has no anchor seed" : "proposal.json has no crop-box seed",
      detail:
        input.kind === "anchors"
          ? "Apply proposal is blocked until auto_proposal.anchors exists."
          : "Apply proposal is blocked until auto_proposal.crop_boxes exists."
    };
  }

  const parsedProposal = JSON.parse(input.proposalText);
  const summary =
    input.kind === "anchors"
      ? (() => {
          const stats = countAnchorEntries(parsedProposal);
          return `${stats.viewCount} views / ${stats.anchorCount} anchors`;
        })()
      : (() => {
          const stats = countCropBoxEntries(parsedProposal);
          return `${stats.groupCount} groups / ${stats.boxCount} crop boxes`;
        })();

  if (!input.overrideText) {
    return {
      kind: input.kind,
      available: true,
      state: "create",
      tone: "warn",
      stateLabel: "create override",
      summary,
      detail:
        input.kind === "anchors"
          ? "No anchors.json override exists yet. Applying proposal will create the first explicit anchor override file."
          : "No crop-boxes.json override exists yet. Applying proposal will create the first explicit crop override file."
    };
  }

  if (input.overrideText === input.proposalText) {
    return {
      kind: input.kind,
      available: true,
      state: "unchanged",
      tone: "ok",
      stateLabel: "already synced",
      summary,
      detail:
        input.kind === "anchors"
          ? "Proposal anchors already match the saved anchors.json override."
          : "Proposal crop boxes already match the saved crop-boxes.json override."
    };
  }

  return {
    kind: input.kind,
    available: true,
    state: "update",
    tone: "warn",
    stateLabel: "update override",
    summary,
    detail:
      input.kind === "anchors"
        ? "Proposal anchors differ from the current anchors.json override and will overwrite it."
        : "Proposal crop boxes differ from the current crop-boxes.json override and will overwrite it."
  };
}

export function summarizeProposalApplyPreview(input: {
  proposalPath: string | null;
  anchorsOverridePath: string | null;
  cropBoxesOverridePath: string | null;
}): CharacterProposalPreviewEntry[] {
  return (["anchors", "cropBoxes"] as const).map((kind) =>
    summarizeProposalPreviewDocument({
      kind,
      proposalText: readProposalOverrideSeed({ proposalPath: input.proposalPath, kind }),
      overrideText: readExistingOverrideDocumentText({
        overridePath: kind === "anchors" ? input.anchorsOverridePath : input.cropBoxesOverridePath,
        kind
      })
    })
  );
}

export function buildProposalApplyOverrideDocuments(input: {
  proposalPath: string | null;
  applyMode: CharacterProposalApplyMode;
}): {
  appliedKinds: CharacterOverrideKind[];
  anchorsText: string | null;
  cropBoxesText: string | null;
} {
  const anchorsText =
    input.applyMode === "all" || input.applyMode === "anchors"
      ? readProposalOverrideSeed({ proposalPath: input.proposalPath, kind: "anchors" })
      : null;
  const cropBoxesText =
    input.applyMode === "all" || input.applyMode === "cropBoxes"
      ? readProposalOverrideSeed({ proposalPath: input.proposalPath, kind: "cropBoxes" })
      : null;
  const appliedKinds: CharacterOverrideKind[] = [];
  if (anchorsText) {
    appliedKinds.push("anchors");
  }
  if (cropBoxesText) {
    appliedKinds.push("cropBoxes");
  }
  if (appliedKinds.length === 0) {
    throw createOverrideHttpError(400, "proposal.json does not expose anchor or crop-box override seeds yet");
  }
  if (input.applyMode === "anchors" && !anchorsText) {
    throw createOverrideHttpError(400, "proposal.json does not expose anchors yet");
  }
  if (input.applyMode === "cropBoxes" && !cropBoxesText) {
    throw createOverrideHttpError(400, "proposal.json does not expose crop boxes yet");
  }
  return {
    appliedKinds,
    anchorsText,
    cropBoxesText
  };
}

export function normalizeManualOverrideText(rawText: string, kind: CharacterOverrideKind): string {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    throw createOverrideHttpError(400, `${kind === "anchors" ? "anchors" : "crop boxes"} override JSON is required`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createOverrideHttpError(400, `Invalid ${kind === "anchors" ? "anchors" : "crop boxes"} override JSON: ${message}`);
  }
  if (!isRecord(parsed)) {
    throw createOverrideHttpError(400, `${kind === "anchors" ? "anchors" : "crop boxes"} override must be a JSON object`);
  }
  return normalizePrettyJsonDocument(
    kind === "anchors" ? sanitizeAnchorOverridePayload(parsed) : sanitizeCropBoxOverridePayload(parsed)
  );
}

export function resolveManualOverrideFilePath(characterRoot: string, kind: CharacterOverrideKind): string {
  return path.join(characterRoot, "pack", "overrides", kind === "anchors" ? "anchors.json" : "crop-boxes.json");
}

export function materializeCharacterOverrideDocuments(input: {
  appliedKinds: CharacterOverrideKind[];
  anchorsText: string | null;
  cropBoxesText: string | null;
  anchorsOverridePath: string;
  cropBoxesOverridePath: string;
}): {
  appliedKinds: CharacterOverrideKind[];
  anchorsOverridePath: string | null;
  cropBoxesOverridePath: string | null;
} {
  fs.mkdirSync(path.dirname(input.anchorsOverridePath), { recursive: true });
  if (input.anchorsText) {
    fs.writeFileSync(input.anchorsOverridePath, input.anchorsText, "utf8");
  }
  if (input.cropBoxesText) {
    fs.writeFileSync(input.cropBoxesOverridePath, input.cropBoxesText, "utf8");
  }
  return {
    appliedKinds: input.appliedKinds,
    anchorsOverridePath: input.anchorsText ? input.anchorsOverridePath : null,
    cropBoxesOverridePath: input.cropBoxesText ? input.cropBoxesOverridePath : null
  };
}
