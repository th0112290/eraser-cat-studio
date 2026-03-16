import { renderTableEmptyRow } from "./uiText";

type ExplorerPageInput = {
  title: string;
  subtitle: string;
  flash: string;
  filters: string;
  summaryCards: string;
  notes?: string;
  linksHtml?: string;
  railTitle?: string;
  railIntro?: string;
  railCards?: ExplorerRailCard[];
  recoveryTitle?: string;
  recoveryIntro?: string;
  recoveryCards?: ExplorerRailCard[];
  factsTitle?: string;
  factsIntro?: string;
  facts?: ExplorerFact[];
  evidenceTitle?: string;
  evidenceIntro?: string;
  evidenceCards?: ExplorerRailCard[];
  evidenceDrawer?: ExplorerEvidenceDrawer;
  tableId: string;
  tableTitle: string;
  tableSubtitle: string;
  filterPlaceholder: string;
  headers: string;
  rows: string;
  emptyColspan: number;
  emptyText: string;
};

type ExplorerRailCard = {
  title: string;
  detail: string;
  tone?: "ok" | "warn" | "bad" | "muted";
  badge?: string;
  html?: string;
};

type ExplorerFact = {
  label: string;
  value: string;
  hint?: string;
};

type ExplorerEvidenceDrawer = {
  summary: string;
  bodyHtml: string;
  open?: boolean;
};

function explorerTone(value: ExplorerRailCard["tone"]): "ok" | "warn" | "bad" | "muted" {
  return value ?? "muted";
}

function renderExplorerRailCards(cards: ExplorerRailCard[]): string {
  if (cards.length === 0) {
    return '<div class="ops-review-empty">No review actions are available for this explorer yet.</div>';
  }

  return `<div class="ops-review-card-list">${cards
    .map((card) => {
      const tone = explorerTone(card.tone);
      return `<article class="ops-review-card tone-${tone}">
        <div class="ops-review-card-head">
          <div class="ops-review-card-title">${card.title}</div>
          ${card.badge ? `<span class="badge ${tone}">${card.badge}</span>` : ""}
        </div>
        <p>${card.detail}</p>
        ${card.html ? `<div class="ops-review-card-actions">${card.html}</div>` : ""}
      </article>`;
    })
    .join("")}</div>`;
}

function renderExplorerFacts(facts: ExplorerFact[]): string {
  if (facts.length === 0) {
    return '<div class="ops-review-empty">No recovery snapshot facts are available for this explorer yet.</div>';
  }

  return `<div class="ops-review-fact-grid">${facts
    .map(
      (fact) => `<article class="ops-review-fact">
        <span class="ops-review-fact-label">${fact.label}</span>
        <strong>${fact.value}</strong>
        ${fact.hint ? `<span class="muted-text">${fact.hint}</span>` : ""}
      </article>`
    )
    .join("")}</div>`;
}

function renderExplorerEvidenceDrawer(drawer?: ExplorerEvidenceDrawer): string {
  if (!drawer) {
    return '<div class="ops-review-empty">No artifact evidence drawer is available for this explorer yet.</div>';
  }

  return `<details class="ops-review-drawer"${drawer.open ? " open" : ""}>
    <summary>${drawer.summary}</summary>
    <div class="ops-review-drawer-body">${drawer.bodyHtml}</div>
  </details>`;
}

