import { renderTableEmptyRow, UI_TEXT } from "./uiText";

type JobsPageBodyInput = {
  flash: string;
  rows: string;
};

type PublishPageBodyInput = {
  flash: string;
  episodeId: string;
};

type JobDetailPageBodyInput = {
  flash: string;
  jobId: string;
  episodeId: string;
  type: string;
  statusBadge: string;
  progress: string;
  attempts: string;
  errorStack: string;
  retryAction: string;
  logRows: string;
};

type HitlPageBodyInput = {
  flash: string;
  episodeIdValue: string;
  failedShotIdsValue: string;
  rows: string;
};

type ArtifactsPageBodyInput = {
  flash: string;
  episodeId: string;
  episodeLinks: string;
  rows: string;
};

type RolloutsPageBodyInput = {
  flash: string;
  summaryCards: string;
  sourceRows: string;
  rows: string;
};

type BenchmarksPageBodyInput = {
  flash: string;
  summaryCards: string;
  sourceRows: string;
  backendRows: string;
  regressionRows: string;
};

const OPERATOR_PATTERN_STYLE = `<style>
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c5c58}
.ops-shell{display:grid;gap:12px}
.ops-titlebar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-titleblock{display:grid;gap:6px;max-width:760px}
.ops-titleblock h1,.ops-titleblock h2{margin-bottom:0}
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.ops-kpi,.ops-lane,.ops-resource-card,.ops-inline-card{display:grid;gap:8px;padding:12px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fff,#f7fbfc);border-radius:14px}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:18px;font-weight:800}
.ops-callout{display:grid;gap:6px;padding:12px;border-radius:14px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fbfefd,#f2f8f9)}
.ops-callout h3,.ops-lane h3,.ops-resource-card h3{margin:0;font-size:15px}
.ops-callout p,.ops-lane p,.ops-resource-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-callout.warn{border-color:#edd2ac;background:linear-gradient(180deg,#fffaf1,#fff3df)}
.ops-callout.bad{border-color:#efc5c8;background:linear-gradient(180deg,#fff7f7,#fff1f2)}
.ops-callout.ok{border-color:#bcdccf;background:linear-gradient(180deg,#f5fcf7,#edf8f0)}
.ops-actions-list,.ops-mini-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}
.ops-actions-list li,.ops-mini-list li{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:8px 0;border-top:1px solid #e1eaef}
.ops-actions-list li:first-child,.ops-mini-list li:first-child{border-top:none;padding-top:0}
.ops-actions-list li span:first-child,.ops-mini-list li span:first-child{font-weight:700;color:#1f3340}
.ops-table-shell{display:grid;gap:10px}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.ops-summary-line{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 10px;border:1px solid #d9e4e8;background:#fff;border-radius:10px}
.search-cluster{display:grid;gap:6px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}
.search-cluster input{width:100%}
.search-cluster .muted-text{line-height:1.4}
.ops-resource-list ul{margin:0;padding-left:18px;display:grid;gap:8px}
.ops-resource-list li{line-height:1.5}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{text-decoration:none}
.ops-detail-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
@media (max-width:720px){.ops-titleblock{max-width:none}.ops-actions-list li,.ops-mini-list li,.ops-summary-line{display:grid;justify-content:stretch}}
</style>`;

function renderOpsStyle(): string {
  return OPERATOR_PATTERN_STYLE;
}

function renderMetricCard(label: string, value: string, hint: string): string {
  return `<div class="ops-kpi"><span class="ops-kpi-label">${label}</span><div class="ops-kpi-value">${value}</div><div class="caption">${hint}</div></div>`;
}

function renderSearchCluster(input: {
  id: string;
  targetId: string;
  label: string;
  placeholder: string;
  hint: string;
}): string {
  return `<div class="search-cluster"><label for="${input.id}">${input.label}</label><input id="${input.id}" name="q" type="search" data-table-filter="${input.targetId}" placeholder="${input.placeholder}" autocomplete="off"/><span class="muted-text">${input.hint}</span></div>`;
}

