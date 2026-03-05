const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

const pages = [
  "/ui",
  "/ui/assets",
  "/ui/studio",
  "/ui/character-generator",
  "/ui/episodes",
  "/ui/jobs",
  "/ui/hitl",
  "/ui/publish",
  "/ui/health",
  "/ui/artifacts"
];

const requiredPageHeadings = new Map([
  ["/ui", ["대시보드", "Dashboard"]],
  ["/ui/assets", ["에셋", "Assets"]],
  ["/ui/studio", ["통합 스튜디오", "Studio"]],
  ["/ui/character-generator", ["캐릭터 생성기", "Character Generator"]],
  ["/ui/episodes", ["에피소드", "Episodes"]],
  ["/ui/jobs", ["작업", "Jobs"]],
  ["/ui/hitl", ["검수", "HITL"]],
  ["/ui/publish", ["퍼블리시", "Publish"]],
  ["/ui/health", ["헬스", "Health"]],
  ["/ui/artifacts", ["아티팩트", "Artifacts"]]
]);

const requiredPageKeywords = new Map([
  ["/ui/assets", ["선택한 에셋", "최근 에셋"]],
  ["/ui/studio", ["빠른 시작 가이드", "원클릭 시작"]],
  ["/ui/jobs", ["최근 100개 작업", "Latest 100 jobs"]],
  ["/ui/hitl", ["검수 재렌더", "HITL Rerender"]],
  ["/ui/publish", ["episodeId", "퍼블리시 실행"]],
  ["/ui/health", ["서비스 상태", "Service Status"]],
  ["/ui/artifacts", ["out/ 인덱스", "out/ index"]]
]);

const requiredNavLabels = [
  "대시보드",
  "통합 스튜디오",
  "작업",
  "에셋",
  "캐릭터",
  "캐릭터 생성기",
  "검수(HITL)",
  "에피소드",
  "퍼블리시",
  "헬스",
  "아티팩트"
];

const mojibakeTokens = [
  "?먯",
  "?듯",
  "罹먮",
  "寃쎄",
  "泥섎",
  "鍮좊",
  "踰꾪",
  "?꾨",
  "?묒",
  "?쒕",
  "?깃",
  "?ㅻ",
  "�"
];

async function checkPage(path) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      "x-request-id": "smoke-ui-visual"
    }
  });

  if (res.status !== 200) {
    throw new Error(`${path} expected 200 but got ${res.status}`);
  }

  const html = await res.text();

  for (const label of requiredNavLabels) {
    if (!html.includes(label)) {
      throw new Error(`${path} missing nav label: ${label}`);
    }
  }

  const headingCandidates = requiredPageHeadings.get(path);
  if (headingCandidates) {
    const matched = headingCandidates.some((heading) => html.includes(heading));
    if (!matched) {
      throw new Error(`${path} missing page heading: ${headingCandidates.join(" | ")}`);
    }
  }

  const keywordCandidates = requiredPageKeywords.get(path);
  if (keywordCandidates) {
    const matched = keywordCandidates.some((keyword) => html.includes(keyword));
    if (!matched) {
      throw new Error(`${path} missing expected keyword: ${keywordCandidates.join(" | ")}`);
    }
  }

  for (const token of mojibakeTokens) {
    if (html.includes(token)) {
      throw new Error(`${path} contains mojibake token: ${token}`);
    }
  }

  const reqId = res.headers.get("x-request-id");
  if (!reqId || reqId !== "smoke-ui-visual") {
    throw new Error(`${path} x-request-id mismatch: ${reqId ?? "none"}`);
  }

  console.log(`[smoke:ui:visual] ${path} ok`);
}

async function main() {
  for (const path of pages) {
    await checkPage(path);
  }
  console.log("[smoke:ui:visual] PASS");
}

main().catch((error) => {
  console.error("[smoke:ui:visual] FAIL", error);
  process.exit(1);
});
