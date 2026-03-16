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
    const match = cleanText(value).match(/^(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})??\s*(\\d{1,2})??\s*(\\d{1,2})??/);
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
    input.bodyHtml ?? ((input.items?.length ?? 0) > 0 ? renderRailItems(input.items ?? []) : '<div class="notice">Nothing to show yet.</div>');
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

function renderActionLinks(links: Array<TableCellLink | null | undefined>, empty = "No quick links available."): string {
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
          intro: input.lifecycleIntro ?? "Track the object lifecycle before opening deeper evidence.",
          steps: input.lifecycleSteps
        })
      : ""
  }${input.panels?.length ? `<div class="ops-rail-grid">${input.panels.map(renderRailCard).join("")}</div>` : ""}</section>`;
}

function extractLastErrorText(errorStackHtml: string): string {
  const preMatch = errorStackHtml.match(/<pre>([\s\S]*?)<\/pre>/i);
  const raw = stripHtml(preMatch?.[1] ?? errorStackHtml)
    .replace(/^lastError:\s*/i, "");
  return summarizeText(raw || "No lastError was captured.", 160);
}


function parseLogEntries(logRowsHtml: string): ParsedLogEntry[] {
  return parseTableRows(logRowsHtml)
    .filter((row) => row.cells.length >= 4)
    .map((row) => ({
      createdAt: stripHtml(row.cells[0]) || "-",
      level: stripHtml(row.cells[1]) || "-",
      message: stripHtml(row.cells[2]) || "(no message)",
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
  if (/(CANCELLED|CANCELED)/.test(normalized)) {
    return {
      tone: "warn",
      stageLabel: "inspect",
      latestResult: latestMessage || "The job ended in a cancelled state.",
      retryLabel: "inspect first",
      retryDetail: "Review the cancellation reason before choosing retry or an alternate path.",
      safeActionLabel: "detail -> episode",
      safeActionDetail: "Check the cancellation context and owning episode before taking action.",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: false
    };
  }
  return {
    tone: "muted",
    stageLabel: "inspect",
    latestResult: latestMessage || `More inspection is required while status is ${statusText || "-"}.`,
    retryLabel: "inspect first",
    retryDetail: "Check retryability and blockers from detail first.",
    safeActionLabel: "detail",
    safeActionDetail: "Read the object summary and linked objects before raw evidence.",
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
        "No linked object"
      );
      const nextActionLinks = renderActionLinks(
        [
          jobLink ? { href: jobLink.href, label: "detail" } : null,
          lifecycle.shouldRecover ? { href: episodeId ? `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}` : "/ui/hitl", label: "recover" } : null,
          lifecycle.shouldInspectHealth ? { href: "/ui/health", label: "health" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId && lifecycle.shouldPublish ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "Open detail to confirm the next action."
      );

      return `<tr><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        jobLink ? `<a href="${jobLink.href}">${jobLink.label}</a>` : stripHtml(row.cells[0]) || "-"
      }</strong>${renderToneBadge(lifecycle.stageLabel, lifecycle.tone)}</div><span class="ops-cell-meta">Anchor job object for the list -> detail -> recover flow.</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "No linked owner episode is recorded."
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
        "No linked object"
      );
      const followupLinks = renderActionLinks(
        [
          lifecycle.shouldRecover ? { href: episodeId ? `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}` : "/ui/hitl", label: "recover" } : null,
          lifecycle.shouldInspectHealth ? { href: "/ui/health", label: "health" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null
        ],
        "Open detail to confirm the next action."
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
      )}</div><span class="ops-cell-meta">Anchor job object for the list -> detail -> recover flow.</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "No linked owner episode is recorded."
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
      const blockerText = summarizeText(stripHtml(row.cells[5]) || "No lastError is recorded.", 140);
      const preflightLinks = renderActionLinks(
        [
          jobLink ? { href: jobLink.href, label: "detail" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}`, label: "recover" } : null
        ],
        "Open detail to inspect the blocker."
      );
      const handoffLinks = renderActionLinks(
        [
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null,
          episodeId ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "Check linked outputs after recovery."
      );

      return `<tr><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        jobLink ? `<a href="${jobLink.href}">${jobLink.label}</a>` : stripHtml(row.cells[0]) || "-"
      }</strong>${renderToneBadge("recover", "bad")}</div><span class="ops-cell-meta">Start the recovery path from the failed job object.</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "No linked episode is recorded."
      }</span>${renderActionLinks(
        [
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null
        ],
        "No linked object"
      )}</div></td><td><div class="ops-cell-stack"><strong>${topicText}</strong><span class="ops-cell-meta">${typeText}</span></div></td><td><div class="ops-cell-stack"><strong>preflight blocker</strong><span class="ops-cell-meta">${blockerText}</span></div></td><td><div class="ops-cell-stack"><strong>detail -> dryRun recover</strong><span class="ops-cell-meta">Review the root cause in detail, then validate episodeId and failedShotIds with dryRun first.</span>${preflightLinks}</div></td><td><div class="ops-cell-stack"><strong>artifacts -> publish handoff</strong><span class="ops-cell-meta">${createdText}</span>${handoffLinks}</div></td></tr>`;
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
  intro: "Read the flow as list -> detail -> recover -> handoff around the Job object. Keep row-action grammar in the order detail, recover, episode, artifacts, publish.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui">Dashboard</a><a href="/ui/hitl">HITL</a><a href="/ui/publish">Publish</a>',
  summaryCards: [
    { label: "scope", valueHtml: "<strong>Latest 100 job objects</strong>", hint: "Read recent failures and stalled runs first.", tone: "muted" },
    { label: "latest result", valueHtml: "<strong>failed / stuck running first</strong>", hint: "This list prioritizes recovery candidates over success paths.", tone: "warn" },
    { label: "row grammar", valueHtml: "<strong>detail -> recover -> handoff</strong>", hint: "Show detail, retryability, and linked objects in the same order for every row.", tone: "ok" },
    { label: "linked objects", valueHtml: "<strong>episode -> artifacts -> publish</strong>", hint: "Do not stop at the job object; open the owner episode and handoff path together.", tone: "ok" }
  ],
  lifecycleTitle: "list -> detail -> recover -> handoff",
  lifecycleIntro: "This list is the entry surface for the Job object lifecycle. Read failure and stalling first, and leave promotion for the last step.",
  lifecycleSteps: [
    { label: "list", detail: "Use status and latest result to pick failed or stuck jobs first.", tone: "muted" },
    { label: "detail", detail: "Read status, retryability, blockers, and linked objects from the top.", tone: "warn" },
    { label: "recover", detail: "Choose the next safe action from retry, HITL, or health.", tone: "bad" },
    { label: "handoff", detail: "Only hand off to publish when the owner episode and artifacts are coherent.", tone: "ok" }
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
  title: "Next safe action",
  intro: "Read filters, retryability, and linked objects first, and push raw evidence down into row detail.",
  linksHtml: '<a href="/ui/health">Health</a><a href="/ui/episodes">Episodes</a><a href="/ui/artifacts">Artifacts</a>',
  cards: [
    {
      title: "Filter + row scan",
      intro: "Use job id, owner episode, and status to scan lifecycle before opening detail.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "jobs-filter",
        targetId: "jobs-table",
        label: "Jobs filter",
        placeholder: t.filterPlaceholder,
        urlParam: "jobsFilter",
        hint: "Apply this locally to the list. You can also jump here through the URL search state."
      })
    },
    {
      title: "Recovery priority",
      intro: "Read FAILED and stalled RUNNING rows first. Only inspect publish when latest result and linked artifacts are coherent.",
      tone: "warn",
      items: [
        { label: "FAILED -> detail -> retry / recover", detail: "Read lastError, retryability, and blockers in job detail before moving into HITL or retry." },
        { label: "RUNNING stall -> detail -> health", detail: "Review health, queue state, and recent jobs together before assuming the run is healthy." },
        { label: "publish hold", detail: "Only inspect publish after latest result and linked artifacts agree with the current object state." }
      ],
      linksHtml: '<a href="/ui/hitl">HITL</a><a href="/ui/health">Health</a>'
    },
    {
      title: "Shared row grammar",
      intro: "Every row should read detail, owner episode, linked objects, and next safe action in the same order.",
      tone: "ok",
      items: [
        { label: "detail", detail: "Read status, latest result, and retryability first." },
        { label: "episode / artifacts", detail: "Open the owner object and linked outputs directly from the row." },
        { label: "recover / publish", detail: "Failures go to recover, healthy outputs go to publish handoff." }
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
      <h2>Job objects</h2>
      <p class="section-intro">Read each row as job object -> owner episode -> latest result -> retryability -> next safe action. Push raw evidence down into detail.</p>
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
  const episodeLabel = hasEpisodeId ? `<strong class="mono">${episodeId}</strong>` : "<strong>Enter an episode id first.</strong>";

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "publish preflight",
  title: t.title,
  intro: "Publish is not a page action. It is an episode-object handoff that should only run after episode -> latest job -> artifacts -> publish has been unlocked in order.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/episodes">Episodes</a><a href="/ui/artifacts">Artifacts</a>',
  summaryCards: [
    { label: "target object", valueHtml: episodeLabel, hint: "Keep jobs, artifacts, and publish aligned on the same episode id.", tone: hasEpisodeId ? "ok" : "warn" },
    { label: "latest job gate", valueHtml: "<strong>COMPLETED / PREVIEW_READY</strong>", hint: "If the latest job is FAILED, stalled, or pending retry, recover before publish.", tone: "warn" },
    { label: "linked artifacts", valueHtml: "<strong>preview / final / manifest</strong>", hint: "Confirm QC and output presence before trusting the raw folder.", tone: hasEpisodeId ? "ok" : "muted" },
    {
      label: "next safe action",
      valueHtml: `<strong>${hasEpisodeId ? "jobs -> artifacts -> publish" : "check episode first"}</strong>`,
      hint: hasEpisodeId ? "Open publish only after latest result and linked outputs are coherent." : "Confirm the same episode id from episode detail or job detail first.",
      tone: hasEpisodeId ? "ok" : "warn"
    }
  ],
  lifecycleTitle: "episode -> latest job -> artifacts -> publish",
  lifecycleIntro: "Publish is the last handoff step. If preflight looks unstable, reopen the recovery path from jobs first.",
  lifecycleSteps: [
    { label: "episode", detail: hasEpisodeId ? `Lock target object ${episodeId} first.` : "Pick the target episode first.", tone: hasEpisodeId ? "ok" : "warn" },
    { label: "latest job", detail: "Check the most recent job result and retry / recover state first.", tone: "warn" },
    { label: "artifacts", detail: "Verify preview, final, QC, and upload manifest.", tone: hasEpisodeId ? "ok" : "muted" },
    { label: "publish", detail: "Run handoff only when the full preflight is aligned.", tone: hasEpisodeId ? "ok" : "muted" }
  ]
})}

${renderRailSection({
  title: "preflight + next safe action",
  intro: "Read the target episode, latest-result gate, linked outputs, and blocked path before trusting the input form.",
  cards: [
    {
      title: "episode object + latest result",
      intro: hasEpisodeId
        ? `With episode id ${episodeId}, inspect episode detail and latest job result first.`
        : "Choose the target episode first, then keep the same episode id through the full handoff flow.",
      tone: hasEpisodeId ? "ok" : "warn",
      items: [
        { label: "episode detail", detail: "Read owner context before deciding whether publish is safe." },
        { label: "latest job", detail: "Confirm the last job result and next safe action before publish." },
        { label: "retryability", detail: "If the latest run is FAILED or stalled, choose recover before publish." }
      ],
      linksHtml: `<a href="${episodeHref}">${hasEpisodeId ? "Episode detail" : "Episodes"}</a>`
    },
    {
      title: "artifacts gate",
      intro: "Check preview, final, QC, and upload manifest on the same episode-object surface.",
      tone: hasEpisodeId ? "ok" : "muted",
      items: [
        { label: "preview / final", detail: "Confirm the rendered outputs are current before promotion." },
        { label: "QC / manifest", detail: "Read QC and upload manifest before raw evidence." },
        { label: "publish handoff", detail: "Only move into publish request when linked outputs are coherent." }
      ],
      linksHtml: `<a href="${artifactsHref}">Artifacts</a><a href="${folderHref}">Raw folder</a>`
    },
    {
      title: "blocked path",
      intro: "If publish is blocked, go back to jobs, health, or artifacts before digging through the raw folder.",
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
  title: "Publish action",
  intro: "Keep the request input simple, but hold next safe action and rollback anchor in the same rail.",
  cards: [
    {
      title: "Publish request",
      intro: "Run the handoff from a single episode id.",
      tone: hasEpisodeId ? "ok" : "muted",
      bodyHtml: `<form method="post" action="/ui/publish" class="ops-form-shell"><div class="field"><label for="publish-episode-id">episodeId <span class="hint" data-tooltip="${t.episodeHelp}">?</span></label><input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/><small>Reuse the same id from episode detail, job detail, or artifact links.</small></div><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="Run publish">${t.runAction}</button></div></form>`
    },
    {
      title: "submit preflight",
      intro: "Latest result and linked-output coherence matter more than the input field itself.",
      tone: "ok",
      items: [
        { label: "episode state", detail: "Confirm COMPLETED or PREVIEW_READY first." },
        { label: "latest job", detail: "If a failed or stalled job is still open, recover before publish." },
        { label: "output manifest", detail: "Confirm upload manifest and output presence together." }
      ]
    },
    {
      title: "Blocked-path recovery",
      intro: "If publish is blocked, return to the owner episode and linked job before raw folder inspection.",
      tone: "warn",
      items: [
        { label: "jobs", detail: "Review failed jobs and retryability first." },
        { label: "artifacts", detail: "Confirm outputs were actually refreshed by render or compile." },
        { label: "health", detail: "If queue or storage health is degraded, repair the platform first." }
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
  const latestResultText = latestLog ? summarizeText(latestLog.message, 140) : "No latest log is recorded.";
  const blockerText = extractLastErrorText(input.errorStack);
  const hasBlocker = !/(No lastError is recorded.|\(none\)|none)/i.test(blockerText);
  const canRetry = input.retryAction.includes("<form") && !input.retryAction.includes("disabled");
  const lifecycle = describeJobLifecycle(statusText, `${input.progress}%`, latestResultText);
  const retryTone: OpsRailTone = canRetry ? "bad" : lifecycle.shouldPublish ? "ok" : statusTone;
  const nextSafeActionLabel = canRetry ? "retry -> artifacts recheck" : lifecycle.safeActionLabel;
  const nextSafeActionDetail = canRetry
    ? "Retry this job object first, then recheck the owner episode and linked outputs."
    : lifecycle.safeActionDetail;
  const actionGrammarHtml = `<div class="stack"><span class="muted-text">Keep the same order: detail -> retry / recover -> episode -> artifacts -> publish.</span><div class="ops-link-row">${input.retryAction}<a href="/ui/hitl">recover</a>${
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
  intro: "Pin status, owner episode, latest result, retryability, blockers, next safe action, and linked objects above the raw logs.",
  flash: input.flash,
  quickLinksHtml: `<a href="/ui/jobs">Jobs list</a><a href="/ui/episodes/${input.episodeId}">Episode</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(
    input.episodeId
  )}">Artifacts</a>`,
  summaryCards: [
    { label: "status", valueHtml: input.statusBadge, hint: "The status badge should clarify retry, recover, and publish-hold decisions.", tone: statusTone },
    {
      label: "owner episode",
      valueHtml: `<a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a>`,
      hint: "Handoff directly to the owner object without going back to the list.",
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
      valueHtml: `<strong>${hasBlocker ? "present" : "none"}</strong>`,
      hint: hasBlocker ? blockerText : "No current lastError blocker is visible.",
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
  lifecycleIntro: "This is not a page surface; it is a Job object surface. Read latest result and blockers before moving forward.",
  lifecycleSteps: [
    { label: "list", detail: "Use the job list to pick failed or stalled jobs first.", tone: "muted" },
    { label: "detail", detail: "Read status, owner, latest result, and retryability first.", tone: statusTone },
    {
      label: lifecycle.shouldRecover || canRetry ? "recover" : lifecycle.shouldInspectHealth ? "health" : "inspect",
      detail: canRetry ? "Choose retry or recover before reading deeper evidence." : lifecycle.safeActionDetail,
      tone: retryTone
    },
    {
      label: lifecycle.shouldPublish ? "handoff" : "linked objects",
      detail: lifecycle.shouldPublish ? "If owner episode and artifacts are coherent, hand off to publish." : "Inspect owner episode and artifacts first.",
      tone: lifecycle.shouldPublish ? "ok" : "muted"
    }
  ],
  panels: [
    {
      title: "Common action grammar",
      intro: "Keep detail -> retry / recover -> episode -> artifacts -> publish in the same order.",
      tone: retryTone,
      bodyHtml: actionGrammarHtml
    },
    {
      title: "linked objects",
      intro: "Handoff directly from detail into owner episode, artifacts, and publish routes.",
      tone: "ok",
      items: [
        { label: "owner episode", detail: "Check owner-object context first." },
        { label: "artifacts", detail: "Verify output presence before opening the raw folder." },
        { label: "publish handoff", detail: "Only hand off with the same episode id when the latest result looks stable." }
      ],
      linksHtml: `<a href="/ui/episodes/${input.episodeId}">episode</a><a href="/artifacts/${input.episodeId}/">artifacts folder</a><a href="/ui/publish?episodeId=${encodeURIComponent(
        input.episodeId
      )}">publish</a>`
    },
    {
      title: "raw evidence discipline",
      intro: "Raw evidence belongs at the end. Summarize latest result and blockers first.",
      tone: hasBlocker ? "warn" : "muted",
      items: [
        { label: "latest result", detail: latestLog ? `${latestLog.createdAt} @ ${latestResultText}` : lifecycle.latestResult },
        { label: "blocker snapshot", detail: blockerText },
        { label: "raw logs", detail: "Only drop into secondary evidence after choosing retry or recover." }
      ]
    }
  ]
})}