export function buildJobsPageBody(input: JobsPageBodyInput): string {
  const t = UI_TEXT.jobs;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">Operator Queue</span>
      <h1>${t.title}</h1>
      <p class="section-intro">Scan newest jobs first, inspect failures quickly, and move from job to episode, artifacts, or publish without a presentation-heavy detour.</p>
    </div>
    <div class="quick-links"><a href="/ui">Dashboard</a><a href="/ui/hitl">HITL</a><a href="/ui/publish">Publish</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("Scope", "<strong>Latest 100 jobs</strong>", "Newest first so retries and fresh failures stay near the top.")}
    ${renderMetricCard("Primary move", "<strong>Inspect the job</strong>", "Open the job row when you need retry, logs, and detailed failure context.")}
    ${renderMetricCard("Object handoff", "<strong>Open the episode</strong>", "Use the linked episode to continue render, artifact, or publish follow-through.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Filters + Recovery Paths</h2>
      <p class="section-intro">Keep search, row rhythm, and recovery visible before the table so operators can scan and act in one pass.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    ${renderSearchCluster({
      id: "jobs-filter",
      targetId: "jobs-table",
      label: "Filter jobs",
      placeholder: t.filterPlaceholder,
      hint: "Search by job id, episode link text, type, or status. Press / to focus."
    })}
    <div class="form-card">
      <h3>Row Action Rhythm</h3>
      <ul class="ops-actions-list">
        <li><span>Inspect job</span><span class="muted-text">Use the job id link for logs, retry, and lastError context.</span></li>
        <li><span>Open episode</span><span class="muted-text">Use the episode link to continue with render, artifacts, or publish.</span></li>
        <li><span>Triage failed shots</span><span class="muted-text">Move into HITL when a failed job needs rerender with operator input.</span></li>
      </ul>
    </div>
    <div class="form-card">
      <h3>Recovery Visible</h3>
      <ul class="ops-actions-list">
        <li><span>Queue looks stuck</span><span class="muted-text">Check Health before retrying multiple jobs.</span></li>
        <li><span>Artifact missing</span><span class="muted-text">Open the related episode, then inspect Artifacts for the object.</span></li>
        <li><span>Publish blocked</span><span class="muted-text">Verify latest job state and object outputs before opening Publish.</span></li>
      </ul>
      <div class="quick-links"><a href="/ui/health">Health</a><a href="/ui/artifacts">Artifacts</a><a href="/ui/episodes">Episodes</a></div>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>Job Queue</h2>
      <p class="section-intro">The table is the product here. Links in the first two columns are the main inspect and follow-up actions.</p>
    </div>
    <span class="badge muted">${t.latestBadge}</span>
  </div>
  <div class="table-wrap"><table id="jobs-table"><thead><tr><th>Job / Inspect</th><th>Episode / Continue</th><th>Type</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noJobs)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>Failed Jobs</h3>
      <p>Open the job first for logs and retry. Use HITL when the failure needs rerender with specific failed shot ids.</p>
      <div class="quick-links"><a href="/ui/hitl">Open HITL</a></div>
    </div>
    <div class="ops-callout ok">
      <h3>Ready To Ship</h3>
      <p>If the latest object is complete and artifacts exist, continue into Publish without leaving the operator loop.</p>
      <div class="quick-links"><a href="/ui/publish">Open Publish</a><a href="/ui/artifacts">Artifacts</a></div>
    </div>
    <div class="ops-callout">
      <h3>Keyboard Path</h3>
      <p>Use <span class="kbd">/</span> for search, open the row you need, and keep retries or downstream handoffs object-centered.</p>
    </div>
  </div>
</section>`;
}

export function buildPublishPageBody(input: PublishPageBodyInput): string {
  const t = UI_TEXT.publish;
  const episodeId = input.episodeId.trim();
  const hasEpisodeId = episodeId.length > 0;
  const episodeHref = hasEpisodeId ? `/ui/episodes/${encodeURIComponent(episodeId)}` : "/ui/episodes";
  const artifactsHref = hasEpisodeId ? `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}` : "/ui/artifacts";
  const folderHref = hasEpisodeId ? `/artifacts/${encodeURIComponent(episodeId)}/` : "/artifacts/";
  const episodeLabel = hasEpisodeId ? `<strong class="mono">${episodeId}</strong>` : "<strong>Enter an episode id</strong>";

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">Ship Handoff</span>
      <h1>${t.title}</h1>
      <p class="section-intro">Confirm object context first, then submit publish. The preflight checklist stays ahead of the form so the handoff is readable and deliberate.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">Jobs</a><a href="/ui/episodes">Episodes</a><a href="/ui/artifacts">Artifacts</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("Current object", episodeLabel, "Use the same episode id from episode detail, job detail, or artifacts quick links.")}
    ${renderMetricCard("Recommended state", "<strong>COMPLETED / PREVIEW_READY</strong>", t.statusHint)}
    ${renderMetricCard("Primary check", "<strong>Artifacts before submit</strong>", "Verify the episode outputs and latest jobs before requesting publish.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Preflight Context</h2>
      <p class="section-intro">These are the checks to complete before the submit button matters.</p>
    </div>
  </div>
  <div class="ops-note-grid">
    <div class="ops-callout ${hasEpisodeId ? "ok" : "warn"}">
      <h3>Episode Reference</h3>
      <p>${hasEpisodeId ? `Working episode: ${episodeLabel}. Open the object detail if you need to verify status, latest job, or downstream links.` : "Start from an episode id so publish stays tied to one clear object."}</p>
      <div class="quick-links"><a href="${episodeHref}">${hasEpisodeId ? "Open Episode Detail" : "Open Episodes"}</a></div>
    </div>
    <div class="ops-callout ${hasEpisodeId ? "ok" : ""}">
      <h3>Artifacts Check</h3>
      <p>Confirm preview/final outputs, qc report, and upload manifest before publish. This keeps the handoff grounded in actual object outputs.</p>
      <div class="quick-links"><a href="${artifactsHref}">Artifacts Quick Links</a><a href="${folderHref}">Raw Artifact Folder</a></div>
    </div>
    <div class="ops-callout">
      <h3>Failure Recovery</h3>
      <p>If publish fails, walk backward: latest job detail, episode status, artifact presence, then service health.</p>
      <div class="quick-links"><a href="/ui/jobs">Jobs</a><a href="/ui/health">Health</a></div>
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Publish Request</h2>
      <p class="section-intro">Once preflight is clear, this form becomes the final handoff step.</p>
    </div>
  </div>
  <form method="post" action="/ui/publish" class="form-card">
    <div class="field">
      <label for="publish-episode-id">episodeId <span class="hint" data-tooltip="${t.episodeHelp}">?</span></label>
      <input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/>
      <small>Copy this from episode detail, job detail, or the artifacts quick-link flow.</small>
    </div>
    <div class="actions"><button type="submit" data-primary-action="1">${t.runAction}</button></div>
  </form>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>Not Ready Yet</h3>
      <p>If status or artifacts are still moving, stop here and finish the object in Episodes or Jobs first.</p>
    </div>
    <div class="ops-callout ok">
      <h3>Ready To Submit</h3>
      <p>When object status, outputs, and latest jobs all line up, publish becomes a clean final step instead of another debugging surface.</p>
    </div>
  </div>
</section>`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">Job Object</span>
      <h1>Job Detail</h1>
      <p class="section-intro">Inspect one job, keep retry visible, and move directly into the related episode, artifacts, or publish path.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">Back to Jobs</a><a href="/ui/episodes/${input.episodeId}">Episode</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(input.episodeId)}">Artifacts</a></div>
  </div>
  ${input.flash}
  <div class="ops-detail-grid">
    ${renderMetricCard("Job", `<strong class="mono">${input.jobId}</strong>`, "Primary inspect object for logs, retry, and failure details.")}
    ${renderMetricCard("Episode", `<a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a>`, "Continue downstream from the related episode when you need broader context.")}
    ${renderMetricCard("Type", `<strong>${input.type}</strong>`, "Use this to understand which part of the pipeline needs recovery.")}
    ${renderMetricCard("Status", input.statusBadge, "Status should tell you whether to inspect, retry, or hand off.")}
    ${renderMetricCard("Progress", `<strong>${input.progress}%</strong>`, "Quick scan value before opening logs.")}
    ${renderMetricCard("Attempts", `<strong>${input.attempts}</strong>`, "Shows retry pressure and backoff settings for this object.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Next Actions</h2>
      <p class="section-intro">Keep recovery and downstream follow-up side by side so the operator does not have to reconstruct the flow.</p>
    </div>
  </div>
  <div class="ops-note-grid">
    <div class="ops-lane">
      <h3>Retry / Inspect</h3>
      <p>Retry is anchored here because this page already has the logs and failure state for the job object.</p>
      <div class="actions">${input.retryAction}</div>
    </div>
    <div class="ops-lane">
      <h3>Related Objects</h3>
      <p>Move out of the job only when you need the episode-wide, artifact-wide, or publish-wide view.</p>
      <div class="quick-links"><a href="/ui/episodes/${input.episodeId}">Episode Detail</a><a href="/artifacts/${input.episodeId}/">Artifact Folder</a><a href="/ui/publish?episodeId=${encodeURIComponent(input.episodeId)}">Publish Handoff</a></div>
    </div>
    <div class="ops-callout warn">
      <h3>Recovery Order</h3>
      <p>Read lastError, inspect logs, retry if appropriate, then escalate to HITL or Health if the failure is not job-local.</p>
      <div class="quick-links"><a href="/ui/hitl">HITL</a><a href="/ui/health">Health</a></div>
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Failure Context</h2>
      <p class="section-intro">Keep the most relevant recovery evidence above the log table.</p>
    </div>
  </div>
  ${input.errorStack}
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>Job Logs</h2>
      <p class="section-intro">Use search to isolate the message sequence that matters before retrying or handing off.</p>
    </div>
    <input type="search" data-table-filter="job-log-table" placeholder="Search logs"/>
  </div>
  <div class="table-wrap"><table id="job-log-table"><thead><tr><th>Created</th><th>Level</th><th>Message</th><th>Details</th></tr></thead><tbody>${
    input.logRows || renderTableEmptyRow(4, "No logs found.")
  }</tbody></table></div>
</section>`;
}

export function buildHitlPageBody(input: HitlPageBodyInput): string {
  const t = UI_TEXT.hitl;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">Failure Triage</span>
      <h1>${t.title}</h1>
      <p class="section-intro">Treat failed jobs as objects to inspect, rerender, and hand off. Keep triage, rerender inputs, and publish follow-through in one surface.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">Jobs</a><a href="/ui/publish">Publish</a><a href="/ui/artifacts">Artifacts</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("Primary move", "<strong>Inspect failed job</strong>", "Open the job row first for logs and detailed failure context.")}
    ${renderMetricCard("Operator input", "<strong>episodeId + failedShotIds</strong>", "Rerender stays explicit so the recovery path remains deliberate.")}
    ${renderMetricCard("Downstream handoff", "<strong>Artifacts then publish</strong>", "After rerender succeeds, verify outputs before moving into publish.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Triage Inputs</h2>
      <p class="section-intro">Search failures, decide which object needs rerender, then submit a focused HITL action.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    ${renderSearchCluster({
      id: "hitl-filter",
      targetId: "hitl-failed-table",
      label: "Filter failed jobs",
      placeholder: t.filterPlaceholder,
      hint: "Search by job, episode, topic, type, or error text."
    })}
    <form method="post" action="/ui/hitl/rerender" class="form-card">
      <h3>Rerender Request</h3>
      <div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div>
      <div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="${t.failedShotHelp}">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>${t.failedShotHint}</small></div>
      <label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun</label>
      <div class="actions"><button type="submit" data-primary-action="1">${t.runAction}</button></div>
    </form>
    <div class="form-card">
      <h3>After Rerender</h3>
      <ul class="ops-actions-list">
        <li><span>Inspect new job</span><span class="muted-text">Open the replacement job for logs and progress.</span></li>
        <li><span>Verify artifacts</span><span class="muted-text">Check that the episode outputs are present and current.</span></li>
        <li><span>Hand off to publish</span><span class="muted-text">Only after the rerender result is visible at the object level.</span></li>
      </ul>
      <div class="quick-links"><a href="/ui/artifacts">Artifacts</a><a href="/ui/publish">Publish</a></div>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.failedJobs}</h2>
      <p class="section-intro">Use the first columns as inspect and episode handoff actions. Error text stays visible so triage remains scan-first.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="hitl-failed-table"><thead><tr><th>Failed Job</th><th>Episode</th><th>Topic</th><th>Type</th><th>Created</th><th>Failure / Recovery</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noFailedJobs)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>Stuck Failure Loop</h3>
      <p>If rerender keeps failing, stop retrying blindly. Inspect the latest job and confirm whether the issue is data, queue, or storage.</p>
      <div class="quick-links"><a href="/ui/jobs">Jobs</a><a href="/ui/health">Health</a></div>
    </div>
    <div class="ops-callout ok">
      <h3>Publish Handoff</h3>
      <p>Once the object is healthy again, carry the same episode id into artifacts and publish without changing context.</p>
    </div>
  </div>
</section>`;
}

export function buildArtifactsPageBody(input: ArtifactsPageBodyInput): string {
  const t = UI_TEXT.artifacts;
  const hasEpisodeLinks = input.episodeLinks.trim().length > 0;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">Object Outputs</span>
      <h1>${t.title}</h1>
      <p class="section-intro">Artifacts should read as object-linked outputs first and a general storage index second.</p>
    </div>
    <div class="quick-links"><a href="/artifacts/">${t.openArtifacts}</a><a href="/ui/episodes">${t.openEpisodes}</a><a href="/ui/jobs">Jobs</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("Primary lookup", "<strong>episodeId</strong>", "Stay anchored to one object when you inspect generated files.")}
    ${renderMetricCard("Expected outputs", "<strong>beats, shots, media, QC</strong>", "Use the episode quick links before falling back to the raw index.")}
    ${renderMetricCard("Recovery", "<strong>trace back to jobs</strong>", "Missing files usually mean the object failed earlier in the pipeline.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Object-Linked Access</h2>
      <p class="section-intro">Start with an episode id when you want artifact inspection to match the same object you saw in Episodes or Jobs.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    <form method="get" action="/ui/artifacts" class="form-card">
      <h3>Episode Quick Links</h3>
      <div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>${t.episodeHelp}</small></div>
      <div class="actions"><button type="submit" class="secondary" data-primary-action="1">${t.quickLinkAction}</button></div>
    </form>
    <div class="ops-resource-card">
      <h3>Episode Outputs</h3>
      <p>${hasEpisodeLinks ? "Use these object-level outputs first. They are the clearest path from an episode into its generated files." : "Enter an episode id to surface quick links for the object rather than scanning the full storage index."}</p>
      <div class="ops-resource-list">${hasEpisodeLinks ? input.episodeLinks : '<div class="notice">No episode quick links loaded yet.</div>'}</div>
    </div>
    <div class="form-card">
      <h3>Recovery Path</h3>
      <ul class="ops-actions-list">
        <li><span>Missing shots.json</span><span class="muted-text">Check the latest compile or beats jobs for the same episode.</span></li>
        <li><span>Missing preview/final</span><span class="muted-text">Return to the related render job or rerender path.</span></li>
        <li><span>Missing upload manifest</span><span class="muted-text">Verify the publish-oriented steps completed before expecting handoff artifacts.</span></li>
      </ul>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.indexTitle}</h2>
      <p class="section-intro">Use the storage index when you need the broader out/ view, but keep the episode quick links as the primary operator path.</p>
    </div>
    <input type="search" data-table-filter="artifact-index-table" aria-label="Filter artifact index" placeholder="${t.indexFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="artifact-index-table"><thead><tr><th>Type</th><th>Name</th><th>Open</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(3, t.noArtifacts)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>Artifact Missing</h3>
      <p>Do not treat the storage index as the source of truth by itself. Trace the object back to its latest jobs and episode state first.</p>
      <div class="quick-links"><a href="/ui/jobs">Jobs</a><a href="/ui/episodes">Episodes</a></div>
    </div>
    <div class="ops-callout ok">
      <h3>Ready For Publish</h3>
      <p>Once the object-level outputs line up, move into publish with the same episode id to keep the handoff tight.</p>
      <div class="quick-links"><a href="/ui/publish">Publish</a></div>
    </div>
  </div>
</section>`;
}

export function buildRolloutsPageBody(input: RolloutsPageBodyInput): string {
  const t = UI_TEXT.rollouts;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">Verdict Board</span>
      <h1>${t.title}</h1>
      <p class="section-intro">Scan comparison signals, understand verdicts immediately, and jump straight into the detailed artifact when something needs operator attention.</p>
    </div>
    <div class="quick-links"><a href="/ui/benchmarks">Benchmarks</a><a href="/ui/health">${t.openHealth}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Filter + Triage Guide</h2>
      <p class="section-intro">Keep compare, verdict, and issue triage readable before you enter the raw artifacts.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    ${renderSearchCluster({
      id: "rollouts-filter",
      targetId: "rollouts-table",
      label: "Filter rollout signals",
      placeholder: t.filterPlaceholder,
      hint: "Search by signal kind, status, verdict, reason, or source."
    })}
    <div class="form-card">
      <h3>Read Order</h3>
      <ul class="ops-actions-list">
        <li><span>Status</span><span class="muted-text">Ready means usable. Blocked and below-min need immediate inspection.</span></li>
        <li><span>Verdict</span><span class="muted-text">Use this as the quick operator summary before opening detail.</span></li>
        <li><span>Reason</span><span class="muted-text">This should explain why the signal is here, not just restate the status.</span></li>
      </ul>
    </div>
    <div class="form-card">
      <h3>Follow-up Rhythm</h3>
      <ul class="ops-actions-list">
        <li><span>Detail</span><span class="muted-text">Open the interpreted view first.</span></li>
        <li><span>Raw JSON</span><span class="muted-text">Use when you need exact source fields or copyable data.</span></li>
        <li><span>Copy path</span><span class="muted-text">Hand the artifact off without losing traceability.</span></li>
      </ul>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.tableTitle}</h2>
      <p class="section-intro">Each row should read as signal, verdict, issue, and follow-up without requiring a second explanatory panel.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="rollouts-table"><thead><tr><th>Signal / Actions</th><th>Status</th><th>Score</th><th>Verdict</th><th>Reason</th><th>Generated</th><th>Source</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noSignals)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>${t.sourcesTitle}</h2>
      <p class="section-intro">${t.sourcesHint}</p>
    </div>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>`;
}

export function buildBenchmarksPageBody(input: BenchmarksPageBodyInput): string {
  const t = UI_TEXT.benchmarks;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">Compare Board</span>
      <h1>${t.title}</h1>
      <p class="section-intro">Keep scenario comparisons, regression verdicts, and issue triage readable immediately so operators can decide what needs deeper inspection.</p>
    </div>
    <div class="quick-links"><a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Triage Guide + Sources</h2>
      <p class="section-intro">Read the tables as compare surfaces first. Source roots stay visible so you know how trustworthy and fresh the data is.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    <div class="form-card">
      <h3>Backend Matrix</h3>
      <ul class="ops-actions-list">
        <li><span>Status</span><span class="muted-text">Use this to decide whether the scenario output is usable at all.</span></li>
        <li><span>Latency + rates</span><span class="muted-text">Read performance and acceptance together before comparing notes.</span></li>
        <li><span>Artifact links</span><span class="muted-text">Open Detail first, then Smoke or Plan if you need context.</span></li>
      </ul>
    </div>
    <div class="form-card">
      <h3>Regression Reports</h3>
      <ul class="ops-actions-list">
        <li><span>Warnings / Errors</span><span class="muted-text">This is the first operator triage field for regressions.</span></li>
        <li><span>Render drift</span><span class="muted-text">Mismatch counts tell you where the object diverged from expected render mode.</span></li>
        <li><span>Issue summary</span><span class="muted-text">Use this before opening detail to decide severity.</span></li>
      </ul>
    </div>
  </div>
  <div class="status-list" style="margin-top:10px">${input.sourceRows}</div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.backendTitle}</h2>
      <p class="section-intro">Backend scenario verdicts should be readable from status, latency, acceptance, and notes in one row.</p>
    </div>
    <input type="search" data-table-filter="benchmark-backend-table" aria-label="Filter backend benchmark matrix" placeholder="${t.backendFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-backend-table"><thead><tr><th>Scenario / Actions</th><th>Status</th><th>Latency</th><th>Acceptance</th><th>Failure Rate</th><th>Notes</th><th>Source</th></tr></thead><tbody>${
    input.backendRows || renderTableEmptyRow(7, t.noBackendRows)
  }</tbody></table></div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.regressionTitle}</h2>
      <p class="section-intro">Regression rows should tell you immediately whether the bundle is blocked, warning-only, or ready for deeper compare work.</p>
    </div>
    <input type="search" data-table-filter="benchmark-regression-table" aria-label="Filter episode regression reports" placeholder="${t.regressionFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-regression-table"><thead><tr><th>Bundle / Actions</th><th>Status</th><th>Warnings / Errors</th><th>Profiles</th><th>Render Drift</th><th>Issues</th><th>Source</th></tr></thead><tbody>${
    input.regressionRows || renderTableEmptyRow(7, t.noRegressionRows)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>Blocked Regression</h3>
      <p>Start with the regression row, then open detail and candidate compare artifacts before deciding whether the problem is rendering, QC, or configuration drift.</p>
    </div>
    <div class="ops-callout ok">
      <h3>Compare Follow-up</h3>
      <p>Use Rollouts when the benchmark signal needs a broader verdict board instead of object-specific investigation.</p>
      <div class="quick-links"><a href="/ui/rollouts">Open Rollouts</a></div>
    </div>
  </div>
</section>`;
}
