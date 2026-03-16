import { renderTableEmptyRow, UI_TEXT } from "./uiText";
import {
  extractRouteValue,
  firstLink,
  type ListPowerActionInput,
  parseTableRows,
  renderListPowerActionBar,
  renderListPowerCompareCheckbox,
  renderListPowerScript,
  renderListPowerStyle,
  renderListPowerSurface,
  renderToneBadge,
  stripHtml
} from "./operationsPages";

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
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-key-grid,.ops-rail-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.ops-kpi,.ops-lane,.ops-inline-card{display:grid;gap:6px;padding:10px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fff,#f7fbfc);border-radius:12px}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:800}
.ops-rail-card{display:grid;gap:8px;padding:12px;border:1px solid #d6e4ea;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f8fbfc)}
.ops-rail-card h3{margin:0;font-size:15px}
.ops-rail-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-rail-card.tone-ok{border-color:#cbe6d7;background:linear-gradient(180deg,#effcf7,#ffffff)}
.ops-rail-card.tone-warn{border-color:#ecd9ad;background:linear-gradient(180deg,#fff8ea,#fffdf7)}
.ops-rail-card.tone-bad{border-color:#efc4c4;background:linear-gradient(180deg,#fff4f4,#fffdfd)}
.ops-rail-card.tone-muted{border-color:#dbe5ef;background:linear-gradient(180deg,#f7fafc,#ffffff)}
.ops-rail-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.ops-rail-item{display:grid;gap:4px;padding-top:8px;border-top:1px solid #e1eaef}
.ops-rail-item:first-child{border-top:none;padding-top:0}
.ops-rail-item strong{font-size:14px;color:#1f3340}
.ops-rail-card .quick-links{margin-top:2px}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{border-color:#9ec6c3;background:linear-gradient(180deg,#ffffff,#eef8f6);text-decoration:none}
.ops-object-card .ops-object-kicker{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#58707c}
.ops-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ops-table-shell{display:grid;gap:10px}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.search-cluster{display:grid;gap:6px;padding:10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}
.search-cluster input{width:100%}
.search-cluster .muted-text{line-height:1.4}
.ops-summary-line{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 9px;border:1px solid #d9e4e8;background:#fff;border-radius:10px}
.ops-form-shell{display:grid;gap:10px}
@media (max-width:720px){.ops-titleblock{max-width:none}.ops-summary-line{display:grid;justify-content:stretch}}
</style>`;

function renderOpsStyle(): string {
  return OPERATOR_PATTERN_STYLE + renderListPowerStyle();
}

type OpsRailTone = "ok" | "warn" | "bad" | "muted";

type OpsRailItem = {
  label: string;
  detail: string;
  html?: string;
};

type OpsRailCardInput = {
  title: string;
  intro: string;
  tone?: OpsRailTone;
  items?: OpsRailItem[];
  bodyHtml?: string;
  linksHtml?: string;
};

function inferTone(markup: string): OpsRailTone {
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
  urlParam?: string;
}): string {
  return `<div class="search-cluster"><label for="${input.id}">${input.label}</label><input id="${input.id}" name="q" type="search" data-table-filter="${input.targetId}"${
    input.urlParam ? ` data-url-param="${input.urlParam}"` : ""
  } placeholder="${input.placeholder}" autocomplete="off"/><span class="muted-text">${input.hint}</span></div>`;
}

function renderRailItems(items: OpsRailItem[]): string {
  return `<ul class="ops-rail-list">${items
    .map(
      (item) =>
        `<li class="ops-rail-item"><strong>${item.label}</strong><span class="muted-text">${item.detail}</span>${item.html ?? ""}</li>`
    )
    .join("")}</ul>`;
}

function renderRailCard(input: OpsRailCardInput): string {
  const tone = input.tone ?? "muted";
  const bodyHtml =
    input.bodyHtml ?? ((input.items?.length ?? 0) > 0 ? renderRailItems(input.items ?? []) : '<div class="notice">표시할 항목이 없습니다.</div>');
  return `<div class="ops-rail-card tone-${tone}"><div class="stack"><h3>${input.title}</h3><p>${input.intro}</p></div>${bodyHtml}${
    input.linksHtml ? `<div class="quick-links">${input.linksHtml}</div>` : ""
  }</div>`;
}

function renderRailSection(input: {
  title: string;
  intro: string;
  linksHtml?: string;
  cards: OpsRailCardInput[];
}): string {
  return `<section class="card"><div class="section-head"><div><h2>${input.title}</h2><p class="section-intro">${input.intro}</p></div>${
    input.linksHtml ? `<div class="quick-links">${input.linksHtml}</div>` : ""
  }</div><div class="ops-rail-grid">${input.cards.map(renderRailCard).join("")}</div></section>`;
}

function sanitizeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function latestJobStatus(latestText: string): string {
  const match = latestText.match(/\(([^)]+)\)\s*$/);
  return match?.[1]?.trim().toUpperCase() ?? "";
}

function episodeRowTags(statusText: string, latestStatus: string): string[] {
  return [
    "episode",
    /(FAILED|ERROR)/i.test(statusText) || /(FAILED|ERROR)/i.test(latestStatus) ? "failed" : "",
    /(RUNNING|QUEUED|PENDING)/i.test(statusText) || /(RUNNING|QUEUED|PENDING)/i.test(latestStatus) ? "active" : "",
    /(SUCCEEDED|COMPLETED|READY)/i.test(latestStatus) ? "publish-ready" : ""
  ].filter(Boolean);
}

function renderPoweredEpisodeRows(rowsHtml: string): string {
  const rows = parseTableRows(rowsHtml).filter((row) => row.cells.length >= 9);
  if (rows.length === 0) return rowsHtml;

  return rows
    .map((row) => {
      const episodeLink = firstLink(row.cells[0]);
      const episodeId = extractRouteValue(episodeLink?.href, "episodes") || stripHtml(row.cells[0]) || "-";
      const topicText = stripHtml(row.cells[1]) || "-";
      const statusMarkup = row.cells[2] || '<span class="badge muted">unknown</span>';
      const statusText = stripHtml(statusMarkup) || "unknown";
      const channelText = stripHtml(row.cells[3]) || "-";
      const styleText = stripHtml(row.cells[4]) || "-";
      const latestText = stripHtml(row.cells[5]) || "-";
      const latestStatus = latestJobStatus(latestText);
      const durationText = stripHtml(row.cells[6]) || "-";
      const createdText = stripHtml(row.cells[7]) || "-";
      const runProfilesHtml = row.cells[8] ?? "";
      const checkboxId = `episodes-compare-${sanitizeDomId(episodeId)}`;
      const rowActions: ListPowerActionInput[] = [];
      if (episodeLink?.href) rowActions.push({ kind: "link", label: "View", href: episodeLink.href });
      rowActions.push({ kind: "compare", label: "Compare", checkboxId });
      rowActions.push({ kind: "link", label: "Rollback", href: `/ui/episodes/${encodeURIComponent(episodeId)}/editor` });
      if (latestStatus && /(SUCCEEDED|COMPLETED|READY)/i.test(latestStatus)) {
        rowActions.push({ kind: "link", label: "Approve", href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}` });
      }
      rowActions.push({ kind: "link", label: "Open artifacts", href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}` });
      rowActions.push({ kind: "copy", label: "Copy ID/path", value: episodeId });

      return `<tr data-list-row="1" data-episode-row="${episodeId}" data-list-status="${statusText.toUpperCase()}" data-list-created-at="${createdText}" data-list-tags="${episodeRowTags(
        statusText,
        latestStatus
      ).join(" ")}"><td><div class="ops-cell-stack"><div class="ops-cell-title">${renderListPowerCompareCheckbox({
        checkboxId,
        compareId: episodeId,
        label: `${episodeId} / ${topicText}`,
        meta: `${statusText} / ${latestText}`,
        viewHref: episodeLink?.href,
        compareHref: `/ui/episodes/${encodeURIComponent(episodeId)}/ab-compare`,
        rollbackHref: `/ui/episodes/${encodeURIComponent(episodeId)}/editor`,
        approveHref: latestStatus && /(SUCCEEDED|COMPLETED|READY)/i.test(latestStatus) ? `/ui/publish?episodeId=${encodeURIComponent(episodeId)}` : "",
        artifactsHref: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`,
        copyValue: episodeId
      })}<strong>${episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : episodeId}</strong>${renderToneBadge(
        latestStatus && /(FAILED|ERROR)/i.test(latestStatus) ? "recover" : latestStatus && /(SUCCEEDED|COMPLETED|READY)/i.test(latestStatus) ? "ready" : "episode",
        latestStatus && /(FAILED|ERROR)/i.test(latestStatus) ? "bad" : latestStatus && /(SUCCEEDED|COMPLETED|READY)/i.test(latestStatus) ? "ok" : "muted"
      )}</div><span class="ops-cell-meta">Episode object stays above compare, artifacts, and publish handoff.</span></div></td><td><div class="ops-cell-stack"><strong>${topicText}</strong><span class="ops-cell-meta">${channelText}</span></div></td><td data-col="status"><div class="ops-cell-stack"><div class="ops-cell-title">${statusMarkup}</div><span class="ops-cell-meta">${
        /ACTIVE|RUNNING|QUEUED|PENDING/i.test(statusText) ? "Watch for stale active episodes and jump into detail before rerunning." : "Use the object status before dropping into lower-level evidence."
      }</span></div></td><td data-col="latestJob"><div class="ops-cell-stack"><strong>${latestText}</strong><span class="ops-cell-meta">${
        latestStatus && /(FAILED|ERROR)/i.test(latestStatus) ? "Latest job failed. Compare, recover, and artifacts stay adjacent." : "Latest job remains the lifecycle anchor for compare and publish."
      }</span></div></td><td><div class="ops-cell-stack"><strong>${styleText}</strong><span class="ops-cell-meta">${durationText}</span></div></td><td><div class="ops-cell-stack"><strong>${createdText}</strong><span class="ops-cell-meta">${
        latestStatus && /(FAILED|ERROR)/i.test(latestStatus)
          ? "next safe action: detail -> recover"
          : latestStatus && /(SUCCEEDED|COMPLETED|READY)/i.test(latestStatus)
            ? "next safe action: compare -> approve"
            : "next safe action: view -> run profile"
      }</span></div></td><td><div class="ops-cell-stack">${renderListPowerActionBar(rowActions)}<div class="list-power-run-profiles"><span class="list-power-inline-note">Safe runs stay on the row for preview, full, and render-only refresh.</span><div class="ops-link-row">${runProfilesHtml}</div></div></div></td></tr>`;
    })
    .join("");
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
  const renderEmpty = (label) => '<div class="notice">No recent ' + esc(label) + '.</div>';
  const renderEpisodeCard = (row) => {
    const id = String(row && row.id || '').trim();
    const topic = String(row && row.topic || id || 'Untitled episode');
    const status = String(row && row.status || 'UNKNOWN');
    const duration = row && row.targetDurationSec ? String(row.targetDurationSec) + ' sec target' : 'Duration missing';
    const latest = Array.isArray(row && row.jobs) && row.jobs.length > 0 && row.jobs[0] && typeof row.jobs[0] === 'object'
      ? String(row.jobs[0].type || '-') + ' / ' + String(row.jobs[0].status || '-')
      : 'No recent job';
    const channel = row && row.channel && typeof row.channel === 'object' && row.channel !== null
      ? String(row.channel.name || row.channel.id || 'Default channel')
      : 'Default channel';
    return '<a class="ops-inline-card ops-object-card" href="/ui/episodes/' + encodeURIComponent(id) + '">' +
      '<span class="ops-object-kicker">Recent episode</span>' +
      '<div class="inline-actions"><span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span><span class="muted-text">' + esc(channel) + '</span></div>' +
      '<strong>' + esc(topic) + '</strong>' +
      '<span class="muted-text">' + esc(id) + '</span>' +
      '<span class="muted-text">' + esc(latest) + ' | ' + esc(duration) + '</span>' +
      '<span class="muted-text">Next: open detail, then render / artifacts / publish.</span>' +
      '</a>';
  };
  const renderJobCard = (row) => {
    const id = String(row && row.id || '').trim();
    const type = String(row && row.type || 'Unknown job');
    const status = String(row && row.status || 'UNKNOWN');
    const progress = row && row.progress != null ? String(row.progress) + '%' : '0%';
    const episodeId = String(row && row.episodeId || row && row.episode && row.episode.id || '').trim();
    const episodeLabel = row && row.episode && typeof row.episode === 'object' && row.episode !== null
      ? String(row.episode.topic || episodeId || 'Episode')
      : (episodeId || 'Episode');
    const inspectLinks = [
      '<a href="/ui/jobs/' + encodeURIComponent(id) + '">Detail</a>',
      episodeId ? '<a href="/ui/episodes/' + encodeURIComponent(episodeId) + '">Episode</a>' : '',
      episodeId ? '<a href="/ui/artifacts?episodeId=' + encodeURIComponent(episodeId) + '">Artifacts</a>' : ''
    ].filter(Boolean).join('');
    return '<div class="ops-inline-card ops-object-card">' +
      '<span class="ops-object-kicker">Recent job</span>' +
      '<div class="inline-actions"><span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span><span class="muted-text">' + esc(progress) + '</span></div>' +
      '<strong>' + esc(type) + '</strong>' +
      '<span class="muted-text">' + esc(id) + '</span>' +
      '<span class="muted-text">' + esc(episodeLabel) + '</span>' +
      '<div class="quick-links">' + inspectLinks + '</div>' +
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
        episodeRoot.innerHTML = '<div class="error">Failed to load episodes: ' + esc(episodesRes.status) + '</div>';
      }
      if (!jobsRes.ok) {
        jobRoot.innerHTML = '<div class="error">Failed to load jobs: ' + esc(jobsRes.status) + '</div>';
      }
    } catch (error) {
      const message = esc(error instanceof Error ? error.message : String(error));
      episodeRoot.innerHTML = '<div class="error">Failed to load episodes: ' + message + '</div>';
      jobRoot.innerHTML = '<div class="error">Failed to load jobs: ' + message + '</div>';
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
        tr.dataset.listStatus = status;
        statusCell.innerHTML = '<div class="ops-cell-stack"><div class="ops-cell-title"><span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span></div><span class="ops-cell-meta">' + (/(RUNNING|QUEUED|PENDING)/.test(status) ? 'Watch for stale active episodes and jump into detail before rerunning.' : 'Use the object status before dropping into lower-level evidence.') + '</span></div>';
      }
      if (latestCell instanceof HTMLTableCellElement) {
        const latest = Array.isArray(row.jobs) && row.jobs.length > 0 ? row.jobs[0] : null;
        const latestText = latest && typeof latest === 'object'
          ? String(latest.type || '-') + ' (' + String(latest.status || '-') + ')'
          : '-';
        latestCell.innerHTML = '<div class="ops-cell-stack"><strong>' + esc(latestText) + '</strong><span class="ops-cell-meta">' + (/(FAILED|ERROR)/.test(latestText) ? 'Latest job failed. Compare, recover, and artifacts stay adjacent.' : 'Latest job remains the lifecycle anchor for compare and publish.') + '</span></div>';
      }
    });
    window.dispatchEvent(new Event('list-power:sync'));
  };
  const stamp = () => {
    if (!(lastUpdated instanceof HTMLElement)) return;
    lastUpdated.textContent = new Date().toLocaleTimeString();
  };
  const poll = async (label) => {
    setLive(label || 'Refreshing episode states...', 'notice');
    try {
      const res = await fetch('/api/episodes', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('poll failed: ' + res.status);
      const json = await res.json();
      const data = Array.isArray(json && json.data) ? json.data : [];
      updateRows(data);
      stamp();
      setLive('Episode states are current.', 'notice');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLive('Refresh failed: ' + message, 'error');
    }
  };
  let timer = null;
  const start = () => {
    if (!(autoRefresh instanceof HTMLInputElement) || !autoRefresh.checked || document.hidden || timer !== null) return;
    timer = setInterval(() => { void poll('Refreshing episode states...'); }, 7000);
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
        setLive('Auto refresh enabled.', 'notice');
        void poll('Refreshing episode states...');
        start();
        return;
      }
      stop();
      setLive('Auto refresh paused. Use manual refresh when needed.', 'notice');
    });
  }
  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }
    void poll('Refreshing episode states...');
    start();
  };
  void poll('Refreshing episode states...');
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
      <span class="eyebrow">운영 보드</span>
      <h1>대시보드</h1>
      <p class="section-intro">오늘의 blocker, 다음 안전 액션, 최근 오브젝트를 위에서 먼저 읽고 detail과 recover로 내려가는 surface입니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/episodes">에피소드</a><a href="/ui/jobs">작업</a><a href="/ui/hitl">HITL</a><a href="/ui/health">상태</a></div>
  </div>
  <div class="ops-kpi-grid">
    ${renderMetricCard("Overall", input.overall, "전체 상태를 먼저 보고 그 아래 action rail로 내려갑니다.")}
    ${renderMetricCard("DB", input.dbStatus, "오브젝트 메타데이터와 episode detail 흐름이 여기에 걸립니다.")}
    ${renderMetricCard("Redis", input.redisStatus, "queue coordination과 worker handoff 상태를 빠르게 읽습니다.")}
    ${renderMetricCard("Minio", input.minioStatus, "artifacts와 publish 승격이 storage 정합 위에서만 안전합니다.")}
    ${renderMetricCard("Queue Ready", input.queueReady, "false면 enqueue와 retry보다 recovery를 먼저 진행합니다.")}
  </div>
