import { spawn } from "node:child_process";
import {
  SIDECAR_SIGNAL_KEYS,
  deriveSidecarFallbackSignal,
  type SidecarJudgeCandidateInput,
  type SidecarJudgeProviderDescriptor,
  type SidecarJudgeSignalHint,
  type SidecarSignalKey
} from "./generatedSidecar";

const DEFAULT_PROMPT_VERSION = "sidecar_local_vlm_prompt_v1";

export type LocalVlmJudgeSignalResponse = {
  score?: number | null;
  confidence?: number | null;
  reasons?: string[];
  evidence?: Record<string, unknown>;
};

export type LocalVlmJudgeResponse = {
  summary?: string;
  confidence?: number | null;
  signals?: Partial<Record<SidecarSignalKey, LocalVlmJudgeSignalResponse>>;
  metadata?: Record<string, unknown>;
};

export type LocalVlmJudgeRequest = {
  prompt_version: string;
  response_schema: "sidecar_local_vlm_response_v1";
  shot_id: string;
  candidate_id: string;
  candidate: {
    output_video_path: string | null;
    reference_image_path: string | null;
    expected_duration_seconds: number;
    output_duration_seconds: number | null;
    subtitles_expected: boolean;
    chart_expected: boolean;
    narration: string | null;
    subtitle_text: string | null;
    artifact_paths: string[];
    metadata: Record<string, unknown>;
  };
};

export type SidecarJudgeProviderResult = {
  candidate_id: string;
  provider: SidecarJudgeProviderDescriptor;
  summary: string;
  confidence: number;
  signals: Record<SidecarSignalKey, SidecarJudgeSignalHint>;
  metadata: Record<string, unknown>;
  raw_response?: Record<string, unknown>;
};

export type SidecarJudgeProvider = {
  descriptor: SidecarJudgeProviderDescriptor;
  evaluateCandidate(candidate: SidecarJudgeCandidateInput): Promise<SidecarJudgeProviderResult>;
};

export type LocalVlmJudgeTransport = (request: LocalVlmJudgeRequest) => Promise<LocalVlmJudgeResponse>;

