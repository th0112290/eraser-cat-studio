const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith("--target="));
const target = targetArg ? targetArg.slice("--target=".length) : "full";

process.env.SMOKE_PIPELINE_TARGET = target;

await import("./smokeE2E.mjs");
