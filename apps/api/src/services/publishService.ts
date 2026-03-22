import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parse as parseQueryString } from "node:querystring";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { JobsOptions, Queue } from "bullmq";
import { Queue as BullQueue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { EpisodeJobPayload } from "./scheduleService";
import {
  MockYouTubeUploader,
  readUploadManifest,
  type UploadManifest
} from "@ec/publish";
import { createDefaultNotifier, estimateJobCost } from "@ec/ops";
import { createExtremeDemoRun, createPublishJob } from "./operatorWorkflowService";
import { apiQueueRetentionOptions } from "./jobRetention";
import { registerAnalyticsRoutes } from "./analyticsService";
import { registerAdminOpsRoutes } from "./adminOpsService";
import { registerAgentRoutes } from "./agentService";
import { writeAuditLog } from "./auditService";
import { registerApiRoutes } from "../routes/apiRoutes";
import { registerCharacterRoutes } from "../routes/characterRoutes";
import { registerUiRoutes } from "../routes/uiRoutes";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };

type PublishLogDetails = {
  manifestPath: string | null;
  plannedPublishAt: string | null;
};

const notifier = createDefaultNotifier();
const API_KEY = process.env.API_KEY?.trim() ?? "";
const DEMO_QUEUE_NAME = "episode-jobs";
const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";
const DEMO_TOPIC = "Extreme Demo";
const DEMO_MAX_ATTEMPTS = 2;
const DEMO_BACKOFF_MS = 1000;
const ASSET_QUEUE_NAME = "asset-ingest-jobs";
const STATIC_ARTIFACTS_PREFIX = "/artifacts/";
const STATIC_ARTIFACTS_ENABLED = (process.env.FF_STATIC_ARTIFACTS ?? "true").trim().toLowerCase() === "true";
const MINIO_HEALTH_PATH = "/minio/health/live";
const IMAGEGEN_DEFAULT_MONTHLY_BUDGET_USD = 30;
const IMAGEGEN_DEFAULT_COST_PER_IMAGE_USD = 0;
const IMAGEGEN_DEFAULT_MAX_CANDIDATES_PER_VIEW = 4;
const IMAGEGEN_DEFAULT_MAX_TOTAL_IMAGES = 18;
const IMAGEGEN_DEFAULT_MAX_RETRIES = 2;
const require = createRequire(import.meta.url);

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function optionalDate(obj: JsonRecord, field: string): Date | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} must be a non-empty ISO date string`);
  }

  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${field} must be a valid ISO date string`);
  }

  return parsed;
}

function parseBooleanField(obj: JsonRecord, field: string, fallback: boolean): boolean {
  const value = obj[field];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw createHttpError(400, `${field} must be a boolean`);
  }
  return value;
}

function detailsToRecord(details: Prisma.JsonValue | null): JsonRecord | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  return details as JsonRecord;
}

function readStringDetail(details: Prisma.JsonValue | null, key: string): string | null {
  const record = detailsToRecord(details);
  if (!record) {
    return null;
  }

  const value = record[key];
  return typeof value === "string" ? value : null;
}

function extractPublishLogDetails(logs: Array<{ details: Prisma.JsonValue | null }>): PublishLogDetails {
  for (const log of logs) {
    const manifestPath = readStringDetail(log.details, "manifestPath");
    const plannedPublishAt = readStringDetail(log.details, "plannedPublishAt");
    if (manifestPath || plannedPublishAt) {
      return {
        manifestPath: manifestPath ?? null,
        plannedPublishAt: plannedPublishAt ?? null
      };
    }
  }

  return {
    manifestPath: null,
    plannedPublishAt: null
  };
}

function getRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../");
}

function getPublishOutputRoot(): string {
  return path.join(getRepoRoot(), "out", "publish");
}

function getStaticArtifactsRoot(): string {
  return path.join(getRepoRoot(), "out");
}

async function readArtifactsIndex(root: string): Promise<Array<{ name: string; type: "file" | "directory"; url: string }>> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const encodedName = encodeURIComponent(entry.name);
      const isDirectory = entry.isDirectory();
      return {
        name: entry.name,
        type: isDirectory ? "directory" : "file",
        url: isDirectory ? `${STATIC_ARTIFACTS_PREFIX}${encodedName}/` : `${STATIC_ARTIFACTS_PREFIX}${encodedName}`
      };
    });
}

