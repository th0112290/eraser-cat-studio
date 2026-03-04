#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REQUIRED_CHECK_TARGETS = [
  {
    id: "character_strict_smoke",
    expectedLabel: "Character Strict Smoke / smoke-character-strict",
    patterns: [/^Character Strict Smoke \/ smoke-character-strict$/i, /^smoke-character-strict$/i]
  },
  {
    id: "e2e_manifest_selftest",
    expectedLabel: "E2E Manifest Selftest / manifest-selftest",
    patterns: [/^E2E Manifest Selftest \/ manifest-selftest$/i, /^manifest-selftest$/i]
  }
];

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
    "Usage: node scripts/capturePrCheckNames.mjs --repo <owner/repo> --pr <number> [--json] [--web] [--out <path>] [--save]\n" +
      "Fallback order:\n" +
      "1) args --repo/--pr\n" +
      "2) env GITHUB_REPOSITORY/PR_NUMBER\n" +
      "3) gh CLI auto-detect (gh repo view + gh pr view)\n" +
      "Auth token for GitHub API: GITHUB_TOKEN|GH_TOKEN"
  );
}

function runGh(args) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error) {
    return {
      ok: false,
      stdout: "",
      stderr: result.error.message
    };
  }
  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();
  return {
    ok: result.status === 0,
    stdout,
    stderr
  };
}

function autoDetectFromGh() {
  const repoResult = runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  const prResult = runGh(["pr", "view", "--json", "number", "--jq", ".number"]);
  const reasons = [];
  if (!repoResult.ok || !prResult.ok) {
    const combined = `${repoResult.stderr}\n${prResult.stderr}`.toLowerCase();
    if (combined.includes("not recognized") || combined.includes("enoent") || combined.includes("command not found")) {
      reasons.push("gh_not_installed");
    }
    if (combined.includes("not logged in") || combined.includes("authenticate") || combined.includes("gh auth login")) {
      reasons.push("gh_not_authenticated");
    }
    if (
      combined.includes("no pull requests") ||
      combined.includes("could not resolve to a pull request") ||
      combined.includes("not a pull request")
    ) {
      reasons.push("no_pr_for_current_branch");
    }
    if (reasons.length === 0) {
      reasons.push("gh_auto_detect_failed");
    }
  }
  return {
    repo: repoResult.ok && repoResult.stdout.length > 0 ? repoResult.stdout : null,
    pr: prResult.ok && prResult.stdout.length > 0 ? prResult.stdout : null,
    reasons
  };
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

function matchRequiredChecks(checkNames) {
  const names = Array.isArray(checkNames) ? checkNames : [];
  return REQUIRED_CHECK_TARGETS.map((target) => {
    const matchedName =
      names.find((name) => target.patterns.some((pattern) => pattern.test(name))) ?? null;
    return {
      id: target.id,
      expectedLabel: target.expectedLabel,
      matched: matchedName !== null,
      matchedName
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true" || args.h === "true") {
    usage();
    return;
  }

  let repo = String(args.repo ?? process.env.GITHUB_REPOSITORY ?? "").trim();
  let prValue = String(args.pr ?? process.env.PR_NUMBER ?? "").trim();
  const token = String(process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim();
  const printJson = args.json === "true";
  const printGuide = args.web === "true";
  const saveDefaultOut = args.save === "true";
  const outPath =
    typeof args.out === "string" && args.out.trim().length > 0
      ? path.resolve(args.out.trim())
      : saveDefaultOut
        ? path.resolve("out", "pr-checks.json")
        : null;
  const guidePath = "docs/branch-protection-character-strict.md";

  let autoDetected = null;
  if (!repo || !prValue) {
    autoDetected = autoDetectFromGh();
    if (!repo && autoDetected.repo) {
      repo = autoDetected.repo;
    }
    if (!prValue && autoDetected.pr) {
      prValue = autoDetected.pr;
    }
  }

  if (!repo || !prValue) {
    const reasonText =
      autoDetected && autoDetected.reasons.length > 0
        ? ` auto-detect hints: ${autoDetected.reasons.join(", ")}`
        : "";
    const recoveryText =
      " Recovery: `gh auth login` and run on PR branch, or run `pnpm ci:checks:capture -- --repo <owner/repo> --pr <number> --json`.";
    const guideText = printGuide ? ` Guide: ${guidePath}.` : "";
    usage();
    throw new Error(
      `Missing --repo/--pr. Provide args/env, or run on a PR branch with authenticated gh CLI.${reasonText}${recoveryText}${guideText}`
    );
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
  const payload = {
    repo,
    pr,
    headSha,
    checkNames: names,
    requiredCheckCoverage: matchRequiredChecks(names),
    checkRuns: runs.map((run) => ({
      name: run?.name ?? null,
      status: run?.status ?? null,
      conclusion: run?.conclusion ?? null,
      app: run?.app?.slug ?? null,
      detailsUrl: run?.details_url ?? null
    }))
  };

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  if (printJson) {
    console.log(JSON.stringify(payload, null, 2));
    if (outPath) {
      console.log(`\n[capture-pr-check-names] Saved: ${outPath}`);
    }
    if (printGuide) {
      console.log(`\n[capture-pr-check-names] Guide: ${guidePath}`);
    }
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
  console.log("[capture-pr-check-names] Required check coverage:");
  for (const coverage of payload.requiredCheckCoverage) {
    if (coverage.matched) {
      console.log(`- OK ${coverage.expectedLabel} -> ${coverage.matchedName}`);
    } else {
      console.log(`- MISSING ${coverage.expectedLabel}`);
    }
  }
  const missing = payload.requiredCheckCoverage.filter((coverage) => !coverage.matched);
  if (missing.length > 0) {
    console.log(
      `[capture-pr-check-names] Missing required checks: ${missing.map((item) => item.expectedLabel).join("; ")}`
    );
    console.log(
      "[capture-pr-check-names] Action: run target workflows on PR once, then re-run this command and update branch protection labels."
    );
  }
  if (outPath) {
    console.log(`[capture-pr-check-names] Saved: ${outPath}`);
  }
  if (printGuide) {
    console.log(`[capture-pr-check-names] Guide: ${guidePath}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[capture-pr-check-names] FAIL: ${message}`);
  process.exit(1);
});
