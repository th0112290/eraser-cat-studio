process.env.SMOKE_PIPELINE_TARGET = process.env.SMOKE_PIPELINE_TARGET ?? "full";
process.env.SMOKE_ACTION_OVERRIDES = "1";

await import("./smokeE2E.mjs");
