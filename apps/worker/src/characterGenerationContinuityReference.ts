import fs from "node:fs";

type CharacterGenerationSessionDelegateLike = {
  findMany: (args: unknown) => Promise<Array<{ id: string }>>;
};

type CharacterGenerationCandidateDelegateLike = {
  findMany: (args: unknown) => Promise<Array<{
    localPath: string | null;
    picked: boolean;
    updatedAt: Date;
    scoreJson: unknown;
    qcJson: unknown;
  }>>;
};

type ContinuityReferenceConfigLike = {
  maxSessionAgeHours: number;
  minScore: number;
  maxRejections: number;
  requirePicked: boolean;
  requireScore: boolean;
  candidateTake: number;
  preferredSessionTake: number;
  fallbackSessionTake: number;
};

type RankedReference = {
  referenceImageBase64: string;
  referenceMimeType: string;
  picked: boolean;
  score: number | null;
  rankScore: number;
  rejectionCount: number;
  updatedAtMs: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function extractCandidateScore(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }
  const raw = value.score;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  return clamp01(raw);
}

export function extractCandidateRejectionCount(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }
  const raw = value.rejections;
  if (!Array.isArray(raw)) {
    return 0;
  }
  return raw.filter((item) => typeof item === "string" && item.trim().length > 0).length;
}

function isBetterContinuityCandidate(
  next: { picked: boolean; rankScore: number; rejectionCount: number; updatedAtMs: number },
  current: { picked: boolean; rankScore: number; rejectionCount: number; updatedAtMs: number }
): boolean {
  if (next.picked !== current.picked) {
    return next.picked;
  }
  if (next.rankScore !== current.rankScore) {
    return next.rankScore > current.rankScore;
  }
  if (next.rejectionCount !== current.rejectionCount) {
    return next.rejectionCount < current.rejectionCount;
  }
  return next.updatedAtMs > current.updatedAtMs;
}

export async function resolveFrontReferenceFromSession(input: {
  candidateDelegate: CharacterGenerationCandidateDelegateLike | null;
  sessionId: string;
  config: ContinuityReferenceConfigLike;
}): Promise<{
  referenceImageBase64: string;
  referenceMimeType: string;
  picked: boolean;
  score: number | null;
  rejectionCount: number;
  updatedAtMs: number;
} | undefined> {
  const { candidateDelegate, sessionId, config } = input;
  if (!candidateDelegate) {
    return undefined;
  }

  const rows = await candidateDelegate.findMany({
    where: {
      sessionId,
      view: "FRONT",
      ...(config.requirePicked ? { picked: true } : {})
    },
    orderBy: [{ picked: "desc" }, { updatedAt: "desc" }],
    take: config.candidateTake,
    select: {
      localPath: true,
      picked: true,
      updatedAt: true,
      scoreJson: true,
      qcJson: true
    }
  });

  let best: RankedReference | null = null;
  for (const row of rows) {
    const localPath = typeof row.localPath === "string" ? row.localPath.trim() : "";
    if (!localPath || !fs.existsSync(localPath)) {
      continue;
    }

    const score = extractCandidateScore(row.scoreJson);
    if (score === null && config.requireScore) {
      continue;
    }
    if (score !== null && score < config.minScore) {
      continue;
    }

    const qc = isRecord(row.qcJson) ? row.qcJson : null;
    const rejectionCount = extractCandidateRejectionCount(qc);
    if (rejectionCount > config.maxRejections) {
      continue;
    }

    const mimeType =
      qc && typeof qc.mime === "string" && qc.mime.trim().length > 0
        ? qc.mime.trim()
        : "image/png";

    let data: Buffer;
    try {
      data = fs.readFileSync(localPath);
    } catch {
      continue;
    }

    const candidate: RankedReference = {
      referenceImageBase64: data.toString("base64"),
      referenceMimeType: mimeType,
      picked: row.picked,
      score,
      rankScore: score ?? -1,
      rejectionCount,
      updatedAtMs: row.updatedAt.getTime()
    };
    if (!best || isBetterContinuityCandidate(candidate, best)) {
      best = candidate;
    }
  }

  if (!best) {
    return undefined;
  }
  return {
    referenceImageBase64: best.referenceImageBase64,
    referenceMimeType: best.referenceMimeType,
    picked: best.picked,
    score: best.score,
    rejectionCount: best.rejectionCount,
    updatedAtMs: best.updatedAtMs
  };
}

