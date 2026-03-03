import { createDefaultNotifier, estimateJobCost } from "./index";

async function main() {
  const notifier = createDefaultNotifier({
    includeConsole: true,
    emailTo: "ops@example.com"
  });

  const estimate = estimateJobCost({
    estimatedRenderSeconds: 180,
    estimatedAudioSeconds: 120,
    estimatedApiCalls: 6
  });

  await notifier.notify({
    source: "ops:smoke",
    title: "Ops smoke alert",
    level: "warn",
    body: "This is a notifier smoke test.",
    metadata: estimate
  });

  console.log(`ops:estimated_cost_usd ${estimate.estimatedCostUsd.toFixed(4)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
