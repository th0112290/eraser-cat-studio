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

const OPERATOR_PATTERN_STYLE = `<style>
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c5c58}
.ops-shell{display:grid;gap:10px}
.ops-titlebar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-titleblock{display:grid;gap:4px;max-width:720px}
.ops-titleblock h1,.ops-titleblock h2{margin-bottom:0}
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.ops-kpi,.ops-lane,.ops-inline-card{display:grid;gap:6px;padding:10px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fff,#f7fbfc);border-radius:12px}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:800}
.ops-callout{display:grid;gap:6px;padding:10px;border-radius:12px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fbfefd,#f2f8f9)}
.ops-callout h3,.ops-lane h3{margin:0;font-size:14px}
.ops-callout p,.ops-lane p,.ops-inline-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-callout.warn{border-color:#edd2ac;background:linear-gradient(180deg,#fffaf1,#fff3df)}
.ops-callout.bad{border-color:#efc5c8;background:linear-gradient(180deg,#fff7f7,#fff1f2)}
.ops-callout.ok{border-color:#bcdccf;background:linear-gradient(180deg,#f5fcf7,#edf8f0)}
.ops-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ops-actions-list,.ops-mini-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}
.ops-actions-list li,.ops-mini-list li{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:6px 0;border-top:1px solid #e1eaef}
.ops-actions-list li:first-child,.ops-mini-list li:first-child{border-top:none;padding-top:0}
.ops-mini-list li span:first-child{font-weight:700;color:#1f3340}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{border-color:#9ec6c3;background:linear-gradient(180deg,#ffffff,#eef8f6);text-decoration:none}
.ops-inline-card strong{font-size:15px;letter-spacing:-.01em}
.ops-table-shell{display:grid;gap:10px}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.search-cluster{display:grid;gap:6px;padding:10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}
.search-cluster input{width:100%}
.search-cluster .muted-text{line-height:1.4}
.ops-key-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.ops-summary-line{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 9px;border:1px solid #d9e4e8;background:#fff;border-radius:10px}
@media (max-width:720px){.ops-titleblock{max-width:none}.ops-actions-list li,.ops-mini-list li,.ops-summary-line{display:grid;justify-content:stretch}}
</style>`;

function renderOpsStyle(): string {
  return OPERATOR_PATTERN_STYLE;
}

