import { renderTableEmptyRow, UI_TEXT } from "./uiText";

type DashboardPageBodyInput = {
  flash: string;
  overall: string;
  dbStatus: string;
  redisStatus: string;
  minioStatus: string;
  queueReady: string;
};

type EpisodesPageBodyInput = {
  flash: string;
  styleOptions: string;
  defaultHookBoost: number;
  rows: string;
  autoRefreshScript: string;
};

function renderSearchCluster(input: {
  id: string;
  targetId: string;
  label: string;
  placeholder: string;
  hint: string;
}): string {
  return `<div class="search-cluster"><label for="${input.id}">${input.label}</label><input id="${input.id}" name="q" type="search" data-table-filter="${input.targetId}" placeholder="${input.placeholder}" autocomplete="off"/><span class="muted-text">${input.hint}</span></div>`;
}

export function buildDashboardPageBody(input: DashboardPageBodyInput): string {
  return `
<section class="card dashboard-shell">
${input.flash}
<div class="hero-grid">
  <div class="hero-copy">
    <span class="eyebrow">Creative Ops Cockpit</span>
    <h1>Dashboard</h1>
    <p class="lede">Run generation, rendering, packaging, and shipping from one operator surface. The shell is tuned for fast handoffs between Studio, Episodes, Jobs, and publish follow-through.</p>
    <div class="hero-actions">
      <a href="/ui/studio" class="secondary">Open Studio</a>
      <a href="/ui/episodes" class="secondary">Open Episodes</a>
      <a href="/ui/character-generator" class="secondary">Advanced Generator</a>
    </div>
  </div>
  <aside class="hero-panel">
    <h3>System Snapshot</h3>
    <p class="section-intro">Use this as the first stop before queuing GPU work or handing runs off to publish.</p>
    <div class="status-list">
      <div class="status-row"><span class="label">Health</span>${input.overall}</div>
      <div class="status-row"><span class="label">Database</span>${input.dbStatus}</div>
      <div class="status-row"><span class="label">Redis</span>${input.redisStatus}</div>
      <div class="status-row"><span class="label">Minio</span>${input.minioStatus}</div>
      <div class="status-row"><span class="label">Queue</span>${input.queueReady}</div>
    </div>
  </aside>
</div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Launch Pads</h2>
      <p class="section-intro">The main entry is still Studio, but the queue and publish loops below are designed for fast operational checks and retries.</p>
    </div>
    <div class="quick-links">
      <a href="/ui/health">Full Health</a>
      <a href="/ui/jobs">Latest Jobs</a>
      <a href="/ui/artifacts">Artifacts</a>
    </div>
  </div>
  <div class="quick-grid">
    <form method="post" action="/ui/actions/demo-extreme" class="form-card">
      <h3>Demo Extreme</h3>
      <p class="card-intro">Kick the full demo loop with the sample script and timing profile.</p>
      <div class="actions"><button type="submit" data-primary-action="1">Run Demo Extreme</button></div>
    </form>
    <form method="post" action="/ui/actions/generate-preview" class="form-card">
      <h3>Preview Render</h3>
      <div class="field"><label for="preview-topic">Preview topic</label><input id="preview-topic" name="topic" value="UI Preview Demo"/><small>Feeds both the script and the preview render request.</small></div>
      <div class="field"><label for="preview-duration">Target duration (sec)</label><input id="preview-duration" name="targetDurationSec" inputmode="numeric" value="600"/><small>Recommended range: 120 to 900 seconds.</small></div>
      <div class="actions"><button type="submit">Start Preview Render</button></div>
    </form>
    <form method="post" action="/ui/actions/generate-full" class="form-card">
      <h3>Final + Package</h3>
      <div class="field"><label for="full-topic">Final pipeline topic</label><input id="full-topic" name="topic" value="UI Full Pipeline Demo"/><small>Used for final render, packaging, and downstream publish tasks.</small></div>
      <div class="field"><label for="full-duration">Target duration (sec)</label><input id="full-duration" name="targetDurationSec" inputmode="numeric" value="600"/><small>Set the intended final runtime.</small></div>
      <div class="actions"><button type="submit" class="secondary">Run Final + Package</button></div>
    </form>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Operator Paths</h2>
      <p class="section-intro">Jump straight into the part of the pipeline you need to inspect.</p>
    </div>
  </div>
  <div class="link-grid">
    <a href="/ui/studio">Studio</a>
    <a href="/ui/jobs">Jobs</a>
    <a href="/ui/assets">Assets</a>
    <a href="/ui/characters">Characters</a>
    <a href="/ui/character-generator">Character Generator</a>
    <a href="/ui/hitl">HITL</a>
    <a href="/ui/episodes">Episodes</a>
    <a href="/ui/publish">Publish</a>
    <a href="/ui/health">Health</a>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Quick Setup Guide</h2>
      <p class="section-intro">For local bring-up, follow this sequence before expecting queue and storage checks to pass.</p>
    </div>
  </div>
  <div class="grid two">
    <div class="form-card">
      <ol class="stack">
        <li>Start infra: <code>pnpm docker:up</code></li>
        <li>Run DB migration: <code>pnpm db:migrate</code></li>
        <li>Run API: <code>pnpm -C apps/api run dev</code></li>
        <li>Run Worker: <code>pnpm -C apps/worker run dev</code></li>
      </ol>
    </div>
    <div class="guide-grid">
      <button type="button" data-copy="pnpm docker:up">Copy docker:up</button>
      <button type="button" data-copy="pnpm db:migrate">Copy db:migrate</button>
      <button type="button" data-copy="pnpm -C apps/api run dev">Copy api dev</button>
      <button type="button" data-copy="pnpm -C apps/worker run dev">Copy worker dev</button>
    </div>
  </div>
</section>`;
}

