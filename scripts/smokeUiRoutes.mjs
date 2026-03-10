const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

function expectedMarker(path) {
  if (path === "/ui/assets") return "asset-upload-form";
  if (path === "/ui/studio") return "Studio";
  if (path === "/ui/character-generator") return "character-generator";
  if (path === "/ui/rollouts") return "Rollouts";
  if (path === "/ui/benchmarks") return "Benchmarks";
  if (path === "/ui/profiles") return "Profile Browser";
  return "";
}

async function check(path, expectedStatus, expectedText) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      "x-request-id": "smoke-ui-routes"
    }
  });
  const text = await res.text();
  const okStatus = res.status === expectedStatus;
  const okText = expectedText ? text.includes(expectedText) : true;
  const requestIdHeader = res.headers.get("x-request-id");

  console.log(
    `[smoke:ui] ${path} status=${res.status} expected=${expectedStatus} text=${okText ? "ok" : "missing"} requestId=${requestIdHeader ?? "none"}`
  );

  if (!okStatus || !okText) {
    throw new Error(`Smoke failed for ${path}: status=${res.status}, expected=${expectedStatus}`);
  }

  if (requestIdHeader && requestIdHeader.length > 0 && requestIdHeader !== "smoke-ui-routes") {
    throw new Error(`Unexpected x-request-id for ${path}: ${requestIdHeader}`);
  }
}

async function main() {
  const mode = (process.env.SMOKE_DB_MODE ?? "down").toLowerCase();
  await check("/ui/rollouts", 200, expectedMarker("/ui/rollouts"));
  await check("/ui/benchmarks", 200, expectedMarker("/ui/benchmarks"));
  await check("/ui/profiles", 200, expectedMarker("/ui/profiles"));

  if (mode === "down") {
    await check("/ui/assets", 503, "database_unavailable");
    await check("/ui/studio", 503, "database_unavailable");
    await check("/ui/character-generator", 503, "database_unavailable");
    await check("/ui/assets", 503, "data-error-code=\"database_unavailable\"");
  } else {
    await check("/ui/assets", 200, expectedMarker("/ui/assets"));
    await check("/ui/studio", 200, expectedMarker("/ui/studio"));
    await check("/ui/character-generator", 200, expectedMarker("/ui/character-generator"));
  }

  console.log("[smoke:ui] PASS");
}

main().catch((error) => {
  console.error("[smoke:ui] FAIL", error);
  process.exit(1);
});
