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
.ops-shell{display:grid;gap:10px}
.ops-titlebar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-titleblock{display:grid;gap:4px;max-width:720px}
.ops-titleblock h1,.ops-titleblock h2{margin-bottom:0}
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid,.ops-rail-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.ops-kpi,.ops-lane,.ops-resource-card,.ops-inline-card{display:grid;gap:6px;padding:10px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fff,#f7fbfc);border-radius:12px}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:800}
.ops-callout{display:grid;gap:6px;padding:10px;border-radius:12px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fbfefd,#f2f8f9)}
.ops-callout h3,.ops-lane h3,.ops-resource-card h3{margin:0;font-size:14px}
.ops-callout p,.ops-lane p,.ops-resource-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-callout.warn{border-color:#edd2ac;background:linear-gradient(180deg,#fffaf1,#fff3df)}
.ops-callout.bad{border-color:#efc5c8;background:linear-gradient(180deg,#fff7f7,#fff1f2)}
.ops-callout.ok{border-color:#bcdccf;background:linear-gradient(180deg,#f5fcf7,#edf8f0)}
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
.ops-table-shell{display:grid;gap:10px}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.search-cluster{display:grid;gap:6px;padding:10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}
.search-cluster input{width:100%}
.search-cluster .muted-text{line-height:1.4}
.ops-resource-list ul{margin:0;padding-left:18px;display:grid;gap:8px}
.ops-resource-list li{line-height:1.5}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{text-decoration:none}
.ops-detail-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.ops-form-shell{display:grid;gap:10px}
.ops-object-shell{display:grid;gap:12px}
.ops-object-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-object-title{display:grid;gap:6px;max-width:760px}
.ops-object-title h1,.ops-object-title h2{margin:0}
.ops-summary-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.ops-summary-card{display:grid;gap:4px;padding:10px 12px;border:1px solid #d6e4ea;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f7fbfc)}
.ops-summary-card.tone-ok{border-color:#cbe6d7;background:linear-gradient(180deg,#effcf7,#ffffff)}
.ops-summary-card.tone-warn{border-color:#ecd9ad;background:linear-gradient(180deg,#fff8ea,#fffdf7)}
.ops-summary-card.tone-bad{border-color:#efc4c4;background:linear-gradient(180deg,#fff4f4,#fffdfd)}
.ops-summary-card.tone-muted{border-color:#dbe5ef;background:linear-gradient(180deg,#f7fafc,#ffffff)}
.ops-summary-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#486173}
.ops-summary-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:15px;font-weight:800}
.ops-summary-hint{color:#4f6470;line-height:1.45}
.ops-lifecycle-shell{display:grid;gap:8px;padding:12px;border:1px solid #dbe5ef;border-radius:14px;background:linear-gradient(180deg,#f8fbfd,#ffffff)}
.ops-lifecycle-shell h2{margin:0;font-size:15px}
.ops-lifecycle-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.ops-lifecycle-step{display:grid;gap:4px;padding:10px;border-radius:12px;border:1px dashed #cbd7e1;background:#ffffff}
.ops-lifecycle-step.tone-ok{border-color:#b8dcc7;background:#f3fcf6}
.ops-lifecycle-step.tone-warn{border-color:#ead3a2;background:#fffaf0}
.ops-lifecycle-step.tone-bad{border-color:#e8b9bd;background:#fff6f6}
.ops-lifecycle-step.tone-muted{border-color:#d4dfe8;background:#f8fbfd}
.ops-lifecycle-label{font-size:12px;font-weight:800;color:#173040;text-transform:uppercase;letter-spacing:.06em}
.ops-lifecycle-detail{color:#4f6470;line-height:1.45}
.ops-cell-stack{display:grid;gap:6px}
.ops-cell-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ops-cell-title strong{font-size:14px}
.ops-cell-meta{color:#4f6470;line-height:1.45}
.ops-link-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ops-link-row form{margin:0;display:inline-flex;align-items:center}
.ops-link-row a,.ops-link-row button{white-space:nowrap}
.ops-log-table pre{margin:0;max-height:220px;overflow:auto}
@media (max-width:720px){.ops-titleblock{max-width:none}}
</style>`;

function renderOpsStyle(): string {
  return OPERATOR_PATTERN_STYLE + renderListPowerStyle();
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

type ListPowerPresetInput = {
  id: string;
  label: string;
  note: string;
  tags?: string[];
  match?: "all" | "any";
  search?: Record<string, string>;
};

type ListPowerSurfaceInput = {
  rootId: string;
  pageKey: string;
  tableId: string;
  title: string;
  intro: string;
  presets: ListPowerPresetInput[];
  searchInputIds: string[];
  viewParam: string;
  compareParam: string;
  compareTitle: string;
  compareIntro: string;
  compareEmpty: string;
  selectionHint: string;
};

type ListPowerCompareMeta = {
  checkboxId: string;
  compareId: string;
  label: string;
  meta?: string;
  viewHref?: string;
  compareHref?: string;
  retryHref?: string;
  recoverHref?: string;
  approveHref?: string;
  rollbackHref?: string;
  artifactsHref?: string;
  copyValue?: string;
};

export type ListPowerActionInput =
  | {
      kind: "link";
      label: string;
      href: string;
      hidden?: boolean;
    }
  | {
      kind: "submit";
      label: string;
      action: string;
      fields?: Array<{ name: string; value: string }>;
      hidden?: boolean;
      disabled?: boolean;
    }
  | {
      kind: "compare";
      label: string;
      checkboxId: string;
      hidden?: boolean;
    }
  | {
      kind: "copy";
      label: string;
      value: string;
      hidden?: boolean;
    };

function sanitizeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderListPowerStyle(): string {
  return `<style>
.list-power-shell{display:grid;gap:12px}
.list-power-grid,.list-power-compare-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.list-power-card,.list-power-compare-card{display:grid;gap:8px;padding:12px;border:1px solid #d8e4ec;border-radius:14px;background:linear-gradient(180deg,#fff,#f7fbfc)}
.list-power-card h3,.list-power-compare-card h3{margin:0;font-size:15px}
.list-power-card p,.list-power-compare-card p{margin:0;color:#4f6470;line-height:1.5}
.list-power-chip-row,.list-power-action-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.list-power-chip,.list-power-custom-chip button{border:1px solid #c8d8e5;border-radius:999px;background:#fff;color:#173040;font-size:12px;font-weight:700;padding:6px 10px}
.list-power-chip.is-active,.list-power-custom-chip button.is-active{border-color:#0f766e;background:#e8f7f5;color:#0f5c58}
.list-power-custom-chip{display:inline-flex;align-items:center;gap:4px;padding:2px;border:1px solid #d6e2ea;border-radius:999px;background:#fff}
.list-power-custom-chip [data-remove-view]{border:none;background:transparent;color:#64748b;padding:4px 6px}
.list-power-action-row form{margin:0}
.list-power-action,.list-power-action-row button,.list-power-action-row a{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 10px;border-radius:10px;border:1px solid #c7d8e6;background:#fff;color:#173040;font-size:12px;font-weight:700;text-decoration:none}
.list-power-action:hover,.list-power-action-row button:hover,.list-power-action-row a:hover{text-decoration:none;border-color:#0f766e;background:#eef8f6}
.list-power-action[aria-disabled="true"],.list-power-action-row [aria-disabled="true"]{opacity:.55;pointer-events:none}
.list-power-checkbox{display:inline-flex;align-items:center;gap:6px}
.list-power-checkbox input{margin:0}
.list-power-checkbox.is-selected{color:#0f766e;font-weight:700}
.list-power-status{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.list-power-caption{color:#4f6470;line-height:1.45}
.list-power-compare-panel{display:grid;gap:10px;padding:12px;border:1px solid #d8e4ec;border-radius:16px;background:linear-gradient(180deg,#f8fbfd,#fff)}
.list-power-compare-card .list-power-meta{color:#4f6470;line-height:1.45}
.list-power-actions-shell{display:grid;gap:8px}
.list-power-run-profiles{display:grid;gap:6px;padding-top:6px;border-top:1px dashed #d6e2ea}
.list-power-inline-note{color:#4f6470;line-height:1.45}
@media (max-width:720px){.list-power-grid,.list-power-compare-grid{grid-template-columns:1fr}}
</style>`;
}

function renderListPowerButton(label: string, attrs: string): string {
  return `<button type="button" class="list-power-chip" ${attrs}>${label}</button>`;
}

export function renderListPowerSurface(input: ListPowerSurfaceInput): string {
  const presetButtons = input.presets
    .map((preset) =>
      renderListPowerButton(
        preset.label,
        `data-view-id="${escapeAttribute(preset.id)}" data-view-note="${escapeAttribute(preset.note)}"`
      )
    )
    .join("");

  return `<section class="card list-power-shell" id="${input.rootId}" data-list-power-root="1" data-page-key="${escapeAttribute(
    input.pageKey
  )}" data-table-id="${escapeAttribute(input.tableId)}" data-view-param="${escapeAttribute(
    input.viewParam
  )}" data-compare-param="${escapeAttribute(input.compareParam)}" data-search-inputs="${escapeAttribute(
    input.searchInputIds.join(",")
  )}">
  <div class="section-head">
    <div>
      <h2>${input.title}</h2>
      <p class="section-intro">${input.intro}</p>
    </div>
    <div class="list-power-status"><span class="badge muted" data-view-state>all rows</span><span class="badge muted" data-selection-state>0 selected</span></div>
  </div>
  <div class="list-power-grid">
    <article class="list-power-card">
      <div class="stack">
        <h3>Saved views</h3>
        <p>${input.selectionHint}</p>
      </div>
      <div class="list-power-chip-row">
        ${renderListPowerButton("All rows", `data-view-id="all" data-view-note="Reset to the full list"`)}
        ${presetButtons}
      </div>
      <div class="list-power-chip-row" data-custom-views></div>
      <div class="list-power-action-row">
        <button type="button" data-save-view>Save current view</button>
        <button type="button" data-reset-view>Reset view</button>
      </div>
      <div class="list-power-caption" data-view-caption>Saved views stay local to this browser, while filters and selections stay mirrored into the URL.</div>
    </article>
    <article class="list-power-card">
      <div class="stack">
        <h3>Compare selection</h3>
        <p>${input.compareIntro}</p>
      </div>
      <div class="list-power-action-row">
        <label class="list-power-checkbox"><input type="checkbox" data-select-all/> Select visible rows</label>
        <a class="list-power-action" href="#${input.rootId}-compare" data-compare-launch aria-disabled="true">Compare selected</a>
        <button type="button" data-copy-selection data-copy="">Copy ID/path</button>
      </div>
      <div class="list-power-caption" data-selection-caption>${input.selectionHint}</div>
    </article>
  </div>
  <div class="list-power-compare-panel" id="${input.rootId}-compare" data-compare-panel hidden>
    <div class="section-head">
      <div>
        <h3>${input.compareTitle}</h3>
        <p class="section-intro">${input.compareIntro}</p>
      </div>
      <div class="list-power-action-row"><button type="button" data-clear-selection>Clear selection</button></div>
    </div>
    <div class="list-power-compare-grid" data-compare-grid></div>
    <div class="notice" data-compare-empty>${input.compareEmpty}</div>
  </div>
  <script type="application/json" data-list-presets>${serializeInlineJson(input.presets)}</script>
</section>`;
}

function renderHiddenFields(fields: Array<{ name: string; value: string }> = []): string {
  return fields
    .map((field) => `<input type="hidden" name="${escapeAttribute(field.name)}" value="${escapeAttribute(field.value)}"/>`)
    .join("");
}

function renderCompareDataAttrs(meta: ListPowerCompareMeta): string {
  const attrs = {
    "data-compare-select": meta.compareId,
    "data-compare-label": meta.label,
    "data-compare-meta": meta.meta ?? "",
    "data-view-href": meta.viewHref ?? "",
    "data-compare-href": meta.compareHref ?? "",
    "data-retry-href": meta.retryHref ?? "",
    "data-recover-href": meta.recoverHref ?? "",
    "data-approve-href": meta.approveHref ?? "",
    "data-rollback-href": meta.rollbackHref ?? "",
    "data-artifacts-href": meta.artifactsHref ?? "",
    "data-copy-value": meta.copyValue ?? meta.compareId
  };

  return Object.entries(attrs)
    .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
    .join(" ");
}

export function renderListPowerCompareCheckbox(meta: ListPowerCompareMeta): string {
  return `<label class="list-power-checkbox" for="${escapeAttribute(meta.checkboxId)}"><input id="${escapeAttribute(
    meta.checkboxId
  )}" type="checkbox" value="${escapeAttribute(meta.compareId)}" ${renderCompareDataAttrs(meta)}/>Select</label>`;
}

export function renderListPowerActionBar(actions: ListPowerActionInput[]): string {
  const actionHtml = actions
    .filter((action) => !action.hidden)
    .map((action) => {
      if (action.kind === "link") {
        return `<a class="list-power-action" href="${action.href}">${action.label}</a>`;
      }
      if (action.kind === "submit") {
        return `<form method="post" action="${action.action}" class="inline">${renderHiddenFields(action.fields)}<button type="submit" class="list-power-action"${
          action.disabled ? " disabled" : ""
        }>${action.label}</button></form>`;
      }
      if (action.kind === "compare") {
        return `<button type="button" class="list-power-action" data-compare-toggle="${escapeAttribute(action.checkboxId)}">${action.label}</button>`;
      }
      return `<button type="button" class="list-power-action" data-copy="${escapeAttribute(action.value)}">${action.label}</button>`;
    })
    .join("");

  return actionHtml.length > 0 ? `<div class="list-power-action-row">${actionHtml}</div>` : "";
}

export function renderListPowerScript(): string {
  return `<script>(() => {
  if (window.__ecsListPowerBound === '1') return;
  window.__ecsListPowerBound = '1';
  const cleanText = (value) => String(value ?? '').trim();
  const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const parseJson = (text) => {
    try {
      return JSON.parse(String(text || '[]'));
    } catch {
      return [];
    }
  };
  const slugify = (value) => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'saved-view';
  const storageKey = (pageKey) => 'ecs-ui:list-power:v1:' + pageKey;
  const parseKoreanDate = (value) => {
    const match = cleanText(value).match(/^(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})시\\s*(\\d{1,2})분\\s*(\\d{1,2})초$/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  };
  const parseSafeListDate = (value) => {
    const match = cleanText(value).match(/^(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})[^\\d]+(\\d{1,2})[^\\d]+(\\d{1,2})/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  };
  const readSavedViews = (pageKey) => {
    try {
      return parseJson(window.localStorage.getItem(storageKey(pageKey)) || '[]');
    } catch {
      return [];
    }
  };
  const writeSavedViews = (pageKey, views) => {
    try {
      window.localStorage.setItem(storageKey(pageKey), JSON.stringify(views));
    } catch {
      // local storage may be blocked; keep URL-only behavior
    }
  };
  const updateUrlParam = (key, value) => {
    const nextUrl = new URL(window.location.href);
    if (cleanText(value)) nextUrl.searchParams.set(key, value);
    else nextUrl.searchParams.delete(key);
    window.history.replaceState({}, '', nextUrl.pathname + (nextUrl.searchParams.toString() ? '?' + nextUrl.searchParams.toString() : '') + nextUrl.hash);
  };
  const encodeSelection = (values) => values.map((value) => encodeURIComponent(value)).join(',');
  const decodeSelection = (value) =>
    cleanText(value)
      .split(',')
      .map((item) => {
        try {
          return decodeURIComponent(item);
        } catch {
          return item;
        }
      })
      .filter(Boolean);
  const roots = Array.from(document.querySelectorAll('[data-list-power-root="1"]'));
  const isVisibleRow = (row) => row instanceof HTMLTableRowElement && !row.hidden && row.style.display !== 'none';
  roots.forEach((root) => {
    if (!(root instanceof HTMLElement)) return;
    const tableId = cleanText(root.dataset.tableId);
    const table = tableId ? document.getElementById(tableId) : null;
    if (!(table instanceof HTMLTableElement)) return;
    const pageKey = cleanText(root.dataset.pageKey) || tableId;
    const viewParam = cleanText(root.dataset.viewParam) || 'view';
    const compareParam = cleanText(root.dataset.compareParam) || 'compare';
    const comparePanel = root.querySelector('[data-compare-panel]');
    const compareGrid = root.querySelector('[data-compare-grid]');
    const compareEmpty = root.querySelector('[data-compare-empty]');
    const viewState = root.querySelector('[data-view-state]');
    const viewCaption = root.querySelector('[data-view-caption]');
    const selectionState = root.querySelector('[data-selection-state]');
    const selectionCaption = root.querySelector('[data-selection-caption]');
    const customViewsRoot = root.querySelector('[data-custom-views]');
    const compareLaunch = root.querySelector('[data-compare-launch]');
    const copySelectionButton = root.querySelector('[data-copy-selection]');
    const selectAll = root.querySelector('[data-select-all]');
    const searchInputs = cleanText(root.dataset.searchInputs)
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((node) => node instanceof HTMLInputElement);
    const presetNode = root.querySelector('[data-list-presets]');
    const presetViews = Array.isArray(parseJson(presetNode && 'textContent' in presetNode ? presetNode.textContent : '[]'))
      ? parseJson(presetNode && 'textContent' in presetNode ? presetNode.textContent : '[]')
      : [];
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const checkboxes = () => Array.from(table.querySelectorAll('input[data-compare-select]'));
    const loadAllViews = () => {
      const saved = readSavedViews(pageKey);
      return [{ id: 'all', label: 'All rows', note: 'Reset to the full list', tags: [], search: {} }].concat(presetViews, saved);
    };
    const findView = (id) => loadAllViews().find((view) => cleanText(view.id) === cleanText(id)) || null;
    const markDynamicTags = () => {
      rows.forEach((row) => {
        if (!(row instanceof HTMLTableRowElement)) return;
        const tags = new Set(cleanText(row.dataset.listTags).split(/\\s+/).filter(Boolean));
        const status = cleanText(row.dataset.listStatus).toUpperCase();
        const createdAt = parseSafeListDate(row.dataset.listCreatedAt);
        if (createdAt && ['RUNNING', 'PENDING', 'QUEUED'].includes(status)) {
          const ageHours = Math.floor((Date.now() - createdAt.getTime()) / 3600000);
          if (ageHours >= 12) tags.add('stale');
        }
        row.dataset.listTags = Array.from(tags).join(' ');
      });
    };
    const setSearchState = (searchStateMap) => {
      searchInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        const nextValue = Object.prototype.hasOwnProperty.call(searchStateMap || {}, input.id) ? String(searchStateMap[input.id] ?? '') : '';
        if (input.value === nextValue) return;
        input.value = nextValue;
        window.setTimeout(() => {
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, 0);
      });
    };
    const renderCustomViews = () => {
      if (!(customViewsRoot instanceof HTMLElement)) return;
      const activeViewId = cleanText(root.dataset.activeViewId || 'all');
      const saved = readSavedViews(pageKey);
      customViewsRoot.innerHTML = saved
        .map((view) => {
          const id = cleanText(view.id);
          const activeClass = id === activeViewId ? 'is-active' : '';
          return '<span class="list-power-custom-chip"><button type="button" class=\"' + activeClass + '\" data-view-id=\"' + escapeHtml(id) + '\" data-view-note=\"' + escapeHtml(cleanText(view.note || view.label || 'Saved view')) + '\">' + escapeHtml(cleanText(view.label || id)) + '</button><button type="button" data-remove-view=\"' + escapeHtml(id) + '\">x</button></span>';
        })
        .join('');
    };
    const syncViewButtons = () => {
      const activeViewId = cleanText(root.dataset.activeViewId || 'all');
      root.querySelectorAll('[data-view-id]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.classList.toggle('is-active', cleanText(node.dataset.viewId) === activeViewId);
      });
    };
    const currentSearchState = () =>
      searchInputs.reduce((acc, input) => {
        if (input instanceof HTMLInputElement) acc[input.id] = input.value;
        return acc;
      }, {});
    const applyView = (viewId, resetSearch = true) => {
      markDynamicTags();
      const activeId = cleanText(viewId) || 'all';
      root.dataset.activeViewId = activeId;
      const view = findView(activeId);
      if (resetSearch && view && typeof view.search === 'object' && Object.keys(view.search).length > 0) {
        setSearchState(view.search);
      } else if (resetSearch && activeId === 'all') {
        setSearchState({});
      }
      rows.forEach((row) => {
        if (!(row instanceof HTMLTableRowElement)) return;
        const tags = new Set(cleanText(row.dataset.listTags).split(/\\s+/).filter(Boolean));
        const viewTags = Array.isArray(view && view.tags) ? view.tags.map((tag) => cleanText(tag)).filter(Boolean) : [];
        const matchMode = cleanText(view && view.match) === 'any' ? 'any' : 'all';
        const matchesView =
          viewTags.length === 0 ? true : matchMode === 'any' ? viewTags.some((tag) => tags.has(tag)) : viewTags.every((tag) => tags.has(tag));
        row.hidden = !matchesView;
      });
      updateUrlParam(viewParam, activeId === 'all' ? '' : activeId);
      const viewLabel = cleanText(view && view.label) || 'All rows';
      if (viewState instanceof HTMLElement) viewState.textContent = viewLabel;
      if (viewCaption instanceof HTMLElement) viewCaption.textContent = cleanText(view && view.note) || 'Saved views stay local to this browser, while filters and selections stay mirrored into the URL.';
      syncViewButtons();
      renderCustomViews();
      syncSelection(false);
    };
    const selectedBoxes = () => checkboxes().filter((node) => node instanceof HTMLInputElement && node.checked);
    const syncSelection = (writeUrl = true) => {
      const selected = selectedBoxes();
      const visibleBoxes = checkboxes().filter((node) => node instanceof HTMLInputElement && isVisibleRow(node.closest('tr')));
      if (selectAll instanceof HTMLInputElement) {
        selectAll.checked = visibleBoxes.length > 0 && visibleBoxes.every((node) => node.checked);
        selectAll.indeterminate = visibleBoxes.some((node) => node.checked) && !selectAll.checked;
      }
      const selectionCount = selected.length;
      if (selectionState instanceof HTMLElement) selectionState.textContent = selectionCount + ' selected';
      if (selectionCaption instanceof HTMLElement) {
        selectionCaption.textContent =
          selectionCount > 0
            ? 'Selection is mirrored into the URL so the compare handoff can be reopened safely.'
            : 'Select rows to build a compare handoff without leaving the list.';
      }
      if (copySelectionButton instanceof HTMLElement) {
        copySelectionButton.setAttribute('data-copy', selected.map((node) => cleanText(node.dataset.copyValue || node.value)).filter(Boolean).join(', '));
      }
      if (compareLaunch instanceof HTMLAnchorElement) {
        const nextUrl = new URL(window.location.href);
        if (selectionCount > 0) nextUrl.searchParams.set(compareParam, encodeSelection(selected.map((node) => cleanText(node.value)).filter(Boolean)));
        else nextUrl.searchParams.delete(compareParam);
        compareLaunch.href = nextUrl.pathname + (nextUrl.searchParams.toString() ? '?' + nextUrl.searchParams.toString() : '') + '#' + (comparePanel instanceof HTMLElement ? comparePanel.id : '');
        compareLaunch.setAttribute('aria-disabled', selectionCount > 0 ? 'false' : 'true');
      }
      checkboxes().forEach((node) => {
        if (!(node instanceof HTMLInputElement)) return;
        const label = node.closest('.list-power-checkbox');
        if (label instanceof HTMLElement) label.classList.toggle('is-selected', node.checked);
        root.querySelectorAll('[data-compare-toggle="' + node.id + '"]').forEach((toggle) => {
          if (toggle instanceof HTMLElement) toggle.classList.toggle('is-active', node.checked);
        });
      });
      if (comparePanel instanceof HTMLElement && compareGrid instanceof HTMLElement && compareEmpty instanceof HTMLElement) {
        compareGrid.innerHTML = selected
          .map((node) => {
            const label = escapeHtml(cleanText(node.dataset.compareLabel || node.value));
            const meta = escapeHtml(cleanText(node.dataset.compareMeta));
            const actions = [
              node.dataset.viewHref ? '<a class="list-power-action" href="' + escapeHtml(node.dataset.viewHref) + '">View</a>' : '',
              node.dataset.compareHref ? '<a class="list-power-action" href="' + escapeHtml(node.dataset.compareHref) + '">Compare</a>' : '',
              node.dataset.retryHref ? '<a class="list-power-action" href="' + escapeHtml(node.dataset.retryHref) + '">Retry</a>' : '',
              node.dataset.recoverHref ? '<a class="list-power-action" href="' + escapeHtml(node.dataset.recoverHref) + '">Recover</a>' : '',
              node.dataset.approveHref ? '<a class="list-power-action" href="' + escapeHtml(node.dataset.approveHref) + '">Approve</a>' : '',
              node.dataset.rollbackHref ? '<a class="list-power-action" href="' + escapeHtml(node.dataset.rollbackHref) + '">Rollback</a>' : '',
              node.dataset.artifactsHref ? '<a class="list-power-action" href="' + escapeHtml(node.dataset.artifactsHref) + '">Open artifacts</a>' : '',
              '<button type="button" class="list-power-action" data-list-copy="' + escapeHtml(cleanText(node.dataset.copyValue || node.value)) + '">Copy ID/path</button>'
            ]
              .filter(Boolean)
              .join('');
            return '<article class="list-power-compare-card"><h3>' + label + '</h3><p class="list-power-meta">' + (meta || 'Use the object surface first, then follow compare or recovery links.') + '</p><div class="list-power-action-row">' + actions + '</div></article>';
          })
          .join('');
        comparePanel.hidden = selectionCount === 0;
        compareEmpty.hidden = selectionCount > 0;
      }
      if (writeUrl) updateUrlParam(compareParam, selectionCount > 0 ? encodeSelection(selected.map((node) => cleanText(node.value)).filter(Boolean)) : '');
    };
    const loadSelectionFromUrl = () => {
      const fromUrl = new Set(decodeSelection(new URL(window.location.href).searchParams.get(compareParam)));
      checkboxes().forEach((node) => {
        if (!(node instanceof HTMLInputElement)) return;
        node.checked = fromUrl.has(cleanText(node.value));
      });
      syncSelection(false);
    };
    root.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;
      const toggle = target.closest('[data-compare-toggle]');
      if (toggle instanceof HTMLElement) {
        const checkbox = document.getElementById(cleanText(toggle.dataset.compareToggle));
        if (checkbox instanceof HTMLInputElement) {
          checkbox.checked = !checkbox.checked;
          syncSelection();
        }
        return;
      }
      const viewButton = target.closest('[data-view-id]');
      if (viewButton instanceof HTMLElement) {
        applyView(cleanText(viewButton.dataset.viewId));
        return;
      }
      const removeView = target.closest('[data-remove-view]');
      if (removeView instanceof HTMLElement) {
        const nextViews = readSavedViews(pageKey).filter((view) => cleanText(view.id) !== cleanText(removeView.dataset.removeView));
        writeSavedViews(pageKey, nextViews);
        if (cleanText(root.dataset.activeViewId) === cleanText(removeView.dataset.removeView)) applyView('all');
        else renderCustomViews();
        syncViewButtons();
        return;
      }
      if (target.closest('[data-save-view]')) {
        const label = window.prompt('Saved view name');
        if (!cleanText(label)) return;
        const activeView = findView(cleanText(root.dataset.activeViewId || 'all'));
        const nextView = {
          id: 'saved-' + slugify(label),
          label: cleanText(label),
          note: 'Local-only saved view',
          tags: Array.isArray(activeView && activeView.tags) ? activeView.tags : [],
          match: cleanText(activeView && activeView.match) === 'any' ? 'any' : 'all',
          search: currentSearchState()
        };
        const savedViews = readSavedViews(pageKey).filter((view) => cleanText(view.id) !== nextView.id);
        savedViews.push(nextView);
        writeSavedViews(pageKey, savedViews);
        applyView(nextView.id, false);
        return;
      }
      if (target.closest('[data-reset-view]')) {
        applyView('all');
        return;
      }
      if (target.closest('[data-clear-selection]')) {
        checkboxes().forEach((node) => {
          if (node instanceof HTMLInputElement) node.checked = false;
        });
        syncSelection();
        return;
      }
      if (target.closest('[data-list-copy]')) {
        const button = target.closest('[data-list-copy]');
        const value = cleanText(button && button.getAttribute('data-list-copy'));
        if (!value) return;
        navigator.clipboard.writeText(value).catch(() => {});
      }
    });
    if (compareLaunch instanceof HTMLAnchorElement) {
      compareLaunch.addEventListener('click', (event) => {
        if (compareLaunch.getAttribute('aria-disabled') === 'true') event.preventDefault();
      });
    }
    if (selectAll instanceof HTMLInputElement) {
      selectAll.addEventListener('change', () => {
        checkboxes().forEach((node) => {
          if (!(node instanceof HTMLInputElement)) return;
          if (!isVisibleRow(node.closest('tr'))) return;
          node.checked = selectAll.checked;
        });
        syncSelection();
      });
    }
    table.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches('input[data-compare-select]')) syncSelection();
    });
    searchInputs.forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.addEventListener('input', () => {
        if (viewState instanceof HTMLElement) viewState.textContent = cleanText(findView(cleanText(root.dataset.activeViewId || 'all'))?.label) || 'All rows';
        syncSelection(false);
      });
    });
    window.addEventListener('list-power:sync', () => {
      applyView(cleanText(root.dataset.activeViewId || 'all'), false);
    });
    renderCustomViews();
    syncViewButtons();
    markDynamicTags();
    const initialViewId = cleanText(new URL(window.location.href).searchParams.get(viewParam)) || 'all';
    applyView(initialViewId, initialViewId !== 'all');
    loadSelectionFromUrl();
  });
})();</script>`;
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

type OpsSummaryCardInput = {
  label: string;
  valueHtml: string;
  hint: string;
  tone?: OpsRailTone;
};

type OpsLifecycleStepInput = {
  label: string;
  detail: string;
  tone?: OpsRailTone;
};

type OpsObjectSummaryHeaderInput = {
  eyebrow: string;
  title: string;
  intro: string;
  titleTag?: "h1" | "h2";
  flash?: string;
  quickLinksHtml?: string;
  summaryCards: OpsSummaryCardInput[];
  lifecycleTitle?: string;
  lifecycleIntro?: string;
  lifecycleSteps?: OpsLifecycleStepInput[];
  panels?: OpsRailCardInput[];
};

type ParsedTableRow = {
  cells: string[];
};

type ParsedLogEntry = {
  createdAt: string;
  level: string;
  message: string;
  detailsHtml: string;
};

type TableCellLink = {
  href: string;
  label: string;
};

type JobLifecycleSummary = {
  tone: OpsRailTone;
  stageLabel: string;
  latestResult: string;
  retryLabel: string;
  retryDetail: string;
  safeActionLabel: string;
  safeActionDetail: string;
  shouldRecover: boolean;
  shouldPublish: boolean;
  shouldInspectHealth: boolean;
};

function toneToBadgeClass(tone: OpsRailTone): string {
  switch (tone) {
    case "ok":
      return "ok";
    case "warn":
      return "warn";
    case "bad":
      return "bad";
    default:
      return "muted";
  }
}

export function renderToneBadge(label: string, tone: OpsRailTone): string {
  return `<span class="badge ${toneToBadgeClass(tone)}">${label}</span>`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function summarizeText(value: string, max = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseTableRows(rowsHtml: string): ParsedTableRow[] {
  return Array.from(rowsHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((match) => ({
      cells: Array.from(match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((cell) => cell[1].trim())
    }))
    .filter((row) => row.cells.length > 0);
}

export function extractLinks(html: string): TableCellLink[] {
  return Array.from(html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)).map((match) => ({
    href: match[1],
    label: stripHtml(match[2])
  }));
}

export function firstLink(html: string): TableCellLink | null {
  return extractLinks(html)[0] ?? null;
}

export function extractRouteValue(href: string | undefined, segment: string): string {
  if (!href) return "";
  const match = href.match(new RegExp(`/${segment}/([^/?#]+)`));
  return match ? safeDecode(match[1]) : "";
}

function dedupeLinks(links: Array<TableCellLink | null | undefined>): TableCellLink[] {
  const seen = new Set<string>();
  return links.flatMap((link) => {
    if (!link || !link.href || !link.label) return [];
    const key = `${link.href}|${link.label}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [link];
  });
}

function renderActionLinks(links: Array<TableCellLink | null | undefined>, empty = "추가 링크 없음"): string {
  const deduped = dedupeLinks(links);
  if (deduped.length === 0) return `<span class="muted-text">${empty}</span>`;
  return `<div class="ops-link-row">${deduped.map((link) => `<a href="${link.href}">${link.label}</a>`).join("")}</div>`;
}

function renderSummaryCard(input: OpsSummaryCardInput): string {
  const tone = input.tone ?? "muted";
  return `<div class="ops-summary-card tone-${tone}"><span class="ops-summary-label">${input.label}</span><div class="ops-summary-value">${input.valueHtml}</div><div class="ops-summary-hint">${input.hint}</div></div>`;
}

function renderLifecycleStrip(input: {
  title: string;
  intro: string;
  steps: OpsLifecycleStepInput[];
}): string {
  return `<div class="ops-lifecycle-shell"><div class="stack"><h2>${input.title}</h2><p class="section-intro">${input.intro}</p></div><div class="ops-lifecycle-grid">${input.steps
    .map(
      (step) =>
        `<div class="ops-lifecycle-step tone-${step.tone ?? "muted"}"><span class="ops-lifecycle-label">${step.label}</span><span class="ops-lifecycle-detail">${step.detail}</span></div>`
    )
    .join("")}</div></div>`;
}

function renderObjectSummaryHeader(input: OpsObjectSummaryHeaderInput): string {
  const titleTag = input.titleTag ?? "h1";
  const titleHtml = titleTag === "h2" ? `<h2>${input.title}</h2>` : `<h1>${input.title}</h1>`;
  return `<section class="card ops-object-shell"><div class="ops-object-head"><div class="ops-object-title"><span class="eyebrow">${input.eyebrow}</span><div class="stack">${titleHtml}<p class="section-intro">${input.intro}</p></div></div>${
    input.quickLinksHtml ? `<div class="quick-links">${input.quickLinksHtml}</div>` : ""
  }</div>${input.flash ?? ""}<div class="ops-summary-grid">${input.summaryCards.map(renderSummaryCard).join("")}</div>${
    input.lifecycleSteps?.length
      ? renderLifecycleStrip({
          title: input.lifecycleTitle ?? "object lifecycle",
          intro: input.lifecycleIntro ?? "상태와 안전 액션을 위에서 고정합니다.",
          steps: input.lifecycleSteps
        })
      : ""
  }${input.panels?.length ? `<div class="ops-rail-grid">${input.panels.map(renderRailCard).join("")}</div>` : ""}</section>`;
}

function extractLastErrorText(errorStackHtml: string): string {
  const preMatch = errorStackHtml.match(/<pre>([\s\S]*?)<\/pre>/i);
  const raw = stripHtml(preMatch?.[1] ?? errorStackHtml)
    .replace(/^lastError 스택 열기\/닫기\s*/i, "")
    .replace(/^lastError:\s*/i, "");
  return summarizeText(raw || "기록된 lastError 없음", 160);
}

function parseLogEntries(logRowsHtml: string): ParsedLogEntry[] {
  return parseTableRows(logRowsHtml)
    .filter((row) => row.cells.length >= 4)
    .map((row) => ({
      createdAt: stripHtml(row.cells[0]) || "-",
      level: stripHtml(row.cells[1]) || "-",
      message: stripHtml(row.cells[2]) || "(메시지 없음)",
      detailsHtml: row.cells[3] ?? ""
    }));
}

function toneFromLogLevel(level: string): OpsRailTone {
  const normalized = level.trim().toUpperCase();
  if (/(ERROR|FAIL|실패)/.test(normalized)) return "bad";
  if (/(WARN|경고)/.test(normalized)) return "warn";
  if (/(INFO|완료|성공)/.test(normalized)) return "ok";
  return "muted";
}

function describeJobLifecycle(statusText: string, progressText: string, latestMessage = ""): JobLifecycleSummary {
  const normalized = statusText.trim().toUpperCase();
  const progressLabel = progressText.trim().length > 0 ? progressText : "0%";
  if (/(FAILED|실패)/.test(normalized)) {
    return {
      tone: "bad",
      stageLabel: "recover",
      latestResult: latestMessage || "최근 실행이 실패 경로에서 멈췄습니다.",
      retryLabel: "retry 가능",
      retryDetail: "FAILED 상태라면 detail에서 바로 retry 여부를 확인할 수 있습니다.",
      safeActionLabel: "detail -> retry / recover",
      safeActionDetail: "lastError와 retryability를 먼저 본 뒤 HITL 또는 health로 넘깁니다.",
      shouldRecover: true,
      shouldPublish: false,
      shouldInspectHealth: true
    };
  }
  if (/(SUCCEEDED|COMPLETED|SUCCESS|성공)/.test(normalized)) {
    return {
      tone: "ok",
      stageLabel: "handoff",
      latestResult: latestMessage || `최근 실행이 handoff 후보입니다. 진행률 ${progressLabel}에서 종료되었습니다.`,
      retryLabel: "retry 불필요",
      retryDetail: "성공 경로에서는 retry보다 artifacts와 publish handoff 검증이 우선입니다.",
      safeActionLabel: "episode -> artifacts -> publish",
      safeActionDetail: "소유 episode와 linked outputs 정합을 확인한 뒤에만 승격으로 넘깁니다.",
      shouldRecover: false,
      shouldPublish: true,
      shouldInspectHealth: false
    };
  }
  if (/(RUNNING|실행 중)/.test(normalized)) {
    return {
      tone: "warn",
      stageLabel: "in flight",
      latestResult: latestMessage || `작업이 아직 실행 중입니다. 현재 진행률은 ${progressLabel}입니다.`,
      retryLabel: "retry 잠김",
      retryDetail: "종료 전까지는 retry를 열지 말고 stuck 여부를 먼저 확인합니다.",
      safeActionLabel: "detail -> health",
      safeActionDetail: "중복 실행을 피하려면 latest result와 상태 화면을 함께 확인합니다.",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: true
    };
  }
  if (/(QUEUED|PENDING|대기)/.test(normalized)) {
    return {
      tone: "muted",
      stageLabel: "queued",
      latestResult: latestMessage || "아직 worker에 배정되지 않았거나 queue에서 대기 중입니다.",
      retryLabel: "retry 잠김",
      retryDetail: "실행이 시작되기 전에는 retry보다 queue 상태 확인이 우선입니다.",
      safeActionLabel: "detail -> health",
      safeActionDetail: "queue, worker, duplicate job 여부를 먼저 확인합니다.",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: true
    };
  }
  if (/(CANCELLED|취소)/.test(normalized)) {
    return {
      tone: "warn",
      stageLabel: "inspect",
      latestResult: latestMessage || "작업이 취소되어 종료되었습니다.",
      retryLabel: "inspect first",
      retryDetail: "왜 취소되었는지 확인한 뒤에만 retry 또는 대체 경로를 고릅니다.",
      safeActionLabel: "detail -> episode",
      safeActionDetail: "취소 원인과 owning episode 문맥을 먼저 확인합니다.",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: false
    };
  }
  return {
    tone: "muted",
    stageLabel: "inspect",
    latestResult: latestMessage || `상태 ${statusText || "-"} 에서 추가 판단이 필요합니다.`,
    retryLabel: "inspect first",
    retryDetail: "retryability와 blockers를 detail에서 먼저 확인합니다.",
    safeActionLabel: "detail",
    safeActionDetail: "원시 evidence보다 먼저 object summary와 linked objects를 읽습니다.",
    shouldRecover: false,
    shouldPublish: false,
    shouldInspectHealth: false
  };
}

function renderJobsTableRows(rowsHtml: string): string {
  const rows = parseTableRows(rowsHtml).filter((row) => row.cells.length >= 6);
  if (rows.length === 0) return rowsHtml;

  return rows
    .map((row) => {
      const jobLink = firstLink(row.cells[0]);
      const episodeLink = firstLink(row.cells[1]);
      const episodeId = extractRouteValue(episodeLink?.href, "episodes");
      const typeText = stripHtml(row.cells[2]) || "-";
      const statusMarkup = row.cells[3] || '<span class="badge muted">unknown</span>';
      const statusText = stripHtml(statusMarkup) || "unknown";
      const progressText = stripHtml(row.cells[4]) || "-";
      const createdText = stripHtml(row.cells[5]) || "-";
      const lifecycle = describeJobLifecycle(statusText, progressText);
      const linkedObjectLinks = renderActionLinks(
        [
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null,
          episodeId && lifecycle.shouldPublish ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "linked object 없음"
      );
      const nextActionLinks = renderActionLinks(
        [
          jobLink ? { href: jobLink.href, label: "detail" } : null,
          lifecycle.shouldRecover ? { href: episodeId ? `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}` : "/ui/hitl", label: "recover" } : null,
          lifecycle.shouldInspectHealth ? { href: "/ui/health", label: "health" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId && lifecycle.shouldPublish ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "detail에서 다음 액션을 확인하세요."
      );

      return `<tr><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        jobLink ? `<a href="${jobLink.href}">${jobLink.label}</a>` : stripHtml(row.cells[0]) || "-"
      }</strong>${renderToneBadge(lifecycle.stageLabel, lifecycle.tone)}</div><span class="ops-cell-meta">list -> detail -> recover 흐름의 anchor job object입니다.</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "연결된 owner episode 정보가 없습니다."
      }</span>${linkedObjectLinks}</div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${typeText}</strong></div><span class="ops-cell-meta">${lifecycle.latestResult}</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title">${statusMarkup}${renderToneBadge(
        lifecycle.retryLabel,
        lifecycle.shouldRecover ? "bad" : lifecycle.tone
      )}</div><span class="ops-cell-meta">${lifecycle.retryDetail}</span></div></td><td><div class="ops-cell-stack"><strong>${progressText}</strong><span class="ops-cell-meta">${createdText}</span></div></td><td><div class="ops-cell-stack"><strong>${lifecycle.safeActionLabel}</strong><span class="ops-cell-meta">${lifecycle.safeActionDetail}</span>${nextActionLinks}</div></td></tr>`;
    })
    .join("");
}

function renderPoweredJobsTableRows(rowsHtml: string): string {
  const rows = parseTableRows(rowsHtml).filter((row) => row.cells.length >= 6);
  if (rows.length === 0) return rowsHtml;

  return rows
    .map((row) => {
      const jobLink = firstLink(row.cells[0]);
      const episodeLink = firstLink(row.cells[1]);
      const episodeId = extractRouteValue(episodeLink?.href, "episodes");
      const jobId = jobLink?.label || stripHtml(row.cells[0]) || "-";
      const typeText = stripHtml(row.cells[2]) || "-";
      const statusMarkup = row.cells[3] || '<span class="badge muted">unknown</span>';
      const statusText = stripHtml(statusMarkup) || "unknown";
      const progressText = stripHtml(row.cells[4]) || "-";
      const createdText = stripHtml(row.cells[5]) || "-";
      const lifecycle = describeJobLifecycle(statusText, progressText);
      const checkboxId = `jobs-compare-${sanitizeDomId(jobId)}`;
      const rowTags = [
        "job",
        lifecycle.shouldRecover ? "failed" : "",
        lifecycle.shouldRecover ? "recoverable" : "",
        lifecycle.shouldPublish ? "publish-ready" : "",
        lifecycle.shouldInspectHealth ? "health-check" : "",
        /(RUNNING|QUEUED|PENDING)/i.test(statusText) ? "active" : "",
        /(FAILED|ERROR)/i.test(statusText) ? "failed" : ""
      ]
        .filter(Boolean)
        .join(" ");
      const compareMeta: ListPowerCompareMeta = {
        checkboxId,
        compareId: jobId,
        label: `${jobId} / ${typeText}`,
        meta: `${statusText} -> ${lifecycle.safeActionLabel}${episodeId ? ` / episode ${episodeId}` : ""}`,
        viewHref: jobLink?.href,
        recoverHref: lifecycle.shouldRecover ? (episodeId ? `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}` : "/ui/hitl") : "",
        approveHref: episodeId && lifecycle.shouldPublish ? `/ui/publish?episodeId=${encodeURIComponent(episodeId)}` : "",
        artifactsHref: episodeId ? `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}` : "",
        copyValue: jobId
      };
      const linkedObjectLinks = renderActionLinks(
        [
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null,
          episodeId && lifecycle.shouldPublish ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "linked object ?놁쓬"
      );
      const followupLinks = renderActionLinks(
        [
          lifecycle.shouldRecover ? { href: episodeId ? `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}` : "/ui/hitl", label: "recover" } : null,
          lifecycle.shouldInspectHealth ? { href: "/ui/health", label: "health" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null
        ],
        "detail?먯꽌 ?ㅼ쓬 ?≪뀡???뺤씤?섏꽭??"
      );
      const rowActions: ListPowerActionInput[] = [];
      if (jobLink?.href) rowActions.push({ kind: "link", label: "View", href: jobLink.href });
      rowActions.push({ kind: "compare", label: "Compare", checkboxId });
      if (lifecycle.shouldRecover && jobId !== "-") {
        rowActions.push({ kind: "submit", label: "Retry", action: `/ui/jobs/${encodeURIComponent(jobId)}/retry` });
        rowActions.push({
          kind: "link",
          label: "Recover",
          href: episodeId ? `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}` : "/ui/hitl"
        });
      }
      if (episodeId && lifecycle.shouldPublish) {
        rowActions.push({ kind: "link", label: "Approve", href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}` });
      }
      if (episodeId) {
        rowActions.push({ kind: "link", label: "Open artifacts", href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}` });
      }
      rowActions.push({ kind: "copy", label: "Copy ID/path", value: jobId });

      return `<tr data-list-row="1" data-list-status="${escapeAttribute(statusText.toUpperCase())}" data-list-created-at="${escapeAttribute(
        createdText
      )}" data-list-tags="${escapeAttribute(rowTags)}"><td><div class="ops-cell-stack"><div class="ops-cell-title">${renderListPowerCompareCheckbox(
        compareMeta
      )}<strong>${jobLink ? `<a href="${jobLink.href}">${jobLink.label}</a>` : jobId}</strong>${renderToneBadge(
        lifecycle.stageLabel,
        lifecycle.tone
      )}</div><span class="ops-cell-meta">list -> detail -> recover ?먮쫫??anchor job object?낅땲??</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "?곌껐??owner episode ?뺣낫媛 ?놁뒿?덈떎."
      }</span>${linkedObjectLinks}</div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${typeText}</strong></div><span class="ops-cell-meta">${lifecycle.latestResult}</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title">${statusMarkup}${renderToneBadge(
        lifecycle.retryLabel,
        lifecycle.shouldRecover ? "bad" : lifecycle.tone
      )}</div><span class="ops-cell-meta">${lifecycle.retryDetail}</span></div></td><td><div class="ops-cell-stack"><strong>${progressText}</strong><span class="ops-cell-meta">${createdText}</span></div></td><td><div class="ops-cell-stack"><strong>${lifecycle.safeActionLabel}</strong><span class="ops-cell-meta">${lifecycle.safeActionDetail}</span>${renderListPowerActionBar(
        rowActions
      )}${followupLinks}</div></td></tr>`;
    })
    .join("");
}

function renderHitlTableRows(rowsHtml: string): string {
  const rows = parseTableRows(rowsHtml).filter((row) => row.cells.length >= 6);
  if (rows.length === 0) return rowsHtml;

  return rows
    .map((row) => {
      const jobLink = firstLink(row.cells[0]);
      const episodeLink = firstLink(row.cells[1]);
      const episodeId = extractRouteValue(episodeLink?.href, "episodes");
      const topicText = stripHtml(row.cells[2]) || "-";
      const typeText = stripHtml(row.cells[3]) || "-";
      const createdText = stripHtml(row.cells[4]) || "-";
      const blockerText = summarizeText(stripHtml(row.cells[5]) || "기록된 lastError 없음", 140);
      const preflightLinks = renderActionLinks(
        [
          jobLink ? { href: jobLink.href, label: "detail" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}`, label: "recover" } : null
        ],
        "detail에서 blocker를 먼저 확인하세요."
      );
      const handoffLinks = renderActionLinks(
        [
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null,
          episodeId ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "recover 뒤 linked outputs를 확인하세요."
      );

      return `<tr><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        jobLink ? `<a href="${jobLink.href}">${jobLink.label}</a>` : stripHtml(row.cells[0]) || "-"
      }</strong>${renderToneBadge("recover", "bad")}</div><span class="ops-cell-meta">실패 job object에서 recover 흐름을 시작합니다.</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "연결 episode 정보가 없습니다."
      }</span>${renderActionLinks(
        [
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null
        ],
        "linked object 없음"
      )}</div></td><td><div class="ops-cell-stack"><strong>${topicText}</strong><span class="ops-cell-meta">${typeText}</span></div></td><td><div class="ops-cell-stack"><strong>preflight blocker</strong><span class="ops-cell-meta">${blockerText}</span></div></td><td><div class="ops-cell-stack"><strong>detail -> dryRun recover</strong><span class="ops-cell-meta">root cause를 detail에서 확인한 뒤 episodeId와 failedShotIds로 dryRun부터 검증합니다.</span>${preflightLinks}</div></td><td><div class="ops-cell-stack"><strong>artifacts -> publish handoff</strong><span class="ops-cell-meta">${createdText}</span>${handoffLinks}</div></td></tr>`;
    })
    .join("");
}

export function buildJobsPageBody(input: JobsPageBodyInput): string {
  const t = UI_TEXT.jobs;
  const rowsHtml = input.rows ? renderPoweredJobsTableRows(input.rows) : "";

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "job lifecycle",
  title: t.title,
  intro: "list -> detail -> recover -> handoff 흐름을 Job object 기준으로 읽습니다. row action grammar도 같은 단어(detail, recover, episode, artifacts, publish)로 맞춥니다.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui">대시보드</a><a href="/ui/hitl">HITL</a><a href="/ui/publish">퍼블리시</a>',
  summaryCards: [
    { label: "범위", valueHtml: "<strong>최근 100개 job object</strong>", hint: "최신 실패와 멈춘 실행을 위쪽에서 먼저 잡습니다.", tone: "muted" },
    { label: "latest result", valueHtml: "<strong>failed / stuck running 우선</strong>", hint: "성공 경로보다 recover 후보를 먼저 여는 리스트입니다.", tone: "warn" },
    { label: "row grammar", valueHtml: "<strong>detail -> recover -> handoff</strong>", hint: "각 행은 detail, retryability, linked objects를 같은 순서로 보여줍니다.", tone: "ok" },
    { label: "linked objects", valueHtml: "<strong>episode -> artifacts -> publish</strong>", hint: "job에서 끝내지 않고 owner episode와 handoff 경로까지 같이 봅니다.", tone: "ok" }
  ],
  lifecycleTitle: "list -> detail -> recover -> handoff",
  lifecycleIntro: "리스트는 Job object lifecycle의 입구입니다. 실패와 정체를 먼저 잡고, 승격은 마지막 단계에서만 엽니다.",
  lifecycleSteps: [
    { label: "list", detail: "status와 latest result로 failed / stuck job을 먼저 고릅니다.", tone: "muted" },
    { label: "detail", detail: "status, retryability, blockers, linked objects를 상단에서 읽습니다.", tone: "warn" },
    { label: "recover", detail: "retry, HITL, health 중 다음 안전 액션을 고릅니다.", tone: "bad" },
    { label: "handoff", detail: "owner episode와 artifacts가 정합할 때만 publish를 엽니다.", tone: "ok" }
  ]
})}

${renderListPowerSurface({
  rootId: "jobs-list-power",
  pageKey: "jobs",
  tableId: "jobs-table",
  title: "Saved views + compare handoff",
  intro: "Use one list grammar for saved views, compare selection, retry, and publish handoff. Filters stay in the URL while custom views stay local to this browser.",
  presets: [
    { id: "failed-jobs", label: "Failed jobs", note: "Recoverable or failed job objects only.", tags: ["failed"], match: "all" },
    { id: "active-jobs", label: "Active jobs", note: "Running, queued, or pending jobs that still need monitoring.", tags: ["active"], match: "all" },
    {
      id: "publish-ready-jobs",
      label: "Publish ready",
      note: "Jobs whose next safe action is publish handoff.",
      tags: ["publish-ready"],
      match: "all"
    }
  ],
  searchInputIds: ["jobs-filter"],
  viewParam: "jobsView",
  compareParam: "jobsCompare",
  compareTitle: "Job compare handoff",
  compareIntro: "Keep selected job objects on the list surface first, then jump into detail, recover, or publish without losing URL state.",
  compareEmpty: "Select one or more job objects to keep detail, recover, and publish handoffs together.",
  selectionHint: "Saved views stay local. Search, active view, and compare selection stay mirrored into the URL."
})}

${renderRailSection({
  title: "다음 안전 액션",
  intro: "필터, retryability, linked objects를 먼저 고정한 뒤에만 row detail로 내려갑니다.",
  linksHtml: '<a href="/ui/health">상태</a><a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a>',
  cards: [
    {
      title: "필터 + row 오픈",
      intro: "job id, owner episode, status로 좁힌 다음 detail에서 lifecycle을 엽니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "jobs-filter",
        targetId: "jobs-table",
        label: "작업 필터",
        placeholder: t.filterPlaceholder,
        urlParam: "jobsFilter",
        hint: "이 리스트에 로컬로 적용됩니다. / 로 전역 검색으로 바로 이동할 수 있습니다."
      })
    },
    {
      title: "복구 우선순위",
      intro: "FAILED와 멈춘 RUNNING을 먼저 정리하고, publish는 latest result가 정합할 때만 마지막에 엽니다.",
      tone: "warn",
      items: [
        { label: "FAILED는 detail -> retry / recover", detail: "job detail에서 lastError, retryability, blocker를 확인한 뒤 HITL 여부를 판단합니다." },
        { label: "RUNNING 정체는 detail -> health", detail: "재시도 전에 health, queue, 최근 jobs를 함께 확인해 중복 실행을 피합니다." },
        { label: "publish hold", detail: "latest result와 linked artifacts가 맞아야만 승격으로 넘깁니다." }
      ],
      linksHtml: '<a href="/ui/hitl">HITL</a><a href="/ui/health">상태</a>'
    },
    {
      title: "공통 row 문법",
      intro: "모든 row는 detail, owner episode, linked objects, next safe action을 같은 문법으로 보여줍니다.",
      tone: "ok",
      items: [
        { label: "detail", detail: "status, latest result, retryability를 먼저 읽습니다." },
        { label: "episode / artifacts", detail: "owner object와 linked outputs를 같은 row에서 바로 엽니다." },
        { label: "recover / publish", detail: "실패는 recover로, 성공은 publish handoff로 이어집니다." }
      ],
      linksHtml: '<a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>작업 오브젝트</h2>
      <p class="section-intro">각 행은 job object -> owner episode -> latest result -> retryability -> next safe action 순서로 읽습니다. raw evidence는 detail 화면으로 내립니다.</p>
    </div>
    <span class="badge muted">${t.latestBadge}</span>
  </div>
  <div class="table-wrap"><table id="jobs-table"><thead><tr><th>job object / lifecycle</th><th>owner episode / linked objects</th><th>type / latest result</th><th>status / retryability</th><th>progress / created</th><th>next safe action</th></tr></thead><tbody>${
    rowsHtml || renderTableEmptyRow(6, t.noJobs)
  }</tbody></table></div>
</section>${renderListPowerScript()}`;
}

export function buildPublishPageBody(input: PublishPageBodyInput): string {
  const t = UI_TEXT.publish;
  const episodeId = input.episodeId.trim();
  const hasEpisodeId = episodeId.length > 0;
  const episodeHref = hasEpisodeId ? `/ui/episodes/${encodeURIComponent(episodeId)}` : "/ui/episodes";
  const artifactsHref = hasEpisodeId ? `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}` : "/ui/artifacts";
  const folderHref = hasEpisodeId ? `/artifacts/${encodeURIComponent(episodeId)}/` : "/artifacts/";
  const episodeLabel = hasEpisodeId ? `<strong class="mono">${episodeId}</strong>` : "<strong>episode id를 입력하세요.</strong>";

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "publish preflight",
  title: t.title,
  intro: "publish는 page action이 아니라 episode object handoff입니다. episode -> latest job -> artifacts -> publish 순서로 잠금이 풀릴 때만 안전합니다.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a>',
  summaryCards: [
    { label: "target object", valueHtml: episodeLabel, hint: "같은 episode id로 jobs, artifacts, publish를 끝까지 이어갑니다.", tone: hasEpisodeId ? "ok" : "warn" },
    { label: "latest job gate", valueHtml: "<strong>COMPLETED / PREVIEW_READY</strong>", hint: "FAILED, stuck RUNNING, retry pending이면 publish보다 recover가 먼저입니다.", tone: "warn" },
    { label: "linked artifacts", valueHtml: "<strong>preview / final / manifest</strong>", hint: "raw folder보다 QC와 output presence 정합을 먼저 확인합니다.", tone: hasEpisodeId ? "ok" : "muted" },
    {
      label: "next safe action",
      valueHtml: `<strong>${hasEpisodeId ? "jobs -> artifacts -> publish" : "episode 선택"}</strong>`,
      hint: hasEpisodeId ? "latest result와 linked outputs를 확인한 뒤에만 publish request를 보냅니다." : "에피소드 상세나 job detail에서 같은 id를 복사해 오세요.",
      tone: hasEpisodeId ? "ok" : "warn"
    }
  ],
  lifecycleTitle: "episode -> latest job -> artifacts -> publish",
  lifecycleIntro: "publish는 마지막 단계입니다. preflight가 깨지면 다시 jobs 또는 recover 경로로 되돌아갑니다.",
  lifecycleSteps: [
    { label: "episode", detail: hasEpisodeId ? `target object ${episodeId}를 고정합니다.` : "먼저 target episode를 고릅니다.", tone: hasEpisodeId ? "ok" : "warn" },
    { label: "latest job", detail: "최근 job이 성공 경로인지, retry / recover가 먼저인지 확인합니다.", tone: "warn" },
    { label: "artifacts", detail: "preview, final, QC, upload manifest 정합을 맞춥니다.", tone: hasEpisodeId ? "ok" : "muted" },
    { label: "publish", detail: "preflight가 모두 통과할 때만 handoff를 실행합니다.", tone: hasEpisodeId ? "ok" : "muted" }
  ]
})}

${renderRailSection({
  title: "preflight + next safe action",
  intro: "퍼블리시 버튼보다 먼저 target episode, latest result gate, linked outputs, blocked path를 상단에서 고정합니다.",
  cards: [
    {
      title: "episode object + latest result",
      intro: hasEpisodeId
        ? `승격 대상 episode id는 ${episodeId} 입니다. 먼저 episode detail에서 상태와 latest job result를 확인합니다.`
        : "승격할 오브젝트가 아직 정해지지 않았습니다. episode id를 먼저 정하세요.",
      tone: hasEpisodeId ? "ok" : "warn",
      items: [
        { label: "episode detail", detail: "이 오브젝트의 현재 상태와 owner context를 먼저 확인합니다." },
        { label: "latest job", detail: "publish는 최신 작업이 성공 경로에 있는 경우에만 안전합니다." },
        { label: "retryability", detail: "FAILED 또는 stuck RUNNING이면 publish 대신 recover 판단을 먼저 내립니다." }
      ],
      linksHtml: `<a href="${episodeHref}">${hasEpisodeId ? "에피소드 상세" : "에피소드 목록"}</a>`
    },
    {
      title: "artifacts gate",
      intro: "preview, final, QC, upload manifest가 모두 같은 episode object를 가리키는지 먼저 맞춥니다.",
      tone: hasEpisodeId ? "ok" : "muted",
      items: [
        { label: "preview / final", detail: "승격 전 출력 파일이 실제로 존재하는지 확인합니다." },
        { label: "QC / manifest", detail: "원시 evidence보다 먼저 QC와 upload manifest를 확인합니다." },
        { label: "publish handoff", detail: "linked outputs가 정합한 경우에만 publish request를 엽니다." }
      ],
      linksHtml: `<a href="${artifactsHref}">산출물</a><a href="${folderHref}">원시 폴더</a>`
    },
    {
      title: "blocked path",
      intro: "publish가 막히면 raw folder 탐색보다 jobs, health, artifacts 중 어느 오브젝트에서 되돌아갈지 먼저 고릅니다.",
      tone: "warn",
      items: [
        { label: "jobs로 복귀", detail: "latest job failure와 retryability를 먼저 확인합니다." },
        { label: "health 확인", detail: "queue나 storage 저하가 있으면 승격을 멈추고 의존성을 먼저 복구합니다." },
        { label: "artifacts 재검증", detail: "누락 output이면 publish가 아니라 render / compile 단계로 되돌아갑니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/health">상태</a><a href="/ui/artifacts">산출물</a>'
    }
  ]
})}

${renderRailSection({
  title: "퍼블리시 실행",
  intro: "요청 입력은 간단하게 두되, next safe action과 rollback anchor는 같은 레일 안에 유지합니다.",
  cards: [
    {
      title: "퍼블리시 요청",
      intro: "episode id 하나로 handoff를 실행합니다.",
      tone: hasEpisodeId ? "ok" : "muted",
      bodyHtml: `<form method="post" action="/ui/publish" class="ops-form-shell"><div class="field"><label for="publish-episode-id">episodeId <span class="hint" data-tooltip="${t.episodeHelp}">?</span></label><input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/><small>에피소드 상세, 작업 상세, 산출물 링크에서 같은 id를 복사해 사용합니다.</small></div><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="퍼블리시 실행">${t.runAction}</button></div></form>`
    },
    {
      title: "submit preflight",
      intro: "입력값보다 latest result와 linked outputs 정합이 더 중요합니다.",
      tone: "ok",
      items: [
        { label: "episode 상태", detail: "COMPLETED 또는 PREVIEW_READY인지 확인합니다." },
        { label: "latest job", detail: "방금 실패한 작업이 있으면 승격보다 recover를 먼저 진행합니다." },
        { label: "output manifest", detail: "upload manifest와 output presence가 맞는지 확인합니다." }
      ]
    },
    {
      title: "차단 시 복귀",
      intro: "publish가 막히면 raw folder보다 owner episode와 linked job 쪽으로 되돌아가야 합니다.",
      tone: "warn",
      items: [
        { label: "jobs", detail: "실패한 최신 작업과 retryability를 확인합니다." },
        { label: "artifacts", detail: "출력이 비면 render / compile 단계부터 다시 봅니다." },
        { label: "health", detail: "서비스 저하가 있으면 승격을 멈추고 복구 명령을 먼저 고릅니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/artifacts">산출물</a><a href="/ui/health">상태</a>'
    }
  ]
})}`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  const statusTone = inferTone(input.statusBadge);
  const statusText = stripHtml(input.statusBadge) || "unknown";
  const logs = parseLogEntries(input.logRows);
  const latestLog = logs.at(-1) ?? null;
  const latestResultText = latestLog ? summarizeText(latestLog.message, 140) : "기록된 최신 로그가 없습니다.";
  const blockerText = extractLastErrorText(input.errorStack);
  const hasBlocker = !/(기록된 lastError 없음|\(없음\))/.test(blockerText);
  const canRetry = input.retryAction.includes("<form") && !input.retryAction.includes("disabled");
  const lifecycle = describeJobLifecycle(statusText, `${input.progress}%`, latestResultText);
  const retryTone: OpsRailTone = canRetry ? "bad" : lifecycle.shouldPublish ? "ok" : statusTone;
  const nextSafeActionLabel = canRetry ? "retry -> artifacts recheck" : lifecycle.safeActionLabel;
  const nextSafeActionDetail = canRetry
    ? "이 job object에서 retry한 뒤 owner episode와 linked outputs를 다시 확인합니다."
    : lifecycle.safeActionDetail;
  const actionGrammarHtml = `<div class="stack"><span class="muted-text">detail -> retry / recover -> episode -> artifacts -> publish 문법을 같은 순서로 유지합니다.</span><div class="ops-link-row">${input.retryAction}<a href="/ui/hitl">recover</a>${
    lifecycle.shouldInspectHealth ? '<a href="/ui/health">health</a>' : ""
  }<a href="/ui/episodes/${input.episodeId}">episode</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(
    input.episodeId
  )}">artifacts</a><a href="/ui/publish?episodeId=${encodeURIComponent(input.episodeId)}">publish</a></div></div>`;

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "job object summary",
  title: "Job object summary",
  titleTag: "h2",
  intro: "status, owner episode, latest result, retryability, blockers, next safe action, linked objects를 raw logs 위에 고정합니다.",
  flash: input.flash,
  quickLinksHtml: `<a href="/ui/jobs">작업 목록</a><a href="/ui/episodes/${input.episodeId}">에피소드</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(
    input.episodeId
  )}">산출물</a>`,
  summaryCards: [
    { label: "status", valueHtml: input.statusBadge, hint: "status badge가 retry / recover / publish hold 판단을 결정합니다.", tone: statusTone },
    {
      label: "owner episode",
      valueHtml: `<a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a>`,
      hint: "목록으로 돌아가지 않고 owner object로 바로 handoff 합니다.",
      tone: "muted"
    },
    {
      label: "latest result",
      valueHtml: `<strong>${latestLog ? `${latestLog.level} @ ${latestLog.createdAt}` : lifecycle.stageLabel}</strong>`,
      hint: latestLog ? latestResultText : lifecycle.latestResult,
      tone: latestLog ? toneFromLogLevel(latestLog.level) : lifecycle.tone
    },
    {
      label: "retryability",
      valueHtml: `<strong>${canRetry ? "retry 가능" : lifecycle.retryLabel}</strong>`,
      hint: canRetry ? "이 detail에서 실패 작업을 직접 재실행할 수 있습니다." : lifecycle.retryDetail,
      tone: retryTone
    },
    {
      label: "blockers",
      valueHtml: `<strong>${hasBlocker ? "있음" : "없음"}</strong>`,
      hint: hasBlocker ? blockerText : "현재 lastError blocker는 보이지 않습니다.",
      tone: hasBlocker ? "bad" : "ok"
    },
    {
      label: "next safe action",
      valueHtml: `<strong>${nextSafeActionLabel}</strong>`,
      hint: nextSafeActionDetail,
      tone: retryTone
    }
  ],
  lifecycleTitle: "list -> detail -> recover -> handoff",
  lifecycleIntro: "이 detail은 page가 아니라 Job object 제어면입니다. latest result와 blockers를 읽은 뒤 다음 단계로만 이동합니다.",
  lifecycleSteps: [
    { label: "list", detail: "job list에서 실패 또는 정체 job을 고릅니다.", tone: "muted" },
    { label: "detail", detail: "status, owner, latest result, retryability를 위에서 읽습니다.", tone: statusTone },
    {
      label: lifecycle.shouldRecover || canRetry ? "recover" : lifecycle.shouldInspectHealth ? "health" : "inspect",
      detail: canRetry ? "retry 또는 recover 경로를 고릅니다." : lifecycle.safeActionDetail,
      tone: retryTone
    },
    {
      label: lifecycle.shouldPublish ? "handoff" : "linked objects",
      detail: lifecycle.shouldPublish ? "owner episode와 artifacts 정합 후 publish로 넘깁니다." : "owner episode와 artifacts를 먼저 맞춥니다.",
      tone: lifecycle.shouldPublish ? "ok" : "muted"
    }
  ],
  panels: [
    {
      title: "공통 액션 문법",
      intro: "retry / recover / episode / artifacts / publish handoff를 같은 문법으로 유지합니다.",
      tone: retryTone,
      bodyHtml: actionGrammarHtml
    },
    {
      title: "linked objects",
      intro: "detail에서 바로 owner episode, artifacts, publish 경로로 handoff 합니다.",
      tone: "ok",
      items: [
        { label: "owner episode", detail: "소유 object 상태와 후속 렌더 경로를 확인합니다." },
        { label: "artifacts", detail: "output presence 확인이 필요할 때만 raw folder로 내려갑니다." },
        { label: "publish handoff", detail: "성공 결과를 승격할 때 같은 episode id로 넘깁니다." }
      ],
      linksHtml: `<a href="/ui/episodes/${input.episodeId}">episode</a><a href="/artifacts/${input.episodeId}/">artifacts folder</a><a href="/ui/publish?episodeId=${encodeURIComponent(
        input.episodeId
      )}">publish</a>`
    },
    {
      title: "raw evidence discipline",
      intro: "원시 evidence는 위 판단면 뒤에만 둡니다. latest result와 blockers를 먼저 요약해서 읽습니다.",
      tone: hasBlocker ? "warn" : "muted",
      items: [
        { label: "latest result", detail: latestLog ? `${latestLog.createdAt} · ${latestResultText}` : lifecycle.latestResult },
        { label: "blocker snapshot", detail: blockerText },
        { label: "raw logs", detail: "retry와 recover 경로를 정한 뒤에만 2차 evidence로 내려갑니다." }
      ]
    }
  ]
})}

<section class="card">
  <div class="section-head">
    <div>
      <h2>Blocker snapshot</h2>
      <p class="section-intro">가장 중요한 failure context만 남깁니다. raw logs보다 위에 두는 마지막 판단용 evidence입니다.</p>
    </div>
  </div>
  <div class="ops-resource-card">${input.errorStack}</div>
</section>

<section class="card ops-table-shell ops-log-table">
  <div class="ops-table-meta">
    <div>
      <h2>원시 로그 / 2차 evidence</h2>
      <p class="section-intro">retry와 recovery 경로가 위에서 정리된 뒤에만 raw log evidence를 확인합니다.</p>
    </div>
    <input type="search" data-table-filter="job-log-table" placeholder="로그 검색"/>
  </div>
  <div class="table-wrap"><table id="job-log-table"><thead><tr><th>생성 시각</th><th>레벨</th><th>메시지</th><th>상세</th></tr></thead><tbody>${
    input.logRows || renderTableEmptyRow(4, "로그가 없습니다.")
  }</tbody></table></div>
</section>`;
}

export function buildHitlPageBody(input: HitlPageBodyInput): string {
  const t = UI_TEXT.hitl;
  const rowsHtml = input.rows ? renderHitlTableRows(input.rows) : "";

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "recover preflight",
  title: t.title,
  intro: "실패 job object에서 recover로 넘어가는 제어면입니다. failed detail, dryRun preflight, artifacts handoff, publish hold를 같은 흐름으로 유지합니다.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/publish">퍼블리시</a><a href="/ui/artifacts">산출물</a>',
  summaryCards: [
    { label: "failure anchor", valueHtml: "<strong>failed job detail</strong>", hint: "원인 확인은 항상 failed job object에서 시작합니다.", tone: "bad" },
    { label: "recover input", valueHtml: "<strong>episodeId + failedShotIds</strong>", hint: "복구 대상 object를 명시적으로 좁혀서 rerender 합니다.", tone: "warn" },
    { label: "preflight", valueHtml: "<strong>dryRun first</strong>", hint: "실행 전 경로 검증을 먼저 통과시키는 것이 안전합니다.", tone: "warn" },
    { label: "handoff", valueHtml: "<strong>artifacts -> publish</strong>", hint: "복구 성공 후 바로 승격하지 말고 linked outputs 정합을 먼저 맞춥니다.", tone: "ok" }
  ],
  lifecycleTitle: "failed job -> preflight -> rerender -> handoff",
  lifecycleIntro: "HITL은 raw rerender 버튼이 아니라 recover preflight입니다. failed detail과 linked outputs를 끊지 않고 이어야 합니다.",
  lifecycleSteps: [
    { label: "failed job", detail: "실패 job detail에서 blocker와 root cause를 읽습니다.", tone: "bad" },
    { label: "preflight", detail: "episodeId, failedShotIds, dryRun으로 recover 경로를 검증합니다.", tone: "warn" },
    { label: "rerender", detail: "새 job object를 생성하되 recover 문맥을 유지합니다.", tone: "warn" },
    { label: "handoff", detail: "artifacts 정합 뒤에만 publish handoff로 넘깁니다.", tone: "ok" }
  ]
})}

${renderRailSection({
  title: "recover preflight + next safe action",
  intro: "failed row를 고르고 rerender를 실행한 뒤, artifacts와 publish hold까지 같은 레일에서 확인합니다.",
  cards: [
    {
      title: "실패 row 좁히기",
      intro: "job, owner episode, topic, error text로 recover 대상을 먼저 줄입니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "hitl-filter",
        targetId: "hitl-failed-table",
        label: "실패 작업 필터",
        placeholder: t.filterPlaceholder,
        hint: "작업, 에피소드, 주제, 타입, 오류 단어로 빠르게 줄입니다."
      })
    },
    {
      title: "recover request",
      intro: "복구 대상 shot id를 명시하고 dryRun으로 경로를 먼저 검증할 수 있습니다.",
      tone: "warn",
      bodyHtml: `<form method="post" action="/ui/hitl/rerender" class="ops-form-shell"><div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div><div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="${t.failedShotHelp}">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>${t.failedShotHint}</small></div><label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun (실행 전 검증)</label><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="HITL rerender 실행">${t.runAction}</button></div></form>`
    },
    {
      title: "recover 뒤 handoff",
      intro: "복구가 끝나도 바로 publish로 가지 말고 linked outputs와 latest result를 먼저 확인합니다.",
      tone: "ok",
      items: [
        { label: "실패 job detail", detail: "원인 확인은 항상 failed job detail에서 먼저 시작합니다." },
        { label: "산출물 재검증", detail: "rerender 뒤 preview / final / QC가 실제로 갱신되었는지 확인합니다." },
        { label: "publish handoff", detail: "복구 결과가 정합한 경우에만 승격 경로로 넘깁니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.failedJobs}</h2>
      <p class="section-intro">row action grammar를 failed job object -> owner episode -> preflight blocker -> recover -> handoff 순서로 통일합니다.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="hitl-failed-table"><thead><tr><th>failed job object / lifecycle</th><th>owner episode / linked objects</th><th>topic / type</th><th>preflight blocker</th><th>next safe action</th><th>recover -> handoff</th></tr></thead><tbody>${
    rowsHtml || renderTableEmptyRow(6, t.noFailedJobs)
  }</tbody></table></div>
</section>`;
}

function artifactTagList(typeText: string, nameText: string): string[] {
  const normalizedType = typeText.toLowerCase();
  const normalizedName = nameText.toLowerCase();
  return [
    "artifact",
    normalizedType.includes("directory") ? "directory" : "file",
    normalizedName.endsWith(".json") ? "json" : "",
    normalizedName.endsWith(".mp4") ? "video" : "",
    normalizedName.includes("manifest") ? "manifest" : "",
    normalizedName.includes("preview") || normalizedName.includes("final") ? "media" : ""
  ].filter(Boolean);
}

function renderPoweredArtifactsTableRows(rowsHtml: string, episodeIdValue: string): string {
  const rows = parseTableRows(rowsHtml).filter((row) => row.cells.length >= 3);
  if (rows.length === 0) return rowsHtml;

  return rows
    .map((row) => {
      const typeText = stripHtml(row.cells[0]) || "-";
      const nameText = stripHtml(row.cells[1]) || "-";
      const pathLink = firstLink(row.cells[2]);
      const pathText = pathLink?.label || stripHtml(row.cells[2]) || "-";
      const checkboxId = `artifacts-compare-${sanitizeDomId(pathText)}`;
      const compareMeta: ListPowerCompareMeta = {
        checkboxId,
        compareId: pathText,
        label: nameText,
        meta: `${typeText} / ${pathText}`,
        viewHref: pathLink?.href,
        approveHref:
          episodeIdValue && (nameText.toLowerCase().includes("final") || nameText.toLowerCase().includes("manifest"))
            ? `/ui/publish?episodeId=${encodeURIComponent(episodeIdValue)}`
            : "",
        copyValue: pathText
      };
      const rowActions: ListPowerActionInput[] = [];
      if (pathLink?.href) rowActions.push({ kind: "link", label: "View", href: pathLink.href });
      rowActions.push({ kind: "compare", label: "Compare", checkboxId });
      if (pathLink?.href) rowActions.push({ kind: "link", label: "Open artifacts", href: pathLink.href });
      if (compareMeta.approveHref) rowActions.push({ kind: "link", label: "Approve", href: compareMeta.approveHref });
      rowActions.push({ kind: "copy", label: "Copy ID/path", value: pathText });

      return `<tr data-list-row="1" data-list-status="${escapeAttribute(typeText.toUpperCase())}" data-list-created-at="" data-list-tags="${escapeAttribute(
        artifactTagList(typeText, nameText).join(" ")
      )}"><td><div class="ops-cell-stack"><div class="ops-cell-title">${renderListPowerCompareCheckbox(compareMeta)}<strong>${nameText}</strong>${renderToneBadge(
        typeText,
        typeText.toLowerCase().includes("directory") ? "muted" : "ok"
      )}</div><span class="ops-cell-meta">${pathText}</span></div></td><td><div class="ops-cell-stack"><strong>${typeText}</strong><span class="ops-cell-meta">${
        episodeIdValue ? `episode ${episodeIdValue}` : "global artifact index"
      }</span></div></td><td><div class="ops-cell-stack"><strong>${pathLink ? `<a href="${pathLink.href}">${pathText}</a>` : pathText}</strong><span class="ops-cell-meta">${
        nameText.toLowerCase().includes("manifest") ? "publish handoff candidate" : "open artifact or copy the path for downstream review"
      }</span></div></td><td><div class="ops-cell-stack"><strong>${
        nameText.toLowerCase().includes("manifest") ? "approve -> publish" : "view -> copy"
      }</strong><span class="ops-cell-meta">Row actions follow the same view, compare, approve, and copy grammar as the object lists above.</span>${renderListPowerActionBar(
        rowActions
      )}</div></td></tr>`;
    })
    .join("");
}

export function buildArtifactsPageBody(input: ArtifactsPageBodyInput): string {
  const t = UI_TEXT.artifacts;
  const hasEpisodeLinks = input.episodeLinks.trim().length > 0;
  const rowsHtml = input.rows ? renderPoweredArtifactsTableRows(input.rows, input.episodeId.trim()) : "";
  const linkedOutputsHtml = hasEpisodeLinks ? input.episodeLinks : '<div class="notice">아직 에피소드 빠른 링크를 불러오지 않았습니다.</div>';

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">linked outputs</span>
      <h1>${t.title}</h1>
      <p class="section-intro">산출물 화면은 raw directory 브라우저가 아니라 linked object view입니다. episode id를 중심으로 output presence와 recovery anchor를 함께 봅니다.</p>
    </div>
    <div class="quick-links"><a href="/artifacts/">${t.openArtifacts}</a><a href="/ui/episodes">${t.openEpisodes}</a><a href="/ui/jobs">작업</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("조회 키", "<strong>episodeId</strong>", "항상 같은 오브젝트 id로 jobs, episode, publish까지 이어갑니다.")}
    ${renderMetricCard("핵심 outputs", "<strong>beats, shots, media, QC</strong>", "원시 인덱스보다 먼저 linked outputs를 확인합니다.")}
    ${renderMetricCard("복구 앵커", "<strong>jobs / episode detail</strong>", "누락 파일은 대개 상위 파이프라인 단계에서 해결됩니다.")}
  </div>
</section>

${renderListPowerSurface({
  rootId: "artifacts-list-power",
  pageKey: "artifacts",
  tableId: "artifact-index-table",
  title: "Saved views + path compare",
  intro: "Keep artifact list power on the same grammar: local saved views, URL-synced filters, compare selection, and publish handoff for manifest or final outputs.",
  presets: [
    { id: "media-artifacts", label: "Media outputs", note: "Preview and final media files only.", tags: ["media"], match: "all" },
    { id: "json-artifacts", label: "JSON objects", note: "Plans, manifests, and supporting JSON files.", tags: ["json"], match: "all" },
    { id: "manifest-only", label: "Manifest only", note: "Publish handoff candidates.", tags: ["manifest"], match: "all" }
  ],
  searchInputIds: ["artifact-index-filter"],
  viewParam: "artifactsView",
  compareParam: "artifactsCompare",
  compareTitle: "Artifact compare handoff",
  compareIntro: "Select files or directories to keep path review, open-artifact actions, and publish handoff together.",
  compareEmpty: "Select one or more artifact rows to keep review paths and copy actions in one place.",
  selectionHint: "Custom views stay in localStorage. Search, active view, and selected paths stay mirrored into the URL."
})}

${renderRailSection({
  title: "다음 안전 액션",
  intro: "episode lookup, linked outputs, recovery anchor를 같은 화면 위쪽에 유지합니다.",
  cards: [
    {
      title: "episode lookup",
      intro: "같은 object id로 output set을 빠르게 여는 진입점입니다.",
      tone: "muted",
      bodyHtml: `<form method="get" action="/ui/artifacts" class="ops-form-shell"><div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>${t.episodeHelp}</small></div><div class="actions"><button type="submit" class="secondary" data-primary-action="1" data-primary-label="에피소드 산출물 열기">${t.quickLinkAction}</button></div></form>`
    },
    {
      title: "linked outputs",
      intro: hasEpisodeLinks
        ? "이 오브젝트와 직접 연결된 outputs를 위에서 바로 확인합니다."
        : "episode id를 입력하면 이 오브젝트의 linked outputs를 먼저 띄웁니다.",
      tone: hasEpisodeLinks ? "ok" : "muted",
      bodyHtml: `<div class="ops-resource-card"><div class="ops-resource-list">${linkedOutputsHtml}</div></div>`
    },
    {
      title: "복구 앵커",
      intro: "누락 output은 대부분 상위 파이프라인 단계에서 해결합니다.",
      tone: "warn",
      items: [
        { label: "shots.json 없음", detail: "compile_shots 또는 beats 생성 작업부터 다시 확인합니다." },
        { label: "preview / final 없음", detail: "관련 render job 또는 HITL rerender 경로로 되돌아갑니다." },
        { label: "upload manifest 없음", detail: "publish를 멈추고 linked outputs 정합부터 맞춥니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/episodes">에피소드</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>원시 산출물 인덱스</h2>
      <p class="section-intro">이 표는 2차 evidence입니다. linked outputs와 recovery anchor를 본 뒤에만 raw index를 확인합니다.</p>
    </div>
    <input id="artifact-index-filter" type="search" data-table-filter="artifact-index-table" data-url-param="artifactsFilter" aria-label="산출물 인덱스 필터" placeholder="${t.indexFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="artifact-index-table"><thead><tr><th>artifact object / selection</th><th>type / owner</th><th>path / handoff</th><th>row actions</th></tr></thead><tbody>${
    rowsHtml || renderTableEmptyRow(4, t.noArtifacts)
  }</tbody></table></div>
</section>${renderListPowerScript()}`;
}

export function buildRolloutsPageBody(input: RolloutsPageBodyInput): string {
  const t = UI_TEXT.rollouts;

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">판정 surface</span>
      <h1>${t.title}</h1>
      <p class="section-intro">rollout과 compare 신호를 raw JSON이 아니라 decision surface로 읽습니다. 판단, recovery, linked evidence를 같은 위계로 맞춥니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/benchmarks">벤치마크</a><a href="/ui/health">${t.openHealth}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "filter, compare read order, recovery anchor를 표 위에 고정해 판단 피로도를 줄입니다.",
  cards: [
    {
      title: "신호 필터",
      intro: "signal, status, verdict, reason, source를 기준으로 문제 묶음을 먼저 좁힙니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "rollouts-filter",
        targetId: "rollouts-table",
        label: "롤아웃 신호 필터",
        placeholder: t.filterPlaceholder,
        hint: "신호 종류, 상태, 판정, 사유, 소스로 바로 줄입니다."
      })
    },
    {
      title: "비교 읽는 순서",
      intro: "상태보다 판정과 사유를 먼저 읽고, compare action은 그 다음에 엽니다.",
      tone: "warn",
      items: [
        { label: "status", detail: "blocked와 below-min은 즉시 차단 신호로 취급합니다." },
        { label: "verdict / reason", detail: "수치만 보지 말고 왜 막혔는지 reason을 먼저 읽습니다." },
        { label: "compare action", detail: "상세와 원시 JSON은 판단이 서지 않을 때만 엽니다." }
      ]
    },
    {
      title: "복구 / linked evidence",
      intro: "rollout signal은 benchmark, artifacts, health와 같이 묶어서 봐야 합니다.",
      tone: "ok",
      items: [
        { label: "benchmark와 비교", detail: "동일 번들의 upstream benchmark 결과를 함께 확인합니다." },
        { label: "artifacts handoff", detail: "판정 근거가 필요한 경우에만 linked outputs로 이동합니다." },
        { label: "health 확인", detail: "서비스 저하가 보이면 signal 자체보다 인프라 복구를 먼저 합니다." }
      ],
      linksHtml: '<a href="/ui/benchmarks">벤치마크</a><a href="/ui/artifacts">산출물</a><a href="/ui/health">상태</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.tableTitle}</h2>
      <p class="section-intro">각 행은 signal -> verdict -> reason -> next compare action 순서로 읽습니다.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="rollouts-table"><thead><tr><th>오브젝트 / 비교 액션</th><th>상태</th><th>점수</th><th>판정</th><th>사유</th><th>생성 시각</th><th>소스</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noSignals)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>2차 evidence / sources</h2>
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
      <span class="eyebrow">compare surface</span>
      <h1>${t.title}</h1>
      <p class="section-intro">benchmark는 scenario compare와 regression recover를 함께 보는 화면입니다. heavy evidence보다 비교 판단과 next action을 먼저 올립니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "backend matrix와 regression queue를 같은 compare grammar로 읽고, sources는 마지막에 내립니다.",
  cards: [
    {
      title: "backend matrix 읽기",
      intro: "상태보다 허용률, 실패율, 메모를 함께 읽어 현재 시나리오가 승격 가능한지 판단합니다.",
      tone: "muted",
      items: [
        { label: "상태", detail: "시나리오 결과가 usable 한지 먼저 확인합니다." },
        { label: "지연 + 허용률", detail: "비용과 품질을 한 줄에서 함께 읽습니다." },
        { label: "linked outputs", detail: "필요할 때만 smoke / plan artifacts로 내려갑니다." }
      ]
    },
    {
      title: "regression queue 읽기",
      intro: "warning과 error를 먼저 보고 drift와 issue를 그 다음에 해석합니다.",
      tone: "warn",
      items: [
        { label: "경고 / 오류", detail: "차단 여부를 가장 먼저 판단합니다." },
        { label: "렌더 드리프트", detail: "비교 기준을 벗어난 폭을 빠르게 읽습니다." },
        { label: "이슈 요약", detail: "세부 evidence를 열기 전에 다음 조치를 정합니다." }
      ]
    },
    {
      title: "linked compare flow",
      intro: "benchmark 결과는 rollout과 artifacts까지 연결될 때만 운영 판단이 됩니다.",
      tone: "ok",
      items: [
        { label: "rollouts로 인계", detail: "동일 번들의 rollout decision surface와 연결합니다." },
        { label: "artifacts로 확인", detail: "근거가 필요할 때만 linked outputs로 이동합니다." },
        { label: "sources는 마지막", detail: "raw source rows는 2차 evidence로 아래에 둡니다." }
      ],
      linksHtml: `<a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a>`
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.backendTitle}</h2>
      <p class="section-intro">backend compare의 1차 표입니다. row별 next action을 먼저 읽고 필요할 때만 source evidence로 내려갑니다.</p>
    </div>
    <input type="search" data-table-filter="benchmark-backend-table" aria-label="백엔드 벤치마크 필터" placeholder="${t.backendFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-backend-table"><thead><tr><th>시나리오 / 다음 액션</th><th>상태</th><th>지연 시간</th><th>허용률</th><th>실패율</th><th>메모</th><th>소스</th></tr></thead><tbody>${
    input.backendRows || renderTableEmptyRow(7, t.noBackendRows)
  }</tbody></table></div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.regressionTitle}</h2>
      <p class="section-intro">regression queue의 1차 표입니다. warning / error를 먼저 읽고 drift와 issue를 뒤에 붙입니다.</p>
    </div>
    <input type="search" data-table-filter="benchmark-regression-table" aria-label="회귀 리포트 필터" placeholder="${t.regressionFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-regression-table"><thead><tr><th>번들 / 다음 액션</th><th>상태</th><th>경고 / 오류</th><th>프로필</th><th>렌더 드리프트</th><th>이슈</th><th>소스</th></tr></thead><tbody>${
    input.regressionRows || renderTableEmptyRow(7, t.noRegressionRows)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>2차 evidence / sources</h2>
      <p class="section-intro">${t.sourcesHint}</p>
    </div>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>`;
}