export function buildEpisodesPageBody(input: EpisodesPageBodyInput): string {
  const t = UI_TEXT.episodes;
  return `
<section class="card dashboard-shell">
  ${input.flash}
  <div class="hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">Episode Orchestration</span>
      <h1>${t.title}</h1>
      <p class="lede">Create a new episode, attach the right style preset, then move straight into preview, render, artifacts, and publish without losing context.</p>
      <div class="hero-actions">
        <a href="/ui/jobs" class="secondary">${t.quickLinksJobs}</a>
        <a href="/ui/artifacts" class="secondary">${t.quickLinksArtifacts}</a>
        <a href="/ui/publish" class="secondary">Open Publish</a>
      </div>
    </div>
    <aside class="hero-panel">
      <h3>What This Page Covers</h3>
      <p class="section-intro">Queue new story work, keep an eye on the latest jobs, and jump into publish or artifact inspection from the row you are already on.</p>
      <div class="status-list">
        <div class="status-row"><span class="label">Create</span><strong>Topic, channel, duration</strong></div>
        <div class="status-row"><span class="label">Tune</span><strong>Preset + hook boost</strong></div>
        <div class="status-row"><span class="label">Run</span><strong>Preview, full, or render-only</strong></div>
      </div>
    </aside>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Create And Enqueue</h2>
      <p class="section-intro">Keep the creation form lightweight and use the list below for operational follow-through.</p>
    </div>
  </div>
  <form method="post" action="/ui/episodes" class="quick-grid">
    <div class="form-card">
      <h3>Base Settings</h3>
      <div class="field">
        <label for="episode-topic">Topic</label>
        <input id="episode-topic" name="topic" required data-tooltip="Example: Q4 growth analysis"/>
        <small>Short, operator-readable topic for the episode and downstream jobs.</small>
      </div>
      <div class="field">
        <label for="episode-channel">Channel ID</label>
        <input id="episode-channel" name="channelId"/>
        <small>Optional. Leave blank to use the default channel context.</small>
      </div>
      <div class="field">
        <label for="episode-duration">Target duration (sec)</label>
        <input id="episode-duration" name="targetDurationSec" value="600" inputmode="numeric"/>
      </div>
    </div>
    <div class="form-card">
      <h3>Pipeline Options</h3>
      <div class="field">
        <label for="episode-jobType">Job type</label>
        <select id="episode-jobType" name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option></select>
      </div>
      <div class="field">
        <label for="episode-pipelineMode">Pipeline mode</label>
        <select id="episode-pipelineMode" name="pipelineMode"><option value="preview">preview-only</option><option value="full">full (final + package)</option><option value="manual">manual</option></select>
      </div>
      <div class="field">
        <label for="episode-stylePreset">Style preset</label>
        <select id="episode-stylePreset" name="stylePresetId">${input.styleOptions}</select>
        <small>AUTO selects from tone, pacing, and KPI signals. Use a fixed preset when you need stable visual comparisons.</small>
      </div>
      <div class="field">
        <label for="episode-hookBoost">Hook boost (0 to 1)</label>
        <input id="episode-hookBoost" type="range" name="hookBoost" min="0" max="1" step="0.05" value="${input.defaultHookBoost}" oninput="this.nextElementSibling.value=this.value"/>
        <output>${input.defaultHookBoost}</output>
      </div>
      <div class="actions"><button type="submit" data-primary-action="1">${t.createAndEnqueue}</button></div>
    </div>
  </form>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>${t.recent}</h2>
      <p class="section-intro">Recent rows refresh in place so you can keep this page open while the worker queue is active.</p>
    </div>
    <div class="quick-links">
      <a href="/ui/jobs">${t.quickLinksJobs}</a>
      <a href="/ui/artifacts">${t.quickLinksArtifacts}</a>
      <a href="/ui/health">Health</a>
    </div>
  </div>
  <div class="toolbar">
    <label class="toggle-pill" for="episodes-auto-refresh"><input id="episodes-auto-refresh" type="checkbox" checked/> Live refresh</label>
    <button id="episodes-refresh-now" type="button" class="secondary">Refresh now</button>
    <span id="episodes-last-updated" class="muted-text">Waiting for first sync.</span>
  </div>
  <div id="episodes-live-status" class="notice" role="status" aria-live="polite">${t.listHint}</div>
  ${renderSearchCluster({
    id: "episodes-filter",
    targetId: "episodes-table",
    label: "Filter recent episodes",
    placeholder: t.tableFilterPlaceholder,
    hint: `${t.localFilterHint} Press / to focus search.`
  })}
  <div class="table-wrap"><table id="episodes-table"><thead><tr><th>ID</th><th>Topic</th><th>Status</th><th>Channel</th><th>Style</th><th>Latest Job</th><th>Duration</th><th>Created</th><th>Run / Follow-up</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(9, t.noEpisodes)
  }</tbody></table></div>
</section>${input.autoRefreshScript}`;
}
