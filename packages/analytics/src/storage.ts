import fs from "node:fs";
import path from "node:path";
import type { DropoffAnalysis, RepurposePlan, RetentionCurve } from "./types";

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function analyticsPaths(rootDir: string, episodeId: string): {
  retentionPath: string;
  dropoffPath: string;
  repurposePath: string;
} {
  const safeEpisodeId = episodeId.replace(/[^a-zA-Z0-9_-]/g, "_");

  return {
    retentionPath: path.join(rootDir, "retention", `${safeEpisodeId}.json`),
    dropoffPath: path.join(rootDir, "dropoffs", `${safeEpisodeId}.json`),
    repurposePath: path.join(rootDir, "repurpose", `${safeEpisodeId}.json`)
  };
}

export function saveRetentionCurve(rootDir: string, curve: RetentionCurve): string {
  const filePath = analyticsPaths(rootDir, curve.episodeId).retentionPath;
  writeJson(filePath, curve);
  return filePath;
}

export function saveDropoffAnalysis(rootDir: string, analysis: DropoffAnalysis): string {
  const filePath = analyticsPaths(rootDir, analysis.episodeId).dropoffPath;
  writeJson(filePath, analysis);
  return filePath;
}

export function saveRepurposePlan(rootDir: string, plan: RepurposePlan): string {
  const filePath = analyticsPaths(rootDir, plan.episodeId).repurposePath;
  writeJson(filePath, plan);
  return filePath;
}

export function readRetentionCurve(filePath: string): RetentionCurve {
  return readJson<RetentionCurve>(filePath);
}

export function readDropoffAnalysis(filePath: string): DropoffAnalysis {
  return readJson<DropoffAnalysis>(filePath);
}

export function readRepurposePlan(filePath: string): RepurposePlan {
  return readJson<RepurposePlan>(filePath);
}

export function hasFile(filePath: string): boolean {
  return fs.existsSync(filePath);
}
