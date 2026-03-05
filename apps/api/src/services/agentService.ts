import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  AgentSuggestionStatus,
  AgentSuggestionType,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { Queue, type JobsOptions } from "bullmq";
import { createDefaultNotifier, estimateJobCost } from "@ec/ops";
import type { EpisodeJobPayload } from "@ec/shared";
import { apiQueueRetentionOptions } from "./jobRetention";
import { writeAuditLog } from "./auditService";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };
type ActiveJobStatus = "QUEUED" | "RUNNING";
type HitlReviewAction = "approve" | "reject";

type FeatureFlags = {
  director: boolean;
  qaInspector: boolean;
  templateImprover: boolean;
  hitlUi: boolean;
};

type BeatSnapshot = {
  beatId: string;
  kind: string;
  narration: string;
};

type ShotSnapshot = {
  shotId: string;
  durationFrames: number;
  hasChart: boolean;
  hasPointing: boolean;
  hasAudio: boolean;
};

type DirectorAlternative = {
  id: string;
  title: string;
  rationale: string;
  estimatedDurationDeltaSec: number;
  cameraMoves: string[];
  pacingRules: string[];
  affectedShotIds: string[];
};

type QaDimension = {
  score: number;
  reasons: string[];
  metrics: JsonRecord;
};

type FinalRunIssue = {
  code: string;
  severity: "INFO" | "WARN" | "ERROR";
  message: string;
  shotId?: string;
};

type HitlFailedShot = {
  shotId: string;
  issueCodes: string[];
  messages: string[];
  errorCount: number;
};

type QcIssueAggregate = {
  code: string;
  count: number;
  warnCount: number;
  errorCount: number;
};

const notifier = createDefaultNotifier();
const DEFAULT_QUEUE_NAME = "episode-jobs";
const RENDER_JOB_NAME = "RENDER_EPISODE";
const DEFAULT_BACKOFF_MS = 1000;
const MAX_RETRY_ATTEMPTS = 5;
const AGENT_TYPE_SET = new Set<string>(Object.values(AgentSuggestionType));
const AGENT_STATUS_SET = new Set<string>(Object.values(AgentSuggestionStatus));

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countWords(text: string): number {
  const normalized = text.trim();
  if (normalized === "") {
    return 0;
  }
  return normalized.split(/\s+/).length;
}

function logDetails(details: JsonRecord): Prisma.InputJsonValue {
  return details as Prisma.InputJsonValue;
}

function parseFeatureFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return defaultValue;
  }

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function readFeatureFlags(): FeatureFlags {
  return {
    director: parseFeatureFlag("FF_AGENT_DIRECTOR", true),
    qaInspector: parseFeatureFlag("FF_AGENT_QA_INSPECTOR", true),
    templateImprover: parseFeatureFlag("FF_AGENT_TEMPLATE_IMPROVER", true),
    hitlUi: parseFeatureFlag("FF_HITL_UI", true)
  };
}

function requireRouteParam(params: unknown, field: string): string {
  if (!isRecord(params)) {
    throw createHttpError(400, "Route params are invalid");
  }

  const value = params[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} path param must be a non-empty string`);
  }

  return value.trim();
}

function requireBodyObject(body: unknown): JsonRecord {
  if (!isRecord(body)) {
    throw createHttpError(400, "Request body must be a JSON object");
  }
  return body;
}

function optionalString(obj: JsonRecord, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} must be a non-empty string`);
  }

  return value.trim();
}

function optionalBoolean(obj: JsonRecord, field: string): boolean | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw createHttpError(400, `${field} must be a boolean`);
  }

  return value;
}

function optionalPositiveInteger(obj: JsonRecord, field: string): number | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw createHttpError(400, `${field} must be a positive integer`);
  }

  return value;
}

function requireStringArray(obj: JsonRecord, field: string): string[] {
  const value = obj[field];
  if (!Array.isArray(value) || value.length === 0) {
    throw createHttpError(400, `${field} must be a non-empty array of strings`);
  }

  const items = value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw createHttpError(400, `${field}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });

  return Array.from(new Set(items));
}

function optionalQueryString(query: unknown, field: string): string | undefined {
  if (query === undefined || query === null) {
    return undefined;
  }
  if (!isRecord(query)) {
    throw createHttpError(400, "Query params are invalid");
  }

  const value = query[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} query must be a non-empty string`);
  }

  return value.trim();
}

function optionalQueryInteger(query: unknown, field: string): number | undefined {
  const value = optionalQueryString(query, field);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw createHttpError(400, `${field} query must be an integer`);
  }

  return parsed;
}

function readStringDetail(details: Prisma.JsonValue | null, key: string): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const value = (details as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function extractBeats(doc: Prisma.JsonValue | null): BeatSnapshot[] {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return [];
  }

  const rawBeats = (doc as Record<string, unknown>).beats;
  if (!Array.isArray(rawBeats)) {
    return [];
  }

  const beats: BeatSnapshot[] = [];
  for (const row of rawBeats) {
    if (!isRecord(row)) {
      continue;
    }

    const beatId = asString(row.beat_id ?? row.id).trim();
    const kind = asString(row.kind ?? row.type, "narrative").trim() || "narrative";
    const narration = asString(row.narration).trim();

    if (beatId === "" || narration === "") {
      continue;
    }

    beats.push({ beatId, kind, narration });
  }

  return beats;
}