function toRepoRelativePath(filePath: string | null | undefined): string | null {
  if (!filePath || filePath.trim().length === 0) {
    return null;
  }
  const repoRoot = getRepoRoot();
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(repoRoot, resolvedPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  return relativePath.replace(/\\/g, "/");
}

function toArtifactsUrl(filePath: string | null | undefined): string | null {
  const relativePath = toRepoRelativePath(filePath);
  if (!relativePath || !relativePath.startsWith("out/")) {
    return null;
  }
  const artifactRelativePath = relativePath.slice("out/".length);
  const segments = artifactRelativePath.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }
  return `${STATIC_ARTIFACTS_PREFIX}${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function sanitizeUploadManifest(manifest: UploadManifest | null): UploadManifest | null {
  if (!manifest) {
    return null;
  }
  return {
    ...manifest,
    thumbnail: {
      ...manifest.thumbnail,
      sourceFramePath: toRepoRelativePath(manifest.thumbnail.sourceFramePath),
      outputPath: toRepoRelativePath(manifest.thumbnail.outputPath) ?? path.basename(manifest.thumbnail.outputPath)
    },
    artifacts: {
      ...manifest.artifacts,
      renderOutputPath: toRepoRelativePath(manifest.artifacts.renderOutputPath)
    }
  };
}

function registerArtifactsIndexRoutes(app: FastifyInstance): void {
  const artifactsRoot = getStaticArtifactsRoot();

  const handler = async () => {
    const items = await readArtifactsIndex(artifactsRoot);
    return {
      ok: true,
      root: "out",
      items
    };
  };

  app.get("/artifacts", handler);
  app.get("/artifacts/", handler);
}

function registerFormBody(app: FastifyInstance): void {
  if (app.hasContentTypeParser("application/x-www-form-urlencoded")) {
    return;
  }

  try {
    const module = require("@fastify/formbody") as { default?: unknown } | unknown;
    const plugin =
      module && typeof module === "object" && "default" in module
        ? ((module as { default: unknown }).default ?? module)
        : module;
    app.register(plugin as never);
  } catch (error) {
    app.log.warn(
      { error },
      "Failed to load @fastify/formbody. Falling back to built-in urlencoded parser."
    );
    app.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string" },
      (_request, body, done) => {
        try {
          const rawBody = typeof body === "string" ? body : body.toString("utf8");
          done(null, parseQueryString(rawBody));
        } catch (parseError) {
          done(parseError as Error, undefined);
        }
      }
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRedisUnavailableError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("EAI_AGAIN") ||
    message.includes("Connection is closed") ||
    message.includes("connect ECONNREFUSED") ||
    message.includes("All sentinels are unreachable")
  );
}

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseNonNegativeEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parseProviderName(value: unknown): "mock" | "comfyui" | "remoteApi" | "vertexImagen" {
  if (typeof value !== "string") {
    return "mock";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "comfyui") {
    return "comfyui";
  }
  if (normalized === "remoteapi" || normalized === "remote_api" || normalized === "remote") {
    return "remoteApi";
  }
  if (normalized === "verteximagen" || normalized === "vertex_imagen" || normalized === "vertex-imagen" || normalized === "vertex") {
    return "vertexImagen";
  }
  return "mock";
}

function isPremiumImageProvider(provider: "mock" | "comfyui" | "remoteApi" | "vertexImagen"): boolean {
  return provider === "remoteApi" || provider === "vertexImagen";
}

function readPremiumImageGenPolicy() {
  return {
    maxCandidatesPerView: parsePositiveIntEnv(process.env.IMAGEGEN_PREMIUM_MAX_CANDIDATES_PER_VIEW, 2),
    maxTotalImages: parsePositiveIntEnv(process.env.IMAGEGEN_PREMIUM_MAX_TOTAL_IMAGES, 6),
    maxRetries: parsePositiveIntEnv(process.env.IMAGEGEN_PREMIUM_MAX_RETRIES, 1)
  };
}

function readImageGenBudgetConfig() {
  return {
    monthBudgetUsd: parseNonNegativeEnv(process.env.IMAGEGEN_MONTHLY_BUDGET_USD, IMAGEGEN_DEFAULT_MONTHLY_BUDGET_USD),
    costPerImageUsd: parseNonNegativeEnv(process.env.IMAGEGEN_COST_PER_IMAGE_USD, IMAGEGEN_DEFAULT_COST_PER_IMAGE_USD),
    maxCandidatesPerView: parsePositiveIntEnv(
      process.env.IMAGEGEN_MAX_CANDIDATES_PER_VIEW,
      IMAGEGEN_DEFAULT_MAX_CANDIDATES_PER_VIEW
    ),
    maxTotalImages: parsePositiveIntEnv(process.env.IMAGEGEN_MAX_TOTAL_IMAGES, IMAGEGEN_DEFAULT_MAX_TOTAL_IMAGES),
    maxRetries: parsePositiveIntEnv(process.env.IMAGEGEN_MAX_RETRIES, IMAGEGEN_DEFAULT_MAX_RETRIES),
    remoteConfigured:
      typeof process.env.IMAGEGEN_REMOTE_BASE_URL === "string" &&
      process.env.IMAGEGEN_REMOTE_BASE_URL.trim().length > 0,
    vertexConfigured:
      typeof process.env.IMAGEGEN_VERTEX_PROJECT_ID === "string" &&
      process.env.IMAGEGEN_VERTEX_PROJECT_ID.trim().length > 0,
    comfyConfigured:
      typeof process.env.COMFYUI_BASE_URL === "string"
        ? process.env.COMFYUI_BASE_URL.trim().length > 0
        : typeof process.env.COMFYUI_URL === "string" && process.env.COMFYUI_URL.trim().length > 0
  };
}

function parseBudgetQuery(requestQuery: unknown): {
  provider: "mock" | "comfyui" | "remoteApi" | "vertexImagen";
  candidateCount: number;
  views: number;
} {
  const query = isRecord(requestQuery) ? requestQuery : {};
  const provider = parseProviderName(query.provider);

  const candidateCountRaw = query.candidateCount;
  const viewsRaw = query.views;

  let candidateCount = IMAGEGEN_DEFAULT_MAX_CANDIDATES_PER_VIEW;
  if (typeof candidateCountRaw === "string") {
    const parsed = Number.parseInt(candidateCountRaw, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      candidateCount = parsed;
    }
  }

  let views = 3;
  if (typeof viewsRaw === "string") {
    const parsed = Number.parseInt(viewsRaw, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      views = parsed;
    }
  }

  return { provider, candidateCount, views };
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function readMonthlyImageGenSpentUsd(prisma: PrismaClient): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ total: unknown }>>`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
      FROM provider_call_logs
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `;
    return rows.length > 0 ? Math.max(0, toNumber(rows[0].total)) : 0;
  } catch {
    return 0;
  }
}

function estimateRunCost(input: {
  provider: "mock" | "comfyui" | "remoteApi" | "vertexImagen";
  candidateCount: number;
  views: number;
  maxCandidatesPerView: number;
  maxTotalImages: number;
  costPerImageUsd: number;
}): {
  estimatedImageCount: number;
  estimatedCostUsd: number;
  maxCandidatesPerView: number;
  maxTotalImages: number;
  maxRetries?: number;
} {
  const premiumPolicy = readPremiumImageGenPolicy();
  const effectiveMaxCandidatesPerView = isPremiumImageProvider(input.provider)
    ? Math.max(1, Math.min(input.maxCandidatesPerView, premiumPolicy.maxCandidatesPerView))
    : input.maxCandidatesPerView;
  const effectiveMaxTotalImages = isPremiumImageProvider(input.provider)
    ? Math.max(1, Math.min(input.maxTotalImages, premiumPolicy.maxTotalImages))
    : input.maxTotalImages;
  const clampedCandidates = Math.max(1, Math.min(input.candidateCount, effectiveMaxCandidatesPerView));
  const clampedViews = Math.max(1, input.views);
  const maxByTotal = Math.max(1, Math.floor(effectiveMaxTotalImages / clampedViews));
  const finalCandidates = Math.min(clampedCandidates, maxByTotal);
  const estimatedImageCount = finalCandidates * clampedViews;
  return {
    estimatedImageCount,
    estimatedCostUsd: estimatedImageCount * Math.max(0, input.costPerImageUsd),
    maxCandidatesPerView: effectiveMaxCandidatesPerView,
    maxTotalImages: effectiveMaxTotalImages,
    ...(isPremiumImageProvider(input.provider) ? { maxRetries: premiumPolicy.maxRetries } : {})
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkMinioHealth(): Promise<{ status: "up" | "down" | "skipped"; endpoint: string | null; error: string | null }> {
  const endpoint = process.env.S3_ENDPOINT?.trim() ?? "";
  if (!endpoint) {
    return {
      status: "skipped",
      endpoint: null,
      error: "S3_ENDPOINT is not set"
    };
  }

  const base = endpoint.replace(/\/+$/, "");
  const probeUrl = `${base}${MINIO_HEALTH_PATH}`;
  try {
    const response = await fetchWithTimeout(probeUrl, 2000);
    if (response.ok) {
      return {
        status: "up",
        endpoint: base,
        error: null
      };
    }

    return {
      status: "down",
      endpoint: base,
      error: `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      status: "down",
      endpoint: base,
      error: errorMessage(error)
    };
  }
}