function buildExplorerPageBody(input: ExplorerPageInput): string {
  return `
<section class="card dashboard-shell">
  <style>
    .ops-review-shell{display:grid;gap:12px}
    .ops-review-strip{display:grid;gap:12px;grid-template-columns:minmax(260px,1.2fr) minmax(280px,.95fr);align-items:start}
    .ops-review-rail{display:grid;gap:10px}
    .ops-review-note,.ops-review-panel{padding:12px;border:1px solid #d9e5ef;border-radius:16px;background:linear-gradient(180deg,#fcfefe,#f4f9fd)}
    .ops-review-note strong{display:block;margin-bottom:4px}
    .ops-review-panel{display:grid;gap:10px}
    .ops-review-panel-head{display:grid;gap:4px}
    .ops-review-panel-head h2,.ops-review-panel-head h3{margin:0}
    .ops-review-jump-banner{display:grid;gap:10px;padding:12px;border:1px solid #d9e5ef;border-radius:16px;background:linear-gradient(180deg,#fcfefe,#f4f9fd)}
    .ops-review-card-list{display:grid;gap:8px}
    .ops-review-card{display:grid;gap:6px;padding:11px;border-radius:14px;border:1px solid #d9e5ef;background:#fff}
    .ops-review-card.tone-ok{border-color:#cbe6d7;background:#f3fbf7}
    .ops-review-card.tone-warn{border-color:#ecd9ad;background:#fffaf0}
    .ops-review-card.tone-bad{border-color:#efc4c4;background:#fff6f6}
    .ops-review-card-head{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
    .ops-review-card-title{font-size:14px;font-weight:800;color:#12344d}
    .ops-review-card p{margin:0;color:#425466;line-height:1.45}
    .ops-review-card-actions{display:flex;flex-wrap:wrap;gap:8px}
    .ops-review-fact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
    .ops-review-fact{display:grid;gap:4px;padding:10px;border:1px solid #d8e5ee;border-radius:14px;background:#f8fbff}
    .ops-review-fact-label{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#557083}
    .ops-review-empty{padding:11px;border:1px dashed #c8d7e7;border-radius:14px;background:#f8fbff;color:#536475}
    .ops-chip-grid{display:flex;flex-wrap:wrap;gap:8px}
    .ops-chip-grid a{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;border:1px solid #c7d9eb;background:#fff;color:#0f4e6a;font-size:12px;font-weight:700}
    .ops-chip-grid a:hover{text-decoration:none;background:#eef7ff}
    .ops-filter-card{display:grid;gap:10px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:14px}
    .ops-review-drawer{border:1px solid #d8e5ee;border-radius:14px;background:#fff}
    .ops-review-drawer summary{cursor:pointer;list-style:none;padding:11px 12px;font-weight:800;color:#12344d}
    .ops-review-drawer summary::-webkit-details-marker{display:none}
    .ops-review-drawer[open] summary{border-bottom:1px solid #e1ebf4}
    .ops-review-drawer-body{display:grid;gap:10px;padding:12px}
    .ops-review-jump-target:target{scroll-margin-top:14px;box-shadow:inset 0 0 0 2px #0f766e33}
    .ops-review-table-row.is-focused,.ops-review-table-row:target{background:#eef7ff}
    .ops-review-shell .mono{word-break:break-all}
    @media (max-width:960px){.ops-review-strip{grid-template-columns:1fr}}
  </style>
  <div class="section-head">
    <div>
      <h1>${input.title}</h1>
      <p class="section-intro">${input.subtitle}</p>
    </div>
    <div class="quick-links">${input.linksHtml ?? '<a href="/ui/benchmarks">Benchmarks</a><a href="/ui/rollouts">Rollouts</a><a href="/ui/artifacts">Artifacts</a>'}</div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
  <div class="ops-review-strip">
    <div class="ops-review-shell">
      <div class="ops-review-panel">
        <div class="ops-review-panel-head">
          <h2>Explorer filters</h2>
          <p class="section-intro">Narrow the queue first, then inspect detail surfaces only for the rows that still need a decision.</p>
        </div>
        <div class="ops-filter-card">${input.filters}</div>
      </div>
    </div>
    <div class="ops-review-rail">
      <div class="ops-review-panel ops-review-jump-target" id="${input.tableId}-decision">
        <div class="ops-review-panel-head">
          <h2>${input.railTitle ?? "Decision rail"}</h2>
          <p class="section-intro">${input.railIntro ?? "Keep compare-before-promote and recovery actions above the table scan."}</p>
        </div>
        ${renderExplorerRailCards(input.railCards ?? [])}
      </div>
      <div class="ops-review-panel ops-review-jump-target" id="${input.tableId}-recovery">
        <div class="ops-review-panel-head">
          <h3>${input.recoveryTitle ?? "Recovery rail"}</h3>
          <p class="section-intro">${input.recoveryIntro ?? "Keep recovery order, rollback anchors, and linked objects visible while scanning the queue."}</p>
        </div>
        ${renderExplorerRailCards(input.recoveryCards ?? [])}
      </div>
      <div class="ops-review-panel ops-review-jump-target" id="${input.tableId}-snapshot">
        <div class="ops-review-panel-head">
          <h3>${input.factsTitle ?? "Recovery snapshot"}</h3>
          <p class="section-intro">${input.factsIntro ?? "Keep scope, blockers, and rollback anchors visible while scanning the queue."}</p>
        </div>
        ${renderExplorerFacts(input.facts ?? [])}
      </div>
      <div class="ops-review-panel ops-review-jump-target" id="${input.tableId}-evidence">
        <div class="ops-review-panel-head">
          <h3>${input.evidenceTitle ?? "Artifact evidence drawer"}</h3>
          <p class="section-intro">${input.evidenceIntro ?? "Keep artifact-backed evidence close, but push raw payload reading behind a drawer."}</p>
        </div>
        ${input.evidenceCards && input.evidenceCards.length > 0 ? renderExplorerRailCards(input.evidenceCards) : ""}
        ${renderExplorerEvidenceDrawer(input.evidenceDrawer)}
      </div>
      ${input.notes ?? '<div class="ops-review-note"><strong>Artifact-backed view</strong><span class="muted-text">This screen only reads existing benchmark or episode artifacts. It does not re-run worker or renderer logic.</span></div>'}
    </div>
  </div>
</section>
<section class="card">
  <div class="section-head"><div><h2>${input.tableTitle}</h2><span class="muted-text">${input.tableSubtitle}</span></div><input type="search" data-table-filter="${input.tableId}" aria-label="${input.tableTitle}" placeholder="${input.filterPlaceholder}"/></div>
  <div class="table-wrap"><table id="${input.tableId}"><thead><tr>${input.headers}</tr></thead><tbody>${input.rows || renderTableEmptyRow(input.emptyColspan, input.emptyText)}</tbody></table></div>
</section>
<script>
(() => {
  const hash = window.location.hash ? window.location.hash.slice(1) : "";
  if (!hash) return;
  const target = document.getElementById(hash);
  if (!(target instanceof HTMLElement)) return;
  if (target instanceof HTMLDetailsElement) {
    target.open = true;
  }
  const parentDetails = target.closest("details");
  if (parentDetails instanceof HTMLDetailsElement) {
    parentDetails.open = true;
  }
  target.querySelectorAll("details").forEach((node) => {
    if (node instanceof HTMLDetailsElement) {
      node.open = true;
    }
  });
  requestAnimationFrame(() => {
    target.scrollIntoView({ block: "start", behavior: "auto" });
  });
})();
</script>`;
}