export async function resolveAutoContinuityReference(input: {
  sessionDelegate: CharacterGenerationSessionDelegateLike | null;
  episodeId: string;
  channelId: string;
  characterPackId: string;
  currentSessionId?: string;
  config: ContinuityReferenceConfigLike;
  resolveFrontReferenceFromSession: (sessionId: string) => Promise<{
    referenceImageBase64: string;
    referenceMimeType: string;
    picked: boolean;
    score: number | null;
    rejectionCount: number;
    updatedAtMs: number;
  } | undefined>;
}): Promise<{
  match?:
    | {
        sessionId: string;
        referenceImageBase64: string;
        referenceMimeType: string;
        sourcePool: "preferred" | "fallback";
        candidatePicked: boolean;
        candidateScore: number | null;
        candidateRejectionCount: number;
        candidateUpdatedAt: string;
      }
    | undefined;
  diagnostics: {
    cutoffUpdatedAt: string;
    queuedSessionCount: number;
    uniqueQueuedSessionCount: number;
    duplicateSessionCount: number;
    searchedSessionCount: number;
    searchedSessionIdsPreview: string[];
    preferredPoolCount: number;
    fallbackPoolCount: number;
    reason?: "matched" | "no_recent_ready_session" | "no_eligible_front_candidate";
  };
}> {
  const { sessionDelegate, episodeId, channelId, characterPackId, currentSessionId, config } = input;
  if (!sessionDelegate) {
    return {
      diagnostics: {
        cutoffUpdatedAt: new Date(Date.now() - config.maxSessionAgeHours * 60 * 60 * 1000).toISOString(),
        queuedSessionCount: 0,
        uniqueQueuedSessionCount: 0,
        duplicateSessionCount: 0,
        searchedSessionCount: 0,
        searchedSessionIdsPreview: [],
        preferredPoolCount: 0,
        fallbackPoolCount: 0,
        reason: "no_recent_ready_session"
      }
    };
  }

  const cutoffDate = new Date(Date.now() - config.maxSessionAgeHours * 60 * 60 * 1000);
  const whereBase: Record<string, unknown> = {
    status: "READY",
    NOT: {
      episodeId
    },
    updatedAt: {
      gte: cutoffDate
    },
    ...(currentSessionId ? { id: { not: currentSessionId } } : {})
  };

  const preferred = await sessionDelegate.findMany({
    where: {
      ...whereBase,
      characterPackId
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true
    },
    take: config.preferredSessionTake
  });

  const fallback = await sessionDelegate.findMany({
    where: {
      ...whereBase,
      episode: {
        is: {
          channelId
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true
    },
    take: config.fallbackSessionTake
  });

  const queue = [...preferred.map((row) => row.id), ...fallback.map((row) => row.id)];
  const uniqueQueuedSessionIds = new Set(queue);
  const uniqueQueuedSessionCount = uniqueQueuedSessionIds.size;
  const duplicateSessionCount = Math.max(0, queue.length - uniqueQueuedSessionCount);
  const preferredSet = new Set(preferred.map((row) => row.id));
  const visited = new Set<string>();
  const visitedOrder: string[] = [];
  for (const sessionId of queue) {
    if (visited.has(sessionId)) {
      continue;
    }
    visited.add(sessionId);
    visitedOrder.push(sessionId);
    const resolved = await input.resolveFrontReferenceFromSession(sessionId);
    if (resolved) {
      return {
        match: {
          sessionId,
          referenceImageBase64: resolved.referenceImageBase64,
          referenceMimeType: resolved.referenceMimeType,
          sourcePool: preferredSet.has(sessionId) ? "preferred" : "fallback",
          candidatePicked: resolved.picked,
          candidateScore: resolved.score,
          candidateRejectionCount: resolved.rejectionCount,
          candidateUpdatedAt: new Date(resolved.updatedAtMs).toISOString()
        },
        diagnostics: {
          cutoffUpdatedAt: cutoffDate.toISOString(),
          queuedSessionCount: queue.length,
          uniqueQueuedSessionCount,
          duplicateSessionCount,
          searchedSessionCount: visited.size,
          searchedSessionIdsPreview: visitedOrder.slice(0, 5),
          preferredPoolCount: preferred.length,
          fallbackPoolCount: fallback.length,
          reason: "matched"
        }
      };
    }
  }

  const reason =
    queue.length === 0
      ? ("no_recent_ready_session" as const)
      : ("no_eligible_front_candidate" as const);
  return {
    diagnostics: {
      cutoffUpdatedAt: cutoffDate.toISOString(),
      queuedSessionCount: queue.length,
      uniqueQueuedSessionCount,
      duplicateSessionCount,
      searchedSessionCount: visited.size,
      searchedSessionIdsPreview: visitedOrder.slice(0, 5),
      preferredPoolCount: preferred.length,
      fallbackPoolCount: fallback.length,
      reason
    }
  };
}