function readManifestSafely(manifestPath: string | null): UploadManifest | null {
  if (!manifestPath) {
    return null;
  }

  const resolvedPath = path.resolve(manifestPath);
  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  try {
    return readUploadManifest(resolvedPath);
  } catch {
    return null;
  }
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
    const existing = await queue.getJob(payload.jobDbId);
    if (existing) {
      return existing;
    }
    throw error;
  }
}

function registerStaticArtifactsFallbackRoute(app: FastifyInstance): void {
  const artifactsRoot = getStaticArtifactsRoot();

  app.get(`${STATIC_ARTIFACTS_PREFIX}*`, async (request, reply) => {
    const wildcard = (request.params as { "*": unknown })["*"];
    if (typeof wildcard !== "string" || wildcard.trim() === "") {
      throw createHttpError(404, "Artifact not found");
    }

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(wildcard);
    } catch {
      throw createHttpError(400, "Invalid artifact path encoding");
    }

    const normalized = decodedPath.replace(/^[/\\]+/, "");
    const absolutePath = path.resolve(artifactsRoot, normalized);
    const relative = path.relative(artifactsRoot, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw createHttpError(403, "Forbidden");
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(absolutePath);
    } catch {
      throw createHttpError(404, "Artifact not found");
    }

    if (!stat.isFile()) {
      throw createHttpError(404, "Artifact not found");
    }

    if (absolutePath.endsWith(".mp4")) {
      reply.type("video/mp4");
    } else if (absolutePath.endsWith(".json")) {
      reply.type("application/json; charset=utf-8");
    } else if (absolutePath.endsWith(".srt")) {
      reply.type("text/plain; charset=utf-8");
    }

    return reply.send(fs.createReadStream(absolutePath));
  });
}

