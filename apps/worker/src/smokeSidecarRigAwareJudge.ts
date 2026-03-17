import assert from "node:assert/strict";

import type { SidecarJudgeCandidateInput, SidecarSignalKey } from "./generatedSidecar";
import { SIDECAR_SIGNAL_KEYS } from "./generatedSidecar";
import { createLocalVlmJudgeProvider } from "./localVlmJudgeProvider";
import { runPremiumSidecarVisualJudge } from "./sidecarVisualJudge";

function anchorEntry(x: number, y: number, confidence: number, status: "present" | "occluded" | "missing" | "not_applicable" = "present") {
  return { x, y, confidence, status };
}

function buildAnchorManifest() {
  return {
    views: {
      front: {
        head_center: anchorEntry(0.5, 0.24, 0.84),
        mouth_center: anchorEntry(0.5, 0.38, 0.8),
        eye_near: anchorEntry(0.58, 0.2, 0.83),
        eye_far: anchorEntry(0.42, 0.2, 0.82),
        ear_near: anchorEntry(0.66, 0.08, 0.79),
        ear_far: anchorEntry(0.34, 0.08, 0.78),
        paw_anchor: anchorEntry(0.52, 0.72, 0.77),
        tail_root: anchorEntry(0.3, 0.74, 0.76)
      },
      threeQuarter: {
        head_center: anchorEntry(0.54, 0.24, 0.78),
        mouth_center: anchorEntry(0.56, 0.39, 0.75),
        eye_near: anchorEntry(0.61, 0.2, 0.76),
        eye_far: anchorEntry(0.48, 0.22, 0.71),
        ear_near: anchorEntry(0.69, 0.08, 0.74),
        ear_far: anchorEntry(0.41, 0.1, 0.68),
        paw_anchor: anchorEntry(0.55, 0.72, 0.73),
        tail_root: anchorEntry(0.36, 0.75, 0.71)
      },
      profile: {
        head_center: anchorEntry(0.57, 0.24, 0.74),
        mouth_center: anchorEntry(0.65, 0.39, 0.72),
        eye_near: anchorEntry(0.67, 0.2, 0.73),
        eye_far: { status: "not_applicable", confidence: 0.7 },
        ear_near: anchorEntry(0.71, 0.09, 0.71),
        ear_far: { status: "occluded", confidence: 0.62 },
        paw_anchor: anchorEntry(0.58, 0.72, 0.7),
        tail_root: anchorEntry(0.41, 0.75, 0.69)
      }
    }
  };
}

function buildMetadata(input: {
  requestedView?: "front" | "threeQuarter" | "profile";
  classicScores?: Partial<Record<"motion" | "subtitle" | "chart" | "identity", number>>;
  rigScores?: Partial<Record<"head_pose" | "eye_drift" | "mouth_readability" | "landmark_consistency", number>>;
}) {
  const classicScores = input.classicScores ?? {};
  const rigScores = input.rigScores ?? {};
  return {
    ...(typeof classicScores.motion === "number" ? { motion_score: classicScores.motion } : {}),
    ...(typeof classicScores.subtitle === "number" ? { subtitle_score: classicScores.subtitle } : {}),
    ...(typeof classicScores.chart === "number" ? { chart_score: classicScores.chart } : {}),
    ...(typeof classicScores.identity === "number" ? { identity_score: classicScores.identity } : {}),
    ...(typeof rigScores.head_pose === "number" ? { head_pose_score: rigScores.head_pose } : {}),
    ...(typeof rigScores.eye_drift === "number" ? { eye_drift_score: rigScores.eye_drift } : {}),
    ...(typeof rigScores.mouth_readability === "number" ? { mouth_readability_score: rigScores.mouth_readability } : {}),
    ...(typeof rigScores.landmark_consistency === "number"
      ? { landmark_consistency_score: rigScores.landmark_consistency }
      : {}),
    requested_reference_view: input.requestedView ?? "threeQuarter",
    proposal: {
      auto_proposal: {
        review_only: false,
        required_manual_slots: [],
        anchor_confidence_summary: {
          overall: 0.78,
          by_view: {
            front: 0.8,
            threeQuarter: 0.74,
            profile: 0.71
          }
        },
        anchor_review: {
          missing_anchor_ids: [],
          low_confidence_anchor_ids: []
        },
        anchors: buildAnchorManifest()
      }
    }
  };
}

function buildSignalHints(confidence = 0.82) {
  return Object.fromEntries(
    SIDECAR_SIGNAL_KEYS.map((signal) => [
      signal,
      {
        confidence,
        reasons: ["smoke_confidence_seed"]
      }
    ])
  ) as Partial<Record<SidecarSignalKey, { confidence: number; reasons: string[] }>>;
}

