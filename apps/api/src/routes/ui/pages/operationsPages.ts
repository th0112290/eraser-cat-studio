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
:root{--ops-density-gap:10px;--ops-density-card-padding:12px;--ops-density-cell-y:10px;--ops-density-cell-x:12px;--ops-density-chip-gap:8px;--ops-density-table-font:12px}
body[data-shell-density="compact"],body[data-density="compact"],body[data-ui-density="compact"],body[class*="density-compact"]{--ops-density-gap:8px;--ops-density-card-padding:10px;--ops-density-cell-y:8px;--ops-density-cell-x:10px;--ops-density-chip-gap:6px;--ops-density-table-font:11px}
body[data-shell-density="comfortable"],body[data-density="comfortable"],body[data-ui-density="comfortable"],body[class*="density-comfortable"]{--ops-density-gap:12px;--ops-density-card-padding:14px;--ops-density-cell-y:12px;--ops-density-cell-x:14px;--ops-density-chip-gap:10px;--ops-density-table-font:13px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c5c58}
.ops-shell{display:grid;gap:var(--ops-density-gap)}
.ops-titlebar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-titleblock{display:grid;gap:4px;max-width:720px}
.ops-titleblock h1,.ops-titleblock h2{margin-bottom:0}
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid,.ops-rail-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.ops-kpi,.ops-lane,.ops-resource-card,.ops-inline-card{display:grid;gap:6px;padding:var(--ops-density-card-padding);border:1px solid #d6e3e8;background:linear-gradient(180deg,#fff,#f7fbfc);border-radius:12px}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:800}
.ops-callout{display:grid;gap:6px;padding:var(--ops-density-card-padding);border-radius:12px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fbfefd,#f2f8f9)}
.ops-callout h3,.ops-lane h3,.ops-resource-card h3{margin:0;font-size:14px}
.ops-callout p,.ops-lane p,.ops-resource-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-callout.warn{border-color:#edd2ac;background:linear-gradient(180deg,#fffaf1,#fff3df)}
.ops-callout.bad{border-color:#efc5c8;background:linear-gradient(180deg,#fff7f7,#fff1f2)}
.ops-callout.ok{border-color:#bcdccf;background:linear-gradient(180deg,#f5fcf7,#edf8f0)}
.ops-rail-card{display:grid;gap:8px;padding:var(--ops-density-card-padding);border:1px solid #d6e4ea;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f8fbfc)}
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
.ops-table-shell{display:grid;gap:var(--ops-density-gap)}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.ops-table-meta>.search-cluster,.ops-table-meta>input[type="search"]{flex:1 1 280px;max-width:420px}
.search-cluster{display:grid;gap:6px;padding:var(--ops-density-card-padding);border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.search-cluster[role="search"]{box-shadow:0 0 0 1px rgba(216,228,236,.55) inset}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}
.search-cluster input{width:100%;min-height:40px}
.search-cluster .muted-text{line-height:1.4}
.ops-resource-list ul{margin:0;padding-left:18px;display:grid;gap:8px}
.ops-resource-list li{line-height:1.5}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{text-decoration:none}
.ops-detail-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.ops-form-shell{display:grid;gap:var(--ops-density-gap)}
.ops-object-shell{display:grid;gap:12px}
.ops-object-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-object-title{display:grid;gap:6px;max-width:760px}
.ops-object-title h1,.ops-object-title h2{margin:0}
.ops-summary-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.ops-summary-card{display:grid;gap:4px;padding:var(--ops-density-card-padding);border:1px solid #d6e4ea;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f7fbfc)}
.ops-summary-card.tone-ok{border-color:#cbe6d7;background:linear-gradient(180deg,#effcf7,#ffffff)}
.ops-summary-card.tone-warn{border-color:#ecd9ad;background:linear-gradient(180deg,#fff8ea,#fffdf7)}
.ops-summary-card.tone-bad{border-color:#efc4c4;background:linear-gradient(180deg,#fff4f4,#fffdfd)}
.ops-summary-card.tone-muted{border-color:#dbe5ef;background:linear-gradient(180deg,#f7fafc,#ffffff)}
.ops-summary-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#486173}
.ops-summary-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:15px;font-weight:800}
.ops-summary-hint{color:#4f6470;line-height:1.45}
.ops-lifecycle-shell{display:grid;gap:8px;padding:var(--ops-density-card-padding);border:1px solid #dbe5ef;border-radius:14px;background:linear-gradient(180deg,#f8fbfd,#ffffff)}
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
.ops-link-row{display:flex;align-items:center;gap:var(--ops-density-chip-gap);flex-wrap:wrap}
.ops-link-row form{margin:0;display:inline-flex;align-items:center}
.ops-link-row a,.ops-link-row button{white-space:nowrap;min-height:34px}
.ops-link-row a{font-weight:700}
.table-wrap table{font-size:var(--ops-density-table-font)}
.table-wrap th,.table-wrap td{padding:var(--ops-density-cell-y) var(--ops-density-cell-x);line-height:1.55}
.table-wrap .notice,.table-wrap .error{margin:0;min-height:72px;display:grid;align-content:center}
.ops-log-table pre{margin:0;max-height:220px;overflow:auto}
@media (max-width:720px){.ops-titleblock{max-width:none}.ops-table-meta{align-items:stretch}.ops-table-meta>.search-cluster,.ops-table-meta>input[type="search"]{max-width:none;width:100%}.ops-link-row,.ops-toolbar{display:grid;grid-template-columns:1fr}.ops-link-row a,.ops-link-row button,.ops-link-row form{width:100%}.ops-link-row form button{width:100%}}
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
  const hintId = `${input.id}-hint`;
  return `<div class="search-cluster" role="search" aria-label="${escapeAttribute(input.label)}"><label for="${escapeAttribute(input.id)}">${input.label}</label><input id="${escapeAttribute(
    input.id
  )}" name="q" type="search" data-table-filter="${escapeAttribute(input.targetId)}" aria-controls="${escapeAttribute(input.targetId)}" aria-describedby="${escapeAttribute(
    hintId
  )}"${input.urlParam ? ` data-url-param="${escapeAttribute(input.urlParam)}"` : ""} placeholder="${escapeAttribute(input.placeholder)}" autocomplete="off"/><span id="${escapeAttribute(
    hintId
  )}" class="muted-text">${input.hint}</span></div>`;
}

function renderSrOnlyCaption(text: string): string {
  return `<caption class="sr-only">${escapeAttribute(text)}</caption>`;
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
.list-power-shell{display:grid;gap:var(--ops-density-gap)}
.list-power-grid,.list-power-compare-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.list-power-card,.list-power-compare-card{display:grid;gap:8px;padding:var(--ops-density-card-padding);border:1px solid #d8e4ec;border-radius:14px;background:linear-gradient(180deg,#fff,#f7fbfc)}
.list-power-card h3,.list-power-compare-card h3{margin:0;font-size:15px}
.list-power-card p,.list-power-compare-card p{margin:0;color:#4f6470;line-height:1.5}
.list-power-chip-row,.list-power-action-row{display:flex;flex-wrap:wrap;gap:var(--ops-density-chip-gap);align-items:center}
.list-power-chip,.list-power-custom-chip button{border:1px solid #c8d8e5;border-radius:999px;background:#fff;color:#173040;font-size:12px;font-weight:700;padding:6px 10px;min-height:34px}
.list-power-chip.is-active,.list-power-custom-chip button.is-active{border-color:#0f766e;background:#e8f7f5;color:#0f5c58}
.list-power-custom-chip{display:inline-flex;align-items:center;gap:4px;padding:2px;border:1px solid #d6e2ea;border-radius:999px;background:#fff}
.list-power-custom-chip [data-remove-view]{border:none;background:transparent;color:#64748b;padding:4px 8px;font-size:11px;font-weight:700}
.list-power-action-row form{margin:0}
.list-power-action,.list-power-action-row button,.list-power-action-row a{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 10px;border-radius:10px;border:1px solid #c7d8e6;background:#fff;color:#173040;font-size:12px;font-weight:700;text-decoration:none;min-height:34px}
.list-power-action-row a{border-color:#d7e2e9;background:linear-gradient(180deg,#fcfefe,#f5faf9);color:#0f6e67}
.list-power-action-row button,.list-power-action-row form .list-power-action{box-shadow:0 1px 0 rgba(15,23,42,.04)}
.list-power-action:hover,.list-power-action-row button:hover,.list-power-action-row a:hover{text-decoration:none;border-color:#0f766e;background:#eef8f6}
.list-power-action[aria-disabled="true"],.list-power-action-row [aria-disabled="true"]{opacity:.55;pointer-events:none}
.list-power-checkbox{display:inline-flex;align-items:center;gap:6px}
.list-power-checkbox input{margin:0}
.list-power-checkbox.is-selected{color:#0f766e;font-weight:700}
.list-power-status{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.list-power-caption{display:grid;gap:4px;color:#4f6470;line-height:1.45;min-height:42px}
.list-power-live{padding:10px 12px;border:1px dashed #d4e0e7;border-radius:12px;background:linear-gradient(180deg,#fbfdfe,#f5f9fb);color:#47606d;line-height:1.45}
.list-power-compare-panel{display:grid;gap:10px;padding:var(--ops-density-card-padding);border:1px solid #d8e4ec;border-radius:16px;background:linear-gradient(180deg,#f8fbfd,#fff)}
.list-power-compare-card .list-power-meta{color:#4f6470;line-height:1.45}
.list-power-actions-shell{display:grid;gap:8px}
.list-power-run-profiles{display:grid;gap:6px;padding-top:6px;border-top:1px dashed #d6e2ea}
.list-power-inline-note{color:#4f6470;line-height:1.45}
.list-power-compare-panel .notice{margin:0}
@media (max-width:720px){.list-power-grid,.list-power-compare-grid{grid-template-columns:1fr}.list-power-status{justify-content:stretch}.list-power-action-row{display:grid;grid-template-columns:1fr}.list-power-action-row form{width:100%}.list-power-action,.list-power-action-row button,.list-power-action-row a{width:100%}}
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
        <p>Keep reusable list presets local to this browser while the current filter state stays safe to reopen from the URL.</p>
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
        <a class="list-power-action" href="#${input.rootId}-compare" data-compare-launch aria-disabled="true" aria-controls="${input.rootId}-compare">Compare selected</a>
        <button type="button" data-copy-selection data-copy="" aria-label="Copy selected IDs or paths" disabled>Copy selected IDs/paths</button>
      </div>
      <div class="list-power-caption" data-selection-caption>${input.selectionHint}</div>
    </article>
  </div>
  <div class="list-power-live" data-list-power-live role="status" aria-live="polite" aria-atomic="true">Saved views ready. No compare selection yet.</div>
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
    const match = cleanText(value).match(/^(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})??\s*(\\d{1,2})遺?\s*(\\d{1,2})珥?/);
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
    const liveRegion = root.querySelector('[data-list-power-live]');
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
    const toast = (title, message, tone = 'ok', timeoutMs = 2200) => {
      if (typeof window.__ecsToast === 'function') window.__ecsToast(title, message, tone, timeoutMs);
    };
    const announce = (message) => {
      if (liveRegion instanceof HTMLElement) liveRegion.textContent = message;
    };
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
          const label = cleanText(view.label || id);
          return '<span class="list-power-custom-chip"><button type="button" class=\"' + activeClass + '\" data-view-id=\"' + escapeHtml(id) + '\" data-view-note=\"' + escapeHtml(cleanText(view.note || view.label || 'Saved view')) + '\">' + escapeHtml(label) + '</button><button type="button" data-remove-view=\"' + escapeHtml(id) + '\" aria-label=\"Remove saved view ' + escapeHtml(label) + '\">Remove</button></span>';
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
      announce(viewLabel + ' ready. ' + rows.filter((row) => isVisibleRow(row)).length + ' rows visible.');
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
      if (copySelectionButton instanceof HTMLButtonElement) {
        copySelectionButton.setAttribute('data-copy', selected.map((node) => cleanText(node.dataset.copyValue || node.value)).filter(Boolean).join(', '));
        copySelectionButton.disabled = selectionCount === 0;
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
      announce(
        selectionCount > 0
          ? selectionCount + ' rows selected for compare. Compare handoff and copy actions are ready.'
          : 'No compare selection yet. Select visible rows to build a reopenable compare handoff.'
      );
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
        const removedId = cleanText(removeView.dataset.removeView);
        const removedLabel = cleanText(findView(removedId)?.label || removedId || 'Saved view');
        const nextViews = readSavedViews(pageKey).filter((view) => cleanText(view.id) !== cleanText(removeView.dataset.removeView));
        writeSavedViews(pageKey, nextViews);
        if (cleanText(root.dataset.activeViewId) === cleanText(removeView.dataset.removeView)) applyView('all');
        else renderCustomViews();
        syncViewButtons();
        toast('Saved view removed', removedLabel, 'warn');
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
        toast('Saved view updated', nextView.label);
        return;
      }
      if (target.closest('[data-reset-view]')) {
        applyView('all');
        toast('View reset', 'All rows');
        return;
      }
      if (target.closest('[data-clear-selection]')) {
        checkboxes().forEach((node) => {
          if (node instanceof HTMLInputElement) node.checked = false;
        });
        syncSelection();
        toast('Selection cleared', 'Compare handoff reset');
        return;
      }
      if (target.closest('[data-list-copy]')) {
        const button = target.closest('[data-list-copy]');
        const value = cleanText(button && button.getAttribute('data-list-copy'));
        if (!value) return;
        navigator.clipboard
          .writeText(value)
          .then(() => toast('Copied', value))
          .catch((error) => toast('Copy failed', String(error), 'bad', 5000));
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
        window.setTimeout(() => {
          if (viewState instanceof HTMLElement) viewState.textContent = cleanText(findView(cleanText(root.dataset.activeViewId || 'all'))?.label) || 'All rows';
          announce(rows.filter((row) => isVisibleRow(row)).length + ' rows match the current filters.');
          syncSelection(false);
        }, 0);
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
    input.bodyHtml ?? ((input.items?.length ?? 0) > 0 ? renderRailItems(input.items ?? []) : '<div class="notice">?쒖떆????ぉ???놁뒿?덈떎.</div>');
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

function renderActionLinks(links: Array<TableCellLink | null | undefined>, empty = "異붽? 留곹겕 ?놁쓬"): string {
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
          intro: input.lifecycleIntro ?? "?곹깭? ?덉쟾 ?≪뀡???꾩뿉??怨좎젙?⑸땲??",
          steps: input.lifecycleSteps
        })
      : ""
  }${input.panels?.length ? `<div class="ops-rail-grid">${input.panels.map(renderRailCard).join("")}</div>` : ""}</section>`;
}

function extractLastErrorText(errorStackHtml: string): string {
  const preMatch = errorStackHtml.match(/<pre>([\s\S]*?)<\/pre>/i);
  const raw = stripHtml(preMatch?.[1] ?? errorStackHtml)
    .replace(/^lastError ?ㅽ깮 ?닿린\/?リ린\s*/i, "")
    .replace(/^lastError:\s*/i, "");
  return summarizeText(raw || "湲곕줉??lastError ?놁쓬", 160);
}

function parseLogEntries(logRowsHtml: string): ParsedLogEntry[] {
  return parseTableRows(logRowsHtml)
    .filter((row) => row.cells.length >= 4)
    .map((row) => ({
      createdAt: stripHtml(row.cells[0]) || "-",
      level: stripHtml(row.cells[1]) || "-",
      message: stripHtml(row.cells[2]) || "(硫붿떆吏 ?놁쓬)",
      detailsHtml: row.cells[3] ?? ""
    }));
}

function toneFromLogLevel(level: string): OpsRailTone {
  const normalized = level.trim().toUpperCase();
  if (/(ERROR|FAIL|FAILED)/.test(normalized)) return "bad";
  if (/(WARN|WARNING)/.test(normalized)) return "warn";
  if (/(INFO|SUCCESS|SUCCEEDED|COMPLETED)/.test(normalized)) return "ok";
  return "muted";
}

function describeJobLifecycle(statusText: string, progressText: string, latestMessage = ""): JobLifecycleSummary {
  const normalized = statusText.trim().toUpperCase();
  const progressLabel = progressText.trim().length > 0 ? progressText : "0%";
  if (/(FAILED|ERROR|FAIL)/.test(normalized)) {
    return {
      tone: "bad",
      stageLabel: "recover",
      latestResult: latestMessage || "The latest attempt failed and needs recovery triage.",
      retryLabel: "retry available",
      retryDetail: "When a job is failed, confirm retryability on the detail surface before rerunning it.",
      safeActionLabel: "detail -> retry / recover",
      safeActionDetail: "Read lastError and retryability first, then decide between retry, HITL, or health.",
      shouldRecover: true,
      shouldPublish: false,
      shouldInspectHealth: true
    };
  }
  if (/(SUCCEEDED|COMPLETED|SUCCESS)/.test(normalized)) {
    return {
      tone: "ok",
      stageLabel: "handoff",
      latestResult: latestMessage || `The latest attempt completed cleanly at ${progressLabel} and is ready for handoff review.`,
      retryLabel: "retry not needed",
      retryDetail: "On a successful path, verify artifacts and publish handoff before thinking about another run.",
      safeActionLabel: "episode -> artifacts -> publish",
      safeActionDetail: "Confirm the owner episode and linked outputs before promoting to publish.",
      shouldRecover: false,
      shouldPublish: true,
      shouldInspectHealth: false
    };
  }
  if (/(RUNNING|IN_PROGRESS)/.test(normalized)) {
    return {
      tone: "warn",
      stageLabel: "in flight",
      latestResult: latestMessage || `The job is still running. Current progress is ${progressLabel}.`,
      retryLabel: "retry later",
      retryDetail: "Do not retry while the job is active. Confirm whether it is making progress or stuck first.",
      safeActionLabel: "detail -> health",
      safeActionDetail: "Inspect the latest result and health state before deciding whether the run is actually stuck.",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: true
    };
  }
  if (/(QUEUED|PENDING)/.test(normalized)) {
    return {
      tone: "muted",
      stageLabel: "queued",
      latestResult: latestMessage || "The job is queued and waiting for worker capacity.",
      retryLabel: "retry later",
      retryDetail: "Before retrying a queued job, inspect queue and worker health first.",
      safeActionLabel: "detail -> health",
      safeActionDetail: "Check queue, worker availability, and duplicate runs before taking action.",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: true
    };
  }
  if (/(CANCELLED|痍⑥냼)/.test(normalized)) {
    return {
      tone: "warn",
      stageLabel: "inspect",
      latestResult: latestMessage || "?묒뾽??痍⑥냼?섏뼱 醫낅즺?섏뿀?듬땲??",
      retryLabel: "inspect first",
      retryDetail: "??痍⑥냼?섏뿀?붿? ?뺤씤???ㅼ뿉留?retry ?먮뒗 ?泥?寃쎈줈瑜?怨좊쫭?덈떎.",
      safeActionLabel: "detail -> episode",
      safeActionDetail: "痍⑥냼 ?먯씤怨?owning episode 臾몃㎘??癒쇱? ?뺤씤?⑸땲??",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: false
    };
  }
  return {
    tone: "muted",
    stageLabel: "inspect",
    latestResult: latestMessage || `?곹깭 ${statusText || "-"} ?먯꽌 異붽? ?먮떒???꾩슂?⑸땲??`,
    retryLabel: "inspect first",
    retryDetail: "retryability? blockers瑜?detail?먯꽌 癒쇱? ?뺤씤?⑸땲??",
    safeActionLabel: "detail",
    safeActionDetail: "?먯떆 evidence蹂대떎 癒쇱? object summary? linked objects瑜??쎌뒿?덈떎.",
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
        "linked object ?놁쓬"
      );
      const nextActionLinks = renderActionLinks(
        [
          jobLink ? { href: jobLink.href, label: "detail" } : null,
          lifecycle.shouldRecover ? { href: episodeId ? `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}` : "/ui/hitl", label: "recover" } : null,
          lifecycle.shouldInspectHealth ? { href: "/ui/health", label: "health" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId && lifecycle.shouldPublish ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "detail?먯꽌 ?ㅼ쓬 ?≪뀡???뺤씤?섏꽭??"
      );

      return `<tr><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        jobLink ? `<a href="${jobLink.href}">${jobLink.label}</a>` : stripHtml(row.cells[0]) || "-"
      }</strong>${renderToneBadge(lifecycle.stageLabel, lifecycle.tone)}</div><span class="ops-cell-meta">list -> detail -> recover ?먮쫫??anchor job object?낅땲??</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "?곌껐??owner episode ?뺣낫媛 ?놁뒿?덈떎."
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
        "linked object ??곸벉"
      );
      const followupLinks = renderActionLinks(
        [
          lifecycle.shouldRecover ? { href: episodeId ? `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}` : "/ui/hitl", label: "recover" } : null,
          lifecycle.shouldInspectHealth ? { href: "/ui/health", label: "health" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null
        ],
        "detail?癒?퐣 ??쇱벉 ??る???類ㅼ뵥??뤾쉭??"
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
      )}</div><span class="ops-cell-meta">list -> detail -> recover ?癒?カ??anchor job object??낅빍??</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "?怨뚭퍙??owner episode ?類ｋ궖揶쎛 ??곷뮸??덈뼄."
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
      const blockerText = summarizeText(stripHtml(row.cells[5]) || "湲곕줉??lastError ?놁쓬", 140);
      const preflightLinks = renderActionLinks(
        [
          jobLink ? { href: jobLink.href, label: "detail" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}`, label: "recover" } : null
        ],
        "detail?먯꽌 blocker瑜?癒쇱? ?뺤씤?섏꽭??"
      );
      const handoffLinks = renderActionLinks(
        [
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null,
          episodeId ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "recover ??linked outputs瑜??뺤씤?섏꽭??"
      );

      return `<tr><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        jobLink ? `<a href="${jobLink.href}">${jobLink.label}</a>` : stripHtml(row.cells[0]) || "-"
      }</strong>${renderToneBadge("recover", "bad")}</div><span class="ops-cell-meta">?ㅽ뙣 job object?먯꽌 recover ?먮쫫???쒖옉?⑸땲??</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "?곌껐 episode ?뺣낫媛 ?놁뒿?덈떎."
      }</span>${renderActionLinks(
        [
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null
        ],
        "linked object ?놁쓬"
      )}</div></td><td><div class="ops-cell-stack"><strong>${topicText}</strong><span class="ops-cell-meta">${typeText}</span></div></td><td><div class="ops-cell-stack"><strong>preflight blocker</strong><span class="ops-cell-meta">${blockerText}</span></div></td><td><div class="ops-cell-stack"><strong>detail -> dryRun recover</strong><span class="ops-cell-meta">root cause瑜?detail?먯꽌 ?뺤씤????episodeId? failedShotIds濡?dryRun遺??寃利앺빀?덈떎.</span>${preflightLinks}</div></td><td><div class="ops-cell-stack"><strong>artifacts -> publish handoff</strong><span class="ops-cell-meta">${createdText}</span>${handoffLinks}</div></td></tr>`;
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
  intro: "list -> detail -> recover -> handoff ?먮쫫??Job object 湲곗??쇰줈 ?쎌뒿?덈떎. row action grammar??媛숈? ?⑥뼱(detail, recover, episode, artifacts, publish)濡?留욎땅?덈떎.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui">Dashboard</a><a href="/ui/hitl">HITL</a><a href="/ui/publish">Publish</a>',
  summaryCards: [
    { label: "踰붿쐞", valueHtml: "<strong>理쒓렐 100媛?job object</strong>", hint: "理쒖떊 ?ㅽ뙣? 硫덉텣 ?ㅽ뻾???꾩そ?먯꽌 癒쇱? ?≪뒿?덈떎.", tone: "muted" },
    { label: "latest result", valueHtml: "<strong>failed / stuck running ?곗꽑</strong>", hint: "?깃났 寃쎈줈蹂대떎 recover ?꾨낫瑜?癒쇱? ?щ뒗 由ъ뒪?몄엯?덈떎.", tone: "warn" },
    { label: "row grammar", valueHtml: "<strong>detail -> recover -> handoff</strong>", hint: "媛??됱? detail, retryability, linked objects瑜?媛숈? ?쒖꽌濡?蹂댁뿬以띾땲??", tone: "ok" },
    { label: "linked objects", valueHtml: "<strong>episode -> artifacts -> publish</strong>", hint: "job?먯꽌 ?앸궡吏 ?딄퀬 owner episode? handoff 寃쎈줈源뚯? 媛숈씠 遊낅땲??", tone: "ok" }
  ],
  lifecycleTitle: "list -> detail -> recover -> handoff",
  lifecycleIntro: "由ъ뒪?몃뒗 Job object lifecycle???낃뎄?낅땲?? ?ㅽ뙣? ?뺤껜瑜?癒쇱? ?↔퀬, ?밴꺽? 留덉?留??④퀎?먯꽌留??쎈땲??",
  lifecycleSteps: [
    { label: "list", detail: "status? latest result濡?failed / stuck job??癒쇱? 怨좊쫭?덈떎.", tone: "muted" },
    { label: "detail", detail: "status, retryability, blockers, linked objects瑜??곷떒?먯꽌 ?쎌뒿?덈떎.", tone: "warn" },
    { label: "recover", detail: "retry, HITL, health 以??ㅼ쓬 ?덉쟾 ?≪뀡??怨좊쫭?덈떎.", tone: "bad" },
    { label: "handoff", detail: "owner episode? artifacts媛 ?뺥빀???뚮쭔 publish瑜??쎈땲??", tone: "ok" }
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
  title: "?ㅼ쓬 ?덉쟾 ?≪뀡",
  intro: "?꾪꽣, retryability, linked objects瑜?癒쇱? 怨좎젙???ㅼ뿉留?row detail濡??대젮媛묐땲??",
  linksHtml: '<a href="/ui/health">Health</a><a href="/ui/episodes">Episodes</a><a href="/ui/artifacts">Artifacts</a>',
  cards: [
    {
      title: "?꾪꽣 + row ?ㅽ뵂",
      intro: "job id, owner episode, status濡?醫곹엺 ?ㅼ쓬 detail?먯꽌 lifecycle???쎈땲??",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "jobs-filter",
        targetId: "jobs-table",
        label: "?묒뾽 ?꾪꽣",
        placeholder: t.filterPlaceholder,
        urlParam: "jobsFilter",
        hint: "??由ъ뒪?몄뿉 濡쒖뺄濡??곸슜?⑸땲?? / 濡??꾩뿭 寃?됱쑝濡?諛붾줈 ?대룞?????덉뒿?덈떎."
      })
    },
    {
      title: "蹂듦뎄 ?곗꽑?쒖쐞",
      intro: "FAILED? 硫덉텣 RUNNING??癒쇱? ?뺣━?섍퀬, publish??latest result媛 ?뺥빀???뚮쭔 留덉?留됱뿉 ?쎈땲??",
      tone: "warn",
      items: [
        { label: "FAILED??detail -> retry / recover", detail: "job detail?먯꽌 lastError, retryability, blocker瑜??뺤씤????HITL ?щ?瑜??먮떒?⑸땲??" },
        { label: "RUNNING ?뺤껜??detail -> health", detail: "?ъ떆???꾩뿉 health, queue, 理쒓렐 jobs瑜??④퍡 ?뺤씤??以묐났 ?ㅽ뻾???쇳빀?덈떎." },
        { label: "publish hold", detail: "latest result? linked artifacts媛 留욎븘?쇰쭔 ?밴꺽?쇰줈 ?섍퉩?덈떎." }
      ],
      linksHtml: '<a href="/ui/hitl">HITL</a><a href="/ui/health">?곹깭</a>'
    },
    {
      title: "怨듯넻 row 臾몃쾿",
      intro: "紐⑤뱺 row??detail, owner episode, linked objects, next safe action??媛숈? 臾몃쾿?쇰줈 蹂댁뿬以띾땲??",
      tone: "ok",
      items: [
        { label: "detail", detail: "status, latest result, retryability瑜?癒쇱? ?쎌뒿?덈떎." },
        { label: "episode / artifacts", detail: "owner object? linked outputs瑜?媛숈? row?먯꽌 諛붾줈 ?쎈땲??" },
        { label: "recover / publish", detail: "?ㅽ뙣??recover濡? ?깃났? publish handoff濡??댁뼱吏묐땲??" }
      ],
      linksHtml: '<a href="/ui/episodes">Episodes</a><a href="/ui/artifacts">Artifacts</a><a href="/ui/publish">Publish</a>'
    },
    {
      title: "Surface help",
      intro: "Use the list as the control layer: filter, compare, and copy first, then open detail only for the next safe action.",
      tone: "muted",
      items: [
        { label: "Saved views", detail: "Keep a few local job slices per browser without leaking them into shell-wide navigation." },
        { label: "Compare handoff", detail: "Selection stays in the URL, so compare and recovery work can be reopened safely after moving to detail pages." },
        { label: "Empty or blocked rows", detail: "If the list is empty or stale, go back to dashboard, health, or recent episodes before retrying raw actions." }
      ],
      linksHtml: '<a href="/ui">Dashboard</a><a href="/ui/health">Health</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>?묒뾽 ?ㅻ툕?앺듃</h2>
      <p class="section-intro">媛??됱? job object -> owner episode -> latest result -> retryability -> next safe action ?쒖꽌濡??쎌뒿?덈떎. raw evidence??detail ?붾㈃?쇰줈 ?대┰?덈떎.</p>
    </div>
    <span class="badge muted">${t.latestBadge}</span>
  </div>
  <div class="table-wrap"><table id="jobs-table" aria-label="Job objects list">${renderSrOnlyCaption(
    "Job objects list with owner episode, latest result, retryability, and next safe action."
  )}<thead><tr><th>job object / lifecycle</th><th>owner episode / linked objects</th><th>type / latest result</th><th>status / retryability</th><th>progress / created</th><th>next safe action</th></tr></thead><tbody>${
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
  const episodeLabel = hasEpisodeId ? `<strong class="mono">${episodeId}</strong>` : "<strong>episode id瑜??낅젰?섏꽭??</strong>";

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "publish preflight",
  title: t.title,
  intro: "publish??page action???꾨땲??episode object handoff?낅땲?? episode -> latest job -> artifacts -> publish ?쒖꽌濡??좉툑???由??뚮쭔 ?덉쟾?⑸땲??",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/episodes">Episodes</a><a href="/ui/artifacts">Artifacts</a>',
  summaryCards: [
    { label: "target object", valueHtml: episodeLabel, hint: "媛숈? episode id濡?jobs, artifacts, publish瑜??앷퉴吏 ?댁뼱媛묐땲??", tone: hasEpisodeId ? "ok" : "warn" },
    { label: "latest job gate", valueHtml: "<strong>COMPLETED / PREVIEW_READY</strong>", hint: "FAILED, stuck RUNNING, retry pending?대㈃ publish蹂대떎 recover媛 癒쇱??낅땲??", tone: "warn" },
    { label: "linked artifacts", valueHtml: "<strong>preview / final / manifest</strong>", hint: "raw folder蹂대떎 QC? output presence ?뺥빀??癒쇱? ?뺤씤?⑸땲??", tone: hasEpisodeId ? "ok" : "muted" },
    {
      label: "next safe action",
      valueHtml: `<strong>${hasEpisodeId ? "jobs -> artifacts -> publish" : "episode ?좏깮"}</strong>`,
      hint: hasEpisodeId ? "latest result? linked outputs瑜??뺤씤???ㅼ뿉留?publish request瑜?蹂대깄?덈떎." : "?먰뵾?뚮뱶 ?곸꽭??job detail?먯꽌 媛숈? id瑜?蹂듭궗???ㅼ꽭??",
      tone: hasEpisodeId ? "ok" : "warn"
    }
  ],
  lifecycleTitle: "episode -> latest job -> artifacts -> publish",
  lifecycleIntro: "publish??留덉?留??④퀎?낅땲?? preflight媛 源⑥?硫??ㅼ떆 jobs ?먮뒗 recover 寃쎈줈濡??섎룎?꾧컩?덈떎.",
  lifecycleSteps: [
    { label: "episode", detail: hasEpisodeId ? `target object ${episodeId}瑜?怨좎젙?⑸땲??` : "癒쇱? target episode瑜?怨좊쫭?덈떎.", tone: hasEpisodeId ? "ok" : "warn" },
    { label: "latest job", detail: "理쒓렐 job???깃났 寃쎈줈?몄?, retry / recover媛 癒쇱??몄? ?뺤씤?⑸땲??", tone: "warn" },
    { label: "artifacts", detail: "preview, final, QC, upload manifest ?뺥빀??留욎땅?덈떎.", tone: hasEpisodeId ? "ok" : "muted" },
    { label: "publish", detail: "preflight媛 紐⑤몢 ?듦낵???뚮쭔 handoff瑜??ㅽ뻾?⑸땲??", tone: hasEpisodeId ? "ok" : "muted" }
  ]
})}

${renderRailSection({
  title: "preflight + next safe action",
  intro: "?쇰툝由ъ떆 踰꾪듉蹂대떎 癒쇱? target episode, latest result gate, linked outputs, blocked path瑜??곷떒?먯꽌 怨좎젙?⑸땲??",
  cards: [
    {
      title: "episode object + latest result",
      intro: hasEpisodeId
        ? `?밴꺽 ???episode id??${episodeId} ?낅땲?? 癒쇱? episode detail?먯꽌 ?곹깭? latest job result瑜??뺤씤?⑸땲??`
        : "?밴꺽???ㅻ툕?앺듃媛 ?꾩쭅 ?뺥빐吏吏 ?딆븯?듬땲?? episode id瑜?癒쇱? ?뺥븯?몄슂.",
      tone: hasEpisodeId ? "ok" : "warn",
      items: [
        { label: "episode detail", detail: "???ㅻ툕?앺듃???꾩옱 ?곹깭? owner context瑜?癒쇱? ?뺤씤?⑸땲??" },
        { label: "latest job", detail: "publish??理쒖떊 ?묒뾽???깃났 寃쎈줈???덈뒗 寃쎌슦?먮쭔 ?덉쟾?⑸땲??" },
        { label: "retryability", detail: "FAILED ?먮뒗 stuck RUNNING?대㈃ publish ???recover ?먮떒??癒쇱? ?대┰?덈떎." }
      ],
      linksHtml: `<a href="${episodeHref}">${hasEpisodeId ? "?먰뵾?뚮뱶 ?곸꽭" : "?먰뵾?뚮뱶 紐⑸줉"}</a>`
    },
    {
      title: "artifacts gate",
      intro: "preview, final, QC, upload manifest媛 紐⑤몢 媛숈? episode object瑜?媛由ы궎?붿? 癒쇱? 留욎땅?덈떎.",
      tone: hasEpisodeId ? "ok" : "muted",
      items: [
        { label: "preview / final", detail: "?밴꺽 ??異쒕젰 ?뚯씪???ㅼ젣濡?議댁옱?섎뒗吏 ?뺤씤?⑸땲??" },
        { label: "QC / manifest", detail: "?먯떆 evidence蹂대떎 癒쇱? QC? upload manifest瑜??뺤씤?⑸땲??" },
        { label: "publish handoff", detail: "linked outputs媛 ?뺥빀??寃쎌슦?먮쭔 publish request瑜??쎈땲??" }
      ],
      linksHtml: `<a href="${artifactsHref}">Artifacts</a><a href="${folderHref}">Raw folder</a>`
    },
    {
      title: "blocked path",
      intro: "publish媛 留됲엳硫?raw folder ?먯깋蹂대떎 jobs, health, artifacts 以??대뒓 ?ㅻ툕?앺듃?먯꽌 ?섎룎?꾧컝吏 癒쇱? 怨좊쫭?덈떎.",
      tone: "warn",
      items: [
        { label: "jobs first", detail: "Confirm the latest job failure, blocker, and retryability before forcing publish." },
        { label: "health second", detail: "If queue or storage health is degraded, recover the platform before retrying handoff." },
        { label: "artifacts before publish", detail: "If outputs are missing, return to render or compile instead of promoting a broken package." }
      ],
      linksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/health">Health</a><a href="/ui/artifacts">Artifacts</a>'
    }
  ]
})}

${renderRailSection({
  title: "?쇰툝由ъ떆 ?ㅽ뻾",
  intro: "?붿껌 ?낅젰? 媛꾨떒?섍쾶 ?먮릺, next safe action怨?rollback anchor??媛숈? ?덉씪 ?덉뿉 ?좎??⑸땲??",
  cards: [
    {
      title: "?쇰툝由ъ떆 ?붿껌",
      intro: "episode id ?섎굹濡?handoff瑜??ㅽ뻾?⑸땲??",
      tone: hasEpisodeId ? "ok" : "muted",
      bodyHtml: `<form method="post" action="/ui/publish" class="ops-form-shell"><div class="field"><label for="publish-episode-id">episodeId <span class="hint" data-tooltip="${t.episodeHelp}">?</span></label><input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/><small>?먰뵾?뚮뱶 ?곸꽭, ?묒뾽 ?곸꽭, ?곗텧臾?留곹겕?먯꽌 媛숈? id瑜?蹂듭궗???ъ슜?⑸땲??</small></div><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="?쇰툝由ъ떆 ?ㅽ뻾">${t.runAction}</button></div></form>`
    },
    {
      title: "submit preflight",
      intro: "?낅젰媛믩낫??latest result? linked outputs ?뺥빀????以묒슂?⑸땲??",
      tone: "ok",
      items: [
        { label: "episode ?곹깭", detail: "COMPLETED ?먮뒗 PREVIEW_READY?몄? ?뺤씤?⑸땲??" },
        { label: "latest job", detail: "諛⑷툑 ?ㅽ뙣???묒뾽???덉쑝硫??밴꺽蹂대떎 recover瑜?癒쇱? 吏꾪뻾?⑸땲??" },
        { label: "output manifest", detail: "upload manifest? output presence媛 留욌뒗吏 ?뺤씤?⑸땲??" }
      ]
    },
    {
      title: "李⑤떒 ??蹂듦?",
      intro: "publish媛 留됲엳硫?raw folder蹂대떎 owner episode? linked job 履쎌쑝濡??섎룎?꾧????⑸땲??",
      tone: "warn",
      items: [
        { label: "jobs", detail: "?ㅽ뙣??理쒖떊 ?묒뾽怨?retryability瑜??뺤씤?⑸땲??" },
        { label: "artifacts", detail: "異쒕젰??鍮꾨㈃ render / compile ?④퀎遺???ㅼ떆 遊낅땲??" },
        { label: "health", detail: "?쒕퉬????섍? ?덉쑝硫??밴꺽??硫덉텛怨?蹂듦뎄 紐낅졊??癒쇱? 怨좊쫭?덈떎." }
      ],
      linksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/artifacts">Artifacts</a><a href="/ui/health">Health</a>'
    },
    {
      title: "Publish help",
      intro: "Treat this page as a preflight and handoff checkpoint, not as a raw publish button.",
      tone: "muted",
      items: [
        { label: "Start from the episode object", detail: "Reuse the same episodeId from episodes, jobs, or artifacts so the handoff stays coherent." },
        { label: "Do not trust the folder alone", detail: "Manifest, preview, final output, and latest job state should agree before you promote anything." },
        { label: "Blocked path", detail: "If the request feels unsafe, go back to jobs or artifacts first instead of forcing publish from here." }
      ],
      linksHtml: '<a href="/ui/episodes">Episodes</a><a href="/ui/jobs">Jobs</a>'
    }
  ]
})}`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  const statusTone = inferTone(input.statusBadge);
  const statusText = stripHtml(input.statusBadge) || "unknown";
  const logs = parseLogEntries(input.logRows);
  const latestLog = logs.at(-1) ?? null;
  const latestResultText = latestLog ? summarizeText(latestLog.message, 140) : "湲곕줉??理쒖떊 濡쒓렇媛 ?놁뒿?덈떎.";
  const blockerText = extractLastErrorText(input.errorStack);
  const hasBlocker = !/(湲곕줉??lastError ?놁쓬|\(?놁쓬\))/.test(blockerText);
  const canRetry = input.retryAction.includes("<form") && !input.retryAction.includes("disabled");
  const lifecycle = describeJobLifecycle(statusText, `${input.progress}%`, latestResultText);
  const retryTone: OpsRailTone = canRetry ? "bad" : lifecycle.shouldPublish ? "ok" : statusTone;
  const nextSafeActionLabel = canRetry ? "retry -> artifacts recheck" : lifecycle.safeActionLabel;
  const nextSafeActionDetail = canRetry
    ? "??job object?먯꽌 retry????owner episode? linked outputs瑜??ㅼ떆 ?뺤씤?⑸땲??"
    : lifecycle.safeActionDetail;
  const actionGrammarHtml = `<div class="stack"><span class="muted-text">detail -> retry / recover -> episode -> artifacts -> publish 臾몃쾿??媛숈? ?쒖꽌濡??좎??⑸땲??</span><div class="ops-link-row">${input.retryAction}<a href="/ui/hitl">recover</a>${
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
  intro: "status, owner episode, latest result, retryability, blockers, next safe action, linked objects瑜?raw logs ?꾩뿉 怨좎젙?⑸땲??",
  flash: input.flash,
  quickLinksHtml: `<a href="/ui/jobs">Jobs list</a><a href="/ui/episodes/${input.episodeId}">Episode</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(
    input.episodeId
  )}">Artifacts</a>`,
  summaryCards: [
    { label: "status", valueHtml: input.statusBadge, hint: "status badge媛 retry / recover / publish hold ?먮떒??寃곗젙?⑸땲??", tone: statusTone },
    {
      label: "owner episode",
      valueHtml: `<a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a>`,
      hint: "紐⑸줉?쇰줈 ?뚯븘媛吏 ?딄퀬 owner object濡?諛붾줈 handoff ?⑸땲??",
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
      valueHtml: `<strong>${canRetry ? "retry available" : lifecycle.retryLabel}</strong>`,
      hint: canRetry ? "This failed job can be retried directly from the detail surface." : lifecycle.retryDetail,
      tone: retryTone
    },
    {
      label: "blockers",
      valueHtml: `<strong>${hasBlocker ? "?덉쓬" : "?놁쓬"}</strong>`,
      hint: hasBlocker ? blockerText : "?꾩옱 lastError blocker??蹂댁씠吏 ?딆뒿?덈떎.",
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
  lifecycleIntro: "??detail? page媛 ?꾨땲??Job object ?쒖뼱硫댁엯?덈떎. latest result? blockers瑜??쎌? ???ㅼ쓬 ?④퀎濡쒕쭔 ?대룞?⑸땲??",
  lifecycleSteps: [
    { label: "list", detail: "job list?먯꽌 ?ㅽ뙣 ?먮뒗 ?뺤껜 job??怨좊쫭?덈떎.", tone: "muted" },
    { label: "detail", detail: "status, owner, latest result, retryability瑜??꾩뿉???쎌뒿?덈떎.", tone: statusTone },
    {
      label: lifecycle.shouldRecover || canRetry ? "recover" : lifecycle.shouldInspectHealth ? "health" : "inspect",
      detail: canRetry ? "retry ?먮뒗 recover 寃쎈줈瑜?怨좊쫭?덈떎." : lifecycle.safeActionDetail,
      tone: retryTone
    },
    {
      label: lifecycle.shouldPublish ? "handoff" : "linked objects",
      detail: lifecycle.shouldPublish ? "owner episode? artifacts ?뺥빀 ??publish濡??섍퉩?덈떎." : "owner episode? artifacts瑜?癒쇱? 留욎땅?덈떎.",
      tone: lifecycle.shouldPublish ? "ok" : "muted"
    }
  ],
  panels: [
    {
      title: "怨듯넻 ?≪뀡 臾몃쾿",
      intro: "retry / recover / episode / artifacts / publish handoff瑜?媛숈? 臾몃쾿?쇰줈 ?좎??⑸땲??",
      tone: retryTone,
      bodyHtml: actionGrammarHtml
    },
    {
      title: "linked objects",
      intro: "detail?먯꽌 諛붾줈 owner episode, artifacts, publish 寃쎈줈濡?handoff ?⑸땲??",
      tone: "ok",
      items: [
        { label: "owner episode", detail: "?뚯쑀 object ?곹깭? ?꾩냽 ?뚮뜑 寃쎈줈瑜??뺤씤?⑸땲??" },
        { label: "artifacts", detail: "output presence ?뺤씤???꾩슂???뚮쭔 raw folder濡??대젮媛묐땲??" },
        { label: "publish handoff", detail: "?깃났 寃곌낵瑜??밴꺽????媛숈? episode id濡??섍퉩?덈떎." }
      ],
      linksHtml: `<a href="/ui/episodes/${input.episodeId}">episode</a><a href="/artifacts/${input.episodeId}/">artifacts folder</a><a href="/ui/publish?episodeId=${encodeURIComponent(
        input.episodeId
      )}">publish</a>`
    },
    {
      title: "raw evidence discipline",
      intro: "?먯떆 evidence?????먮떒硫??ㅼ뿉留??〓땲?? latest result? blockers瑜?癒쇱? ?붿빟?댁꽌 ?쎌뒿?덈떎.",
      tone: hasBlocker ? "warn" : "muted",
      items: [
        { label: "latest result", detail: latestLog ? `${latestLog.createdAt} 쨌 ${latestResultText}` : lifecycle.latestResult },
        { label: "blocker snapshot", detail: blockerText },
        { label: "raw logs", detail: "retry? recover 寃쎈줈瑜??뺥븳 ?ㅼ뿉留?2李?evidence濡??대젮媛묐땲??" }
      ]
    }
  ]
})}

<section class="card" data-surface-role="evidence" data-surface-priority="secondary">
  <div class="section-head">
    <div>
      <h2>Blocker snapshot</h2>
      <p class="section-intro">媛??以묒슂??failure context留??④퉩?덈떎. raw logs蹂대떎 ?꾩뿉 ?먮뒗 留덉?留??먮떒??evidence?낅땲??</p>
    </div>
  </div>
  <div class="ops-resource-card">${input.errorStack}</div>
</section>

<section class="card ops-table-shell ops-log-table" data-surface-role="evidence" data-surface-priority="secondary">
  <div class="ops-table-meta">
    <div>
      <h2>?먯떆 濡쒓렇 / 2李?evidence</h2>
      <p class="section-intro">retry? recovery 寃쎈줈媛 ?꾩뿉???뺣━???ㅼ뿉留?raw log evidence瑜??뺤씤?⑸땲??</p>
    </div>
    <input id="job-log-filter" type="search" data-table-filter="job-log-table" data-url-param="jobLogFilter" aria-label="Job log filter" aria-controls="job-log-table" placeholder="Search logs"/>
  </div>
  <div class="table-wrap"><table id="job-log-table" aria-label="Job log evidence">${renderSrOnlyCaption("Job log evidence table with timestamp, level, message, and details.")}<thead><tr><th>?앹꽦 ?쒓컖</th><th>?덈꺼</th><th>硫붿떆吏</th><th>?곸꽭</th></tr></thead><tbody>${
    input.logRows || renderTableEmptyRow(4, "濡쒓렇媛 ?놁뒿?덈떎.")
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
  intro: "?ㅽ뙣 job object?먯꽌 recover濡??섏뼱媛???쒖뼱硫댁엯?덈떎. failed detail, dryRun preflight, artifacts handoff, publish hold瑜?媛숈? ?먮쫫?쇰줈 ?좎??⑸땲??",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/publish">Publish</a><a href="/ui/artifacts">Artifacts</a>',
  summaryCards: [
    { label: "failure anchor", valueHtml: "<strong>failed job detail</strong>", hint: "?먯씤 ?뺤씤? ??긽 failed job object?먯꽌 ?쒖옉?⑸땲??", tone: "bad" },
    { label: "recover input", valueHtml: "<strong>episodeId + failedShotIds</strong>", hint: "蹂듦뎄 ???object瑜?紐낆떆?곸쑝濡?醫곹???rerender ?⑸땲??", tone: "warn" },
    { label: "preflight", valueHtml: "<strong>dryRun first</strong>", hint: "?ㅽ뻾 ??寃쎈줈 寃利앹쓣 癒쇱? ?듦낵?쒗궎??寃껋씠 ?덉쟾?⑸땲??", tone: "warn" },
    { label: "handoff", valueHtml: "<strong>artifacts -> publish</strong>", hint: "蹂듦뎄 ?깃났 ??諛붾줈 ?밴꺽?섏? 留먭퀬 linked outputs ?뺥빀??癒쇱? 留욎땅?덈떎.", tone: "ok" }
  ],
  lifecycleTitle: "failed job -> preflight -> rerender -> handoff",
  lifecycleIntro: "HITL? raw rerender 踰꾪듉???꾨땲??recover preflight?낅땲?? failed detail怨?linked outputs瑜??딆? ?딄퀬 ?댁뼱???⑸땲??",
  lifecycleSteps: [
    { label: "failed job", detail: "?ㅽ뙣 job detail?먯꽌 blocker? root cause瑜??쎌뒿?덈떎.", tone: "bad" },
    { label: "preflight", detail: "episodeId, failedShotIds, dryRun?쇰줈 recover 寃쎈줈瑜?寃利앺빀?덈떎.", tone: "warn" },
    { label: "rerender", detail: "??job object瑜??앹꽦?섎릺 recover 臾몃㎘???좎??⑸땲??", tone: "warn" },
    { label: "handoff", detail: "artifacts ?뺥빀 ?ㅼ뿉留?publish handoff濡??섍퉩?덈떎.", tone: "ok" }
  ]
})}

${renderRailSection({
  title: "recover preflight + next safe action",
  intro: "failed row瑜?怨좊Ⅴ怨?rerender瑜??ㅽ뻾???? artifacts? publish hold源뚯? 媛숈? ?덉씪?먯꽌 ?뺤씤?⑸땲??",
  cards: [
    {
      title: "failed row intake",
      intro: "Use job id, owner episode, topic, and error text to isolate the recovery target before opening a rerender request.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "hitl-filter",
        targetId: "hitl-failed-table",
        label: "Failed jobs filter",
        placeholder: t.filterPlaceholder,
        hint: "Search by job id, owner episode, topic, or failure keyword before you open a recovery path."
      })
    },
    {
      title: "recover request",
      intro: "蹂듦뎄 ???shot id瑜?紐낆떆?섍퀬 dryRun?쇰줈 寃쎈줈瑜?癒쇱? 寃利앺븷 ???덉뒿?덈떎.",
      tone: "warn",
      bodyHtml: `<form method="post" action="/ui/hitl/rerender" class="ops-form-shell"><div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div><div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="${t.failedShotHelp}">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>${t.failedShotHint}</small></div><label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun (?ㅽ뻾 ??寃利?</label><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="HITL rerender ?ㅽ뻾">${t.runAction}</button></div></form>`
    },
    {
      title: "recover -> handoff",
      intro: "Do not jump straight from rerender to publish. Recheck linked outputs and the latest result first.",
      tone: "ok",
      items: [
        { label: "failed job detail", detail: "Start from the failed job detail when you need blocker context or retry history." },
        { label: "artifact verification", detail: "Confirm preview, final output, and QC were really refreshed by the rerender." },
        { label: "publish handoff", detail: "Only hand off to publish after the rerender result looks coherent." }
      ],
      linksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/artifacts">Artifacts</a><a href="/ui/publish">Publish</a>'
    },
    {
      title: "Recover help",
      intro: "Use this surface to validate the rerender request, not to bypass the failed-job diagnosis.",
      tone: "muted",
      items: [
        { label: "Dry run first", detail: "failure mode媛 ?룰컝由щ㈃ episodeId? failedShotIds瑜?癒쇱? 寃利앺븳 ???ㅼ젣 rerender瑜??ㅽ뻾?⑸땲??" },
        { label: "Keep the failed row nearby", detail: "?꾪꽣濡????row瑜?醫곹? owner episode? blocker瑜????놁뿉 ??梨꾨줈 蹂듦뎄瑜?吏꾪뻾?⑸땲??" },
        { label: "Return from the same object", detail: "rerender ?ㅼ뿉??媛숈? episode object?먯꽌 artifacts? publish瑜??ㅼ떆 ?щ뒗 ?몄씠 ?덉쟾?⑸땲??" }
      ],
      linksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/artifacts">Artifacts</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.failedJobs}</h2>
      <p class="section-intro">row action grammar瑜?failed job object -> owner episode -> preflight blocker -> recover -> handoff ?쒖꽌濡??듭씪?⑸땲??</p>
    </div>
  </div>
  <div class="table-wrap"><table id="hitl-failed-table" aria-label="?ㅽ뙣 ?묒뾽 蹂듦뎄 ?뚯씠釉?>${renderSrOnlyCaption(
    "Failed job recovery table with owner episode, preflight blocker, next safe action, and handoff."
  )}<thead><tr><th>failed job object / lifecycle</th><th>owner episode / linked objects</th><th>topic / type</th><th>preflight blocker</th><th>next safe action</th><th>recover -> handoff</th></tr></thead><tbody>${
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
  const linkedOutputsHtml = hasEpisodeLinks ? input.episodeLinks : '<div class="notice">?꾩쭅 ?먰뵾?뚮뱶 鍮좊Ⅸ 留곹겕瑜?遺덈윭?ㅼ? ?딆븯?듬땲??</div>';

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">linked outputs</span>
      <h1>${t.title}</h1>
      <p class="section-intro">?곗텧臾??붾㈃? raw directory 釉뚮씪?곗?媛 ?꾨땲??linked object view?낅땲?? episode id瑜?以묒떖?쇰줈 output presence? recovery anchor瑜??④퍡 遊낅땲??</p>
    </div>
    <div class="quick-links"><a href="/artifacts/">${t.openArtifacts}</a><a href="/ui/episodes">${t.openEpisodes}</a><a href="/ui/jobs">Jobs</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("Lookup anchor", "<strong>episodeId</strong>", "Keep jobs, episode detail, artifacts, and publish aligned on the same object id.")}
    ${renderMetricCard("Linked outputs", "<strong>beats, shots, media, QC</strong>", "Verify the linked outputs before you drop into raw file evidence.")}
    ${renderMetricCard("Recovery return", "<strong>jobs / episode detail</strong>", "When evidence is missing, return to the upstream owner surface before trusting the raw path.")}
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
  title: "?ㅼ쓬 ?덉쟾 ?≪뀡",
  intro: "episode lookup, linked outputs, recovery anchor瑜?媛숈? ?붾㈃ ?꾩そ???좎??⑸땲??",
  cards: [
    {
      title: "episode lookup",
      intro: "媛숈? object id濡?output set??鍮좊Ⅴ寃??щ뒗 吏꾩엯?먯엯?덈떎.",
      tone: "muted",
      bodyHtml: `<form method="get" action="/ui/artifacts" class="ops-form-shell"><div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>${t.episodeHelp}</small></div><div class="actions"><button type="submit" class="secondary" data-primary-action="1" data-primary-label="?먰뵾?뚮뱶 ?곗텧臾??닿린">${t.quickLinkAction}</button></div></form>`
    },
    {
      title: "linked outputs",
      intro: hasEpisodeLinks
        ? "???ㅻ툕?앺듃? 吏곸젒 ?곌껐??outputs瑜??꾩뿉??諛붾줈 ?뺤씤?⑸땲??"
        : "episode id瑜??낅젰?섎㈃ ???ㅻ툕?앺듃??linked outputs瑜?癒쇱? ?꾩썎?덈떎.",
      tone: hasEpisodeLinks ? "ok" : "muted",
      bodyHtml: `<div class="ops-resource-card"><div class="ops-resource-list">${linkedOutputsHtml}</div></div>`
    },
    {
      title: "蹂듦뎄 ?듭빱",
      intro: "?꾨씫 output? ?遺遺??곸쐞 ?뚯씠?꾨씪???④퀎?먯꽌 ?닿껐?⑸땲??",
      tone: "warn",
      items: [
        { label: "shots.json ?놁쓬", detail: "compile_shots ?먮뒗 beats ?앹꽦 ?묒뾽遺???ㅼ떆 ?뺤씤?⑸땲??" },
        { label: "preview / final ?놁쓬", detail: "愿??render job ?먮뒗 HITL rerender 寃쎈줈濡??섎룎?꾧컩?덈떎." },
        { label: "upload manifest ?놁쓬", detail: "publish瑜?硫덉텛怨?linked outputs ?뺥빀遺??留욎땅?덈떎." }
      ],
      linksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/episodes">Episodes</a><a href="/ui/publish">Publish</a>'
    },
    {
      title: "Artifacts help",
      intro: "Use this page to verify linked outputs and safe copy paths before opening raw files one by one.",
      tone: "muted",
      items: [
        { label: "Start from episodeId", detail: "Keep jobs, episode detail, artifacts, and publish on the same object id so recovery stays easy to reopen." },
        { label: "Copy paths deliberately", detail: "Copy the exact path or manifest candidate from the selected rows instead of retyping from the raw folder view." },
        { label: "Empty artifact index", detail: "If the index is sparse, return to jobs or episode detail first and confirm which upstream stage failed to write outputs." }
      ],
      linksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/episodes">Episodes</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>?먯떆 ?곗텧臾??몃뜳??/h2>
      <p class="section-intro">???쒕뒗 2李?evidence?낅땲?? linked outputs? recovery anchor瑜?蹂??ㅼ뿉留?raw index瑜??뺤씤?⑸땲??</p>
    </div>
    <input id="artifact-index-filter" type="search" data-table-filter="artifact-index-table" data-url-param="artifactsFilter" aria-label="Artifact index filter" aria-controls="artifact-index-table" placeholder="${t.indexFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="artifact-index-table" aria-label="Artifact index table">${renderSrOnlyCaption("Artifact index table with selected object, owner, path, and row actions.")}<thead><tr><th>artifact object / selection</th><th>type / owner</th><th>path / handoff</th><th>row actions</th></tr></thead><tbody>${
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
      <span class="eyebrow">?먯젙 surface</span>
      <h1>${t.title}</h1>
      <p class="section-intro">rollout怨?compare ?좏샇瑜?raw JSON???꾨땲??decision surface濡??쎌뒿?덈떎. ?먮떒, recovery, linked evidence瑜?媛숈? ?꾧퀎濡?留욎땅?덈떎.</p>
    </div>
    <div class="quick-links"><a href="/ui/benchmarks">踰ㅼ튂留덊겕</a><a href="/ui/health">${t.openHealth}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "?ㅼ쓬 ?덉쟾 ?≪뀡",
  intro: "filter, compare read order, recovery anchor瑜????꾩뿉 怨좎젙???먮떒 ?쇰줈?꾨? 以꾩엯?덈떎.",
  cards: [
    {
      title: "?좏샇 ?꾪꽣",
      intro: "signal, status, verdict, reason, source瑜?湲곗??쇰줈 臾몄젣 臾띠쓬??癒쇱? 醫곹옓?덈떎.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "rollouts-filter",
        targetId: "rollouts-table",
        label: "濡ㅼ븘???좏샇 ?꾪꽣",
        placeholder: t.filterPlaceholder,
        hint: "?좏샇 醫낅쪟, ?곹깭, ?먯젙, ?ъ쑀, ?뚯뒪濡?諛붾줈 以꾩엯?덈떎."
      })
    },
    {
      title: "鍮꾧탳 ?쎈뒗 ?쒖꽌",
      intro: "?곹깭蹂대떎 ?먯젙怨??ъ쑀瑜?癒쇱? ?쎄퀬, compare action? 洹??ㅼ쓬???쎈땲??",
      tone: "warn",
      items: [
        { label: "status", detail: "blocked? below-min? 利됱떆 李⑤떒 ?좏샇濡?痍④툒?⑸땲??" },
        { label: "verdict / reason", detail: "?섏튂留?蹂댁? 留먭퀬 ??留됲삍?붿? reason??癒쇱? ?쎌뒿?덈떎." },
        { label: "compare action", detail: "?곸꽭? ?먯떆 JSON? ?먮떒???쒖? ?딆쓣 ?뚮쭔 ?쎈땲??" }
      ]
    },
    {
      title: "蹂듦뎄 / linked evidence",
      intro: "rollout signal? benchmark, artifacts, health? 媛숈씠 臾띠뼱??遊먯빞 ?⑸땲??",
      tone: "ok",
      items: [
        { label: "benchmark? 鍮꾧탳", detail: "?숈씪 踰덈뱾??upstream benchmark 寃곌낵瑜??④퍡 ?뺤씤?⑸땲??" },
        { label: "artifacts handoff", detail: "?먯젙 洹쇨굅媛 ?꾩슂??寃쎌슦?먮쭔 linked outputs濡??대룞?⑸땲??" },
        { label: "health ?뺤씤", detail: "?쒕퉬????섍? 蹂댁씠硫?signal ?먯껜蹂대떎 ?명봽??蹂듦뎄瑜?癒쇱? ?⑸땲??" }
      ],
      linksHtml: '<a href="/ui/benchmarks">Benchmarks</a><a href="/ui/artifacts">Artifacts</a><a href="/ui/health">Health</a>'
    },
    {
      title: "Rollout help",
      intro: "Treat rollout rows as decision signals first, and only drop into raw evidence when the signal still looks ambiguous.",
      tone: "muted",
      items: [
        { label: "Read order", detail: "Status, verdict, and reason should answer most decisions before you inspect the source payloads." },
        { label: "Blocked-first review", detail: "Keep blocked or below-min rows above healthy rollout noise so compare work stays focused." },
        { label: "Secondary evidence", detail: "Use linked benchmarks, artifacts, or health only when the row itself cannot explain the signal." }
      ],
      linksHtml: '<a href="/ui/benchmarks">Benchmarks</a><a href="/ui/health">Health</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.tableTitle}</h2>
      <p class="section-intro">媛??됱? signal -> verdict -> reason -> next compare action ?쒖꽌濡??쎌뒿?덈떎.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="rollouts-table" aria-label="Rollout signal table">${renderSrOnlyCaption("Rollout signal table with object, decision state, reason, and source links.")}<thead><tr><th>?ㅻ툕?앺듃 / 鍮꾧탳 ?≪뀡</th><th>?곹깭</th><th>?먯닔</th><th>?먯젙</th><th>?ъ쑀</th><th>?앹꽦 ?쒓컖</th><th>?뚯뒪</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noSignals)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>2李?evidence / sources</h2>
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
      <p class="section-intro">benchmark??scenario compare? regression recover瑜??④퍡 蹂대뒗 ?붾㈃?낅땲?? heavy evidence蹂대떎 鍮꾧탳 ?먮떒怨?next action??癒쇱? ?щ┰?덈떎.</p>
    </div>
    <div class="quick-links"><a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "?ㅼ쓬 ?덉쟾 ?≪뀡",
  intro: "backend matrix? regression queue瑜?媛숈? compare grammar濡??쎄퀬, sources??留덉?留됱뿉 ?대┰?덈떎.",
  cards: [
    {
      title: "backend matrix read order",
      intro: "Read the scenario state, latency, failure rate, and notes before deciding whether a backend is still safe enough for current work.",
      tone: "muted",
      items: [
        { label: "state", detail: "Confirm first whether the scenario is still usable." },
        { label: "latency + failure rate", detail: "Read cost and reliability together before escalating the issue." },
        { label: "linked outputs", detail: "Open smoke or plan artifacts only when the benchmark row needs more evidence." }
      ]
    },
    {
      title: "regression queue ?쎄린",
      intro: "warning怨?error瑜?癒쇱? 蹂닿퀬 drift? issue瑜?洹??ㅼ쓬???댁꽍?⑸땲??",
      tone: "warn",
      items: [
        { label: "寃쎄퀬 / ?ㅻ쪟", detail: "李⑤떒 ?щ?瑜?媛??癒쇱? ?먮떒?⑸땲??" },
        { label: "?뚮뜑 ?쒕━?꾪듃", detail: "鍮꾧탳 湲곗???踰쀬뼱????쓣 鍮좊Ⅴ寃??쎌뒿?덈떎." },
        { label: "?댁뒋 ?붿빟", detail: "?몃? evidence瑜??닿린 ?꾩뿉 ?ㅼ쓬 議곗튂瑜??뺥빀?덈떎." }
      ]
    },
    {
      title: "linked compare flow",
      intro: "Connect benchmark findings to rollouts and artifacts only after you know which benchmark row is driving the decision.",
      tone: "ok",
      items: [
        { label: "hand off to rollouts", detail: "Jump to the rollout decision surface with the same candidate in mind." },
        { label: "check artifacts sparingly", detail: "Open linked outputs only when the benchmark row still looks ambiguous." },
        { label: "sources stay last", detail: "Treat raw source rows as secondary evidence after the compare decision is mostly clear." }
      ],
      linksHtml: `<a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a>`
    },
    {
      title: "Benchmark help",
      intro: "Use the backend matrix and regression queue to decide what changed before you open linked sources or rollout surfaces.",
      tone: "muted",
      items: [
        { label: "Backend matrix first", detail: "Latency, success rate, and notes should tell you whether a backend is still safe enough for current work." },
        { label: "Regression queue second", detail: "Warnings and errors deserve attention before you scan the long source evidence rows." },
        { label: "Compare handoff", detail: "Jump to rollouts or artifacts only after you know which benchmark row is actually driving the decision." }
      ],
      linksHtml: `<a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a>`
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.backendTitle}</h2>
      <p class="section-intro">backend compare??1李??쒖엯?덈떎. row蹂?next action??癒쇱? ?쎄퀬 ?꾩슂???뚮쭔 source evidence濡??대젮媛묐땲??</p>
    </div>
    <input id="benchmark-backend-filter" type="search" data-table-filter="benchmark-backend-table" data-url-param="benchmarkBackendFilter" aria-label="Backend benchmark filter" aria-controls="benchmark-backend-table" placeholder="${t.backendFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-backend-table" aria-label="Backend benchmark table">${renderSrOnlyCaption("Backend benchmark table with scenario status, latency, failure rate, notes, and sources.")}<thead><tr><th>?쒕굹由ъ삤 / ?ㅼ쓬 ?≪뀡</th><th>?곹깭</th><th>吏???쒓컙</th><th>?덉슜瑜?/th><th>?ㅽ뙣??/th><th>硫붾え</th><th>?뚯뒪</th></tr></thead><tbody>${
    input.backendRows || renderTableEmptyRow(7, t.noBackendRows)
  }</tbody></table></div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.regressionTitle}</h2>
      <p class="section-intro">regression queue??1李??쒖엯?덈떎. warning / error瑜?癒쇱? ?쎄퀬 drift? issue瑜??ㅼ뿉 遺숈엯?덈떎.</p>
    </div>
    <input id="benchmark-regression-filter" type="search" data-table-filter="benchmark-regression-table" data-url-param="benchmarkRegressionFilter" aria-label="Regression report filter" aria-controls="benchmark-regression-table" placeholder="${t.regressionFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-regression-table" aria-label="Regression report table">${renderSrOnlyCaption("Regression report table with bundle status, warnings, profile, drift, issues, and sources.")}<thead><tr><th>踰덈뱾 / ?ㅼ쓬 ?≪뀡</th><th>?곹깭</th><th>寃쎄퀬 / ?ㅻ쪟</th><th>?꾨줈??/th><th>?뚮뜑 ?쒕━?꾪듃</th><th>?댁뒋</th><th>?뚯뒪</th></tr></thead><tbody>${
    input.regressionRows || renderTableEmptyRow(7, t.noRegressionRows)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>2李?evidence / sources</h2>
      <p class="section-intro">${t.sourcesHint}</p>
    </div>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>`;
}


