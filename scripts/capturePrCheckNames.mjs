#!/usr/bin/env node

import { spawnSync } from "node:child_process";

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
    usage();
    throw new Error(
      `Missing --repo/--pr. Provide args/env, or run on a PR branch with authenticated gh CLI.${reasonText}`
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
