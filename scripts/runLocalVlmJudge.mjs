import fs from "node:fs";

const SIGNAL_KEYS = ["motion", "subtitle", "chart", "identity"];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function firstNumber(record, keys) {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const candidate = asFiniteNumber(record[key]);
    if (candidate !== null) {
      return candidate;
    }
  }
  return null;
}

function deriveHeuristicSignal(candidate, signal) {
  const metadata = isRecord(candidate.metadata) ? candidate.metadata : {};
  const durationRatio =
    typeof candidate.output_duration_seconds === "number" &&
    Number.isFinite(candidate.output_duration_seconds) &&
    candidate.expected_duration_seconds > 0
      ? candidate.output_duration_seconds / candidate.expected_duration_seconds
      : null;

  if (signal === "motion") {
    const metadataScore = firstNumber(metadata, ["motion_score", "motionScore", "motion_coherence_score"]);
    if (metadataScore !== null) {
      return {
        score: clamp(metadataScore, 0, 100),
        confidence: 0.72,
        reasons: ["derived_from_motion_metadata"],
        evidence: { source: "metadata" }
      };
    }
    const score =
      durationRatio === null
        ? 62
        : durationRatio >= 0.94 && durationRatio <= 1.08
          ? 76
          : durationRatio >= 0.9 && durationRatio <= 1.12
            ? 68
            : 54;
    return {
      score,
      confidence: 0.62,
      reasons: [durationRatio === null ? "duration_ratio_missing" : "duration_ratio_heuristic"],
      evidence: { duration_ratio: durationRatio }
    };
  }

  if (signal === "subtitle") {
    const metadataScore = firstNumber(metadata, ["subtitle_score", "subtitleScore", "subtitle_safe_score"]);
    if (metadataScore !== null) {
      return {
        score: clamp(metadataScore, 0, 100),
        confidence: 0.72,
        reasons: ["derived_from_subtitle_metadata"],
        evidence: { source: "metadata" }
      };
    }
    return {
      score: candidate.subtitles_expected ? 68 : 80,
      confidence: 0.58,
      reasons: [candidate.subtitles_expected ? "subtitle_expected_without_vlm" : "subtitle_not_expected"],
      evidence: {
        subtitle_text_present: Boolean(candidate.subtitle_text)
      }
    };
  }

  if (signal === "chart") {
    const metadataScore = firstNumber(metadata, ["chart_score", "chartScore", "chart_safe_score"]);
    if (metadataScore !== null) {
      return {
        score: clamp(metadataScore, 0, 100),
        confidence: 0.72,
        reasons: ["derived_from_chart_metadata"],
        evidence: { source: "metadata" }
      };
    }
    return {
      score: candidate.chart_expected ? 68 : 78,
      confidence: 0.58,
      reasons: [candidate.chart_expected ? "chart_expected_without_vlm" : "chart_not_expected"],
      evidence: { chart_expected: candidate.chart_expected ?? false }
    };
  }

  const metadataScore = firstNumber(metadata, [
    "identity_score",
    "identityScore",
    "mascot_identity_preservation_score"
  ]);
  if (metadataScore !== null) {
    return {
      score: clamp(metadataScore, 0, 100),
      confidence: 0.72,
      reasons: ["derived_from_identity_metadata"],
      evidence: { source: "metadata" }
    };
  }
  return {
    score: candidate.reference_image_path ? 74 : 60,
    confidence: 0.64,
    reasons: [candidate.reference_image_path ? "reference_identity_anchor_present" : "reference_identity_anchor_missing"],
    evidence: { reference_image_path: candidate.reference_image_path ?? null }
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const raw = await readStdin();
  if (!raw) {
    throw new Error("Local VLM judge stdin payload is empty.");
  }
  const parsed = JSON.parse(raw);
  if (!isRecord(parsed) || !isRecord(parsed.candidate)) {
    throw new Error("Local VLM judge request is invalid.");
  }

  const candidate = parsed.candidate;
  const signals = Object.fromEntries(
    SIGNAL_KEYS.map((signal) => [signal, deriveHeuristicSignal(candidate, signal)])
  );
  const confidence =
    SIGNAL_KEYS.reduce((sum, signal) => sum + (signals[signal].confidence ?? 0.6), 0) / SIGNAL_KEYS.length;

  const payload = {
    summary: "Process-local judge wrapper completed without an external multimodal backend.",
    confidence: round(confidence, 3),
    signals,
    metadata: {
      transport: "process_wrapper_heuristic",
      request_prompt_version: typeof parsed.prompt_version === "string" ? parsed.prompt_version : null,
      artifact_path_count: Array.isArray(candidate.artifact_paths) ? candidate.artifact_paths.length : 0,
      output_video_exists:
        typeof candidate.output_video_path === "string" && candidate.output_video_path.length > 0
          ? fs.existsSync(candidate.output_video_path)
          : false
    }
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
