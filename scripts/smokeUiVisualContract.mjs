const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

const pages = [
  "/ui",
  "/ui/assets",
  "/ui/studio",
  "/ui/character-generator",
  "/ui/characters",
  "/ui/episodes",
  "/ui/jobs",
  "/ui/hitl",
  "/ui/publish",
  "/ui/health",
  "/ui/rollouts",
  "/ui/benchmarks",
  "/ui/profiles",
  "/ui/artifacts"
];

const requiredPageHeadings = new Map([
  ["/ui", ["Dashboard", "대시보드"]],
  ["/ui/assets", ["Assets", "에셋 (상세 모드)"]],
  ["/ui/studio", ["Studio", "통합 스튜디오"]],
  ["/ui/character-generator", ["Character Generator", "캐릭터 생성기 (상세 모드)"]],
  ["/ui/characters", ["Character Pack", "캐릭터 팩 (상세 모드)"]],
  ["/ui/episodes", ["Episodes"]],
  ["/ui/jobs", ["Jobs"]],
  ["/ui/hitl", ["HITL"]],
  ["/ui/publish", ["Publish"]],
  ["/ui/health", ["Health", "Health Report"]],
  ["/ui/rollouts", ["Rollouts"]],
  ["/ui/benchmarks", ["Benchmarks"]],
  ["/ui/profiles", ["Profile Browser"]],
  ["/ui/artifacts", ["Artifacts"]]
]);

const requiredPageKeywords = new Map([
  ["/ui/assets", ["Selected Asset", "Recent Assets", "선택된 에셋", "최근 에셋"]],
  ["/ui/studio", ["Quick Start Guide", "Start One-click", "최근 에셋", "최근 에피소드"]],
  ["/ui/character-generator", ["Generation Mode", "Style/Prompt", "Run Character Candidate Generation", "생성 모드", "생성 실행"]],
  ["/ui/characters", ["pack.json", "preview.mp4", "선택된 팩", "최근 캐릭터 팩"]],
  ["/ui/episodes", ["Recent Episodes", "Create episode + enqueue", "Quick Run", "targetDurationSec", "Latest Episodes"]],
  ["/ui/jobs", ["Latest 100 jobs", "Jobs", "최근 작업"]],
  ["/ui/hitl", ["HITL Rerender", "Failed Jobs"]],
  ["/ui/publish", ["episodeId", "Run publish"]],
  ["/ui/health", ["Service Status"]],
  ["/ui/rollouts", ["Rollout Signals", "Artifact Sources", "Detail"]],
  ["/ui/benchmarks", ["Backend Benchmark Matrix", "Episode Regression Reports", "Render Modes"]],
  ["/ui/profiles", ["Active Channel Bibles", "Runtime Profile Bundles", "Profile Runtime Evidence"]],
  ["/ui/artifacts", ["out/ index"]]
]);

const requiredNavLabelCandidates = [
  ["Dashboard", "대시보드"],
  ["Studio", "스튜디오", "통합 스튜디오"],
  ["Jobs", "작업"],
  ["Assets", "에셋"],
  ["Characters", "캐릭터"],
  ["Character Generator", "캐릭터 생성기"],
  ["HITL", "검수(HITL)"],
  ["Episodes", "에피소드"],
  ["Publish", "발행", "퍼블리시"],
  ["Health", "상태", "헬스", "헬스 리포트"],
  ["Rollouts", "롤아웃"],
  ["Benchmarks", "벤치마크"],
  ["Profiles", "프로필"],
  ["Artifacts", "산출물", "아티팩트"]
];

const requiredNavHrefList = [
  "/ui",
  "/ui/studio",
  "/ui/jobs",
  "/ui/assets",
  "/ui/characters",
  "/ui/character-generator",
  "/ui/hitl",
  "/ui/episodes",
  "/ui/publish",
  "/ui/health",
  "/ui/rollouts",
  "/ui/benchmarks",
  "/ui/profiles",
  "/ui/artifacts"
];