<section class="card" data-surface-role="evidence" data-surface-priority="secondary">
  <div class="section-head">
    <div>
      <h2>Blocker snapshot</h2>
      <p class="section-intro">Pin failure context here first. This is primary evidence that should sit above the raw logs.</p>
    </div>
  </div>
  <div class="ops-resource-card">${input.errorStack}</div>
</section>

<section class="card ops-table-shell ops-log-table" data-surface-role="evidence" data-surface-priority="secondary">
  <div class="ops-table-meta">
    <div>
      <h2>Raw logs / secondary evidence</h2>
      <p class="section-intro">Only inspect raw log evidence after the retry or recovery path is decided.</p>
    </div>
    <input id="job-log-filter" type="search" data-table-filter="job-log-table" data-url-param="jobLogFilter" aria-label="Job log filter" aria-controls="job-log-table" placeholder="Search logs"/>
  </div>
  <div class="table-wrap"><table id="job-log-table" aria-label="Job log evidence">${renderSrOnlyCaption("Job log evidence table with timestamp, level, message, and details.")}<thead><tr><th>Created at</th><th>Level</th><th>Message</th><th>Details</th></tr></thead><tbody>${
    input.logRows || renderTableEmptyRow(4, "No logs found.")
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
  intro: "Use the failed job object to anchor recover, then read failed detail, dry-run preflight, artifact handoff, and publish hold in the same order.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/publish">Publish</a><a href="/ui/artifacts">Artifacts</a>',
  summaryCards: [
    { label: "failure anchor", valueHtml: "<strong>failed job detail</strong>", hint: "Start by checking blockers on the failed job object.", tone: "bad" },
    { label: "recover input", valueHtml: "<strong>episodeId + failedShotIds</strong>", hint: "Keep the recovery target aligned on the same object axis.", tone: "warn" },
    { label: "preflight", valueHtml: "<strong>dryRun first</strong>", hint: "Validate the route with dryRun before execution.", tone: "warn" },
    { label: "handoff", valueHtml: "<strong>artifacts -> publish</strong>", hint: "Confirm linked outputs after recovery before handoff to publish.", tone: "ok" }
  ],
  lifecycleTitle: "failed job -> preflight -> rerender -> handoff",
  lifecycleIntro: "HITL is not a raw rerender button. It is a recovery preflight surface that should read failed detail and linked outputs first.",
  lifecycleSteps: [
    { label: "failed job", detail: "Read blockers and root cause from failed job detail first.", tone: "bad" },
    { label: "preflight", detail: "Validate the recover route with episodeId, failedShotIds, and dryRun first.", tone: "warn" },
    { label: "rerender", detail: "Continue recovery execution on the same job-object axis.", tone: "warn" },
    { label: "handoff", detail: "Only move to publish handoff after artifact verification.", tone: "ok" }
  ]
})}

