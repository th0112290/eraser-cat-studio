import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

function pickHeader(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function hashApiKey(value: string | undefined): string | null {
  if (!value || value.trim() === "") {
    return null;
  }

  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 24);
}

function sanitize(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as JsonRecord)) {
      if (entry === undefined) {
        continue;
      }
      out[key] = sanitize(entry);
    }
    return out;
  }

  return String(value);
}

export async function writeAuditLog(input: {
  prisma: PrismaClient;
  request: FastifyRequest;
  statusCode: number;
  success: boolean;
  action: string;
  details?: Record<string, unknown>;
  errorMessage?: string;
}): Promise<void> {
  const apiKey = pickHeader(input.request.headers["x-api-key"] as string | string[] | undefined);
  const actorApiKeyHash = hashApiKey(apiKey);

  const userAgent = pickHeader(input.request.headers["user-agent"] as string | string[] | undefined) ?? null;
  const forwardedFor = pickHeader(input.request.headers["x-forwarded-for"] as string | string[] | undefined);

  const details = sanitize({
    action: input.action,
    query: input.request.query,
    params: input.request.params,
    ...(input.details ? input.details : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {})
  }) as Prisma.InputJsonValue;

  await input.prisma.auditLog.create({
    data: {
      method: input.request.method,
      path: input.request.url,
      statusCode: input.statusCode,
      success: input.success,
      actorApiKeyHash,
      clientIp: forwardedFor ?? input.request.ip ?? null,
      userAgent,
      requestId: input.request.id,
      details
    }
  });
}
