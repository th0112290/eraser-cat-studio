import fs from "node:fs";
import net from "node:net";
import { PrismaClient } from "@prisma/client";

type SidecarSmokePreflightInput = {
  fixturePath: string;
  characterPackId?: string | null;
  requireCharacterPack?: boolean;
  requireApprovedCharacterPack?: boolean;
  renderer?: string | null;
};

type SidecarSmokePreflightResult = {
  fixturePath: string;
  database: "ok";
  redis: "ok";
  comfy:
    | {
        renderer: string;
        serverUrl: string;
        objectInfo: "ok";
      }
    | null;
  characterPack:
    | {
        id: string;
        channelId: string;
        status: string;
      }
    | null;
};

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveComfyServerUrl(): string {
  const configured = process.env.COMFY_SERVER_URL?.trim();
  return configured && configured.length > 0 ? configured : "http://127.0.0.1:8000";
}

function isComfyBackedRenderer(renderer: string | null | undefined): boolean {
  const normalized = renderer?.trim().toLowerCase() ?? "";
  if (normalized.length === 0) {
    return false;
  }
  return normalized.startsWith("comfyui-") || normalized.startsWith("hunyuan15_");
}

async function probeComfyObjectInfo(serverUrl: string): Promise<void> {
  const endpoint = new URL(serverUrl);
  await probeTcpEndpoint({
    host: endpoint.hostname,
    port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80))
  });
  const response = await fetch(`${serverUrl}/object_info`, {
    method: "GET",
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("invalid object_info payload");
  }
}

async function probeTcpEndpoint(input: { host: string; port: number; timeoutMs?: number }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finalize = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      callback();
    };
    socket.setTimeout(input.timeoutMs ?? 3000);
    socket.once("connect", () => finalize(resolve));
    socket.once("timeout", () => finalize(() => reject(new Error(`timeout connecting to ${input.host}:${input.port}`))));
    socket.once("error", (error) => finalize(() => reject(error)));
    socket.connect(input.port, input.host);
  });
}

export async function runSidecarSmokePreflight(
  input: SidecarSmokePreflightInput
): Promise<SidecarSmokePreflightResult> {
  if (!fs.existsSync(input.fixturePath)) {
    throw new Error(`[sidecar-smoke-preflight] fixture not found: ${input.fixturePath}`);
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch (error) {
    throw new Error(`[sidecar-smoke-preflight] database unreachable: ${formatErrorMessage(error)}`);
  }

  try {
    const redisUrlRaw = process.env.REDIS_URL?.trim();
    if (!redisUrlRaw) {
      throw new Error("REDIS_URL is required");
    }
    const redisUrl = new URL(redisUrlRaw);
    await probeTcpEndpoint({
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379)
    });
  } catch (error) {
    throw new Error(`[sidecar-smoke-preflight] redis unreachable: ${formatErrorMessage(error)}`);
  }

  const renderer = input.renderer?.trim() || null;
  const comfyServerUrl = resolveComfyServerUrl();
  const comfyResult = isComfyBackedRenderer(renderer)
    ? await (async () => {
        try {
          await probeComfyObjectInfo(comfyServerUrl);
          return {
            renderer: renderer!,
            serverUrl: comfyServerUrl,
            objectInfo: "ok" as const
          };
        } catch (error) {
          throw new Error(
            `[sidecar-smoke-preflight] comfy unreachable for ${renderer} @ ${comfyServerUrl}: ${formatErrorMessage(error)}`
          );
        }
      })()
    : null;

  const characterPackId = input.characterPackId?.trim() || null;
  if (!characterPackId) {
    if (input.requireCharacterPack !== false) {
      throw new Error("[sidecar-smoke-preflight] character pack id is required");
    }
    await prisma.$disconnect();
    return {
      fixturePath: input.fixturePath,
      database: "ok",
      redis: "ok",
      comfy: comfyResult,
      characterPack: null
    };
  }

  try {
    const characterPack = await prisma.characterPack.findUnique({
      where: { id: characterPackId },
      select: {
        id: true,
        channelId: true,
        status: true
      }
    });
    if (!characterPack) {
      throw new Error(`character pack not found: ${characterPackId}`);
    }
    if (input.requireApprovedCharacterPack !== false && characterPack.status !== "APPROVED") {
      throw new Error(`character pack ${characterPackId} is not approved (status=${characterPack.status})`);
    }
    return {
      fixturePath: input.fixturePath,
      database: "ok",
      redis: "ok",
      comfy: comfyResult,
      characterPack: {
        id: characterPack.id,
        channelId: characterPack.channelId,
        status: characterPack.status
      }
    };
  } catch (error) {
    throw new Error(`[sidecar-smoke-preflight] ${formatErrorMessage(error)}`);
  } finally {
    await prisma.$disconnect();
  }
}