function extractShots(doc: Prisma.JsonValue | null): { fps: number; shots: ShotSnapshot[] } {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { fps: 30, shots: [] };
  }

  const objectDoc = doc as Record<string, unknown>;
  const render = isRecord(objectDoc.render) ? objectDoc.render : {};
  const fps = Math.max(1, Math.round(asNumber(render.fps, 30)));

  const rawShots = objectDoc.shots;
  if (!Array.isArray(rawShots)) {
    return { fps, shots: [] };
  }

  const shots: ShotSnapshot[] = [];
  for (const row of rawShots) {
    if (!isRecord(row)) {
      continue;
    }

    const shotId = asString(row.shot_id).trim();
    if (shotId === "") {
      continue;
    }

    const character = isRecord(row.character) ? row.character : {};
    const tracks = isRecord(character.tracks) ? character.tracks : {};
    const pointTrack = Array.isArray(tracks.point_track) ? tracks.point_track : [];

    shots.push({
      shotId,
      durationFrames: Math.max(1, Math.round(asNumber(row.duration_frames, 1))),
      hasChart: isRecord(row.chart),
      hasPointing: pointTrack.length > 0,
      hasAudio: isRecord(row.audio)
    });
  }

  return { fps, shots };
}
function buildDirectorAlternatives(beats: BeatSnapshot[], shots: ShotSnapshot[], fps: number): DirectorAlternative[] {
  if (shots.length === 0) {
    return [
      {
        id: "alt_structure_only",
        title: "Structure-only recommendation",
        rationale: "Shot document is missing, so this pass focuses on narrative rhythm.",
        estimatedDurationDeltaSec: 0,
        cameraMoves: ["Generate shots first, then apply camera proposals."],
        pacingRules: [
          "Target 25-40 shots for 10-minute format.",
          `Spread intents across beats: ${Array.from(new Set(beats.map((beat) => beat.kind))).join(", ") || "narrative"}.`
        ],
        affectedShotIds: []
      }
    ];
  }

  const safeFps = Math.max(1, fps);
  const hookShots = shots.slice(0, Math.min(3, shots.length));
  const chartShots = shots.filter((shot) => shot.hasChart).slice(0, 4);
  const pointShots = shots.filter((shot) => shot.hasPointing).slice(-3);

  const hookFrames = hookShots.reduce((sum, shot) => sum + shot.durationFrames, 0);
  const chartFrames = chartShots.reduce((sum, shot) => sum + shot.durationFrames, 0);
  const pointFrames = pointShots.reduce((sum, shot) => sum + shot.durationFrames, 0);

  return [
    {
      id: "alt_hook_tighten",
      title: "Tighten Hook Pace",
      rationale: "Increase opening energy by shortening first cuts.",
      estimatedDurationDeltaSec: Number((-(hookFrames * 0.12) / safeFps).toFixed(1)),
      cameraMoves: ["Use quick push-in for first shots.", "Prefer hard cuts over fades in the first 15 seconds."],
      pacingRules: ["Keep first 3 shots under 6 seconds.", "One visual objective per hook shot."],
      affectedShotIds: hookShots.map((shot) => shot.shotId)
    },
    {
      id: "alt_data_focus",
      title: "Data Focus Move",
      rationale: "Give chart-heavy segments more visual emphasis.",
      estimatedDurationDeltaSec: Number(((chartFrames * 0.08) / safeFps).toFixed(1)),
      cameraMoves: ["Add mild zoom ramp around highlighted bars.", "Center frame on callout target during narration."],
      pacingRules: ["Avoid overlay clutter in data shots.", "Hold key data highlight for at least 2.2 seconds."],
      affectedShotIds: chartShots.map((shot) => shot.shotId)
    },
    {
      id: "alt_payoff_hold",
      title: "Payoff Hold",
      rationale: "Slow down final segment to improve comprehension and CTA retention.",
      estimatedDurationDeltaSec: Number(((pointFrames * 0.15) / safeFps).toFixed(1)),
      cameraMoves: ["Reduce camera drift in ending shots.", "Hold frame during pointing action."],
      pacingRules: ["Extend final pointing shots by 10-15%.", "Mute non-essential overlays at CTA."],
      affectedShotIds: pointShots.map((shot) => shot.shotId)
    }
  ];
}

function scoreScript(beats: BeatSnapshot[]): QaDimension {
  const narrations = beats.map((beat) => beat.narration);
  const totalWords = narrations.reduce((sum, line) => sum + countWords(line), 0);
  const longLines = narrations.filter((line) => countWords(line) > 28).length;

  const normalized = narrations.map((line) =>
    line.toLowerCase().replace(/[^a-z0-9\s]/gi, "").replace(/\s+/g, " ").trim()
  );

  const seen = new Set<string>();
  let duplicates = 0;
  for (const line of normalized) {
    if (line === "") {
      continue;
    }
    if (seen.has(line)) {
      duplicates += 1;
      continue;
    }
    seen.add(line);
  }

  const reasons: string[] = [];
  let score = 100;

  if (totalWords < 900) {
    score -= 25;
    reasons.push("Script is short for 10-minute target duration.");
  }
  if (longLines > 0) {
    score -= Math.min(20, longLines * 2);
    reasons.push(`Long line count: ${longLines}.`);
  }
  if (duplicates > 0) {
    score -= Math.min(20, duplicates * 4);
    reasons.push(`Repeated narration lines: ${duplicates}.`);
  }
  if (beats.length < 20) {
    score -= 15;
    reasons.push("Beat count is low for pacing diversity.");
  }

  return {
    score: clampScore(score),
    reasons,
    metrics: {
      beatCount: beats.length,
      totalWords,
      averageWordsPerBeat: beats.length > 0 ? Number((totalWords / beats.length).toFixed(2)) : 0,
      longLines,
      duplicates
    }
  };
}