type RepairAcceptancePageBodyInput = {
  flash: string;
  filters: string;
  summaryCards: string;
  notes?: string;
  linksHtml?: string;
  railCards?: ExplorerRailCard[];
  recoveryCards?: ExplorerRailCard[];
  facts?: ExplorerFact[];
  evidenceCards?: ExplorerRailCard[];
  evidenceDrawer?: ExplorerEvidenceDrawer;
  rows: string;
};

export function buildRepairAcceptancePageBody(input: RepairAcceptancePageBodyInput): string {
  return buildExplorerPageBody({
    title: "Repair / Acceptance Explorer",
    subtitle: "Cross-benchmark view of acceptance decisions, QC outcomes, and repair-heavy sidecar shots.",
    flash: input.flash,
    filters: input.filters,
    summaryCards: input.summaryCards,
    notes: input.notes,
    linksHtml: input.linksHtml,
    railTitle: "Decision rail",
    railIntro: "Review blocked acceptance states first, compare candidate evidence before promote, then move to recovery paths.",
    railCards: input.railCards,
    recoveryTitle: "Recovery rail",
    recoveryIntro: "Keep rollback order, linked review objects, and operator recovery steps visible above the queue.",
    recoveryCards: input.recoveryCards,
    factsTitle: "Acceptance snapshot",
    factsIntro: "Keep the current queue shape and rollback anchors above the table scan.",
    facts: input.facts,
    evidenceTitle: "Artifact evidence drawer",
    evidenceIntro: "Candidate compare, smoke, plan, and judge artifacts stay adjacent, but raw payload reading remains secondary.",
    evidenceCards: input.evidenceCards,
    evidenceDrawer: input.evidenceDrawer,
    tableId: "repair-acceptance-table",
    tableTitle: "Acceptance Queue",
    tableSubtitle: "Review shots where provider, policy, QC run issues, or fallback state need operator attention.",
    filterPlaceholder: "Search shot, bundle, backend, repair signal...",
    headers: "<th>Shot</th><th>Acceptance / Final</th><th>QC / Issues</th><th>Policy / Repair</th><th>Judge / Failure</th><th>Artifacts</th><th>Source</th>",
    rows: input.rows,
    emptyColspan: 7,
    emptyText: "No repair or acceptance artifacts matched the current filters."
  });
}