function inferTone(markup: string): "ok" | "warn" | "bad" | "muted" {
  if (markup.includes("badge bad")) return "bad";
  if (markup.includes("badge warn")) return "warn";
  if (markup.includes("badge ok")) return "ok";
  return "muted";
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

function buildDashboardRecentObjectsScript(): string {
  return `<script>(() => {
  const episodeRoot = document.getElementById('dashboard-recent-episodes');
  const jobRoot = document.getElementById('dashboard-recent-jobs');
  if (!(episodeRoot instanceof HTMLElement) || !(jobRoot instanceof HTMLElement)) return;
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const badgeClass = (status) => {
    const text = String(status || '').toUpperCase();
    if (text === 'COMPLETED' || text === 'SUCCEEDED' || text === 'READY') return 'ok';
    if (text === 'FAILED' || text === 'ERROR' || text === 'DOWN') return 'bad';
    if (text === 'RUNNING' || text === 'QUEUED' || text === 'PENDING' || text === 'DEGRADED') return 'warn';
    return 'muted';
  };
  const renderEmpty = (label) => '<div class="notice">No recent ' + esc(label) + ' found.</div>';
  const renderEpisodeCard = (row) => {
    const id = String(row && row.id || '').trim();
    const topic = String(row && row.topic || id || 'Untitled episode');
    const status = String(row && row.status || 'UNKNOWN');
    const duration = row && row.targetDurationSec ? String(row.targetDurationSec) + 's target' : 'duration n/a';
    const latest = Array.isArray(row && row.jobs) && row.jobs.length > 0 && row.jobs[0] && typeof row.jobs[0] === 'object'
      ? String(row.jobs[0].type || '-') + ' / ' + String(row.jobs[0].status || '-')
      : 'no recent job';
    const channel = row && row.channel && typeof row.channel === 'object' && row.channel !== null
      ? String(row.channel.name || row.channel.id || 'default channel')
      : 'default channel';
    return '<a class="ops-inline-card" href="/ui/episodes/' + encodeURIComponent(id) + '">' +
      '<div class="inline-actions"><span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span><span class="muted-text">' + esc(channel) + '</span></div>' +
      '<strong>' + esc(topic) + '</strong>' +
      '<span class="muted-text">' + esc(id) + '</span>' +
      '<span class="muted-text">' + esc(latest) + ' | ' + esc(duration) + '</span>' +
      '</a>';
  };
  const renderJobCard = (row) => {
    const id = String(row && row.id || '').trim();
    const type = String(row && row.type || 'Unknown job');
    const status = String(row && row.status || 'UNKNOWN');
    const progress = row && row.progress != null ? String(row.progress) + '%' : '0%';
    const episodeId = String(row && row.episodeId || row && row.episode && row.episode.id || '').trim();
    const episodeLabel = row && row.episode && typeof row.episode === 'object' && row.episode !== null
      ? String(row.episode.topic || episodeId || 'Episode link')
      : (episodeId || 'Episode link');
    const inspectLinks = [
      '<a href="/ui/jobs/' + encodeURIComponent(id) + '">Inspect</a>',
      episodeId ? '<a href="/ui/episodes/' + encodeURIComponent(episodeId) + '">Episode</a>' : '',
      episodeId ? '<a href="/ui/artifacts?episodeId=' + encodeURIComponent(episodeId) + '">Artifacts</a>' : ''
    ].filter(Boolean).join('');
    return '<div class="ops-inline-card">' +
      '<div class="inline-actions"><span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span><span class="muted-text">' + esc(progress) + '</span></div>' +
      '<strong>' + esc(type) + '</strong>' +
      '<span class="muted-text">' + esc(id) + '</span>' +
      '<span class="muted-text">' + esc(episodeLabel) + '</span>' +
      '<div class="inline-actions">' + inspectLinks + '</div>' +
      '</div>';
  };
  const load = async () => {
    episodeRoot.innerHTML = '<div class="notice">Loading recent episodes...</div>';
    jobRoot.innerHTML = '<div class="notice">Loading recent jobs...</div>';
    try {
      const [episodesRes, jobsRes] = await Promise.all([
        fetch('/api/episodes', { headers: { accept: 'application/json' } }),
        fetch('/api/jobs?limit=4', { headers: { accept: 'application/json' } })
      ]);
      const episodesJson = episodesRes.ok ? await episodesRes.json() : { data: [] };
      const jobsJson = jobsRes.ok ? await jobsRes.json() : { data: [] };
      const episodes = Array.isArray(episodesJson && episodesJson.data) ? episodesJson.data.slice(0, 4) : [];
      const jobs = Array.isArray(jobsJson && jobsJson.data) ? jobsJson.data.slice(0, 4) : [];
      episodeRoot.innerHTML = episodes.length > 0 ? episodes.map(renderEpisodeCard).join('') : renderEmpty('episodes');
      jobRoot.innerHTML = jobs.length > 0 ? jobs.map(renderJobCard).join('') : renderEmpty('jobs');
      if (!episodesRes.ok) {
        episodeRoot.innerHTML = '<div class="error">Episode summary refresh failed: ' + esc(episodesRes.status) + '</div>';
      }
      if (!jobsRes.ok) {
        jobRoot.innerHTML = '<div class="error">Job summary refresh failed: ' + esc(jobsRes.status) + '</div>';
      }
    } catch (error) {
      const message = esc(error instanceof Error ? error.message : String(error));
      episodeRoot.innerHTML = '<div class="error">Episode summary refresh failed: ' + message + '</div>';
      jobRoot.innerHTML = '<div class="error">Job summary refresh failed: ' + message + '</div>';
    }
  };
  let timer = null;
  const start = () => {
    if (timer !== null) return;
    timer = setInterval(() => { void load(); }, 15000);
  };
  const stop = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };
  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }
    void load();
    start();
  };
  void load();
  start();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  });
})();</script>`;
}

function buildEpisodesLiveMonitorScript(): string {
  return `<script>(() => {
  const table = document.getElementById('episodes-table');
  const live = document.getElementById('episodes-live-status');
  const lastUpdated = document.getElementById('episodes-last-updated');
  const refreshNow = document.getElementById('episodes-refresh-now');
  const autoRefresh = document.getElementById('episodes-auto-refresh');
  if (!(table instanceof HTMLTableElement)) return;
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const badgeClass = (status) => {
    const text = String(status || '').toUpperCase();
    if (text === 'COMPLETED' || text === 'SUCCEEDED') return 'ok';
    if (text === 'FAILED' || text === 'ERROR') return 'bad';
    if (text === 'RUNNING' || text === 'QUEUED' || text === 'PENDING') return 'warn';
    return 'muted';
  };
  const setLive = (message, tone) => {
    if (!(live instanceof HTMLElement)) return;
    live.classList.remove('notice', 'error');
    live.classList.add(tone === 'error' ? 'error' : 'notice');
    live.textContent = message;
  };
  const updateRows = (episodes) => {
    const map = new Map();
    for (const row of episodes) {
      if (!row || typeof row !== 'object') continue;
      const id = String(row.id || '').trim();
      if (!id) continue;
      map.set(id, row);
    }
    document.querySelectorAll('tr[data-episode-row]').forEach((tr) => {
      if (!(tr instanceof HTMLTableRowElement)) return;
      const id = String(tr.dataset.episodeRow || '').trim();
      if (!id || !map.has(id)) return;
      const row = map.get(id);
      const statusCell = tr.querySelector('td[data-col="status"]');
      const latestCell = tr.querySelector('td[data-col="latestJob"]');
      if (statusCell instanceof HTMLTableCellElement) {
        const status = String(row.status || 'UNKNOWN');
        statusCell.innerHTML = '<span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span>';
      }
      if (latestCell instanceof HTMLTableCellElement) {
        const latest = Array.isArray(row.jobs) && row.jobs.length > 0 ? row.jobs[0] : null;
        const latestText = latest && typeof latest === 'object'
          ? String(latest.type || '-') + ' (' + String(latest.status || '-') + ')'
          : '-';
        latestCell.textContent = latestText;
      }
    });
  };
  const stamp = () => {
    if (!(lastUpdated instanceof HTMLElement)) return;
    lastUpdated.textContent = new Date().toLocaleTimeString();
  };
  const poll = async (label) => {
    setLive(label || 'Refreshing recent episode states...', 'notice');
    try {
      const res = await fetch('/api/episodes', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('poll failed: ' + res.status);
      const json = await res.json();
      const data = Array.isArray(json && json.data) ? json.data : [];
      updateRows(data);
      stamp();
      setLive('Recent episode states synced.', 'notice');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLive('Status refresh failed: ' + message, 'error');
    }
  };
  let timer = null;
  const start = () => {
    if (!(autoRefresh instanceof HTMLInputElement) || !autoRefresh.checked || document.hidden || timer !== null) return;
    timer = setInterval(() => { void poll('Refreshing recent episode states...'); }, 7000);
  };
  const stop = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };
  if (refreshNow instanceof HTMLButtonElement) {
    refreshNow.addEventListener('click', () => { void poll('Manual refresh in progress...'); });
  }
  if (autoRefresh instanceof HTMLInputElement) {
    autoRefresh.addEventListener('change', () => {
      if (autoRefresh.checked) {
        setLive('Live refresh enabled.', 'notice');
        void poll('Refreshing recent episode states...');
        start();
        return;
      }
      stop();
      setLive('Live refresh paused. Use Refresh now for a manual sync.', 'notice');
    });
  }
  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }
    void poll('Refreshing recent episode states...');
    start();
  };
  void poll('Refreshing recent episode states...');
  start();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  });
})();</script>`;
}

export function buildDashboardPageBody(input: DashboardPageBodyInput): string {
  const healthTone = inferTone(input.overall);
  const queueTone = inferTone(input.queueReady);
  const storageTone = inferTone(input.minioStatus);

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  ${input.flash}
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">Operator Board</span>
      <h1>Dashboard</h1>
      <p class="section-intro">Start here for overview, risk checks, and the next action into episodes, jobs, rerenders, or publish.</p>
    </div>
    <div class="quick-links"><a href="/ui/episodes">Episodes</a><a href="/ui/jobs">Jobs</a><a href="/ui/hitl">HITL</a><a href="/ui/health">Health</a></div>
  </div>
  <div class="ops-kpi-grid">
    ${renderMetricCard("Overall", input.overall, "First go or no-go check before queueing new work.")}
    ${renderMetricCard("Database", input.dbStatus, "Metadata and episode state must stay readable.")}
    ${renderMetricCard("Redis", input.redisStatus, "Queue and worker coordination depend on this staying healthy.")}
    ${renderMetricCard("Minio", input.minioStatus, "Artifact storage should be stable before publish handoff.")}
    ${renderMetricCard("Queue", input.queueReady, "False means preview, render, and retry paths may stall.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Risk Signals</h2>
      <p class="section-intro">Scan the platform state, decide whether to continue, then move directly into the affected operator lane.</p>
    </div>
    <div class="quick-links"><a href="/ui/health">Open Health</a><a href="/ui/artifacts">Artifacts</a><a href="/ui/publish">Publish</a></div>
  </div>
  <div class="ops-note-grid">
    <div class="ops-callout ${healthTone}">
      <h3>Platform Health</h3>
      <p>Overall service state: ${input.overall}. If this is down or degraded, verify infra before retrying jobs or opening publish.</p>
    </div>
    <div class="ops-callout ${queueTone}">
      <h3>Queue Readiness</h3>
      <p>Queue state: ${input.queueReady}. When queue readiness is false, move into Jobs or Health before queuing new episode work.</p>
    </div>
    <div class="ops-callout ${storageTone}">
      <h3>Artifact + Publish Path</h3>
      <p>Storage state: ${input.minioStatus}. If artifacts are unstable, expect publish and artifact inspection to need recovery.</p>
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Next Actions</h2>
      <p class="section-intro">Use these controls when you need to create new work quickly, then continue from Episodes or Jobs for row-level follow-through.</p>
    </div>
  </div>
  <div class="quick-grid">
    <form method="post" action="/ui/actions/demo-extreme" class="form-card">
      <h3>Demo Extreme</h3>
      <p class="section-intro">Run the reference end-to-end loop when you want a full sanity pass across generation, render, and packaging.</p>
      <div class="actions"><button type="submit" data-primary-action="1" data-primary-label="Run demo pipeline">Run Demo Extreme</button></div>
    </form>
    <form method="post" action="/ui/actions/generate-preview" class="form-card">
      <h3>Preview Render</h3>
      <div class="field"><label for="preview-topic">Preview topic</label><input id="preview-topic" name="topic" value="UI Preview Demo"/><small>Create quick preview work, then inspect progress from Jobs or Episodes.</small></div>
      <div class="field"><label for="preview-duration">Target duration (sec)</label><input id="preview-duration" name="targetDurationSec" inputmode="numeric" value="600"/><small>Recommended range: 120 to 900 seconds.</small></div>
      <div class="actions"><button type="submit">Start Preview Render</button></div>
    </form>
    <form method="post" action="/ui/actions/generate-full" class="form-card">
      <h3>Final + Package</h3>
      <div class="field"><label for="full-topic">Final pipeline topic</label><input id="full-topic" name="topic" value="UI Full Pipeline Demo"/><small>Queue work intended for final render, package generation, and downstream publish checks.</small></div>
      <div class="field"><label for="full-duration">Target duration (sec)</label><input id="full-duration" name="targetDurationSec" inputmode="numeric" value="600"/><small>Use this when the run should be publish-oriented, not just preview-oriented.</small></div>
      <div class="actions"><button type="submit" class="secondary">Run Final + Package</button></div>
    </form>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Object Lanes</h2>
      <p class="section-intro">Keep the console object-centered: create in Episodes, inspect in Jobs, triage in HITL, ship from Publish, and verify via Artifacts.</p>
    </div>
  </div>
  <div class="ops-mini-grid">
    <div class="ops-lane">
      <h3>Episode Lane</h3>
      <p>Create new episode work, scan latest status, then run preview, full, or render-only from the same row.</p>
      <div class="quick-links"><a href="/ui/episodes">Open Episodes</a><a href="/ui/studio">Studio</a></div>
    </div>
    <div class="ops-lane">
      <h3>Job Lane</h3>
      <p>Inspect queue progress, open logs, retry failed runs, and move into related episode or artifact context.</p>
      <div class="quick-links"><a href="/ui/jobs">Open Jobs</a><a href="/ui/hitl">Failed Queue</a></div>
    </div>
    <div class="ops-lane">
      <h3>Ship Lane</h3>
      <p>Confirm artifacts and status, then hand off into publish without losing episode context.</p>
      <div class="quick-links"><a href="/ui/artifacts">Artifacts</a><a href="/ui/publish">Publish</a></div>
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Recent Object Summaries</h2>
      <p class="section-intro">The dashboard stays overview-first, but recent episodes and jobs remain visible here so you can jump straight into the active object.</p>
    </div>
    <div class="quick-links"><a href="/ui/episodes">All Episodes</a><a href="/ui/jobs">All Jobs</a></div>
  </div>
  <div class="ops-mini-grid">
    <div class="ops-lane">
      <div class="ops-table-meta"><h3>Recent Episodes</h3><span class="muted-text">Auto-refreshing lane</span></div>
      <div id="dashboard-recent-episodes" class="ops-shell"><div class="notice">Loading recent episodes...</div></div>
    </div>
    <div class="ops-lane">
      <div class="ops-table-meta"><h3>Recent Jobs</h3><span class="muted-text">Auto-refreshing lane</span></div>
      <div id="dashboard-recent-jobs" class="ops-shell"><div class="notice">Loading recent jobs...</div></div>
    </div>
  </div>
</section>
${buildDashboardRecentObjectsScript()}`;
}

export function buildEpisodesPageBody(input: EpisodesPageBodyInput): string {
  const t = UI_TEXT.episodes;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  ${input.flash}
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">Episode Queue</span>
      <h1>${t.title}</h1>
      <p class="section-intro">List-first operator view for scanning status, filtering quickly, and running preview, full, or render-only flows from the row you are already on.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">${t.quickLinksJobs}</a><a href="/ui/artifacts">${t.quickLinksArtifacts}</a><a href="/ui/publish">Publish</a></div>
  </div>
  <div class="ops-kpi-grid">
    ${renderMetricCard("Create", "<strong>Topic, channel, duration</strong>", "Queue a new episode only after the active list looks healthy.")}
    ${renderMetricCard("Run", "<strong>Preview, full, render-only</strong>", "Use the row actions to keep execution and follow-up in one place.")}
    ${renderMetricCard("Handoff", "<strong>Jobs, artifacts, publish</strong>", "Move into downstream inspection without losing the current object.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Filters + Live Queue Controls</h2>
      <p class="section-intro">Search first, keep live status visible, and use the same row action rhythm across every episode.</p>
    </div>
  </div>
  <div class="ops-key-grid">
    ${renderSearchCluster({
      id: "episodes-filter",
      targetId: "episodes-table",
      label: "Filter recent episodes",
      placeholder: t.tableFilterPlaceholder,
      hint: `${t.localFilterHint} Press / to focus search.`
    })}
    <div class="form-card">
      <h3>Live Monitor</h3>
      <div class="ops-toolbar">
        <label class="toggle-pill" for="episodes-auto-refresh"><input id="episodes-auto-refresh" type="checkbox" checked/> Live refresh</label>
        <button id="episodes-refresh-now" type="button" class="secondary">Refresh now</button>
      </div>
      <div class="ops-summary-line"><span>Last sync</span><span id="episodes-last-updated" class="muted-text">Waiting for first sync.</span></div>
      <div id="episodes-live-status" class="notice" role="status" aria-live="polite">${t.listHint}</div>
    </div>
    <div class="form-card">
      <h3>Row Action Rhythm</h3>
      <ul class="ops-actions-list">
        <li><span>Preview</span><span class="muted-text">Fast checkpoint before full or publish-oriented work.</span></li>
        <li><span>Full</span><span class="muted-text">Run the complete pipeline when the episode is ready to move downstream.</span></li>
        <li><span>Render</span><span class="muted-text">Use when script and shots are already set and you only need the output pass.</span></li>
      </ul>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.recent}</h2>
      <p class="section-intro">Tables come first here. Status, latest job, and row actions should read before any creation form.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">${t.quickLinksJobs}</a><a href="/ui/hitl">HITL</a><a href="/ui/health">Health</a></div>
  </div>
  <div class="table-wrap"><table id="episodes-table"><thead><tr><th>Episode</th><th>Topic</th><th>Status</th><th>Channel</th><th>Style / Hook</th><th>Latest Job</th><th>Duration</th><th>Created</th><th>Run / Follow-up</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(9, t.noEpisodes)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Create Next Episode</h2>
      <p class="section-intro">After you scan the queue, use this form to add the next object with the right style preset and intended downstream path.</p>
    </div>
  </div>
  <form method="post" action="/ui/episodes" class="quick-grid">
    <div class="form-card">
      <h3>Base Context</h3>
      <div class="field">
        <label for="episode-topic">Topic</label>
        <input id="episode-topic" name="topic" required data-tooltip="Example: Q4 growth analysis"/>
        <small>Short, operator-readable topic for the episode and the jobs it will spawn.</small>
      </div>
      <div class="field">
        <label for="episode-channel">Channel ID</label>
        <input id="episode-channel" name="channelId"/>
        <small>Optional. Leave blank to keep the default channel context.</small>
      </div>
      <div class="field">
        <label for="episode-duration">Target duration (sec)</label>
        <input id="episode-duration" name="targetDurationSec" value="600" inputmode="numeric"/>
        <small>Set the intended runtime before choosing preview-only, full, or manual flow.</small>
      </div>
    </div>
    <div class="form-card">
      <h3>Pipeline Setup</h3>
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
        <small>AUTO chooses from tone and pacing. Lock a preset when you want repeatable comparison runs.</small>
      </div>
      <div class="field">
        <label for="episode-hookBoost">Hook boost (0 to 1)</label>
        <input id="episode-hookBoost" type="range" name="hookBoost" min="0" max="1" step="0.05" value="${input.defaultHookBoost}" oninput="this.nextElementSibling.value=this.value"/>
        <output>${input.defaultHookBoost}</output>
      </div>
      <div class="actions"><button type="submit" data-primary-action="1" data-primary-label="Create and enqueue episode">${t.createAndEnqueue}</button></div>
    </div>
  </form>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Recovery + Handoff</h2>
      <p class="section-intro">Keep the next move visible when an episode leaves the happy path or is ready for downstream work.</p>
    </div>
  </div>
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>Failed Or Stalled</h3>
      <p>Open the latest job from the row, inspect logs, then use HITL for failed-shot rerender paths when recovery needs human direction.</p>
      <div class="quick-links"><a href="/ui/jobs">Jobs</a><a href="/ui/hitl">HITL</a></div>
    </div>
    <div class="ops-callout ok">
      <h3>Artifacts Ready</h3>
      <p>When preview or final outputs exist, move straight into artifact inspection before opening publish.</p>
      <div class="quick-links"><a href="/ui/artifacts">Artifacts</a><a href="/ui/publish">Publish</a></div>
    </div>
    <div class="ops-callout">
      <h3>Operator Shortcut</h3>
      <p>Use <span class="kbd">/</span> to jump to search, keep live refresh enabled, and let the row action buttons drive the next step.</p>
    </div>
  </div>
</section>${buildEpisodesLiveMonitorScript()}`;
}
