import assert from "node:assert/strict";
import { resolveManifestReadPath } from "./characterGeneration";

const jobDbId = "job-123";

assert.equal(
  resolveManifestReadPath(jobDbId, {
    manifestPath: "C:/tmp/new-manifest.json",
    sourceManifestPath: "C:/tmp/source-manifest.json"
  }),
  "C:\\tmp\\source-manifest.json"
);

assert.equal(
  resolveManifestReadPath(jobDbId, {
    manifestPath: "C:/tmp/new-manifest.json"
  }),
  "C:\\tmp\\new-manifest.json"
);

assert.ok(
  resolveManifestReadPath(jobDbId, {}).endsWith("\\out\\characters\\generations\\job-123\\generation_manifest.json")
);

console.log("[characterGenerationSourceManifestPath.smoke] PASS");
process.exit(0);
