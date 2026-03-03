
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createValidator, sha256Hex, stableStringify } from "@ec/shared";
import type { EpisodeJobPayload } from "../services/scheduleService";

type JsonRecord = Record<string, unknown>;
type RegisterUiRoutesInput = {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: Queue;
  queueName: string;
};

type ChannelBibleState = {
  source: string;
  channelId: string;
  version: number;
  schemaId: string;
  jsonText: string;
  isActive: boolean;
  message?: string;
  error?: string;
  validationErrors?: string[];
};

const validator = createValidator();
const DEFAULT_CHANNEL_BIBLE_SCHEMA = "channel_bible.schema.json";
const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function esc(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function q(requestQuery: unknown, key: string): string | undefined {
  if (!isRecord(requestQuery)) return undefined;
  const value = requestQuery[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function b(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const value = body[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function n(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const x = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(x)) return true;
    if (["0", "false", "no", "off"].includes(x)) return false;
  }
  return fallback;
}

function csv(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((v) => (typeof v === "string" ? v.trim() : "")).filter((v) => v.length > 0)));
  }
  if (typeof value === "string") {
    return Array.from(new Set(value.split(",").map((v) => v.trim()).filter((v) => v.length > 0)));
  }
  return [];
}

function pipelineFromMode(mode: string | undefined): JsonRecord | undefined {
  if (!mode) {
    return undefined;
  }

  const normalized = mode.trim().toLowerCase();
  if (normalized === "preview") {
    return {
      stopAfterPreview: true,
      autoRenderFinal: false
    };
  }

  if (normalized === "full") {
    return {
      stopAfterPreview: false,
      autoRenderFinal: true
    };
  }

  return undefined;
}

function getRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../");
}

function getOutRoot(): string {
  return path.join(getRepoRoot(), "out");
}

function getEpisodeOutPaths(episodeId: string) {
  const outDir = path.join(getOutRoot(), episodeId);
  return {
    outDir,
    beats: path.join(outDir, "beats.json"),
    shots: path.join(outDir, "shots.json"),
    preview: path.join(outDir, "preview.mp4"),
    final: path.join(outDir, "final.mp4"),
    qc: path.join(outDir, "qc_report.json")
  };
}

function fmtDate(value: unknown): string {
  if (typeof value !== "string") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return date.toLocaleString("ko-KR", { hour12: false });
}

