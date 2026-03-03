import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parse as parseQueryString } from "node:querystring";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { JobsOptions, Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { EpisodeJobPayload } from "./scheduleService";
import {
  createPublishManifest,
  MockYouTubeUploader,
  readUploadManifest,
  type UploadManifest
} from "../../../../packages/publish/src/index";
import { createDefaultNotifier, estimateJobCost } from "../../../../packages/ops/src/index";
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
const STATIC_ARTIFACTS_PREFIX = "/artifacts/";
const STATIC_ARTIFACTS_ENABLED = (process.env.FF_STATIC_ARTIFACTS ?? "true").trim().toLowerCase() === "true";
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

function isArtifactsRequest(url: string): boolean {
  const pathname = url.split("?", 1)[0] ?? url;
  return pathname === "/artifacts" || pathname.startsWith(STATIC_ARTIFACTS_PREFIX);
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

function registerArtifactsIndexRoutes(app: FastifyInstance): void {
  const artifactsRoot = getStaticArtifactsRoot();

  const handler = async () => {
    const items = await readArtifactsIndex(artifactsRoot);
    return {
      ok: true,
      root: artifactsRoot,
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
    removeOnComplete: false,
    removeOnFail: false
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

export function registerPublishRoutes(input: {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: Queue<EpisodeJobPayload>;
}): void {
  const { app, prisma, queue } = input;
  const queueName = queue.name ?? DEMO_QUEUE_NAME;

  registerFormBody(app);

  registerApiRoutes({
    app,
    prisma,
    queue,
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

    app.addHook("onRequest", async (request) => {
      if (!isArtifactsRequest(request.url)) {
        return;
      }

      if (API_KEY.length === 0) {
        return;
      }

      const existing = request.headers["x-api-key"];
      const current = Array.isArray(existing) ? existing[0] : existing;
      if (typeof current !== "string" || current.trim() === "") {
        request.headers["x-api-key"] = API_KEY;
      }
    });

    registerStaticArtifactsRoute(app);
  }

  app.post("/demo/extreme", async (request, reply) => {
    try {
      const user = await prisma.user.upsert({
        where: { email: DEMO_USER_EMAIL },
        update: { name: DEMO_USER_NAME },
        create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME }
      });

      const channel =
        (await prisma.channel.findFirst({
          where: { userId: user.id, name: DEMO_CHANNEL_NAME },
          orderBy: { createdAt: "asc" }
        })) ??
        (await prisma.channel.create({
          data: { userId: user.id, name: DEMO_CHANNEL_NAME }
        }));

      const episode =
        (await prisma.episode.findFirst({
          where: { channelId: channel.id, topic: DEMO_TOPIC },
          orderBy: { createdAt: "desc" }
        })) ??
        (await prisma.episode.create({
          data: {
            channelId: channel.id,
            topic: DEMO_TOPIC,
            targetDurationSec: 600
          }
        }));

      const activeJob = await prisma.job.findFirst({
        where: {
          episodeId: episode.id,
          type: "GENERATE_BEATS",
          status: { in: ["QUEUED", "RUNNING"] }
        },
        orderBy: { createdAt: "desc" }
      });

      if (activeJob?.bullmqJobId) {
        await writeAuditLog({
          prisma,
          request,
          statusCode: 200,
          success: true,
          action: "demo.extreme.create",
          details: {
            idempotent: true,
            episodeId: episode.id,
            jobId: activeJob.id,
            bullmqJobId: activeJob.bullmqJobId
          }
        });

        return {
          data: {
            idempotent: true,
            episodeId: episode.id,
            jobId: activeJob.id,
            bullmqJobId: activeJob.bullmqJobId
          }
        };
      }

      const job =
        activeJob ??
        (await prisma.job.create({
          data: {
            episodeId: episode.id,
            type: "GENERATE_BEATS",
            status: "QUEUED",
            progress: 0,
            maxAttempts: DEMO_MAX_ATTEMPTS,
            retryBackoffMs: DEMO_BACKOFF_MS,
            ...estimateJobCost({
              estimatedApiCalls: 2
            })
          }
        }));

      if (!activeJob) {
        await prisma.jobLog.create({
          data: {
            jobId: job.id,
            level: "info",
            message: "Transition -> QUEUED",
            details: {
              source: "api:demo:extreme",
              maxAttempts: job.maxAttempts,
              backoffMs: job.retryBackoffMs
            } as Prisma.InputJsonValue
          }
        });
      }

      const queued = await enqueueWithIdempotency(
        queue,
        "GENERATE_BEATS",
        {
          jobDbId: job.id,
          episodeId: episode.id,
          schemaChecks: []
        },
        job.maxAttempts,
        job.retryBackoffMs
      );

      const bullmqJobId = String(queued.id);

      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: "QUEUED",
            bullmqJobId,
            lastError: null,
            finishedAt: null
          }
        });

        await tx.jobLog.create({
          data: {
            jobId: job.id,
            level: "info",
            message: activeJob ? "Transition -> REENQUEUED" : "Transition -> ENQUEUED",
            details: {
              source: "api:demo:extreme",
              queueName,
              bullmqJobId
            } as Prisma.InputJsonValue
          }
        });
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: 201,
        success: true,
        action: "demo.extreme.create",
        details: {
          idempotent: false,
          episodeId: episode.id,
          jobId: job.id,
          bullmqJobId
        }
      });

      return reply.code(201).send({
        data: {
          idempotent: false,
          episodeId: episode.id,
          jobId: job.id,
          bullmqJobId
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
            path: previewPath
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

      const episode = await prisma.episode.findUnique({
        where: { id: episodeId },
        select: {
          id: true,
          topic: true
        }
      });

      if (!episode) {
        throw createHttpError(404, "Episode not found");
      }

      const plannedPublishAt = publishAtInput ?? new Date();
      const plannedPublishAtIso = plannedPublishAt.toISOString();

      const existingPublishJob = await prisma.job.findFirst({
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

      if (existingPublishJob && existingPublishJob.status === "SUCCEEDED") {
        const details = extractPublishLogDetails(existingPublishJob.logs);
        if (details.plannedPublishAt === plannedPublishAtIso) {
          const manifest = readManifestSafely(details.manifestPath);
          if (manifest && details.manifestPath) {
            await writeAuditLog({
              prisma,
              request,
              statusCode: 200,
              success: true,
              action: "publish.create",
              details: {
                episodeId,
                idempotent: true,
                jobId: existingPublishJob.id
              }
            });

            return {
              data: {
                episodeId,
                status: existingPublishJob.status,
                publishAt: plannedPublishAtIso,
                jobId: existingPublishJob.id,
                manifestPath: details.manifestPath,
                manifest,
                idempotent: true
              }
            };
          }
        }
      }

      const cost = estimateJobCost({
        estimatedApiCalls: 3,
        estimatedRenderSeconds: 0,
        estimatedAudioSeconds: 0
      });

      const publishJob = await prisma.job.create({
        data: {
          episodeId,
          type: "PACKAGE_OUTPUTS",
          status: "RUNNING",
          progress: 10,
          maxAttempts: 1,
          retryBackoffMs: 1000,
          startedAt: new Date(),
          estimatedRenderSeconds: cost.estimatedRenderSeconds,
          estimatedAudioSeconds: cost.estimatedAudioSeconds,
          estimatedApiCalls: cost.estimatedApiCalls,
          estimatedCostUsd: cost.estimatedCostUsd
        }
      });

      await prisma.jobLog.create({
        data: {
          jobId: publishJob.id,
          level: "info",
          message: "Transition -> RUNNING",
          details: {
            source: "api:publish",
            plannedPublishAt: plannedPublishAtIso,
            estimatedCostUsd: cost.estimatedCostUsd
          } as Prisma.InputJsonValue
        }
      });

      const publishResult = await createPublishManifest(
        {
          episodeId,
          topic: episode.topic,
          plannedPublishAt,
          outputRootDir: getPublishOutputRoot(),
          sourceFramePath,
          renderOutputPath,
          thumbnailTemplateName
        },
        new MockYouTubeUploader()
      );

      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: publishJob.id },
          data: {
            status: "SUCCEEDED",
            progress: 100,
            finishedAt: new Date(),
            lastError: null
          }
        });

        await tx.jobLog.create({
          data: {
            jobId: publishJob.id,
            level: "info",
            message: "Publish manifest stored",
            details: {
              source: "api:publish",
              plannedPublishAt: plannedPublishAtIso,
              manifestPath: publishResult.manifestPath,
              uploadStatus: publishResult.manifest.status,
              externalVideoId: publishResult.manifest.upload.externalVideoId,
              watchUrl: publishResult.manifest.upload.watchUrl
            } as Prisma.InputJsonValue
          }
        });

        await tx.jobLog.create({
          data: {
            jobId: publishJob.id,
            level: "info",
            message: "Transition -> SUCCEEDED",
            details: {
              source: "api:publish",
              plannedPublishAt: plannedPublishAtIso,
              manifestPath: publishResult.manifestPath
            } as Prisma.InputJsonValue
          }
        });
      });

      await writeAuditLog({
        prisma,
        request,
        statusCode: 201,
        success: true,
        action: "publish.create",
        details: {
          episodeId,
          idempotent: false,
          jobId: publishJob.id,
          manifestPath: publishResult.manifestPath
        }
      });

      return reply.code(201).send({
        data: {
          episodeId,
          status: "SUCCEEDED",
          publishAt: plannedPublishAtIso,
          jobId: publishJob.id,
          manifestPath: publishResult.manifestPath,
          manifest: publishResult.manifest,
          idempotent: false
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
          manifestPath: details.manifestPath,
          manifest
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

