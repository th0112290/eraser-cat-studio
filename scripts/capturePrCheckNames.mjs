#!/usr/bin/env node

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function usage() {
  console.log(
    "Usage: node scripts/capturePrCheckNames.mjs --repo <owner/repo> --pr <number> [--json]\n" +
      "Env fallback: GITHUB_REPOSITORY, PR_NUMBER, GITHUB_TOKEN|GH_TOKEN"
  );
}

async function fetchJson(url, token) {
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
  const response = await fetch(url, { headers });
  const text = await response.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message =
      (json && typeof json.message === "string" && json.message) ||
      text ||
      `HTTP ${response.status}`;
    throw new Error(`${response.status} ${url}: ${message}`);
  }
  return json;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true" || args.h === "true") {
    usage();
    return;
  }

  const repo = String(args.repo ?? process.env.GITHUB_REPOSITORY ?? "").trim();
  const prValue = String(args.pr ?? process.env.PR_NUMBER ?? "").trim();
  const token = String(process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim();
  const printJson = args.json === "true";

  if (!repo || !prValue) {
    usage();
    throw new Error("Missing --repo/--pr (or GITHUB_REPOSITORY/PR_NUMBER).");
  }
  const pr = Number.parseInt(prValue, 10);
  if (!Number.isFinite(pr) || pr <= 0) {
    throw new Error(`Invalid PR number: ${prValue}`);
  }

  const base = `https://api.github.com/repos/${encodeURIComponent(repo)}`;
  const pull = await fetchJson(`${base}/pulls/${pr}`, token);
  const headSha = String(pull?.head?.sha ?? "").trim();
  if (!headSha) {
    throw new Error(`Failed to resolve head SHA for PR #${pr}`);
  }

  const checks = await fetchJson(`${base}/commits/${headSha}/check-runs?per_page=100`, token);
  const runs = Array.isArray(checks?.check_runs) ? checks.check_runs : [];
  const names = [...new Set(runs.map((run) => String(run?.name ?? "").trim()).filter((v) => v.length > 0))].sort(
    (a, b) => a.localeCompare(b)
  );

  if (printJson) {
    console.log(
      JSON.stringify(
        {
          repo,
          pr,
          headSha,
          checkNames: names,
          checkRuns: runs.map((run) => ({
            name: run?.name ?? null,
            status: run?.status ?? null,
            conclusion: run?.conclusion ?? null,
            app: run?.app?.slug ?? null,
            detailsUrl: run?.details_url ?? null
          }))
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`[capture-pr-check-names] repo=${repo} pr=${pr} head=${headSha}`);
  if (names.length === 0) {
    console.log("[capture-pr-check-names] No check runs found.");
    return;
  }
  console.log("[capture-pr-check-names] Check names:");
  for (const name of names) {
    console.log(`- ${name}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[capture-pr-check-names] FAIL: ${message}`);
  process.exit(1);
});
