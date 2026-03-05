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

export function buildDashboardPageBody(input: DashboardPageBodyInput): string {
  return `
<section class="card dashboard-shell"><h1>Dashboard</h1>
${input.flash}
<section class="card" style="margin-bottom:12px;border:1px solid #b9d3ff;background:linear-gradient(180deg,#f4f8ff,#eef5ff)">
  <h2 style="margin:0 0 8px">Main Entry: Studio</h2>
  <p style="margin:0 0 10px;color:#425466">Run character generation, asset upload, character-pack selection, episode/render/publish from one page.</p>
  <div class="actions">
    <a href="/ui/studio" class="secondary" style="padding:9px 12px;border-radius:10px;border:1px solid #c5d7eb">Open Studio</a>
    <a href="/ui/character-generator" class="secondary" style="padding:9px 12px;border-radius:10px;border:1px solid #c5d7eb">Open Advanced Generator</a>
  </div>
</section>
<div class="grid two">
  <div class="card">
    <h2>Service Status</h2>
    <div class="status-list">
      <div class="status-row"><span class="label">health</span>${input.overall}</div>
      <div class="status-row"><span class="label">database</span>${input.dbStatus}</div>
      <div class="status-row"><span class="label">redis</span>${input.redisStatus}</div>
      <div class="status-row"><span class="label">minio</span>${input.minioStatus}</div>
      <div class="status-row"><span class="label">queueReady</span>${input.queueReady}</div>
    </div>
    <p style="margin:10px 0 0"><a href="/ui/health">Open full health report</a></p>
  </div>
  <div class="card">
    <h2>Quick Actions</h2>
    <div class="quick-grid">
      <form method="post" action="/ui/actions/demo-extreme" class="form-card">
        <h3>Demo Extreme</h3>
        <div class="field"><small>Run the demo pipeline quickly with sample script and timeline.</small></div>
        <div class="actions"><button type="submit" data-primary-action="1">Run Demo Extreme</button></div>
      </form>
      <form method="post" action="/ui/actions/generate-preview" class="form-card">
        <h3>Preview Render</h3>
        <div class="field"><label for="preview-topic">Preview topic</label><input id="preview-topic" name="topic" value="UI Preview Demo"/><small>Used as script and render topic input.</small></div>
        <div class="field"><label for="preview-duration">targetDurationSec</label><input id="preview-duration" name="targetDurationSec" value="600"/><small>Recommended range: 120 to 900 seconds.</small></div>
        <div class="actions"><button type="submit">Start Preview Render</button></div>
      </form>
      <form method="post" action="/ui/actions/generate-full" class="form-card">
        <h3>Final + Package</h3>
        <div class="field"><label for="full-topic">Final pipeline topic</label><input id="full-topic" name="topic" value="UI Full Pipeline Demo"/><small>Topic for final render and packaging.</small></div>
        <div class="field"><label for="full-duration">targetDurationSec</label><input id="full-duration" name="targetDurationSec" value="600"/><small>Target output length.</small></div>
        <div class="actions"><button type="submit" class="secondary">Run Final + Package</button></div>
      </form>
    </div>
  </div>
</div>
</section>

<section class="card"><h2>Control Plane</h2>
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

<section class="card"><h2>Quick Setup Guide</h2>
<ol>
<li>Start infra: <code>pnpm docker:up</code></li>
<li>Run DB migration: <code>pnpm db:migrate</code></li>
<li>Run API: <code>pnpm -C apps/api run dev</code></li>
<li>Run Worker: <code>pnpm -C apps/worker run dev</code></li>
</ol>
<div class="guide-grid">
<button type="button" data-copy="pnpm docker:up">Copy docker:up</button>
<button type="button" data-copy="pnpm db:migrate">Copy db:migrate</button>
<button type="button" data-copy="pnpm -C apps/api run dev">Copy api dev</button>
<button type="button" data-copy="pnpm -C apps/worker run dev">Copy worker dev</button>
</div>
</section>`;
}

export function buildEpisodesPageBody(input: EpisodesPageBodyInput): string {
  const t = UI_TEXT.episodes;
  return `
<section class="card dashboard-shell">
  <h1>${t.title}</h1>
  ${input.flash}
  <form method="post" action="/ui/episodes" class="quick-grid">
    <div class="form-card">
      <h3>Base Settings</h3>
      <div class="field">
        <label for="episode-topic">topic</label>
        <input id="episode-topic" name="topic" required data-tooltip="ex) Q4 growth analysis"/>
        <small>Topic used for episode generation.</small>
      </div>
      <div class="field">
        <label for="episode-channel">channelId (optional)</label>
        <input id="episode-channel" name="channelId"/>
      </div>
      <div class="field">
        <label for="episode-duration">targetDurationSec</label>
        <input id="episode-duration" name="targetDurationSec" value="600"/>
      </div>
    </div>
    <div class="form-card">
      <h3>Pipeline Options</h3>
      <div class="field">
        <label for="episode-jobType">jobType</label>
        <select id="episode-jobType" name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option></select>
      </div>
      <div class="field">
        <label for="episode-pipelineMode">pipelineMode</label>
        <select id="episode-pipelineMode" name="pipelineMode"><option value="preview">preview-only</option><option value="full">full (final + package)</option><option value="manual">manual</option></select>
      </div>
      <div class="field">
        <label for="episode-stylePreset">stylePreset <span class="hint" data-tooltip="AUTO chooses style from snapshot tone/speed/KPI.">?</span></label>
        <select id="episode-stylePreset" name="stylePresetId">${input.styleOptions}</select>
      </div>
      <div class="field">
        <label for="episode-hookBoost">hookBoost (0~1)</label>
        <input id="episode-hookBoost" type="range" name="hookBoost" min="0" max="1" step="0.05" value="${input.defaultHookBoost}" oninput="this.nextElementSibling.value=this.value"/>
        <output>${input.defaultHookBoost}</output>
      </div>
      <div class="actions"><button type="submit" data-primary-action="1">${t.createAndEnqueue}</button></div>
    </div>
  </form>
</section>
<section class="card">
  <div class="section-head">
    <h2>${t.recent}</h2>
    <div class="quick-links"><a href="/ui/jobs">${t.quickLinksJobs}</a><a href="/ui/artifacts">${t.quickLinksArtifacts}</a></div>
  </div>
  <p class="notice">${t.listHint} <span class="kbd">/</span> moves focus to search.</p>
  <div class="table-tools">
    <input type="search" data-table-filter="episodes-table" placeholder="${t.tableFilterPlaceholder}"/>
    <span class="muted-text">${t.localFilterHint}</span>
  </div>
  <div class="table-wrap"><table id="episodes-table"><thead><tr><th>ID</th><th>Topic</th><th>Status</th><th>Channel</th><th>Style</th><th>Latest Job</th><th>Duration</th><th>Created</th><th>Quick Run</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(9, t.noEpisodes)
  }</tbody></table></div>
</section>${input.autoRefreshScript}`;
}

