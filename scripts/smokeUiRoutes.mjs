const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

async function check(path, expectedStatus, expectedText) {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  const okStatus = res.status === expectedStatus;
  const okText = expectedText ? text.includes(expectedText) : true;
  console.log(
    `[smoke:ui] ${path} status=${res.status} expected=${expectedStatus} text=${okText ? "ok" : "missing"}`
  );
  if (!okStatus || !okText) {
    throw new Error(`Smoke failed for ${path}: status=${res.status}, expected=${expectedStatus}`);
  }
}

async function main() {
  const mode = process.env.SMOKE_DB_MODE ?? "down";
  if (mode === "down") {
    await check("/ui/assets", 503, "database_unavailable");
    await check("/ui/studio", 503, "database_unavailable");
    await check("/ui/character-generator", 503, "database_unavailable");
  } else {
    await check("/ui/assets", 200, "에셋");
    await check("/ui/studio", 200, "통합 스튜디오");
    await check("/ui/character-generator", 200, "캐릭터 생성기");
  }
  console.log("[smoke:ui] PASS");
}

main().catch((error) => {
  console.error("[smoke:ui] FAIL", error);
  process.exit(1);
});