function parseFinalRunIssues(details: Prisma.JsonValue | null): FinalRunIssue[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return [];
  }

  const rawIssues = (details as Record<string, unknown>).finalRunIssues;
  if (!Array.isArray(rawIssues)) {
    return [];
  }

  const issues: FinalRunIssue[] = [];

  for (const row of rawIssues) {
    if (!isRecord(row)) {
      continue;
    }

    const code = asString(row.code).trim();
    const message = asString(row.message).trim();
    const severityRaw = asString(row.severity, "INFO").trim().toUpperCase();
    const shotId = asString(row.shotId).trim();

    if (code === "" || message === "") {
      continue;
    }

    const severity: "INFO" | "WARN" | "ERROR" =
      severityRaw === "ERROR" ? "ERROR" : severityRaw === "WARN" ? "WARN" : "INFO";

    issues.push({
      code,
      severity,
      message,
      ...(shotId !== "" ? { shotId } : {})
    });
  }

  return issues;
}

function scoreVisuals(finalRunIssues: FinalRunIssue[], qcRows: Array<{ severity: string }>): QaDimension {
  const issueErrors = finalRunIssues.filter((issue) => issue.severity === "ERROR").length;
  const issueWarnings = finalRunIssues.filter((issue) => issue.severity === "WARN").length;
  const fallbackErrors = qcRows.filter((row) => row.severity === "ERROR").length;
  const fallbackWarnings = qcRows.filter((row) => row.severity === "WARN").length;

  const errorCount = Math.max(issueErrors, fallbackErrors);
  const warnCount = Math.max(issueWarnings, fallbackWarnings);

  const reasons: string[] = [];
  let score = 100 - errorCount * 14 - warnCount * 2;

  if (errorCount > 0) {
    reasons.push(`Visual blocking errors: ${errorCount}.`);
  }
  if (warnCount > 10) {
    reasons.push(`Visual warnings are high: ${warnCount}.`);
  }
  if (finalRunIssues.length === 0 && qcRows.length === 0) {
    score -= 10;
    reasons.push("No visual QC evidence found.");
  }

  return {
    score: clampScore(score),
    reasons,
    metrics: {
      finalRunIssueCount: finalRunIssues.length,
      errorCount,
      warnCount
    }
  };
}

function scoreAudio(shots: ShotSnapshot[], audioRows: Array<{ severity: string }>): QaDimension {
  const shotsWithAudio = shots.filter((shot) => shot.hasAudio).length;
  const audioErrors = audioRows.filter((row) => row.severity === "ERROR").length;
  const audioWarnings = audioRows.filter((row) => row.severity === "WARN").length;

  const reasons: string[] = [];
  let score = shotsWithAudio > 0 ? 90 : 70;

  if (shots.length > 0 && shotsWithAudio < Math.ceil(shots.length * 0.3)) {
    score -= 10;
    reasons.push("Low ratio of shots containing audio cues.");
  }
  if (audioErrors > 0) {
    score -= audioErrors * 18;
    reasons.push(`Audio clipping errors: ${audioErrors}.`);
  }
  if (audioWarnings > 0) {
    score -= Math.min(10, audioWarnings * 2);
    reasons.push(`Audio clipping warnings: ${audioWarnings}.`);
  }

  return {
    score: clampScore(score),
    reasons,
    metrics: {
      shotCount: shots.length,
      shotsWithAudio,
      audioErrors,
      audioWarnings
    }
  };
}

function aggregateQcIssues(rows: Array<{ check: string; severity: string; details: Prisma.JsonValue | null }>): QcIssueAggregate[] {
  const map = new Map<string, QcIssueAggregate>();

  for (const row of rows) {
    let code = `check:${row.check}`;
    if (row.details && typeof row.details === "object" && !Array.isArray(row.details)) {
      const rawCode = asString((row.details as Record<string, unknown>).code).trim();
      if (rawCode !== "") {
        code = rawCode;
      }
    }

    const current = map.get(code) ?? {
      code,
      count: 0,
      warnCount: 0,
      errorCount: 0
    };

    current.count += 1;
    if (row.severity === "ERROR") {
      current.errorCount += 1;
    }
    if (row.severity === "WARN") {
      current.warnCount += 1;
    }

    map.set(code, current);
  }

  return Array.from(map.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.code.localeCompare(right.code);
  });
}