${renderRailSection({
  title: "recover preflight + next safe action",
  intro: "Read rerender request, artifacts, and publish hold from the same failed-row surface.",
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
      intro: "Specify the recovery shot ids explicitly and validate the route with dryRun first.",
      tone: "warn",
      bodyHtml: `<form method="post" action="/ui/hitl/rerender" class="ops-form-shell"><div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div><div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="${t.failedShotHelp}">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>${t.failedShotHint}</small></div><label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun (validate before run)</label><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="Run HITL rerender">${t.runAction}</button></div></form>`
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
        { label: "Dry run first", detail: "Narrow the failure mode by validating episodeId and failedShotIds with dryRun before rerender." },
        { label: "Keep the failed row nearby", detail: "Keep owner episode and blocker context visible from the same row while recovering." },
        { label: "Return from the same object", detail: "After rerender, reopen artifacts and publish from the same episode object." }
      ],
      linksHtml: '<a href="/ui/jobs">Jobs</a><a href="/ui/artifacts">Artifacts</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.failedJobs}</h2>
      <p class="section-intro">Normalize row-action grammar to failed job object -> owner episode -> preflight blocker -> recover -> handoff.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="hitl-failed-table" aria-label="Failed job recovery table">${renderSrOnlyCaption(
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
  const linkedOutputsHtml = hasEpisodeLinks ? input.episodeLinks : '<div class="notice">Episode-linked outputs are not available yet.</div>';

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">linked outputs</span>
      <h1>${t.title}</h1>
      <p class="section-intro">This surface is not a raw directory browser. Treat artifacts as a linked-object view anchored on episode id, output presence, and recovery anchors.</p>
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
  title: "Next safe action",
  intro: "Pin episode lookup, linked outputs, and recovery anchors at the top of the surface.",
  cards: [
    {
      title: "episode lookup",
      intro: "Use the same object id as a fast entry point into the output set.",
      tone: "muted",
      bodyHtml: `<form method="get" action="/ui/artifacts" class="ops-form-shell"><div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>${t.episodeHelp}</small></div><div class="actions"><button type="submit" class="secondary" data-primary-action="1" data-primary-label="Open episode artifacts">${t.quickLinkAction}</button></div></form>`
    },
    {
      title: "linked outputs",
      intro: hasEpisodeLinks
        ? "Read linked outputs first from the same episode object."
        : "Enter an episode id to inspect linked outputs on the same axis.",
      tone: hasEpisodeLinks ? "ok" : "muted",
      bodyHtml: `<div class="ops-resource-card"><div class="ops-resource-list">${linkedOutputsHtml}</div></div>`
    },
    {
      title: "Recovery entry",
      intro: "If linked outputs are missing, decide which upstream stage to reopen first.",
      tone: "warn",
      items: [
        { label: "Check shots.json", detail: "Confirm compile_shots and beats generation completed successfully." },
        { label: "Check preview / final", detail: "Confirm render job or HITL rerender outputs were truly refreshed." },
        { label: "Check upload manifest", detail: "Confirm linked outputs before publish." }
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
      <h2>Raw artifact index</h2>
      <p class="section-intro">This is secondary evidence. Read linked outputs and recovery anchors before opening the raw index.</p>
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
      <span class="eyebrow">decision surface</span>
      <h1>${t.title}</h1>
      <p class="section-intro">Read rollout and compare signals as a decision surface rather than raw JSON. Keep judgement, recovery, and linked evidence on the same level.</p>
    </div>
    <div class="quick-links"><a href="/ui/benchmarks">Benchmarks</a><a href="/ui/health">${t.openHealth}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "Next safe action",
  intro: "Fix the filter, compare read order, and recovery anchor before making the decision.",
  cards: [
    {
      title: "Signal filter",
      intro: "Read signal, status, verdict, reason, and source in the same order.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "rollouts-filter",
        targetId: "rollouts-table",
        label: "Rollout signal filter",
        placeholder: t.filterPlaceholder,
        hint: "Search signal name, state, verdict, and reason together."
      })
    },
    {
      title: "Compare read order",
      intro: "Read status and verdict first, then move into compare action.",
      tone: "warn",
      items: [
        { label: "status", detail: "Read blocked and below-min signals first." },
        { label: "verdict / reason", detail: "Keep verdict and reason legible on the same line." },
        { label: "compare action", detail: "Choose the next compare action before opening raw JSON." }
      ]
    },
    {
      title: "Recovery / linked evidence",
      intro: "Keep the path from rollout signal into benchmarks, artifacts, and health visible together.",
      tone: "ok",
      items: [
        { label: "Benchmark compare", detail: "Inspect the matching upstream benchmark first." },
        { label: "Artifacts handoff", detail: "After a rollout verdict, drop only into linked outputs." },
        { label: "Health check", detail: "Confirm whether platform health influenced the signal." }
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
      <p class="section-intro">Read each signal as signal -> verdict -> reason -> next compare action.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="rollouts-table" aria-label="Rollout signal table">${renderSrOnlyCaption("Rollout signal table with object, decision state, reason, and source links.")}<thead><tr><th>Object / compare action</th><th>Status</th><th>Score</th><th>Verdict</th><th>Reason</th><th>Created at</th><th>Source</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noSignals)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Secondary evidence / sources</h2>
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
      <p class="section-intro">Benchmarks combine scenario compare with regression recovery. Put compare judgement and next action above heavy evidence.</p>
    </div>
    <div class="quick-links"><a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "Next safe action",
  intro: "Read the backend matrix and regression queue with the same compare grammar, and push sources to the end.",
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
      title: "Regression queue read order",
      intro: "Read warnings and errors first, then attach drift and issues behind them.",
      tone: "warn",
      items: [
        { label: "warning / error", detail: "Inspect risk signals first." },
        { label: "Drift review", detail: "Read how far the compare result moved only after risk is clear." },
        { label: "Issue separation", detail: "Choose the next action before dropping into raw evidence." }
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
      <p class="section-intro">Backend compare is the first entry point. Read row-level next action first and only descend into source evidence when needed.</p>
    </div>
    <input id="benchmark-backend-filter" type="search" data-table-filter="benchmark-backend-table" data-url-param="benchmarkBackendFilter" aria-label="Backend benchmark filter" aria-controls="benchmark-backend-table" placeholder="${t.backendFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-backend-table" aria-label="Backend benchmark table">${renderSrOnlyCaption("Backend benchmark table with scenario status, latency, failure rate, notes, and sources.")}<thead><tr><th>Scenario / next action</th><th>Status</th><th>Latency</th><th>Cost rate</th><th>Failure rate</th><th>Notes</th><th>Source</th></tr></thead><tbody>${
    input.backendRows || renderTableEmptyRow(7, t.noBackendRows)
  }</tbody></table></div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.regressionTitle}</h2>
      <p class="section-intro">Regression queue is the first entry point. Read warnings and errors first, then drift and issues after them.</p>
    </div>
    <input id="benchmark-regression-filter" type="search" data-table-filter="benchmark-regression-table" data-url-param="benchmarkRegressionFilter" aria-label="Regression report filter" aria-controls="benchmark-regression-table" placeholder="${t.regressionFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-regression-table" aria-label="Regression report table">${renderSrOnlyCaption("Regression report table with bundle status, warnings, profile, drift, issues, and sources.")}<thead><tr><th>Bundle / next action</th><th>Status</th><th>Warnings / errors</th><th>Profile</th><th>Drift</th><th>Issues</th><th>Source</th></tr></thead><tbody>${
    input.regressionRows || renderTableEmptyRow(7, t.noRegressionRows)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Secondary evidence / sources</h2>
      <p class="section-intro">${t.sourcesHint}</p>
    </div>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>`;
}