export type CreateLocalVlmJudgeProviderInput = {
  transport?: LocalVlmJudgeTransport;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout_ms?: number;
  model?: string | null;
  mode?: string;
  prompt_version?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function firstStringArray(record: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!record) {
    return [];
  }
  for (const key of keys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) {
      continue;
    }
    const values = candidate
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

function buildRequest(candidate: SidecarJudgeCandidateInput, promptVersion: string): LocalVlmJudgeRequest {
  return {
    prompt_version: promptVersion,
    response_schema: "sidecar_local_vlm_response_v1",
    shot_id: candidate.shotId,
    candidate_id: candidate.candidateId,
    candidate: {
      output_video_path: candidate.outputVideoPath ?? null,
      reference_image_path: candidate.referenceImagePath ?? null,
      expected_duration_seconds: round(Math.max(0, candidate.expectedDurationSeconds), 3),
      output_duration_seconds:
        typeof candidate.outputDurationSeconds === "number"
          ? round(Math.max(0, candidate.outputDurationSeconds), 3)
          : null,
      subtitles_expected: candidate.subtitlesExpected ?? false,
      chart_expected: candidate.chartExpected ?? false,
      narration: candidate.narration ?? null,
      subtitle_text: candidate.subtitleText ?? null,
      artifact_paths: (candidate.artifacts ?? []).map((artifact) => artifact.path),
      metadata: { ...(candidate.metadata ?? {}) }
    }
  };
}

export function createProcessLocalVlmTransport(input: {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout_ms?: number;
}): LocalVlmJudgeTransport {
  return async (request) =>
    new Promise<LocalVlmJudgeResponse>((resolve, reject) => {
      const child = spawn(input.command, input.args ?? [], {
        cwd: input.cwd,
        env: input.env,
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeoutMs = input.timeout_ms ?? 20_000;

      const settle = (error?: Error, response?: LocalVlmJudgeResponse) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutHandle);
        if (error) {
          reject(error);
          return;
        }
        resolve(response ?? {});
      };

      const timeoutHandle = setTimeout(() => {
        child.kill();
        settle(new Error(`Local VLM judge timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        settle(error);
      });
      child.on("close", (code) => {
        if (code !== 0) {
          settle(new Error(`Local VLM judge exited with code ${code ?? -1}: ${stderr.trim() || stdout.trim()}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as unknown;
          settle(undefined, isRecord(parsed) ? (parsed as LocalVlmJudgeResponse) : {});
        } catch {
          settle(new Error(`Local VLM judge returned non-JSON output: ${stderr.trim() || stdout.trim()}`));
        }
      });

      child.stdin.end(`${JSON.stringify(request)}\n`);
    });
}


export function createHeuristicLocalVlmTransport(): LocalVlmJudgeTransport {
  return async (request) => {
    const candidate: SidecarJudgeCandidateInput = {
      shotId: request.shot_id,
      candidateId: request.candidate_id,
      expectedDurationSeconds: request.candidate.expected_duration_seconds,
      outputDurationSeconds: request.candidate.output_duration_seconds,
      outputVideoPath: request.candidate.output_video_path,
      referenceImagePath: request.candidate.reference_image_path,
      narration: request.candidate.narration,
      subtitleText: request.candidate.subtitle_text,
      subtitlesExpected: request.candidate.subtitles_expected,
      chartExpected: request.candidate.chart_expected,
      metadata: request.candidate.metadata
    };

    const signals = Object.fromEntries(
      SIDECAR_SIGNAL_KEYS.map((signal) => [signal, deriveSidecarFallbackSignal(candidate, signal, "provider")])
    ) as Record<SidecarSignalKey, SidecarJudgeSignalHint>;

    const confidence =
      SIDECAR_SIGNAL_KEYS.reduce((sum, signal) => sum + (signals[signal].confidence ?? 0.6), 0) /
      SIDECAR_SIGNAL_KEYS.length;

    return {
      summary: "Heuristic local VLM fallback computed rig-aware sidecar signals without an external model process.",
      confidence: round(confidence, 3),
      signals,
      metadata: {
        transport: "heuristic"
      }
    };
  };
}

function mergeSignal(
  candidate: SidecarJudgeCandidateInput,
  response: LocalVlmJudgeResponse,
  signal: SidecarSignalKey
): SidecarJudgeSignalHint {
  const responseSignal = response.signals?.[signal];
  const hint = candidate.signalHints?.[signal];
  const heuristic = deriveSidecarFallbackSignal(candidate, signal, "provider");
  const responseRecord = isRecord(responseSignal?.evidence) ? responseSignal?.evidence : {};
  const hintRecord = isRecord(hint?.evidence) ? hint?.evidence : {};
  const heuristicRecord = isRecord(heuristic.evidence) ? heuristic.evidence : {};
  const responseMetadata = isRecord(response.metadata) ? response.metadata : {};
  const primarySource =
    typeof responseSignal?.score === "number"
      ? responseRecord.source ?? responseMetadata.transport ?? "local_vlm"
      : typeof hint?.score === "number"
        ? hintRecord.source ?? "candidate_hint"
        : heuristicRecord.source ?? responseMetadata.transport ?? "heuristic";

  return {
    score: clamp(responseSignal?.score ?? hint?.score ?? heuristic.score ?? 0, 0, 100),
    confidence: round(
      clamp(
        responseSignal?.confidence ?? hint?.confidence ?? response.confidence ?? heuristic.confidence ?? 0.6,
        0,
        1
      ),
      3
    ),
    reasons: uniqueStrings([
      ...(responseSignal?.reasons ?? []),
      ...(hint?.reasons ?? []),
      ...(heuristic.reasons ?? []),
      ...firstStringArray(responseMetadata, [`${signal}_reasons`, `${signal}Reasons`])
    ]),
    evidence: {
      ...heuristicRecord,
      ...hintRecord,
      ...responseRecord,
      candidate_id: candidate.candidateId,
      source: primarySource
    }
  };
}

export function createLocalVlmJudgeProvider(
  input: CreateLocalVlmJudgeProviderInput = {}
): SidecarJudgeProvider {
  const promptVersion = input.prompt_version ?? DEFAULT_PROMPT_VERSION;
  const descriptor: SidecarJudgeProviderDescriptor = {
    kind: "local_vlm",
    mode:
      input.mode ??
      (input.transport ? "custom_transport" : input.command ? "process_transport" : "heuristic_transport"),
    model: input.model ?? null,
    prompt_version: promptVersion
  };

  const transport =
    input.transport ??
    (input.command
      ? createProcessLocalVlmTransport({
          command: input.command,
          args: input.args,
          cwd: input.cwd,
          env: input.env,
          timeout_ms: input.timeout_ms
        })
      : createHeuristicLocalVlmTransport());

  return {
    descriptor,
    async evaluateCandidate(candidate) {
      const request = buildRequest(candidate, promptVersion);
      let response: LocalVlmJudgeResponse = {};
      let transportError: Error | null = null;
      try {
        response = await transport(request);
      } catch (error) {
        transportError = error instanceof Error ? error : new Error(String(error));
        response = {
          summary: "Local VLM unavailable; using rig-aware metadata fallback.",
          metadata: {
            transport: "heuristic_fallback",
            transport_error: transportError.message
          }
        };
      }
      const signals = Object.fromEntries(
        SIDECAR_SIGNAL_KEYS.map((signal) => [signal, mergeSignal(candidate, response, signal)])
      ) as Record<SidecarSignalKey, SidecarJudgeSignalHint>;
      const confidence =
        SIDECAR_SIGNAL_KEYS.reduce((sum, signal) => sum + (signals[signal].confidence ?? 0.6), 0) /
        SIDECAR_SIGNAL_KEYS.length;

      return {
        candidate_id: candidate.candidateId,
        provider: descriptor,
        summary:
          asString(response.summary) ??
          (transportError ? "Local VLM unavailable; rig-aware metadata fallback used." : "Local VLM judge evaluated the sidecar candidate."),
        confidence: round(confidence, 3),
        signals,
        metadata: {
          ...(isRecord(response.metadata) ? response.metadata : {}),
          transport_mode: descriptor.mode,
          ...(transportError ? { transport_error: transportError.message } : {})
        },
        raw_response: {
          summary: response.summary ?? null,
          confidence: response.confidence ?? null,
          signals: response.signals ?? {},
          metadata: response.metadata ?? {},
          transport_error: transportError?.message ?? null
        }
      };
    }
  };
}