const requiredTableFilterByPage = new Map([
  ["/ui/assets", ["data-table-filter", "asset-filter"]],
  ["/ui/episodes", ['data-table-filter="episodes-table"']],
  ["/ui/jobs", ['data-table-filter="jobs-table"']],
  ["/ui/hitl", ['data-table-filter="hitl-failed-table"']],
  ["/ui/rollouts", ['data-table-filter="rollouts-table"']],
  ["/ui/benchmarks", ['data-table-filter="benchmark-backend-table"', 'data-table-filter="benchmark-regression-table"']],
  ["/ui/profiles", ['data-table-filter="profiles-evidence-table"', 'data-table-filter="profiles-bible-table"']],
  ["/ui/artifacts", ['data-table-filter="artifact-index-table"']]
]);

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

  for (const labels of requiredNavLabelCandidates) {
    const matched = labels.some((label) => html.includes(label));
    if (!matched) {
      throw new Error(`${path} missing nav label set: ${labels.join(" | ")}`);
    }
  }

  for (const href of requiredNavHrefList) {
    if (!html.includes(`href="${href}"`)) {
      throw new Error(`${path} missing nav href: ${href}`);
    }
  }

  if (path.startsWith("/ui/episodes/") && !requiredPageHeadings.has(path)) {
    const dynamicHeadings = ["Episode Detail"];
    const matched = dynamicHeadings.some((heading) => html.includes(heading));
    if (!matched) {
      throw new Error(`${path} missing page heading: ${dynamicHeadings.join(" | ")}`);
    }
  }
  if (path.startsWith("/ui/jobs/") && !requiredPageHeadings.has(path)) {
    const dynamicHeadings = ["Job Detail"];
    const matched = dynamicHeadings.some((heading) => html.includes(heading));
    if (!matched) {
      throw new Error(`${path} missing page heading: ${dynamicHeadings.join(" | ")}`);
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

  const tableFilterCandidates = requiredTableFilterByPage.get(path);
  if (tableFilterCandidates) {
    const matched = tableFilterCandidates.some((token) => html.includes(token));
    if (!matched) {
      throw new Error(`${path} missing table filter token: ${tableFilterCandidates.join(" | ")}`);
    }
  }
  if (path.startsWith("/ui/episodes/") && !requiredPageKeywords.has(path)) {
    const dynamicKeywords = ["Run Profile", "Preview Player", "QC Report"];
    const matched = dynamicKeywords.some((keyword) => html.includes(keyword));
    if (!matched) {
      throw new Error(`${path} missing expected keyword: ${dynamicKeywords.join(" | ")}`);
    }
    const opsKeywords = ["Profile & Route Inspector", "Acceptance / QC Reasons", "Per-shot Ops Signals"];
    const opsMatched = opsKeywords.some((keyword) => html.includes(keyword));
    if (!opsMatched) {
      throw new Error(`${path} missing ops keyword: ${opsKeywords.join(" | ")}`);
    }
  }
  if (path.startsWith("/ui/jobs/") && !requiredPageKeywords.has(path)) {
    const dynamicKeywords = ["Job Detail", "Job Logs", "Retry"];
    const matched = dynamicKeywords.some((keyword) => html.includes(keyword));
    if (!matched) {
      throw new Error(`${path} missing expected keyword: ${dynamicKeywords.join(" | ")}`);
    }
  }

  const shouldCheckMojibake = pages.includes(path);
  if (shouldCheckMojibake) {
    for (const token of mojibakeTokens) {
      if (html.includes(token)) {
        throw new Error(`${path} contains mojibake token: ${token}`);
      }
    }
  }

  const reqId = res.headers.get("x-request-id");
  if (!reqId || reqId !== "smoke-ui-visual") {
    throw new Error(`${path} x-request-id mismatch: ${reqId ?? "none"}`);
  }

  console.log(`[smoke:ui:visual] ${path} ok`);
}

function findFirstMatch(html, regex) {
  const match = html.match(regex);
  return match ? match[1] : null;
}

async function checkDetailPages() {
  const charactersRes = await fetch(`${baseUrl}/ui/characters`, {
    headers: {
      "x-request-id": "smoke-ui-visual"
    }
  });
  if (charactersRes.ok) {
    const html = await charactersRes.text();
    if (html.includes("Selected Pack")) {
      const required = ["Generated Pack Lineage", "View Lineage", "Repair Tasks"];
      const matched = required.some((keyword) => html.includes(keyword));
      if (!matched) {
        throw new Error(`/ui/characters missing expected lineage keyword: ${required.join(" | ")}`);
      }
    }
  }

  const episodesRes = await fetch(`${baseUrl}/ui/episodes`, {
    headers: {
      "x-request-id": "smoke-ui-visual"
    }
  });
  if (episodesRes.ok) {
    const html = await episodesRes.text();
    const episodeId = findFirstMatch(html, /href="\/ui\/episodes\/([^"]+)"/);
    if (episodeId) {
      await checkPage(`/ui/episodes/${episodeId}`);
    }
  }

  const jobsRes = await fetch(`${baseUrl}/ui/jobs`, {
    headers: {
      "x-request-id": "smoke-ui-visual"
    }
  });
  if (jobsRes.ok) {
    const html = await jobsRes.text();
    const jobId = findFirstMatch(html, /href="\/ui\/jobs\/([^"]+)"/);
    if (jobId) {
      await checkPage(`/ui/jobs/${jobId}`);
    }
  }

  const benchmarksRes = await fetch(`${baseUrl}/ui/benchmarks`, {
    headers: {
      "x-request-id": "smoke-ui-visual"
    }
  });
  if (benchmarksRes.ok) {
    const html = await benchmarksRes.text();
    const match = html.match(/href="(\/ui\/benchmarks\/candidates\?path=[^"]+)"/);
    if (match?.[1]) {
      const candidatePath = match[1]
        .replaceAll("&amp;", "&")
        .replaceAll("&#39;", "'")
        .replaceAll("&quot;", "\"");
      const res = await fetch(`${baseUrl}${candidatePath}`, {
        headers: {
          "x-request-id": "smoke-ui-visual"
        }
      });
      if (!res.ok) {
        throw new Error(`/ui/benchmarks candidate compare expected 200 but got ${res.status}`);
      }
      const candidateHtml = await res.text();
      const required = ["Sidecar Candidate Compare", "Candidate Score Matrix", "Request Context"];
      const matched = required.some((keyword) => candidateHtml.includes(keyword));
      if (!matched) {
        throw new Error(`/ui/benchmarks candidate compare missing expected keyword: ${required.join(" | ")}`);
      }
    }
  }
}

async function main() {
  for (const path of pages) {
    await checkPage(path);
  }
  await checkDetailPages();
  console.log("[smoke:ui:visual] PASS");
}

main().catch((error) => {
  console.error("[smoke:ui:visual] FAIL", error);
  process.exit(1);
});