function suggestionForIssue(issue: QcIssueAggregate): { ruleId: string; tweak: string; reason: string; confidence: number } {
  if (issue.code.startsWith("readability_")) {
    return {
      ruleId: "layout.readability.safe-area",
      tweak: "Increase subtitle safe-area margin and clamp line length.",
      reason: `${issue.count} readability failures observed.`,
      confidence: 0.86
    };
  }
  if (issue.code.startsWith("pointer_")) {
    return {
      ruleId: "pointer.anchor.validation",
      tweak: "Validate pointer target existence before render and raise tolerance by 12px.",
      reason: `${issue.count} pointer failures observed.`,
      confidence: 0.84
    };
  }
  if (issue.code.startsWith("layering_")) {
    return {
      ruleId: "occlusion.layering",
      tweak: "Force character layer behind foreground mask where occlusion is expected.",
      reason: `${issue.count} occlusion failures observed.`,
      confidence: 0.88
    };
  }
  if (issue.code.startsWith("chart_")) {
    return {
      ruleId: "chart.fallback.threshold",
      tweak: "Trigger chart simplification earlier for unstable label/summary checks.",
      reason: `${issue.count} chart failures observed.`,
      confidence: 0.82
    };
  }

  return {
    ruleId: "qc.generic.guard",
    tweak: `Add deterministic precheck for ${issue.code}.`,
    reason: `${issue.count} repeated failures observed.`,
    confidence: 0.7
  };
}

function collectFailedShotsFromIssues(issues: FinalRunIssue[]): HitlFailedShot[] {
  const map = new Map<string, { codeSet: Set<string>; messageSet: Set<string>; count: number }>();

  for (const issue of issues) {
    if (issue.severity !== "ERROR" || !issue.shotId) {
      continue;
    }

    const current = map.get(issue.shotId) ?? {
      codeSet: new Set<string>(),
      messageSet: new Set<string>(),
      count: 0
    };

    current.codeSet.add(issue.code);
    current.messageSet.add(issue.message);
    current.count += 1;
    map.set(issue.shotId, current);
  }

  return Array.from(map.entries())
    .map(([shotId, current]) => ({
      shotId,
      issueCodes: Array.from(current.codeSet),
      messages: Array.from(current.messageSet),
      errorCount: current.count
    }))
    .sort((left, right) => {
      if (right.errorCount !== left.errorCount) {
        return right.errorCount - left.errorCount;
      }
      return left.shotId.localeCompare(right.shotId);
    });
}

function normalizeRetryConfig(input: { maxAttempts?: number; backoffMs?: number }): { maxAttempts: number; backoffMs: number } {
  const maxAttempts = Math.min(Math.max(1, input.maxAttempts ?? 2), MAX_RETRY_ATTEMPTS);
  const backoffMs = Math.max(100, input.backoffMs ?? DEFAULT_BACKOFF_MS);
  return { maxAttempts, backoffMs };
}

function stableShotIds(input: string[]): string[] {
  const deduped = Array.from(new Set(input.map((item) => item.trim()).filter((item) => item !== "")));
  deduped.sort((left, right) => left.localeCompare(right));
  return deduped;
}

function createRerenderKey(episodeId: string, shotIds: string[]): string {
  return createHash("sha256").update(`${episodeId}:${shotIds.join(",")}`).digest("hex").slice(0, 24);
}

async function enqueueWithIdempotency(
  queue: Queue<EpisodeJobPayload>,
  name: string,
  payload: EpisodeJobPayload,
  maxAttempts: number,
  backoffMs: number
) {
  const options: JobsOptions = {
    jobId: payload.jobDbId,
    attempts: maxAttempts,
    backoff: {
      type: "exponential",
      delay: backoffMs
    },
    ...apiQueueRetentionOptions()
  };

  try {
    return await queue.add(name, payload, options);
  } catch (error) {
    const existingJob = await queue.getJob(payload.jobDbId);
    if (existingJob) {
      return existingJob;
    }
    throw error;
  }
}

async function ensureEpisodeExists(prisma: PrismaClient, episodeId: string) {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    select: {
      id: true,
      channelId: true,
      topic: true,
      targetDurationSec: true
    }
  });

  if (!episode) {
    throw createHttpError(404, "Episode not found");
  }

  return episode;
}