function registerStaticArtifactsRoute(app: FastifyInstance): void {
  const artifactsRoot = getStaticArtifactsRoot();
  const moduleName = "@fastify/static";

  app.register(async (instance) => {
    try {
      const fastifyStaticModule = (await import(moduleName)) as { default: unknown };

      await instance.register(fastifyStaticModule.default as never, {
        root: artifactsRoot,
        prefix: STATIC_ARTIFACTS_PREFIX,
        decorateReply: false,
        list: false
      });

      instance.log.info(
        {
          prefix: STATIC_ARTIFACTS_PREFIX,
          artifactsRoot
        },
        "Static artifacts route enabled with @fastify/static"
      );
    } catch (error) {
      instance.log.warn({ error }, "Failed to load @fastify/static. Falling back to built-in artifacts route.");
      registerStaticArtifactsFallbackRoute(instance);
    }
  });
}

function injectCharacterGeneratorBudgetBanner(html: string): string {
  if (!html.includes("<main>")) {
    return html;
  }

  const banner = `<section class="card" id="imagegen-budget-banner"><h2>ImageGen Budget</h2><div id="imagegen-budget-body">Loading budget...</div></section>`;
  const script = `<script>(function(){if(window.__ecImageGenBudgetLoaded){return;}window.__ecImageGenBudgetLoaded=true;const bannerBody=document.getElementById("imagegen-budget-body");const providerSelect=document.querySelector('select[name=\"provider\"]');if(providerSelect){const ensureOption=(value,label)=>{const exists=[...providerSelect.options].some(o=>o.value===value);if(!exists){const opt=document.createElement('option');opt.value=value;opt.textContent=label;providerSelect.appendChild(opt);}};ensureOption('remoteApi','remoteApi (vendor-neutral)');ensureOption('vertexImagen','vertexImagen (Google Cloud)');}const candidateInput=document.querySelector('input[name=\"candidateCount\"]');const render=async()=>{const provider=providerSelect&&providerSelect.value?providerSelect.value:'mock';const candidateCount=candidateInput&&candidateInput.value?candidateInput.value:'4';const params=new URLSearchParams({provider,candidateCount,views:'3'});const res=await fetch('/api/character-generator/budget?'+params.toString());if(!res.ok){throw new Error('budget endpoint '+res.status);}const json=await res.json();const data=json&&json.data?json.data:null;if(!data){throw new Error('invalid budget response');}const providerInfo='provider='+data.provider+' / remoteConfigured='+data.remoteConfigured+' / vertexConfigured='+data.vertexConfigured+' / comfyConfigured='+data.comfyConfigured;const costInfo='estimatedThisRun=$'+Number(data.estimatedCostThisRunUsd||0).toFixed(2)+' / monthSpent=$'+Number(data.monthSpentUsd||0).toFixed(2)+' / monthBudget=$'+Number(data.monthBudgetUsd||0).toFixed(2);const limitInfo='maxCandidatesPerView='+data.maxCandidatesPerView+' / maxTotalImages='+data.maxTotalImages+' / maxRetries='+data.maxRetries;const warn=(typeof data.warning==='string'&&data.warning.length>0)?('<div class=\"error\">'+data.warning+'</div>'):'';bannerBody.innerHTML='<div class=\"notice\">'+providerInfo+'</div><div class=\"notice\">'+costInfo+'</div><div class=\"notice\">'+limitInfo+'</div>'+warn;};const safeRender=()=>{render().catch((error)=>{if(bannerBody){bannerBody.textContent='budget load failed: '+String(error);}})};safeRender();if(providerSelect){providerSelect.addEventListener('change',safeRender);}if(candidateInput){candidateInput.addEventListener('input',safeRender);}})();</script>`;
  return html.replace("<main>", `<main>${banner}${script}`);
}