function badgeClass(status: string): string {
  const s = status.toUpperCase();
  if (["SUCCEEDED", "COMPLETED", "PREVIEW_READY"].includes(s)) return "ok";
  if (s === "FAILED") return "bad";
  if (["RUNNING", "GENERATING"].includes(s)) return "warn";
  return "muted";
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title><style>
body{margin:0;font-family:Segoe UI,Noto Sans KR,sans-serif;background:#f5f7fb;color:#1a2433}header{background:#fff;border-bottom:1px solid #d6deea;position:sticky;top:0}nav{max-width:1200px;margin:0 auto;padding:12px 18px;display:flex;gap:14px;align-items:center}nav strong{margin-right:auto}main{max-width:1200px;margin:18px auto;padding:0 18px;display:grid;gap:12px}.card{background:#fff;border:1px solid #d6deea;border-radius:12px;padding:14px}.notice{padding:9px;border-left:4px solid #2f7eed;background:#edf4ff}.error{padding:9px;border-left:4px solid #d92d20;background:#fff0ef}.grid{display:grid;gap:10px}.two{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}a{color:#0f5bd8;text-decoration:none}a:hover{text-decoration:underline}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e3e8f1;padding:7px;text-align:left;vertical-align:top}.badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}.badge.ok{background:#eaf6ed;color:#1d7a34}.badge.warn{background:#fff8e8;color:#945f02}.badge.bad{background:#fff1ef;color:#b42318}.badge.muted{background:#f2f4f7;color:#475467}input,select,textarea,button{font:inherit;border:1px solid #ccd6e5;border-radius:8px;padding:7px 9px}textarea{width:100%;min-height:220px;resize:vertical}button{background:#0f5bd8;color:#fff;border:none;font-weight:700;cursor:pointer}.secondary{background:#eef3fc;color:#143d6a;border:1px solid #cad8f2}pre{margin:0;background:#0b1220;color:#d3e1ff;padding:10px;border-radius:8px;overflow:auto;font-size:12px}.actions{display:flex;flex-wrap:wrap;gap:8px}.inline{display:inline-flex;gap:8px;align-items:center}
</style></head><body><header><nav><strong>Eraser Cat Control Plane</strong><a href="/ui">Dashboard</a><a href="/ui/channel-bible">ChannelBible</a><a href="/ui/episodes">Episodes</a><a href="/ui/hitl">HITL</a><a href="/ui/artifacts">Artifacts</a></nav></header><main>${body}</main></body></html>`;
}

function internalHeaders(withJson: boolean): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (withJson) headers["content-type"] = "application/json";
  const key = process.env.API_KEY?.trim();
  if (key) headers["x-api-key"] = key;
  return headers;
}

function parseJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function injectJson(app: FastifyInstance, method: "GET" | "POST", url: string, payload?: unknown) {
  const res = (await app.inject({
    method,
    url,
    payload: payload as never,
    headers: internalHeaders(payload !== undefined)
  })) as { statusCode: number; body: string };
  return { statusCode: res.statusCode, body: parseJson(res.body), raw: res.body };
}
async function ensureDefaultChannel(prisma: PrismaClient): Promise<{ id: string; name: string }> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: DEMO_USER_NAME },
    create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME }
  });

  const existing = await prisma.channel.findFirst({ where: { userId: user.id, name: DEMO_CHANNEL_NAME }, orderBy: { createdAt: "asc" } });
  if (existing) return { id: existing.id, name: existing.name };

  const created = await prisma.channel.create({ data: { userId: user.id, name: DEMO_CHANNEL_NAME } });
  return { id: created.id, name: created.name };
}

function snapshotBible(): unknown {
  const p = path.join(getOutRoot(), "channel-bible-snapshot.json");
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
    } catch {
      // ignore broken snapshot
    }
  }
  return {
    channel: { name: "Eraser Cat", language: "ko-KR" },
    style: { tone: "friendly", pacing: "medium" },
    template: { opening: "hook", body: "development", closing: "payoff" }
  };
}

async function loadBibleState(prisma: PrismaClient, patch?: Partial<ChannelBibleState>): Promise<ChannelBibleState> {
  const latest = await prisma.channelBible.findFirst({ orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] });
  const base: ChannelBibleState = {
    source: latest ? `DB: ${latest.id}` : "Snapshot",
    channelId: latest?.channelId ?? "",
    version: latest?.version ?? 1,
    schemaId: latest?.schemaId ?? DEFAULT_CHANNEL_BIBLE_SCHEMA,
    jsonText: JSON.stringify(latest?.json ?? snapshotBible(), null, 2),
    isActive: latest?.isActive ?? true
  };
  return { ...base, ...patch };
}

function bibleHtml(state: ChannelBibleState): string {
  const errors = (state.validationErrors ?? []).map((x) => `<li>${esc(x)}</li>`).join("");
  const statusBlock = state.validationErrors && state.validationErrors.length > 0
    ? `<div class="error"><strong>Validation failed</strong><ul>${errors}</ul></div>`
    : "";
  return page("ChannelBible", `<section class="card"><h1>ChannelBible Editor</h1><p>Source: ${esc(state.source)}</p>${state.message ? `<div class="notice">${esc(state.message)}</div>` : ""}${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}${statusBlock}
<form method="post" action="/ui/channel-bible" class="grid">
<div class="grid two"><label>channelId<input name="channelId" value="${esc(state.channelId)}" placeholder="optional"/></label><label>version<input name="version" value="${esc(state.version)}"/></label><label>schemaId<input name="schemaId" value="${esc(state.schemaId)}"/></label><label>isActive<select name="isActive"><option value="true" ${state.isActive ? "selected" : ""}>true</option><option value="false" ${state.isActive ? "" : "selected"}>false</option></select></label></div>
<label>JSON<textarea name="jsonText">${esc(state.jsonText)}</textarea></label>
<div class="actions"><button type="submit" name="mode" value="validate">Validate</button><button type="submit" name="mode" value="save">Save</button></div></form></section>`);
}

function simpleErrorHtml(message: string): string {
  return page("Error", `<section class="card"><h1>Error</h1><div class="error">${esc(message)}</div><p><a href="/ui">Back to Dashboard</a></p></section>`);
}

export function registerUiRoutes(input: RegisterUiRoutesInput): void {
  const { app, prisma } = input;

  app.get("/", async (_request, reply) => reply.redirect("/ui"));

  app.get("/ui", async (request, reply) => {
    const [health, jobs] = await Promise.all([
      injectJson(app, "GET", "/health"),
      prisma.job.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { episode: { select: { id: true, topic: true } } } })
    ]);

    const h = isRecord(health.body) && isRecord(health.body.data) ? health.body.data : {};
    const rows = jobs
      .map((job) => `<tr><td><a href="/ui/jobs/${esc(job.id)}">${esc(job.id)}</a></td><td>${esc(job.type)}</td><td><span class="badge ${badgeClass(job.status)}">${esc(job.status)}</span></td><td>${esc(job.progress)}%</td><td>${job.episode ? `<a href="/ui/episodes/${esc(job.episode.id)}">${esc(job.episode.topic)}</a>` : "-"}</td><td>${fmtDate(job.createdAt.toISOString())}</td></tr>`)
      .join("");

    return reply.type("text/html; charset=utf-8").send(page("Dashboard", `<section class="card"><h1>Dashboard</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<div class="grid two"><div class="card"><h2>Health</h2><p>redis: <span class="badge ${badgeClass(String(h.redis ?? "down"))}">${esc(h.redis ?? "down")}</span></p><p>queueReady: <span class="badge ${h.queueReady ? "ok" : "bad"}">${esc(h.queueReady ?? false)}</span></p><p>loadedSchemas: ${esc(Array.isArray(h.loadedSchemas) ? h.loadedSchemas.join(", ") : "-")}</p></div><div class="card"><h2>Quick Action</h2><form method="post" action="/ui/actions/demo-extreme" class="inline"><button type="submit">Run Extreme Demo</button></form><form method="post" action="/ui/actions/generate-preview" class="grid"><label>Preview topic<input name="topic" value="UI Preview Demo"/></label><label>targetDurationSec<input name="targetDurationSec" value="600"/></label><div class="actions"><button type="submit">Generate Preview (One-click)</button></div></form><form method="post" action="/ui/actions/generate-full" class="grid"><label>Full pipeline topic<input name="topic" value="UI Full Pipeline Demo"/></label><label>targetDurationSec<input name="targetDurationSec" value="600"/></label><div class="actions"><button type="submit" class="secondary">Run Final + Package</button></div></form></div></div></section><section class="card"><h2>Latest Jobs</h2><table><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Episode</th><th>Created</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No jobs</td></tr>'}</tbody></table></section>`));
  });

  app.post("/ui/actions/demo-extreme", async (_request, reply) => {
    const res = await injectJson(app, "POST", "/demo/extreme", {});
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Run Extreme Demo failed (${res.statusCode})`;
      return reply.code(res.statusCode).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && typeof res.body.data.jobId === "string" ? res.body.data.jobId : null;
    if (!jobId) return reply.code(500).type("text/html; charset=utf-8").send(simpleErrorHtml("Run Extreme Demo returned no jobId"));
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.post("/ui/actions/generate-preview", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const topic = b(body, "topic") ?? "UI Preview Demo";
    const targetDurationSec = n(body.targetDurationSec, 600);
    const channelId = b(body, "channelId");

    const payload: JsonRecord = {
      topic,
      targetDurationSec,
      jobType: "GENERATE_BEATS",
      pipeline: {
        stopAfterPreview: true,
        autoRenderFinal: false
      }
    };
    if (channelId) {
      payload.channelId = channelId;
    }

    const res = await injectJson(app, "POST", "/api/episodes", payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Generate Preview failed (${res.statusCode})`;
      return reply.code(res.statusCode).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.code(500).type("text/html; charset=utf-8").send(simpleErrorHtml("Generate Preview returned no jobId"));
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.post("/ui/actions/generate-full", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const topic = b(body, "topic") ?? "UI Full Pipeline Demo";
    const targetDurationSec = n(body.targetDurationSec, 600);
    const channelId = b(body, "channelId");

    const payload: JsonRecord = {
      topic,
      targetDurationSec,
      jobType: "GENERATE_BEATS",
      pipeline: {
        stopAfterPreview: false,
        autoRenderFinal: true
      }
    };
    if (channelId) {
      payload.channelId = channelId;
    }

    const res = await injectJson(app, "POST", "/api/episodes", payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Run full pipeline failed (${res.statusCode})`;
      return reply.code(res.statusCode).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.code(500).type("text/html; charset=utf-8").send(simpleErrorHtml("Run full pipeline returned no jobId"));
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.get("/ui/channel-bible", async (request, reply) => {
    const state = await loadBibleState(prisma, {
      ...(q(request.query, "message") ? { message: q(request.query, "message") } : {}),
      ...(q(request.query, "error") ? { error: q(request.query, "error") } : {})
    });
    return reply.type("text/html; charset=utf-8").send(bibleHtml(state));
  });

  app.post("/ui/channel-bible", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const mode = b(body, "mode") ?? "validate";
    const jsonText = b(body, "jsonText") ?? "";
    const schemaId = b(body, "schemaId") ?? DEFAULT_CHANNEL_BIBLE_SCHEMA;
    const requestedChannelId = b(body, "channelId");
    const requestedVersion = n(body.version, 1);
    const isActive = bool(body.isActive, true);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      const state = await loadBibleState(prisma, {
        source: "Form",
        channelId: requestedChannelId ?? "",
        version: requestedVersion,
        schemaId,
        jsonText,
        isActive,
        error: error instanceof Error ? error.message : "Invalid JSON",
        validationErrors: ["Invalid JSON syntax"]
      });
      return reply.type("text/html; charset=utf-8").send(bibleHtml(state));
    }
    const validation = validator.validate(schemaId, parsed);
    if (!validation.ok || mode === "validate") {
      const state = await loadBibleState(prisma, {
        source: "Form",
        channelId: requestedChannelId ?? "",
        version: requestedVersion,
        schemaId,
        jsonText,
        isActive,
        ...(validation.ok
          ? { message: "Validation passed." }
          : { error: "Validation failed.", validationErrors: validation.errors.map((e) => `${e.path} ${e.message}`) })
      });
      return reply.type("text/html; charset=utf-8").send(bibleHtml(state));
    }

    const channel = requestedChannelId ? { id: requestedChannelId, name: requestedChannelId } : await ensureDefaultChannel(prisma);
    const latest = await prisma.channelBible.findFirst({ where: { channelId: channel.id }, orderBy: { version: "desc" }, select: { version: true } });
    const version = Math.max(requestedVersion, (latest?.version ?? 0) + 1);
    const hash = sha256Hex(stableStringify(parsed));

    const existing = await prisma.channelBible.findUnique({ where: { hash } });
    if (existing) return reply.redirect(`/ui/channel-bible?message=${encodeURIComponent(`Already exists: ${existing.id}`)}`);

    if (isActive) {
      await prisma.channelBible.updateMany({ where: { channelId: channel.id, isActive: true }, data: { isActive: false } });
    }

    const created = await prisma.channelBible.create({
      data: {
        channelId: channel.id,
        version,
        hash,
        schemaId,
        json: parsed as Prisma.InputJsonValue,
        isActive
      }
    });

    return reply.redirect(`/ui/channel-bible?message=${encodeURIComponent(`Saved: ${created.id}`)}`);
  });

  app.get("/ui/episodes", async (request, reply) => {
    const rows = await prisma.episode.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        channel: { select: { name: true } },
        jobs: { orderBy: { createdAt: "desc" }, take: 1, select: { type: true, status: true } }
      }
    });

    const list = rows
      .map((row) => `<tr><td><a href="/ui/episodes/${esc(row.id)}">${esc(row.id)}</a></td><td>${esc(row.topic)}</td><td><span class="badge ${badgeClass(row.status)}">${esc(row.status)}</span></td><td>${esc(row.channel.name)}</td><td>${esc(row.jobs[0] ? `${row.jobs[0].type} (${row.jobs[0].status})` : "-")}</td><td>${esc(row.targetDurationSec)}s</td><td>${fmtDate(row.createdAt.toISOString())}</td></tr>`)
      .join("");

    return reply.type("text/html; charset=utf-8").send(page("Episodes", `<section class="card"><h1>Episodes</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<form method="post" action="/ui/episodes" class="grid two"><label>topic<input name="topic" required/></label><label>channelId(optional)<input name="channelId"/></label><label>targetDurationSec<input name="targetDurationSec" value="600"/></label><label>jobType<select name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option></select></label><label>pipelineMode<select name="pipelineMode"><option value="preview">preview-only</option><option value="full">full(final+package)</option><option value="manual">manual</option></select></label><div class="actions" style="grid-column:1/-1"><button type="submit">Create Episode + Enqueue</button></div></form></section><section class="card"><h2>Latest Episodes</h2><table><thead><tr><th>ID</th><th>Topic</th><th>Status</th><th>Channel</th><th>Latest Job</th><th>Duration</th><th>Created</th></tr></thead><tbody>${list || '<tr><td colspan="7">No episodes</td></tr>'}</tbody></table></section>`));
  });

  app.post("/ui/episodes", async (request, reply) => {
    const body = request.body;
    const topic = b(body, "topic");
    if (!topic) return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("topic is required"));

    const payload: JsonRecord = {
      topic,
      targetDurationSec: n(isRecord(body) ? body.targetDurationSec : undefined, 600),
      ...(b(body, "channelId") ? { channelId: b(body, "channelId") } : {}),
      ...(b(body, "jobType") ? { jobType: b(body, "jobType") } : {})
    };
    const mode = b(body, "pipelineMode");
    const pipeline = pipelineFromMode(mode);
    if (pipeline) {
      payload.pipeline = pipeline;
    }

    const res = await injectJson(app, "POST", "/api/episodes", payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Episode create failed (${res.statusCode})`;
      return reply.code(res.statusCode).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.redirect(`/ui/episodes?message=${encodeURIComponent("Episode created")}`);
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.get("/ui/episodes/:id", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }
    const res = await injectJson(app, "GET", `/api/episodes/${encodeURIComponent(id)}`);
    if (res.statusCode >= 400 || !isRecord(res.body) || !isRecord(res.body.data)) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Episode not found: ${id}`;
      return reply.code(res.statusCode >= 400 ? res.statusCode : 404).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const data = res.body.data;
    const episode = isRecord(data.episode) ? data.episode : {};
    const artifacts = isRecord(data.artifacts) ? data.artifacts : {};
    const jobs = Array.isArray(data.jobs) ? data.jobs.filter((x): x is JsonRecord => isRecord(x)) : [];
    const localOut = getEpisodeOutPaths(id);
    const qcExists =
      artifacts.qcExists === true ||
      fs.existsSync(localOut.qc);
    const uploadManifestExists =
      artifacts.uploadManifestExists === true ||
      fs.existsSync(path.join(localOut.outDir, "upload_manifest.json"));

    const rows = jobs
      .map((job) => `<tr><td><a href="/ui/jobs/${esc(job.id)}">${esc(job.id)}</a></td><td>${esc(job.type)}</td><td><span class="badge ${badgeClass(String(job.status ?? ""))}">${esc(job.status)}</span></td><td>${esc(job.progress)}%</td><td>${fmtDate(job.createdAt)}</td></tr>`)
      .join("");

    return reply.type("text/html; charset=utf-8").send(page(`Episode ${id}`, `<section class="card"><h1>Episode Detail</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<p>episodeId: <strong>${esc(episode.id ?? id)}</strong></p><p>topic: <strong>${esc(episode.topic ?? "")}</strong></p><p>status: <span class="badge ${badgeClass(String(episode.status ?? ""))}">${esc(episode.status)}</span></p><p>outDir: <code>${esc(artifacts.outDir ?? "")}</code></p><div class="grid two"><div class="card"><h3>Documents</h3><p>beats.json: <span class="badge ${artifacts.beatsFileExists ? "ok" : "bad"}">${artifacts.beatsFileExists ? "exists" : "missing"}</span></p><p>shots.json: <span class="badge ${artifacts.shotsFileExists ? "ok" : "bad"}">${artifacts.shotsFileExists ? "exists" : "missing"}</span></p><p>qc_report.json: <span class="badge ${qcExists ? "ok" : "bad"}">${qcExists ? "exists" : "missing"}</span></p></div><div class="card"><h3>Renders</h3><p>preview.mp4: <span class="badge ${artifacts.previewExists ? "ok" : "bad"}">${artifacts.previewExists ? "exists" : "missing"}</span></p><p>final.mp4: <span class="badge ${artifacts.finalExists ? "ok" : "bad"}">${artifacts.finalExists ? "exists" : "missing"}</span></p><p>upload_manifest.json: <span class="badge ${uploadManifestExists ? "ok" : "bad"}">${uploadManifestExists ? "exists" : "missing"}</span></p></div></div><div class="actions"><form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="GENERATE_BEATS"/><input type="hidden" name="pipelineMode" value="preview"/><button type="submit">Generate Preview (One-click)</button></form><form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="GENERATE_BEATS"/><input type="hidden" name="pipelineMode" value="full"/><button type="submit" class="secondary">Run Final + Package</button></form><form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="COMPILE_SHOTS"/><button type="submit">Enqueue COMPILE_SHOTS</button></form><form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="RENDER_PREVIEW"/><button type="submit">Render Preview</button></form><form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><select name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option><option value="RENDER_FINAL">RENDER_FINAL</option><option value="PACKAGE_OUTPUTS">PACKAGE_OUTPUTS</option></select><button type="submit" class="secondary">Force Enqueue</button></form></div></section><section class="card"><h2>Jobs</h2><table><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No jobs</td></tr>'}</tbody></table></section>`));
  });
  app.post("/ui/episodes/:id/enqueue", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }
    const body = request.body;
    const jobType = b(body, "jobType") ?? "COMPILE_SHOTS";
    const mode = b(body, "pipelineMode");
    const pipeline = pipelineFromMode(mode);

    const payload: JsonRecord = { jobType };
    if (pipeline) {
      payload.pipeline = pipeline;
    }

    const res = await injectJson(app, "POST", `/api/episodes/${encodeURIComponent(id)}/enqueue`, payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `enqueue failed (${res.statusCode})`;
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent(msg)}`);
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?message=${encodeURIComponent("Job enqueued")}`);
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.get("/ui/jobs/:id", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("job id is required"));
    }
    const res = await injectJson(app, "GET", `/jobs/${encodeURIComponent(id)}`);
    if (res.statusCode >= 400 || !isRecord(res.body) || !isRecord(res.body.data)) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Job not found: ${id}`;
      return reply.code(res.statusCode >= 400 ? res.statusCode : 404).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const data = res.body.data;
    const logs = Array.isArray(data.logs) ? data.logs.filter((x): x is JsonRecord => isRecord(x)) : [];
    const logRows = logs
      .map((log) => `<tr><td>${fmtDate(log.createdAt)}</td><td>${esc(log.level ?? "info")}</td><td>${esc(log.message ?? "")}</td><td><pre>${esc(JSON.stringify(log.details ?? null, null, 2))}</pre></td></tr>`)
      .join("");

    const episodeId = typeof data.episodeId === "string" ? data.episodeId : "";

    return reply.type("text/html; charset=utf-8").send(page(`Job ${id}`, `<section class="card"><h1>Job Detail</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<p>jobId: <strong>${esc(data.id)}</strong></p><p>episodeId: <a href="/ui/episodes/${esc(episodeId)}">${esc(episodeId)}</a></p><p>type: ${esc(data.type)}</p><p>status: <span class="badge ${badgeClass(String(data.status ?? ""))}">${esc(data.status)}</span></p><p>progress: ${esc(data.progress)}%</p><p>attempts: ${esc(data.attemptsMade)} / ${esc(data.maxAttempts)}</p><p>lastError:</p><pre>${esc(data.lastError ?? "")}</pre><div class="actions"><form method="post" action="/ui/jobs/${esc(id)}/retry"><button type="submit">Retry Job</button></form><a href="/artifacts/${esc(episodeId)}/">Open artifacts folder</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}">Artifacts shortcuts</a></div></section><section class="card"><h2>Job Logs</h2><table><thead><tr><th>Created</th><th>Level</th><th>Message</th><th>Details</th></tr></thead><tbody>${logRows || '<tr><td colspan="4">No logs</td></tr>'}</tbody></table></section>`));
  });

  app.post("/ui/jobs/:id/retry", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("job id is required"));
    }
    const body = request.body;
    const res = await injectJson(app, "POST", `/api/jobs/${encodeURIComponent(id)}/retry`, {
      ...(csv(isRecord(body) ? body.failedShotIds : undefined).length > 0 ? { failedShotIds: csv(isRecord(body) ? body.failedShotIds : undefined) } : {}),
      dryRun: bool(isRecord(body) ? body.dryRun : undefined, false)
    });

    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Retry failed (${res.statusCode})`;
      return reply.redirect(`/ui/jobs/${encodeURIComponent(id)}?error=${encodeURIComponent(msg)}`);
    }

    const newJobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!newJobId) return reply.redirect(`/ui/jobs/${encodeURIComponent(id)}?message=${encodeURIComponent("Retry requested")}`);
    return reply.redirect(`/ui/jobs/${encodeURIComponent(newJobId)}`);
  });

  app.get("/ui/hitl", async (request, reply) => {
    const failed = await prisma.job.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 50, include: { episode: { select: { topic: true } } } });
    const rows = failed
      .map((job) => `<tr><td><a href="/ui/jobs/${esc(job.id)}">${esc(job.id)}</a></td><td><a href="/ui/episodes/${esc(job.episodeId)}">${esc(job.episodeId)}</a></td><td>${esc(job.episode?.topic ?? "-")}</td><td>${esc(job.type)}</td><td>${fmtDate(job.createdAt.toISOString())}</td><td>${esc(job.lastError ?? "")}</td></tr>`)
      .join("");

    return reply.type("text/html; charset=utf-8").send(page("HITL", `<section class="card"><h1>HITL Rerender</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<form method="post" action="/ui/hitl/rerender" class="grid"><div class="grid two"><label>episodeId<input name="episodeId" value="${esc(q(request.query, "episodeId") ?? "")}" required/></label><label>failedShotIds<input name="failedShotIds" value="${esc(q(request.query, "failedShotIds") ?? "")}" placeholder="shot_1,shot_2" required/></label></div><label><input type="checkbox" name="dryRun" value="true"/> dryRun</label><div class="actions"><button type="submit">Rerender selected shots</button></div></form></section><section class="card"><h2>Failed Jobs</h2><table><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Type</th><th>Created</th><th>Error</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No failed jobs</td></tr>'}</tbody></table></section>`));
  });

  app.post("/ui/hitl/rerender", async (request, reply) => {
    const body = request.body;
    const episodeId = b(body, "episodeId");
    if (!episodeId) return reply.redirect(`/ui/hitl?error=${encodeURIComponent("episodeId is required")}`);

    const failedShotIdsRaw = b(body, "failedShotIds") ?? "";
    const shotIds = csv(failedShotIdsRaw);
    if (shotIds.length === 0) {
      return reply.redirect(`/ui/hitl?episodeId=${encodeURIComponent(episodeId)}&error=${encodeURIComponent("failedShotIds is required")}`);
    }

    const res = await injectJson(app, "POST", "/api/hitl/rerender", { episodeId, shotIds, dryRun: bool(isRecord(body) ? body.dryRun : undefined, false) });
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `HITL rerender failed (${res.statusCode})`;
      return reply.redirect(`/ui/hitl?episodeId=${encodeURIComponent(episodeId)}&failedShotIds=${encodeURIComponent(failedShotIdsRaw)}&error=${encodeURIComponent(msg)}`);
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.redirect(`/ui/hitl?message=${encodeURIComponent("Rerender requested")}`);
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.get("/ui/artifacts", async (request, reply) => {
    const episodeId = q(request.query, "episodeId");
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(getOutRoot(), { withFileTypes: true });
    } catch {
      entries = [];
    }

    const rows = entries
      .filter((x) => x.isDirectory() || x.isFile())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => `<tr><td>${x.isDirectory() ? "directory" : "file"}</td><td>${esc(x.name)}</td><td><a href="${x.isDirectory() ? `/artifacts/${encodeURIComponent(x.name)}/` : `/artifacts/${encodeURIComponent(x.name)}`}">${x.isDirectory() ? `/artifacts/${encodeURIComponent(x.name)}/` : `/artifacts/${encodeURIComponent(x.name)}`}</a></td></tr>`)
      .join("");

    let episodeLinks = "";
    if (episodeId) {
      const out = getEpisodeOutPaths(episodeId);
      const links = [
        { label: "Episode folder", url: `/artifacts/${encodeURIComponent(episodeId)}/`, exists: fs.existsSync(out.outDir) },
        { label: "beats.json", url: `/artifacts/${encodeURIComponent(episodeId)}/beats.json`, exists: fs.existsSync(out.beats) },
        { label: "shots.json", url: `/artifacts/${encodeURIComponent(episodeId)}/shots.json`, exists: fs.existsSync(out.shots) },
        { label: "preview.mp4", url: `/artifacts/${encodeURIComponent(episodeId)}/preview.mp4`, exists: fs.existsSync(out.preview) },
        { label: "final.mp4", url: `/artifacts/${encodeURIComponent(episodeId)}/final.mp4`, exists: fs.existsSync(out.final) },
        { label: "qc_report.json", url: `/artifacts/${encodeURIComponent(episodeId)}/qc_report.json`, exists: fs.existsSync(out.qc) },
        { label: "upload_manifest.json", url: `/artifacts/${encodeURIComponent(episodeId)}/upload_manifest.json`, exists: fs.existsSync(path.join(out.outDir, "upload_manifest.json")) }
      ];
      episodeLinks = `<ul>${links.map((x) => `<li><a href="${x.url}">${x.label}</a> <span class="badge ${x.exists ? "ok" : "bad"}">${x.exists ? "exists" : "missing"}</span></li>`).join("")}</ul>`;
    }

    return reply.type("text/html; charset=utf-8").send(page("Artifacts", `<section class="card"><h1>Artifacts</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<p><a href="/artifacts/">Open /artifacts/</a></p><form method="get" action="/ui/artifacts" class="inline"><label>episodeId <input name="episodeId" value="${esc(episodeId ?? "")}"/></label><button type="submit" class="secondary">Open shortcuts</button></form>${episodeLinks}</section><section class="card"><h2>out/ index</h2><table><thead><tr><th>Type</th><th>Name</th><th>URL</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No artifacts</td></tr>'}</tbody></table></section>`));
  });
}