async function findExistingRerenderJob(prisma: PrismaClient, episodeId: string, rerenderKey: string) {
  const jobs = await prisma.job.findMany({
    where: {
      episodeId,
      type: "RENDER_PREVIEW",
      status: { in: ["QUEUED", "RUNNING"] satisfies ActiveJobStatus[] }
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      logs: {
        where: { message: "HITL rerender request" },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  for (const row of jobs) {
    const key = readStringDetail(row.logs[0]?.details ?? null, "rerenderKey");
    if (key === rerenderKey) {
      return {
        id: row.id,
        status: row.status,
        bullmqJobId: row.bullmqJobId,
        maxAttempts: row.maxAttempts,
        retryBackoffMs: row.retryBackoffMs
      };
    }
  }

  return null;
}

function renderHitlHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HITL</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;margin:16px;line-height:1.4}
input,button{padding:8px;margin:4px}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border:1px solid #ddd;padding:6px;vertical-align:top}
#status{margin-top:8px;color:#334155}
</style>
</head>
<body>
<h2>HITL Rerender</h2>
<div>
<input id="episodeId" placeholder="episode id" style="min-width:280px" />
<button id="loadBtn">Load Failed Shots</button>
<button id="approveBtn">Approve</button>
<button id="rejectBtn">Reject</button>
<button id="rerenderBtn">Rerender</button>
</div>
<table><thead><tr><th>Pick</th><th>Shot</th><th>Codes</th><th>Messages</th></tr></thead><tbody id="rows"></tbody></table>
<div id="status"></div>
<script>
const query = new URLSearchParams(window.location.search);
const apiKey = query.get("apiKey") || "";
const prefillEpisode = query.get("episodeId") || "";
document.getElementById("episodeId").value = prefillEpisode;
function authHeaders(base){const h=Object.assign({},base||{});if(apiKey){h["x-api-key"]=apiKey;}return h;}
function status(msg,err){const n=document.getElementById("status");n.textContent=msg;n.style.color=err?"#b91c1c":"#334155";}
function selected(){return Array.from(document.querySelectorAll("input[name=pick]:checked")).map((n)=>n.value);}
async function load(){
  const episodeId=document.getElementById("episodeId").value.trim();
  if(!episodeId){status("episodeId required",true);return;}
  const res=await fetch("/hitl/failed-shots?episodeId="+encodeURIComponent(episodeId),{headers:authHeaders({"accept":"application/json"})});
  const body=await res.json();
  if(!res.ok){status(body?.error||"failed",true);return;}
  const rows=document.getElementById("rows");rows.innerHTML="";
  for(const shot of body.data.shots||[]){
    const tr=document.createElement("tr");
    tr.innerHTML="<td><input type='checkbox' name='pick' value='"+shot.shotId+"'/></td><td>"+shot.shotId+"</td><td>"+(shot.issueCodes||[]).join(", ")+"</td><td>"+(shot.messages||[]).join(" | ")+"</td>";
    rows.appendChild(tr);
  }
  status("loaded "+((body.data.shots||[]).length)+" shots",false);
}
async function review(action){
  const episodeId=document.getElementById("episodeId").value.trim();
  const shotIds=selected();
  if(!episodeId||shotIds.length===0){status("episodeId and selected shots required",true);return;}
  const res=await fetch("/hitl/review",{method:"POST",headers:authHeaders({"content-type":"application/json","accept":"application/json"}),body:JSON.stringify({episodeId,shotIds,action})});
  const body=await res.json();
  if(!res.ok){status(body?.error||"failed",true);return;}
  status("saved: "+body.data.suggestion.status,false);
}
async function rerender(){
  const episodeId=document.getElementById("episodeId").value.trim();
  const shotIds=selected();
  if(!episodeId||shotIds.length===0){status("episodeId and selected shots required",true);return;}
  const res=await fetch("/hitl/rerender",{method:"POST",headers:authHeaders({"content-type":"application/json","accept":"application/json"}),body:JSON.stringify({episodeId,shotIds,dryRun:false})});
  const body=await res.json();
  if(!res.ok){status(body?.error||"failed",true);return;}
  status("queued job="+body.data.job.id+" bullmq="+(body.data.job.bullmqJobId||"pending"),false);
}
document.getElementById("loadBtn").addEventListener("click",()=>{void load();});
document.getElementById("approveBtn").addEventListener("click",()=>{void review("approve");});
document.getElementById("rejectBtn").addEventListener("click",()=>{void review("reject");});
document.getElementById("rerenderBtn").addEventListener("click",()=>{void rerender();});
if(prefillEpisode){void load();}
</script>
</body>
</html>`;
}
export function registerAgentRoutes(input: {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue?: Queue<EpisodeJobPayload>;
  queueName?: string;
}): void {
  const { app, prisma } = input;
  const features = readFeatureFlags();
  const queueName = input.queueName ?? input.queue?.name ?? DEFAULT_QUEUE_NAME;

  let ownsQueue = false;
  const queue =
    input.queue ??
    (() => {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw createHttpError(500, "REDIS_URL is required for HITL rerender enqueue");
      }

      ownsQueue = true;
      return new Queue<EpisodeJobPayload>(queueName, {
        connection: { url: redisUrl }
      });
    })();

  if (ownsQueue) {
    app.addHook("onClose", async () => {
      await queue.close();
    });
  }

  app.get("/agents/features", async (request) => {
    await writeAuditLog({
      prisma,
      request,
      statusCode: 200,
      success: true,
      action: "agents.features.get"
    });

    return {
      data: {
        directorEnabled: features.director,
        qaInspectorEnabled: features.qaInspector,
        templateImproverEnabled: features.templateImprover,
        hitlEnabled: features.hitlUi
      }
    };
  });

  app.get("/agents/suggestions", async (request) => {
    try {
      const episodeId = optionalQueryString(request.query, "episodeId");
      const type = optionalQueryString(request.query, "type");
      const status = optionalQueryString(request.query, "status");
      const limit = optionalQueryInteger(request.query, "limit") ?? 50;

      if (limit <= 0 || limit > 500) {
        throw createHttpError(400, "limit query must be between 1 and 500");
      }
      if (type && !AGENT_TYPE_SET.has(type)) {
        throw createHttpError(400, "type query is invalid");
      }
      if (status && !AGENT_STATUS_SET.has(status)) {
        throw createHttpError(400, "status query is invalid");
      }

      const items = await prisma.agentSuggestion.findMany({
        where: {
          ...(episodeId ? { episodeId } : {}),
          ...(type ? { type: type as AgentSuggestionType } : {}),
          ...(status ? { status: status as AgentSuggestionStatus } : {})
        },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: 200,
        success: true,
        action: "agents.suggestions.list",
        details: { count: items.length }
      });

      return { data: items };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "agents.suggestions.list",
        errorMessage: message
      });

      throw error;
    }
  });

  app.post("/agents/director/:episodeId", async (request, reply) => {
    try {
      if (!features.director) {
        throw createHttpError(404, "DirectorAgent is disabled by feature flag");
      }

      const episodeId = requireRouteParam(request.params, "episodeId");
      const episode = await ensureEpisodeExists(prisma, episodeId);

      const [beatDoc, shotDoc] = await Promise.all([
        prisma.beatDoc.findUnique({ where: { episodeId }, select: { json: true } }),
        prisma.shotDoc.findUnique({ where: { episodeId }, select: { json: true } })
      ]);

      const beats = extractBeats(beatDoc?.json ?? null);
      const { fps, shots } = extractShots(shotDoc?.json ?? null);
      const alternatives = buildDirectorAlternatives(beats, shots, fps);

      const suggestion = await prisma.agentSuggestion.create({
        data: {
          episodeId,
          type: AgentSuggestionType.DIRECTOR,
          status: AgentSuggestionStatus.PENDING,
          title: "Director pacing/camera alternatives",
          summary: `Generated ${alternatives.length} deterministic alternatives from beats/shots.`,
          payload: {
            generatedAt: new Date().toISOString(),
            episodeId,
            topic: episode.topic,
            beatCount: beats.length,
            shotCount: shots.length,
            fps,
            alternatives
          } as Prisma.InputJsonValue
        }
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: 201,
        success: true,
        action: "agents.director.create",
        details: {
          episodeId,
          suggestionId: suggestion.id,
          alternatives: alternatives.length
        }
      });

      return reply.code(201).send({ data: { suggestion, alternatives } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "agents.director.create",
        errorMessage: message
      });

      throw error;
    }
  });

  app.post("/agents/qa-inspector/:episodeId", async (request, reply) => {
    try {
      if (!features.qaInspector) {
        throw createHttpError(404, "QAInspector is disabled by feature flag");
      }

      const episodeId = requireRouteParam(request.params, "episodeId");
      const episode = await ensureEpisodeExists(prisma, episodeId);

      const [beatDoc, shotDoc, latestSummary, qcRows, audioRows] = await Promise.all([
        prisma.beatDoc.findUnique({ where: { episodeId }, select: { json: true } }),
        prisma.shotDoc.findUnique({ where: { episodeId }, select: { json: true } }),
        prisma.qCResult.findFirst({
          where: { episodeId, check: "SCHEMA" },
          orderBy: { createdAt: "desc" },
          select: { details: true, createdAt: true }
        }),
        prisma.qCResult.findMany({
          where: { episodeId, passed: false, severity: { in: ["WARN", "ERROR"] } },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { severity: true }
        }),
        prisma.qCResult.findMany({
          where: { episodeId, check: "AUDIO_CLIP", severity: { in: ["WARN", "ERROR"] } },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { severity: true }
        })
      ]);

      const beats = extractBeats(beatDoc?.json ?? null);
      const shots = extractShots(shotDoc?.json ?? null).shots;
      const finalIssues = parseFinalRunIssues(latestSummary?.details ?? null);

      const script = scoreScript(beats);
      const visuals = scoreVisuals(finalIssues, qcRows);
      const audio = scoreAudio(shots, audioRows);

      const overallScore = clampScore(script.score * 0.4 + visuals.score * 0.4 + audio.score * 0.2);
      const pass = overallScore >= 70 && Number(visuals.metrics.errorCount ?? 0) === 0;
      const reasons = [...script.reasons, ...visuals.reasons, ...audio.reasons, ...(pass ? [] : ["Overall score below threshold"])];

      const report = {
        generatedAt: new Date().toISOString(),
        episodeId,
        topic: episode.topic,
        pass,
        overallScore,
        dimensions: { script, visuals, audio },
        reasons,
        latestQcSummaryAt: latestSummary?.createdAt.toISOString() ?? null
      };

      const suggestion = await prisma.agentSuggestion.create({
        data: {
          episodeId,
          type: AgentSuggestionType.QA_INSPECTOR,
          status: pass ? AgentSuggestionStatus.APPROVED : AgentSuggestionStatus.REJECTED,
          title: `QAInspector ${pass ? "PASS" : "FAIL"}`,
          summary: `Overall score ${overallScore}/100`,
          payload: report as Prisma.InputJsonValue
        }
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: 201,
        success: true,
        action: "agents.qa_inspector.create",
        details: {
          episodeId,
          suggestionId: suggestion.id,
          pass,
          overallScore
        }
      });

      return reply.code(201).send({ data: { suggestion, report } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "agents.qa_inspector.create",
        errorMessage: message
      });

      throw error;
    }
  });
  app.post("/agents/template-improver", async (request, reply) => {
    try {
      if (!features.templateImprover) {
        throw createHttpError(404, "TemplateImprover is disabled by feature flag");
      }

      const body = request.body === undefined ? {} : requireBodyObject(request.body);
      const episodeId = optionalString(body, "episodeId");
      const limit = optionalPositiveInteger(body, "limit") ?? 200;

      if (limit > 1000) {
        throw createHttpError(400, "limit must be <= 1000");
      }

      if (episodeId) {
        await ensureEpisodeExists(prisma, episodeId);
      }

      const rows = await prisma.qCResult.findMany({
        where: {
          ...(episodeId ? { episodeId } : {}),
          passed: false,
          severity: { in: ["WARN", "ERROR"] }
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          check: true,
          severity: true,
          details: true
        }
      });

      const aggregates = aggregateQcIssues(rows);
      const recommendations = aggregates.slice(0, 8).map((issue) => ({
        issue,
        recommendation: suggestionForIssue(issue)
      }));

      const suggestion = await prisma.agentSuggestion.create({
        data: {
          ...(episodeId ? { episodeId } : {}),
          type: AgentSuggestionType.TEMPLATE_IMPROVER,
          status: AgentSuggestionStatus.PENDING,
          title: "Template improvement recommendations",
          summary: `Generated ${recommendations.length} deterministic rule tweaks from QC history.`,
          payload: {
            generatedAt: new Date().toISOString(),
            scope: episodeId ? { episodeId } : { scope: "global" },
            analyzedRows: rows.length,
            recommendations
          } as Prisma.InputJsonValue
        }
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: 201,
        success: true,
        action: "agents.template_improver.create",
        details: {
          episodeId: episodeId ?? null,
          suggestionId: suggestion.id,
          recommendations: recommendations.length
        }
      });

      return reply.code(201).send({
        data: {
          suggestion,
          recommendations,
          analyzedRows: rows.length
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "agents.template_improver.create",
        errorMessage: message
      });

      throw error;
    }
  });

  app.get("/hitl", async (request, reply) => {
    try {
      if (!features.hitlUi) {
        throw createHttpError(404, "HITL UI is disabled by feature flag");
      }

      await writeAuditLog({
        prisma,
        request,
        statusCode: 200,
        success: true,
        action: "hitl.ui.get"
      });

      return reply.type("text/html; charset=utf-8").send(renderHitlHtml());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "hitl.ui.get",
        errorMessage: message
      });

      throw error;
    }
  });

  app.get("/hitl/failed-shots", async (request) => {
    try {
      if (!features.hitlUi) {
        throw createHttpError(404, "HITL UI is disabled by feature flag");
      }

      const episodeId = optionalQueryString(request.query, "episodeId");
      if (!episodeId) {
        throw createHttpError(400, "episodeId query is required");
      }

      await ensureEpisodeExists(prisma, episodeId);

      const [latestSummary, fallbackRows] = await Promise.all([
        prisma.qCResult.findFirst({
          where: { episodeId, check: "SCHEMA" },
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true, details: true }
        }),
        prisma.qCResult.findMany({
          where: { episodeId, passed: false, severity: "ERROR" },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { details: true }
        })
      ]);

      const summaryIssues = parseFinalRunIssues(latestSummary?.details ?? null);
      let shots = collectFailedShotsFromIssues(summaryIssues);

      if (shots.length === 0) {
        const fallbackIssues: FinalRunIssue[] = [];
        for (const row of fallbackRows) {
          if (!row.details || typeof row.details !== "object" || Array.isArray(row.details)) {
            continue;
          }

          const details = row.details as Record<string, unknown>;
          const shotId = asString(details.shotId).trim();
          if (shotId === "") {
            continue;
          }

          fallbackIssues.push({
            shotId,
            code: asString(details.code, "qc_error").trim() || "qc_error",
            message: asString(details.message, "QC error").trim() || "QC error",
            severity: "ERROR"
          });
        }

        shots = collectFailedShotsFromIssues(fallbackIssues);
      }

      await writeAuditLog({
        prisma,
        request,
        statusCode: 200,
        success: true,
        action: "hitl.failed_shots.get",
        details: {
          episodeId,
          shotCount: shots.length
        }
      });

      return {
        data: {
          episodeId,
          latestQcSummary: latestSummary
            ? {
                id: latestSummary.id,
                createdAt: latestSummary.createdAt,
                qcReportPath: readStringDetail(latestSummary.details, "qcReportPath")
              }
            : null,
          shots
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "hitl.failed_shots.get",
        errorMessage: message
      });

      throw error;
    }
  });

  app.post("/hitl/review", async (request, reply) => {
    try {
      if (!features.hitlUi) {
        throw createHttpError(404, "HITL UI is disabled by feature flag");
      }

      const body = requireBodyObject(request.body);
      const episodeId = optionalString(body, "episodeId");
      const actionRaw = optionalString(body, "action");
      const note = optionalString(body, "note");
      const shotIds = requireStringArray(body, "shotIds");

      if (!episodeId) {
        throw createHttpError(400, "episodeId is required");
      }
      if (actionRaw !== "approve" && actionRaw !== "reject") {
        throw createHttpError(400, "action must be approve or reject");
      }

      const action = actionRaw as HitlReviewAction;
      await ensureEpisodeExists(prisma, episodeId);

      const suggestion = await prisma.agentSuggestion.create({
        data: {
          episodeId,
          type: AgentSuggestionType.HITL_REVIEW,
          status: action === "approve" ? AgentSuggestionStatus.APPROVED : AgentSuggestionStatus.REJECTED,
          title: `HITL ${action === "approve" ? "approval" : "rejection"}`,
          summary: `${shotIds.length} shots ${action === "approve" ? "approved" : "rejected"} by reviewer.`,
          payload: {
            action,
            shotIds,
            note: note ?? null,
            reviewedAt: new Date().toISOString()
          } as Prisma.InputJsonValue
        }
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: 201,
        success: true,
        action: "hitl.review.create",
        details: {
          episodeId,
          action,
          shotCount: shotIds.length,
          suggestionId: suggestion.id
        }
      });

      return reply.code(201).send({ data: { suggestion } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "hitl.review.create",
        errorMessage: message
      });

      throw error;
    }
  });

  app.post("/hitl/rerender", async (request, reply) => {
    let jobId: string | null = null;

    try {
      if (!features.hitlUi) {
        throw createHttpError(404, "HITL UI is disabled by feature flag");
      }

      const body = requireBodyObject(request.body);
      const episodeId = optionalString(body, "episodeId");
      const dryRun = optionalBoolean(body, "dryRun") ?? false;
      const shotIdsInput = requireStringArray(body, "shotIds");
      const requestedMaxAttempts = optionalPositiveInteger(body, "maxAttempts");
      const requestedBackoffMs = optionalPositiveInteger(body, "backoffMs");

      if (!episodeId) {
        throw createHttpError(400, "episodeId is required");
      }

      const shotIds = stableShotIds(shotIdsInput);
      if (shotIds.length === 0) {
        throw createHttpError(400, "shotIds must include at least one valid id");
      }

      await ensureEpisodeExists(prisma, episodeId);

      const retry = normalizeRetryConfig({
        maxAttempts: requestedMaxAttempts,
        backoffMs: requestedBackoffMs
      });

      const rerenderKey = createRerenderKey(episodeId, shotIds);
      const existing = await findExistingRerenderJob(prisma, episodeId, rerenderKey);

      if (existing) {
        await writeAuditLog({
          prisma,
          request,
          statusCode: 200,
          success: true,
          action: "hitl.rerender.create",
          details: {
            episodeId,
            idempotent: true,
            jobId: existing.id,
            shotCount: shotIds.length
          }
        });

        return {
          data: {
            idempotent: true,
            rerenderKey,
            shotIds,
            job: existing
          }
        };
      }

      const estimatedRenderSeconds = Math.max(15, shotIds.length * 10);
      const estimatedAudioSeconds = Math.max(0, shotIds.length * 4);
      const cost = estimateJobCost({
        estimatedRenderSeconds,
        estimatedAudioSeconds,
        estimatedApiCalls: 1
      });

      const job = await prisma.job.create({
        data: {
          episodeId,
          type: "RENDER_PREVIEW",
          status: "QUEUED",
          progress: 0,
          maxAttempts: retry.maxAttempts,
          retryBackoffMs: retry.backoffMs,
          estimatedRenderSeconds: cost.estimatedRenderSeconds,
          estimatedAudioSeconds: cost.estimatedAudioSeconds,
          estimatedApiCalls: cost.estimatedApiCalls,
          estimatedCostUsd: cost.estimatedCostUsd
        }
      });
      jobId = job.id;

      await prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: logDetails({
            source: "api:hitl",
            queueName,
            maxAttempts: retry.maxAttempts,
            backoffMs: retry.backoffMs,
            estimatedCostUsd: cost.estimatedCostUsd
          })
        }
      });

      await prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: "info",
          message: "HITL rerender request",
          details: logDetails({
            source: "api:hitl",
            rerenderKey,
            shotIds,
            dryRun
          })
        }
      });

      const payload: EpisodeJobPayload = {
        jobDbId: job.id,
        episodeId,
        schemaChecks: [],
        render: {
          dryRun,
          rerenderFailedShotsOnly: true,
          failedShotIds: shotIds
        }
      };

      const bullJob = await enqueueWithIdempotency(
        queue,
        RENDER_JOB_NAME,
        payload,
        retry.maxAttempts,
        retry.backoffMs
      );
      const bullmqJobId = String(bullJob.id);

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          bullmqJobId,
          lastError: null,
          finishedAt: null
        }
      });

      await prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: "info",
          message: "Transition -> ENQUEUED",
          details: logDetails({
            source: "api:hitl",
            queueName,
            bullmqJobId,
            rerenderKey,
            shotIds
          })
        }
      });

      const suggestion = await prisma.agentSuggestion.create({
        data: {
          episodeId,
          jobId: job.id,
          type: AgentSuggestionType.HITL_REVIEW,
          status: AgentSuggestionStatus.APPLIED,
          title: "HITL rerender requested",
          summary: `Queued rerender for ${shotIds.length} selected shots.`,
          payload: {
            rerenderKey,
            shotIds,
            dryRun,
            queueName,
            jobId: job.id,
            bullmqJobId,
            enqueuedAt: new Date().toISOString()
          } as Prisma.InputJsonValue
        }
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: 201,
        success: true,
        action: "hitl.rerender.create",
        details: {
          episodeId,
          idempotent: false,
          jobId: job.id,
          bullmqJobId,
          shotCount: shotIds.length,
          suggestionId: suggestion.id
        }
      });

      return reply.code(201).send({
        data: {
          idempotent: false,
          rerenderKey,
          shotIds,
          job: {
            id: job.id,
            status: "QUEUED",
            bullmqJobId,
            maxAttempts: retry.maxAttempts,
            retryBackoffMs: retry.backoffMs
          },
          suggestion
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            lastError: stack ?? message,
            finishedAt: new Date()
          }
        });

        await prisma.jobLog.create({
          data: {
            jobId,
            level: "error",
            message: "Transition -> FAILED",
            details: logDetails({
              source: "api:hitl",
              error: message,
              stack: stack ?? null
            })
          }
        });

        await notifier.notify({
          source: "api:hitl",
          title: "HITL rerender enqueue failed",
          level: "error",
          body: "Failed to enqueue HITL rerender job.",
          metadata: {
            jobId,
            error: message
          }
        });
      }

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "hitl.rerender.create",
        errorMessage: message
      });

      throw error;
    }
  });
}