export function registerPublishRoutes(input: {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: Queue<EpisodeJobPayload>;
}): void {
  const { app, prisma, queue } = input;
  const queueName = queue.name ?? DEMO_QUEUE_NAME;
  const assetQueue = new BullQueue(ASSET_QUEUE_NAME, {
    connection: {
      url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    }
  });

  assetQueue.on("error", (error) => {
    if (isRedisUnavailableError(error)) {
      app.log.warn(
        {
          redis: "down",
          queue: ASSET_QUEUE_NAME,
          redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
          reason: errorMessage(error)
        },
        "Asset ingest queue is unavailable. Asset enqueue routes will return 503 until Redis is reachable."
      );
      return;
    }

    app.log.error(
      {
        queue: ASSET_QUEUE_NAME,
        error
      },
      "Asset ingest queue error"
    );
  });

  registerFormBody(app);

  registerApiRoutes({
    app,
    prisma,
    queue,
    assetQueue: assetQueue as unknown as Queue,
    queueName
  });

  registerUiRoutes({
    app,
    prisma,
    queue,
    queueName
  });

  registerCharacterRoutes({
    app,
    prisma,
    queue,
    queueName
  });

  app.addHook("onClose", async () => {
    await assetQueue.close().catch(() => undefined);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const pathname = request.url.split("?", 1)[0] ?? request.url;
    if (pathname !== "/ui/character-generator") {
      return payload;
    }
    if (reply.statusCode >= 400) {
      return payload;
    }

    const contentType = reply.getHeader("content-type");
    const contentTypeText = Array.isArray(contentType) ? contentType.join(";") : String(contentType ?? "");
    if (!contentTypeText.includes("text/html")) {
      return payload;
    }

    const html = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload ?? "");
    if (!html.includes('action="/ui/character-generator/create"')) {
      return payload;
    }
    const injected = injectCharacterGeneratorBudgetBanner(html);
    return injected;
  });

  app.get("/api/character-generator/budget", async (request) => {
    const config = readImageGenBudgetConfig();
    const query = parseBudgetQuery(request.query);
    const estimate = estimateRunCost({
      provider: query.provider,
      candidateCount: query.candidateCount,
      views: query.views,
      maxCandidatesPerView: config.maxCandidatesPerView,
      maxTotalImages: config.maxTotalImages,
      costPerImageUsd: config.costPerImageUsd
    });
    const monthSpentUsd = await readMonthlyImageGenSpentUsd(prisma);

    let warning = "";
    if (query.provider === "remoteApi" && !config.remoteConfigured) {
      warning = "IMAGEGEN_REMOTE_BASE_URL is not configured. remoteApi will not be available.";
    } else if (query.provider === "vertexImagen" && !config.vertexConfigured) {
      warning = "IMAGEGEN_VERTEX_PROJECT_ID is not configured. vertexImagen will not be available.";
    } else if (query.provider === "comfyui" && !config.comfyConfigured && !config.remoteConfigured) {
      warning = "COMFYUI_BASE_URL is not configured. provider will fall back to mock.";
    } else if (isPremiumImageProvider(query.provider) && query.candidateCount > estimate.maxCandidatesPerView) {
      warning = `${query.provider} is capped for premium rescue/bank use. Candidate count is limited to ${estimate.maxCandidatesPerView} per view.`;
    } else if (monthSpentUsd + estimate.estimatedCostUsd > config.monthBudgetUsd) {
      warning = "Estimated run would exceed monthly budget. Generation can be rejected or fallback to mock.";
    }

    return {
      data: {
        provider: query.provider,
        estimatedImageCount: estimate.estimatedImageCount,
        estimatedCostThisRunUsd: estimate.estimatedCostUsd,
        monthSpentUsd,
        monthBudgetUsd: config.monthBudgetUsd,
        remainingBudgetUsd: Math.max(0, config.monthBudgetUsd - monthSpentUsd),
        maxCandidatesPerView: estimate.maxCandidatesPerView,
        maxTotalImages: estimate.maxTotalImages,
        maxRetries: estimate.maxRetries ?? config.maxRetries,
        remoteConfigured: config.remoteConfigured,
        vertexConfigured: config.vertexConfigured,
        comfyConfigured: config.comfyConfigured,
        warning
      }
    };
  });

  registerAnalyticsRoutes({
    app,
    prisma,
    queue,
    queueName
  });

  registerAdminOpsRoutes({
    app,
    prisma
  });

  registerAgentRoutes({
    app,
    prisma,
    queue,
    queueName
  });

  if (STATIC_ARTIFACTS_ENABLED) {
    registerArtifactsIndexRoutes(app);
    registerStaticArtifactsRoute(app);
  }

  app.get("/healthz", async () => {
    let dbStatus: "up" | "down" = "up";
    let dbError: string | null = null;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      dbStatus = "down";
      dbError = errorMessage(error);
    }

    let redisStatus: "up" | "down" = "down";
    let queueReady = false;
    let redisError: string | null = null;

    try {
      const raw = await app.inject({
        method: "GET",
        url: "/health",
        headers: API_KEY.length > 0 ? { "x-api-key": API_KEY } : undefined
      });

      if (raw.statusCode >= 400) {
        redisError = `health probe failed with status ${raw.statusCode}`;
      } else {
        const parsed = JSON.parse(raw.body) as { data?: { redis?: unknown; queueReady?: unknown; redisError?: unknown } };
        const redisValue = parsed?.data?.redis;
        const queueValue = parsed?.data?.queueReady;
        redisStatus = redisValue === "up" ? "up" : "down";
        queueReady = queueValue === true;
        redisError = typeof parsed?.data?.redisError === "string" ? parsed.data.redisError : null;
      }
    } catch (error) {
      redisError = errorMessage(error);
    }

    const minio = await checkMinioHealth();
    const ok = dbStatus === "up" && redisStatus === "up" && queueReady && minio.status !== "down";

    return {
      data: {
        ok,
        checkedAt: new Date().toISOString(),
        services: {
          database: {
            status: dbStatus,
            ...(dbError ? { error: dbError } : {})
          },
          redis: {
            status: redisStatus,
            queueReady,
            queueName,
            ...(redisError ? { error: redisError } : {})
          },
          minio: {
            status: minio.status,
            endpoint: minio.endpoint,
            bucket: process.env.S3_BUCKET?.trim() ?? null,
            ...(minio.error ? { error: minio.error } : {})
          }
        },
        fixes: {
          dockerPreflight: "pnpm smoke:docker",
          startInfra: "pnpm docker:up",
          runMigrations: "pnpm db:migrate",
          startAll: "pnpm dev",
          startApiOnly: "pnpm -C apps/api run dev",
          startWorkerOnly: "pnpm -C apps/worker run dev"
        }
      }
    };
  });

  app.post("/demo/extreme", async (request, reply) => {
    try {
      const body = request.body === undefined ? {} : requireBodyObject(request.body);
      const alwaysCreateNewEpisode = parseBooleanField(body, "alwaysCreateNewEpisode", false);
      const result = await createExtremeDemoRun({
        prisma,
        queue,
        queueName,
        alwaysCreateNewEpisode
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: result.idempotent ? 200 : 201,
        success: true,
        action: "demo.extreme.create",
        details: {
          idempotent: result.idempotent,
          episodeId: result.episodeId,
          jobId: result.jobId,
          bullmqJobId: result.bullmqJobId,
          alwaysCreateNewEpisode: result.alwaysCreateNewEpisode
        }
      });

      return reply.code(result.idempotent ? 200 : 201).send({
        data: {
          idempotent: result.idempotent,
          episodeId: result.episodeId,
          jobId: result.jobId,
          bullmqJobId: result.bullmqJobId,
          alwaysCreateNewEpisode: result.alwaysCreateNewEpisode
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
        action: "demo.extreme.create",
        errorMessage: message
      });

      throw error;
    }
  });

  app.get("/episodes/:episodeId/status", async (request) => {
    try {
      const episodeId = requireRouteParam(request.params, "episodeId");

      const episode = await prisma.episode.findUnique({
        where: { id: episodeId },
        select: {
          id: true,
          topic: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!episode) {
        throw createHttpError(404, "Episode not found");
      }

      const latestJob = await prisma.job.findFirst({
        where: { episodeId },
        orderBy: { createdAt: "desc" },
        include: {
          logs: {
            orderBy: { createdAt: "desc" },
            take: 10
          }
        }
      });

      const previewPath = path.join(getRepoRoot(), "out", episodeId, "preview.mp4");
      const previewExists = fs.existsSync(previewPath);

      await writeAuditLog({
        prisma,
        request,
        statusCode: 200,
        success: true,
        action: "episodes.status.get",
        details: {
          episodeId,
          previewExists,
          latestJobId: latestJob?.id ?? null
        }
      });

      return {
        data: {
          episodeId: episode.id,
          topic: episode.topic,
          episodeStatus: episode.status,
          preview: {
            exists: previewExists,
            path: toRepoRelativePath(previewPath),
            url: previewExists ? toArtifactsUrl(previewPath) : null
          },
          latestJob: latestJob
            ? {
                id: latestJob.id,
                type: latestJob.type,
                status: latestJob.status,
                progress: latestJob.progress,
                attemptsMade: latestJob.attemptsMade,
                maxAttempts: latestJob.maxAttempts,
                bullmqJobId: latestJob.bullmqJobId,
                lastError: latestJob.lastError,
                createdAt: latestJob.createdAt,
                startedAt: latestJob.startedAt,
                finishedAt: latestJob.finishedAt,
                logs: latestJob.logs.map((log) => ({
                  id: log.id,
                  level: log.level,
                  message: log.message,
                  createdAt: log.createdAt
                }))
              }
            : null
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
        action: "episodes.status.get",
        errorMessage: message
      });

      throw error;
    }
  });

  app.post("/publish/:episodeId", async (request, reply) => {
    try {
      const episodeId = requireRouteParam(request.params, "episodeId");
      const body = request.body === undefined ? {} : requireBodyObject(request.body);

      const publishAtInput = optionalDate(body, "publishAt");
      const sourceFramePath = optionalString(body, "sourceFramePath");
      const renderOutputPath = optionalString(body, "renderOutputPath");
      const thumbnailTemplateName = optionalString(body, "thumbnailTemplateName");
      const result = await createPublishJob({
        prisma,
        episodeId,
        plannedPublishAt: publishAtInput,
        sourceFramePath,
        renderOutputPath,
        thumbnailTemplateName,
        outputRootDir: getPublishOutputRoot()
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: result.idempotent ? 200 : 201,
        success: true,
        action: "publish.create",
        details: {
          episodeId,
          idempotent: result.idempotent,
          jobId: result.jobId,
          manifestPath: result.manifestPath
        }
      });

      return reply.code(result.idempotent ? 200 : 201).send({
        data: {
          episodeId,
          status: result.status,
          publishAt: result.publishAt,
          jobId: result.jobId,
          manifestPath: result.manifestPath,
          manifestUrl: toArtifactsUrl(result.manifestPath),
          manifest: sanitizeUploadManifest(result.manifest),
          idempotent: result.idempotent
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "publish.create",
        errorMessage: message
      });

      await notifier.notify({
        source: "api:publish",
        title: "Publish pipeline failed",
        level: "error",
        body: "Publish endpoint failed.",
        metadata: {
          path: request.url,
          error: message,
          stack
        }
      });

      throw error;
    }
  });

  app.get("/publish/:episodeId/status", async (request) => {
    try {
      const episodeId = requireRouteParam(request.params, "episodeId");

      const episode = await prisma.episode.findUnique({
        where: { id: episodeId },
        select: {
          id: true
        }
      });

      if (!episode) {
        throw createHttpError(404, "Episode not found");
      }

      const latestPublishJob = await prisma.job.findFirst({
        where: {
          episodeId,
          type: "PACKAGE_OUTPUTS"
        },
        orderBy: { createdAt: "desc" },
        include: {
          logs: {
            orderBy: { createdAt: "desc" },
            take: 20
          }
        }
      });

      if (!latestPublishJob) {
        await writeAuditLog({
          prisma,
          request,
          statusCode: 200,
          success: true,
          action: "publish.status.get",
          details: {
            episodeId,
            status: "NOT_STARTED"
          }
        });

        return {
          data: {
            episodeId,
            publishAt: null,
            status: "NOT_STARTED",
            job: null,
            manifestPath: null,
            manifest: null
          }
        };
      }

      const details = extractPublishLogDetails(latestPublishJob.logs);
      const manifest = readManifestSafely(details.manifestPath);
      const publishAtIso = details.plannedPublishAt ?? null;
      const publishStatus = manifest?.status ?? latestPublishJob.status;

      await writeAuditLog({
        prisma,
        request,
        statusCode: 200,
        success: true,
        action: "publish.status.get",
        details: {
          episodeId,
          status: publishStatus,
          jobId: latestPublishJob.id
        }
      });

      return {
        data: {
          episodeId,
          publishAt: publishAtIso,
          status: publishStatus,
          job: {
            id: latestPublishJob.id,
            status: latestPublishJob.status,
            progress: latestPublishJob.progress,
            startedAt: latestPublishJob.startedAt,
            finishedAt: latestPublishJob.finishedAt,
            lastError: latestPublishJob.lastError
          },
          manifestPath: toRepoRelativePath(details.manifestPath),
          manifestUrl: toArtifactsUrl(details.manifestPath),
          manifest: sanitizeUploadManifest(manifest)
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
        action: "publish.status.get",
        errorMessage: message
      });

      throw error;
    }
  });
}

