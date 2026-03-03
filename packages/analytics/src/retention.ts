import type { RetentionCurve, RetentionPoint } from "./types";

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function clampPercent(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
}

export function normalizeRetentionPoints(points: RetentionPoint[]): RetentionPoint[] {
  if (points.length < 2) {
    throw new Error("Retention requires at least 2 points");
  }

  const byTime = new Map<number, number>();

  for (const point of points) {
    const timeSec = round(assertFiniteNumber(point.timeSec, "timeSec"), 3);
    const retentionPct = round(clampPercent(assertFiniteNumber(point.retentionPct, "retentionPct")), 3);

    if (timeSec < 0) {
      throw new Error("timeSec must be >= 0");
    }

    byTime.set(timeSec, retentionPct);
  }

  const normalized = Array.from(byTime.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([timeSec, retentionPct]) => ({ timeSec, retentionPct }));

  if (normalized.length < 2) {
    throw new Error("Retention requires at least 2 distinct timestamps");
  }

  return normalized;
}

function parseCsvLine(line: string, lineNumber: number): RetentionPoint {
  const columns = line.split(",").map((value) => value.trim());
  if (columns.length < 2) {
    throw new Error(`CSV line ${lineNumber} must contain at least 2 columns`);
  }

  const timeSec = Number.parseFloat(columns[0]);
  const retentionPct = Number.parseFloat(columns[1]);

  if (!Number.isFinite(timeSec) || !Number.isFinite(retentionPct)) {
    throw new Error(`CSV line ${lineNumber} contains non-numeric values`);
  }

  return { timeSec, retentionPct };
}

function hasHeader(line: string): boolean {
  return /[a-zA-Z]/.test(line);
}

export function parseRetentionCsv(csvText: string): RetentionPoint[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("CSV is empty");
  }

  const startIndex = hasHeader(lines[0]) ? 1 : 0;
  const points: RetentionPoint[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    points.push(parseCsvLine(lines[index], index + 1));
  }

  return normalizeRetentionPoints(points);
}

export function buildRetentionCurve(input: {
  episodeId: string;
  points: RetentionPoint[];
  source?: string;
  uploadedAt?: string;
}): RetentionCurve {
  const points = normalizeRetentionPoints(input.points);
  const durationSec = points[points.length - 1].timeSec;
  const averageRetentionPct = round(
    points.reduce((sum, point) => sum + point.retentionPct, 0) / points.length,
    3
  );

  return {
    episodeId: input.episodeId,
    source: input.source ?? "manual",
    uploadedAt: input.uploadedAt ?? new Date().toISOString(),
    durationSec,
    averageRetentionPct,
    points
  };
}