function buildCandidate(
  candidateId: string,
  metadata: Record<string, unknown>,
  overrides: Partial<SidecarJudgeCandidateInput> = {}
): SidecarJudgeCandidateInput {
  return {
    shotId: "smoke:rig-aware-judge",
    candidateId,
    expectedDurationSeconds: 2,
    outputDurationSeconds: 2,
    outputVideoPath: `C:/tmp/${candidateId}.mp4`,
    referenceImagePath: "C:/tmp/reference.png",
    narration: "Mascot talks through a simple explainer beat.",
    subtitleText: "Mascot explains the next beat.",
    subtitlesExpected: true,
    chartExpected: false,
    signalHints: buildSignalHints(),
    metadata,
    ...overrides
  };
}

async function main() {
  const provider = createLocalVlmJudgeProvider({
    mode: "smoke_transport",
    transport: async () => {
      throw new Error("offline");
    }
  });

  const manifestCandidate = buildCandidate(
    "manifest-derived",
    buildMetadata({
      classicScores: {
        motion: 82,
        subtitle: 79,
        chart: 76,
        identity: 83
      }
    })
  );
  const manifestResult = await provider.evaluateCandidate(manifestCandidate);
  assert.match(manifestResult.summary, /fallback/i);
  assert.equal(manifestResult.metadata.transport_error, "offline");

  for (const signal of ["head_pose", "eye_drift", "mouth_readability", "landmark_consistency"] as const) {
    const evidence = manifestResult.signals[signal].evidence as {
      candidate_id?: string;
      source?: string;
      anchor_confidence_summary?: { overall?: number };
    };
    assert.equal(evidence.candidate_id, manifestCandidate.candidateId, `${signal} should record candidate_id`);
    assert.equal(evidence.source, "manifest", `${signal} should come from manifest fallback`);
    assert.equal(evidence.anchor_confidence_summary?.overall, 0.78, `${signal} should keep anchor confidence summary`);
  }

  const artifact = await runPremiumSidecarVisualJudge({
    shotId: "smoke:rig-aware-judge",
    channelDomain: "default",
    provider,
    candidates: [
      buildCandidate(
        "candidate-a",
        buildMetadata({
          classicScores: {
            motion: 85,
            subtitle: 82,
            chart: 80,
            identity: 84
          },
          rigScores: {
            head_pose: 62,
            eye_drift: 70,
            mouth_readability: 72,
            landmark_consistency: 70
          }
        })
      ),
      buildCandidate(
        "candidate-b",
        buildMetadata({
          classicScores: {
            motion: 80,
            subtitle: 78,
            chart: 76,
            identity: 79
          },
          rigScores: {
            head_pose: 69,
            eye_drift: 68,
            mouth_readability: 68,
            landmark_consistency: 68
          }
        })
      ),
      buildCandidate(
        "candidate-c",
        buildMetadata({
          classicScores: {
            motion: 88,
            subtitle: 86,
            chart: 84,
            identity: 87
          },
          rigScores: {
            head_pose: 77,
            eye_drift: 78,
            mouth_readability: 80,
            landmark_consistency: 79
          }
        })
      )
    ]
  });

  assert.equal(artifact.policy.escalated_to_best_of_3, true, "head_pose near-threshold should trigger best-of-3");
  assert.equal(artifact.policy.escalation_reason, "head_pose_near_threshold");
  assert.equal(artifact.selected_candidate_id, "candidate-c");

  const bestOf2Run = artifact.runs[0]!;
  assert.equal(bestOf2Run.stage, "best_of_2");
  assert.ok(
    bestOf2Run.issues.some(
      (issue) => issue.code === "adaptive_best_of_3_triggered" && issue.details?.reason === "head_pose_near_threshold"
    ),
    "best_of_2 issues should record head_pose-driven escalation"
  );

  const finalRun = artifact.runs[artifact.runs.length - 1]!;
  const selectedScorecard = finalRun.scorecards.find((entry) => entry.candidate_id === "candidate-c");
  assert.ok(selectedScorecard, "final run should include the selected candidate scorecard");
  assert.equal(selectedScorecard?.scorecard.signals.head_pose.evidence.candidate_id, "candidate-c");
  assert.equal(
    (selectedScorecard?.scorecard.signals.head_pose.evidence.anchor_confidence_summary as { overall?: number } | undefined)
      ?.overall,
    0.78
  );

  console.log(
    JSON.stringify(
      {
        provider_summary: manifestResult.summary,
        escalation_reason: artifact.policy.escalation_reason,
        selected_candidate_id: artifact.selected_candidate_id
      },
      null,
      2
    )
  );
}

void main();