</section>

${renderRailSection({
  title: "오늘의 blocker",
  intro: "새 작업보다 차단 요인을 먼저 해소해야 list -> detail -> recover 흐름이 안정됩니다.",
  linksHtml: '<a href="/ui/health">상태 열기</a><a href="/ui/jobs">작업</a><a href="/ui/artifacts">산출물</a>',
  cards: [
    {
      title: "플랫폼 상태",
      intro: "down 또는 degraded면 작업 생성과 승격을 모두 멈추고 health에서 복구합니다.",
      tone: healthTone,
      bodyHtml: `<div class="ops-summary-line"><span>Current</span><span>${input.overall}</span></div>`,
      linksHtml: '<a href="/ui/health">상태</a>'
    },
    {
      title: "Queue / retry 차단",
      intro: "queue ready가 false면 enqueue, retry, HITL handoff 모두 지연될 수 있습니다.",
      tone: queueTone,
      bodyHtml: `<div class="ops-summary-line"><span>Queue ready</span><span>${input.queueReady}</span></div>`,
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/health">상태</a>'
    },
    {
      title: "Artifacts / publish 차단",
      intro: "storage가 흔들리면 linked outputs와 publish 승격이 동시에 막힙니다.",
      tone: storageTone,
      bodyHtml: `<div class="ops-summary-line"><span>Storage</span><span>${input.minioStatus}</span></div>`,
      linksHtml: '<a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

${renderRailSection({
  title: "다음 안전 액션",
  intro: "preview -> full -> publish / recover 순서를 고정해 운영 사고를 줄입니다.",
  cards: [
    {
      title: "안전한 시작: preview",
      intro: "가장 작은 성공 경로를 먼저 만들어 현재 surface를 안정화합니다.",
      tone: "ok",
      bodyHtml: `<form method="post" action="/ui/actions/generate-preview" class="ops-form-shell"><div class="field"><label for="preview-topic">Preview topic</label><input id="preview-topic" name="topic" value="UI preview demo"/><small>가벼운 preview로 queue, render, artifacts 흐름을 먼저 확인합니다.</small></div><div class="field"><label for="preview-duration">Target duration (sec)</label><input id="preview-duration" name="targetDurationSec" inputmode="numeric" value="600"/><small>짧은 길이에서 먼저 상태와 산출물 정합을 확인합니다.</small></div><div class="actions"><button type="submit">Preview render 시작</button></div></form>`
    },
    {
      title: "승격 경로: full",
      intro: "preview가 정상일 때만 full render와 package handoff를 진행합니다.",
      tone: "warn",
      bodyHtml: `<form method="post" action="/ui/actions/generate-full" class="ops-form-shell"><div class="field"><label for="full-topic">Full topic</label><input id="full-topic" name="topic" value="UI full pipeline demo"/><small>full render, package, downstream publish handoff를 한 오브젝트 흐름으로 묶습니다.</small></div><div class="field"><label for="full-duration">Target duration (sec)</label><input id="full-duration" name="targetDurationSec" inputmode="numeric" value="600"/><small>preview와 같은 오브젝트 id를 유지한 채 승격합니다.</small></div><div class="actions"><button type="submit" class="secondary">Full render 시작</button></div></form>`
    },
    {
      title: "복구 / 데모",
      intro: "차단 요인이 없을 때만 full demo를 실행하고, 막히면 linked objects로 돌아갑니다.",
      tone: "muted",
      bodyHtml: `<form method="post" action="/ui/actions/demo-extreme" class="ops-form-shell"><div class="field"><label>Demo Extreme</label><small>생성, render, package를 한 번에 돌리는 점검 루프입니다. blocker가 남아 있으면 사용하지 않습니다.</small></div><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="Demo Extreme 실행">Demo Extreme 실행</button></div></form>`,
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/hitl">HITL</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

${renderRailSection({
  title: "최근 오브젝트",
  intro: "목록으로 바로 내려가기 전에 최근 episode와 job을 위에서 읽고 적절한 detail로 이동합니다.",
  linksHtml: '<a href="/ui/episodes">전체 에피소드</a><a href="/ui/jobs">전체 작업</a>',
  cards: [
    {
      title: "최근 episodes",
      intro: "현재 queue와 artifacts 흐름을 가장 빨리 보여 주는 object 집합입니다.",
      tone: "muted",
      bodyHtml: `<div id="dashboard-recent-episodes" class="ops-shell"><div class="notice">Loading recent episodes...</div></div>`
    },
    {
      title: "최근 jobs",
      intro: "retry, recovery, publish hold 판단을 위에서 바로 읽습니다.",
      tone: "muted",
      bodyHtml: `<div id="dashboard-recent-jobs" class="ops-shell"><div class="notice">Loading recent jobs...</div></div>`
    },
    {
      title: "흐름 고정",
      intro: "list -> detail -> recover -> publish 흐름을 화면마다 같은 순서로 유지합니다.",
      tone: "ok",
      items: [
        { label: "list", detail: "에피소드와 작업 리스트에서 object와 next action을 먼저 읽습니다." },
        { label: "detail", detail: "실패 context와 linked objects는 raw evidence보다 위에 둡니다." },
        { label: "recover / publish", detail: "복구와 승격은 artifacts 정합을 거친 뒤에만 진행합니다." }
      ],
      linksHtml: '<a href="/ui/episodes">에피소드</a><a href="/ui/jobs">작업</a><a href="/ui/hitl">HITL</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

${renderRailSection({
  title: "Saved view launchpad",
  intro: "Use the dashboard as the entry point for URL-backed list views. Jobs and episodes apply the full local saved-view contract, while benchmark and rollout presets deep-link into the shell search contract that already exists.",
  cards: [
    {
      title: "Failed jobs",
      intro: "Open the jobs list with the failed-job preset and keep retry, recover, and publish handoff in one URL.",
      tone: "bad",
      items: [
        { label: "saved view", detail: "jobsView=failed-jobs keeps the failed-job tag filter active." },
        { label: "compare selection", detail: "Bulk compare stays on the jobs list and hands off through jobsCompare in the URL." }
      ],
      linksHtml: '<a href="/ui/jobs?jobsView=failed-jobs">View</a><a href="/ui/jobs?jobsView=failed-jobs#jobs-list-power">Compare</a>'
    },
    {
      title: "Stale episodes",
      intro: "Open episodes with the stale preset so active rows older than the safe window stay above fresh work.",
      tone: "warn",
      items: [
        { label: "saved view", detail: "episodesView=stale-episodes keeps stale active rows pinned without changing the global queue." },
        { label: "deep links", detail: "Row actions still hand off to detail, A/B compare, rollback, artifacts, and publish." }
      ],
      linksHtml: '<a href="/ui/episodes?episodesView=stale-episodes">View</a><a href="/ui/episodes?episodesView=stale-episodes#episodes-list-power">Compare</a>'
    },
    {
      title: "Benchmark regressions",
      intro: "This route is still rendered in uiRoutes.ts, so the dashboard exposes a URL-backed regression deep link instead of an in-file saved-view implementation.",
      tone: "warn",
      items: [
        { label: "shell contract", detail: "The shell search field already hydrates from filter-benchmark-regression-table." },
        { label: "handoff", detail: "Use the benchmark regression section before candidate compare or rollout detail." }
      ],
      linksHtml: '<a href="/ui/benchmarks?filter-benchmark-regression-table=blocked#benchmark-regressions">View</a>'
    },
    {
      title: "Rollout blocked only",
      intro: "Rollouts also stay owned by uiRoutes.ts today, so the dashboard uses the existing shell search param to launch blocked-only review.",
      tone: "bad",
      items: [
        { label: "shell contract", detail: "The rollout queue search already mirrors its filter into the URL." },
        { label: "handoff", detail: "Review blocked signals before compare-before-promote or artifact detail." }
      ],
      linksHtml: '<a href="/ui/rollouts?filter=blocked#rollout-signal-table">View</a>'
    }
  ]
})}
${buildDashboardRecentObjectsScript()}`;
}

export function buildEpisodesPageBody(input: EpisodesPageBodyInput): string {
  const t = UI_TEXT.episodes;
  const rowsHtml = input.rows ? renderPoweredEpisodeRows(input.rows) : "";
  const listPowerSurface = renderListPowerSurface({
    rootId: "episodes-list-power",
    pageKey: "episodes",
    tableId: "episodes-table",
    title: "Saved views + compare handoff",
    intro: "Keep episode list power on the same contract as jobs: local saved views, URL-synced filters, compare selection, rollback handoff, and publish approval when the latest job is clean.",
    presets: [
      { id: "stale-episodes", label: "Stale episodes", note: "Active episodes older than the safe window.", tags: ["active", "stale"], match: "all" },
      { id: "failed-episodes", label: "Failed latest jobs", note: "Episodes whose latest known job failed and should recover first.", tags: ["failed"], match: "all" },
      { id: "publish-ready-episodes", label: "Publish ready", note: "Episodes whose latest job is ready for artifacts and publish handoff.", tags: ["publish-ready"], match: "all" }
    ],
    searchInputIds: ["episodes-filter"],
    viewParam: "episodesView",
    compareParam: "episodesCompare",
    compareTitle: "Episode compare handoff",
    compareIntro: "Selection stays on the list surface first. Jump into detail, A/B compare, rollback, artifacts, or publish without losing the current filter state.",
    compareEmpty: "Select one or more episode objects to keep compare, rollback, and publish handoffs together.",
    selectionHint: "Saved views stay local. Search, active view, and compare selection stay mirrored into the URL."
  });

  return `
${renderOpsStyle()}
${listPowerSurface}
<section class="card dashboard-shell ops-shell">
  ${input.flash}
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">에피소드 리스트</span>
      <h1>${t.title}</h1>
      <p class="section-intro">list 화면에서 object, live state, next action을 먼저 읽고 detail과 recover로 내려가는 흐름을 맞춥니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">${t.quickLinksJobs}</a><a href="/ui/artifacts">${t.quickLinksArtifacts}</a><a href="/ui/publish">퍼블리시</a></div>
  </div>
  <div class="ops-kpi-grid">
    ${renderMetricCard("오브젝트", "<strong>topic, channel, duration</strong>", "row마다 같은 object grammar로 읽습니다.")}
    ${renderMetricCard("live 상태", "<strong>status + latest job</strong>", "자동 refresh가 status와 latest job만 조용히 갱신합니다.")}
    ${renderMetricCard("인계", "<strong>jobs -> artifacts -> publish</strong>", "리스트에서 detail, recover, 승격 경로를 같은 순서로 유지합니다.")}
  </div>
</section>

${renderRailSection({
  title: "리스트 control",
  intro: "필터, live status, row action rhythm을 표 위에서 먼저 고정합니다.",
  cards: [
    {
      title: "로컬 필터",
      intro: "id, topic, status 단어로 현재 표를 줄인 다음 첫 행에서 detail로 이동합니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "episodes-filter",
        targetId: "episodes-table",
        label: "에피소드 필터",
        placeholder: t.tableFilterPlaceholder,
        urlParam: "episodesFilter",
        hint: `${t.localFilterHint} / 필요하면 전역 검색으로 바로 이동할 수 있습니다.`
      })
    },
    {
      title: "Live status",
      intro: "표 전체를 다시 읽지 않고 status와 latest job만 조용히 갱신합니다.",
      tone: "ok",
      bodyHtml: `<div class="ops-form-shell"><div class="ops-toolbar"><label class="toggle-pill" for="episodes-auto-refresh"><input id="episodes-auto-refresh" type="checkbox" checked/> Auto refresh</label><button id="episodes-refresh-now" type="button" class="secondary">지금 새로고침</button></div><div class="ops-summary-line"><span>마지막 갱신</span><span id="episodes-last-updated" class="muted-text">첫 갱신 대기 중</span></div><div id="episodes-live-status" class="notice" role="status" aria-live="polite">Episode states will refresh here.</div></div>`
    },
    {
      title: "row action rhythm",
      intro: "모든 row는 object -> state -> latest job -> next action 순서로 읽습니다.",
      tone: "warn",
      items: [
        { label: "object first", detail: "첫 열에서 episode detail로 들어가고 그 안에서 full context를 봅니다." },
        { label: "latest job second", detail: "표 안에서는 latest job과 status만 읽고 raw logs는 detail로 미룹니다." },
        { label: "next action last", detail: "preview, recover, publish handoff는 마지막 열에서만 고릅니다." }
      ]
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>에피소드 오브젝트</h2>
      <p class="section-intro">각 row는 object, live state, latest job, next action 순서로 읽습니다. raw evidence는 detail이나 jobs로 내립니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">${t.quickLinksJobs}</a><a href="/ui/hitl">HITL</a><a href="/ui/health">상태</a></div>
  </div>
  <div class="table-wrap"><table id="episodes-table"><thead><tr><th>episode object / selection</th><th>topic / channel</th><th>status</th><th>latest job / lifecycle</th><th>style / duration</th><th>created / next safe action</th><th>row actions / run profiles</th></tr></thead><tbody>${
    rowsHtml || renderTableEmptyRow(7, t.noEpisodes)
  }</tbody></table></div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "새 episode 생성도 같은 grammar로 묶고, recover와 linked handoff를 별도 카드로 고정합니다.",
  cards: [
    {
      title: "새 episode 시작",
      intro: "기본 컨텍스트와 pipeline 설정을 한 번에 입력하되, 가장 작은 안전 경로부터 선택합니다.",
      tone: "ok",
      bodyHtml: `<form method="post" action="/ui/episodes" class="quick-grid"><div class="form-card"><h3>기본 컨텍스트</h3><div class="field"><label for="episode-topic">주제</label><input id="episode-topic" name="topic" required data-tooltip="예: Q4 실적 분석"/><small>리스트와 detail에서 바로 이해할 수 있는 주제를 사용합니다.</small></div><div class="field"><label for="episode-channel">채널 ID</label><input id="episode-channel" name="channelId"/><small>비워 두면 기본 채널 컨텍스트를 사용합니다.</small></div><div class="field"><label for="episode-duration">목표 길이(초)</label><input id="episode-duration" name="targetDurationSec" value="600" inputmode="numeric"/><small>preview와 full에서 같은 목표 길이를 유지합니다.</small></div></div><div class="form-card"><h3>Pipeline 설정</h3><div class="field"><label for="episode-jobType">작업 타입</label><select id="episode-jobType" name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option></select></div><div class="field"><label for="episode-pipelineMode">Pipeline 모드</label><select id="episode-pipelineMode" name="pipelineMode"><option value="preview">preview</option><option value="full">full</option><option value="manual">manual</option></select></div><div class="field"><label for="episode-stylePreset">스타일 프리셋</label><select id="episode-stylePreset" name="stylePresetId">${input.styleOptions}</select><small>비교와 반복 실행이 필요하면 프리셋을 고정합니다.</small></div><div class="field"><label for="episode-hookBoost">Hook boost (0~1)</label><input id="episode-hookBoost" type="range" name="hookBoost" min="0" max="1" step="0.05" value="${input.defaultHookBoost}" oninput="this.nextElementSibling.value=this.value"/><output>${input.defaultHookBoost}</output></div><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="에피소드 생성 및 enqueue">${t.createAndEnqueue}</button></div></div></form>`
    },
    {
      title: "복구 경로",
      intro: "row에서 막히면 jobs와 HITL에서 recover하고, outputs가 생기면 artifacts로 handoff 합니다.",
      tone: "warn",
      items: [
        { label: "실패 / 정체", detail: "latest job detail을 먼저 열어 lastError와 retry 가능 여부를 확인합니다." },
        { label: "HITL", detail: "shot 단위 복구가 필요하면 list를 벗어나지 않고 HITL 큐로 이동합니다." },
        { label: "artifacts", detail: "출력이 생긴 뒤에만 output presence와 QC를 확인합니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/hitl">HITL</a><a href="/ui/artifacts">산출물</a>'
    },
    {
      title: "승격 handoff",
      intro: "list에서 바로 publish를 누르기보다 episode detail과 artifacts를 거친 뒤 승격합니다.",
      tone: "ok",
      items: [
        { label: "detail", detail: "오브젝트 상태와 latest job을 detail에서 확정합니다." },
        { label: "artifacts", detail: "preview / final / QC 정합을 확인합니다." },
        { label: "publish", detail: "정합이 맞는 경우에만 같은 episode id로 승격합니다." }
      ],
      linksHtml: '<a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}${buildEpisodesLiveMonitorScript()}${renderListPowerScript()}`;
}
