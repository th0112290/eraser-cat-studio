import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import type { EpisodeJobPayload } from "../services/scheduleService";
import {
  buildCharacterProposalApplyUiHref,
  buildCharacterRebuildSelectedUiHref,
  registerCharacterRoutes
} from "./characterRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const repoRoot = path.resolve(process.cwd(), "../..");
const smokeId = `smoke-${Date.now()}`;
const generateJobId = `proposal-${smokeId}`;
const characterPackId = `pack-${smokeId}`;
const generationRoot = path.join(repoRoot, "out", "characters", "generations", generateJobId);
const generationManifestPath = path.join(generationRoot, "generation_manifest.json");
const characterRoot = path.join(repoRoot, "assets", "generated", "characters", characterPackId);
const proposalPath = path.join(characterRoot, "pack", "proposal.json");
const anchorsOverridePath = path.join(characterRoot, "pack", "overrides", "anchors.json");
const cropBoxesOverridePath = path.join(characterRoot, "pack", "overrides", "crop-boxes.json");

fs.mkdirSync(path.dirname(generationManifestPath), { recursive: true });
fs.mkdirSync(path.dirname(proposalPath), { recursive: true });
fs.writeFileSync(
  generationManifestPath,
  JSON.stringify(
    {
      schemaVersion: "smoke",
      inputHash: "input",
      manifestHash: "manifest",
      status: "PENDING_HITL",
      episodeId: "episode-smoke",
      characterPackId,
      provider: "mock",
      workflowHash: "workflow",
      generatedAt: new Date().toISOString(),
      mode: "new",
      promptPreset: "default",
      positivePrompt: "",
      negativePrompt: "",
      guardrails: [],
      candidates: [],
      selectedByView: {}
    },
    null,
    2
  ),
  "utf8"
);
fs.writeFileSync(
  proposalPath,
  JSON.stringify(
    {
      auto_proposal: {
        anchors: {
          views: {
            front: {
              head_center: { x: 0.52, y: 0.41, status: "present" }
            }
          }
        },
        crop_boxes: {
          head: {
            front: { x: 10, y: 12, w: 24, h: 24 }
          }
        }
      }
    },
    null,
    2
  ),
  "utf8"
);

const prisma = {
  job: {
    async findUnique(input: { where: { id: string } }) {
      if (input.where.id !== generateJobId) {
        return null;
      }
      return {
        id: generateJobId,
        type: "GENERATE_CHARACTER_ASSETS",
        episode: {
          id: "episode-smoke",
          characterPackId,
          characterPackVersion: 1
        }
      };
    }
  }
} as unknown as PrismaClient;

const queue = {} as Queue<EpisodeJobPayload>;
const app = Fastify({ logger: false });
registerCharacterRoutes({
  app,
  prisma,
  queue,
  queueName: "test-queue"
});

try {
  await app.ready();

  const apiResponse = await app.inject({
    method: "POST",
    url: "/api/character-generator/proposals/apply",
    payload: {
      generateJobId,
      applyMode: "anchors"
    }
  });
  assert(apiResponse.statusCode === 201, `expected proposal apply API 201, got ${apiResponse.statusCode}`);
  const apiPayload = JSON.parse(apiResponse.body) as {
    data?: {
      applyMode?: string;
      appliedKinds?: string[];
      anchorsOverridePath?: string | null;
      cropBoxesOverridePath?: string | null;
      rebuilt?: unknown;
    };
  };
  assert(apiPayload.data?.applyMode === "anchors", "expected API proposal apply to keep anchors mode");
  assert(apiPayload.data?.appliedKinds?.join(",") === "anchors", "expected API proposal apply to materialize anchors only");
  assert(apiPayload.data?.anchorsOverridePath === anchorsOverridePath, "expected API proposal apply to return anchors override path");
  assert(apiPayload.data?.cropBoxesOverridePath === null, "expected anchors-only apply to skip crop-box override path");
  assert(apiPayload.data?.rebuilt === null, "expected no rebuild payload for apply-only API request");
  assert(fs.existsSync(anchorsOverridePath), "expected anchors override file to be written");
  assert(fs.readFileSync(anchorsOverridePath, "utf8").includes('"head_center"'), "expected anchors override text to contain proposal seed");

  const uiResponse = await app.inject({
    method: "POST",
    url: "/ui/character-generator/proposals/apply",
    payload: {
      generateJobId,
      applyMode: "cropBoxes",
      currentObject: `run:${generateJobId}`
    }
  });
  assert(uiResponse.statusCode === 302, `expected proposal apply UI redirect, got ${uiResponse.statusCode}`);
  const expectedProposalHref = buildCharacterProposalApplyUiHref({
    generateJobId,
    appliedKinds: ["cropBoxes"],
    creationNav: {
      currentObject: `run:${generateJobId}`
    }
  });
  assert(uiResponse.headers.location === expectedProposalHref, "expected proposal apply UI redirect contract to stay stable");
  assert(fs.existsSync(cropBoxesOverridePath), "expected crop-box override file to be written");

  const rebuildErrorResponse = await app.inject({
    method: "POST",
    url: "/api/character-generator/rebuild-selected",
    payload: {}
  });
  assert(rebuildErrorResponse.statusCode === 400, `expected rebuild-selected validation to return 400, got ${rebuildErrorResponse.statusCode}`);
  assert(rebuildErrorResponse.body.includes("generateJobId is required"), "expected rebuild-selected validation error message");

  const expectedRebuildHref = buildCharacterRebuildSelectedUiHref({
    rebuiltGenerateJobId: "rebuilt-job",
    creationNav: {
      currentObject: `run:${generateJobId}`
    }
  });
  assert(expectedRebuildHref.includes("focus=cg-manual-overrides"), "expected rebuild href to focus override console");
  assert(expectedRebuildHref.includes("jobId=rebuilt-job"), "expected rebuild href to target rebuilt job");

  console.log("[character-routes-practical-smoke] PASS");
} finally {
  await app.close();
  fs.rmSync(generationRoot, { recursive: true, force: true });
  fs.rmSync(characterRoot, { recursive: true, force: true });
}