type RouteReasonPageBodyInput = {
  flash: string;
  filters: string;
  summaryCards: string;
  notes?: string;
  linksHtml?: string;
  railCards?: ExplorerRailCard[];
  recoveryCards?: ExplorerRailCard[];
  facts?: ExplorerFact[];
  evidenceCards?: ExplorerRailCard[];
  evidenceDrawer?: ExplorerEvidenceDrawer;
  rows: string;
};

export function buildRouteReasonPageBody(input: RouteReasonPageBodyInput): string {
  return buildExplorerPageBody({
    title: "Route Reason Explorer",
    subtitle: "Inspect shot routing reasons alongside render mode, backend choice, and acceptance outcomes.",
    flash: input.flash,
    filters: input.filters,
    summaryCards: input.summaryCards,
    notes: input.notes,
    linksHtml: input.linksHtml,
    railTitle: "Decision rail",
    railIntro: "Trace route decisions first, compare candidate evidence before promote, then open the artifact chain only for rows that still diverge.",
    railCards: input.railCards,
    recoveryTitle: "Recovery rail",
    recoveryIntro: "Keep retry order, linked review surfaces, and rollback anchors visible while routing blockers are in scope.",
    recoveryCards: input.recoveryCards,
    factsTitle: "Route snapshot",
    factsIntro: "Keep route drift, filters, and fallback anchors visible while scanning routed shots.",
    facts: input.facts,
    evidenceTitle: "Artifact evidence drawer",
    evidenceIntro: "Route evidence stays artifact-backed and adjacent, while raw payload reading remains behind the drawer.",
    evidenceCards: input.evidenceCards,
    evidenceDrawer: input.evidenceDrawer,
    tableId: "route-reason-table",
    tableTitle: "Route Reason Matrix",
    tableSubtitle: "Tie each `route_reason` to concrete runtime shots, selected candidates, and QC-backed artifact trails.",
    filterPlaceholder: "Search route_reason, shot, backend, blocker...",
    headers: "<th>Shot</th><th>route_reason</th><th>Render Path / Policy</th><th>Acceptance / Final</th><th>QC / Repair</th><th>Artifacts</th><th>Source</th>",
    rows: input.rows,
    emptyColspan: 7,
    emptyText: "No route reason artifacts matched the current filters."
  });
}

type DatasetLineagePageBodyInput = {
  flash: string;
  filters: string;
  summaryCards: string;
  notes?: string;
  linksHtml?: string;
  railCards?: ExplorerRailCard[];
  recoveryCards?: ExplorerRailCard[];
  facts?: ExplorerFact[];
  evidenceCards?: ExplorerRailCard[];
  evidenceDrawer?: ExplorerEvidenceDrawer;
  rows: string;
};

export function buildDatasetLineagePageBody(input: DatasetLineagePageBodyInput): string {
  return buildExplorerPageBody({
    title: "Dataset Lineage Viewer",
    subtitle: "Trace runtime shots back to fixture inputs, chart dataset ids, character packs, and sidecar reference manifests.",
    flash: input.flash,
    filters: input.filters,
    summaryCards: input.summaryCards,
    notes: input.notes,
    linksHtml: input.linksHtml,
    railTitle: "Decision rail",
    railIntro: "Verify lineage before promote, trace the artifact chain, and surface schema gaps before opening low-level payloads.",
    railCards: input.railCards,
    recoveryTitle: "Recovery rail",
    recoveryIntro: "Keep provenance retry order, linked explorers, and rollback anchors visible while validating lineage.",
    recoveryCards: input.recoveryCards,
    factsTitle: "Lineage snapshot",
    factsIntro: "Keep dataset, pack, and schema-gap scope visible while verifying provenance.",
    facts: input.facts,
    evidenceTitle: "Artifact evidence drawer",
    evidenceIntro: "Lineage evidence stays artifact-backed first; raw payloads remain behind the drawer when provenance still looks uncertain.",
    evidenceCards: input.evidenceCards,
    evidenceDrawer: input.evidenceDrawer,
    tableId: "dataset-lineage-table",
    tableTitle: "Lineage Rows",
    tableSubtitle: "Use this when an ops reviewer needs to confirm which dataset and character sources produced a benchmark bundle.",
    filterPlaceholder: "Search episode, dataset, pack, bible ref...",
    headers: "<th>Bundle</th><th>Episode</th><th>Datasets / Packs</th><th>Artifact Chain</th><th>Reference Inputs</th><th>Schema Memo</th><th>Source</th>",
    rows: input.rows,
    emptyColspan: 7,
    emptyText: "No lineage artifacts matched the current filters."
  });
}
