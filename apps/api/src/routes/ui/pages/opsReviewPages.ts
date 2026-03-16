import { renderTableEmptyRow } from "./uiText";

type ExplorerPageInput = {
  title: string;
  subtitle: string;
  flash: string;
  filters: string;
  summaryCards: string;
  notes?: string;
  tableId: string;
  tableTitle: string;
  tableSubtitle: string;
  filterPlaceholder: string;
  headers: string;
  rows: string;
  emptyColspan: number;
  emptyText: string;
};

function buildExplorerPageBody(input: ExplorerPageInput): string {
  return `
<section class="card dashboard-shell">
  <style>
    .ops-review-shell{display:grid;gap:12px}
    .ops-review-strip{display:grid;gap:10px;grid-template-columns:minmax(240px,1.3fr) minmax(240px,.9fr);align-items:start}
    .ops-review-rail{display:grid;gap:10px}
    .ops-review-note{padding:11px 12px;border:1px dashed #bed3e6;border-radius:14px;background:linear-gradient(180deg,#fcfefe,#f4f9fd)}
    .ops-review-note strong{display:block;margin-bottom:4px}
    .ops-chip-grid{display:flex;flex-wrap:wrap;gap:8px}
    .ops-chip-grid a{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;border:1px solid #c7d9eb;background:#fff;color:#0f4e6a;font-size:12px;font-weight:700}
    .ops-chip-grid a:hover{text-decoration:none;background:#eef7ff}
    .ops-filter-card{display:grid;gap:10px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:14px}
    .ops-review-shell .mono{word-break:break-all}
    @media (max-width:960px){.ops-review-strip{grid-template-columns:1fr}}
  </style>
  <div class="section-head">
    <div>
      <h1>${input.title}</h1>
      <p class="section-intro">${input.subtitle}</p>
    </div>
    <div class="quick-links"><a href="/ui/benchmarks">Benchmarks</a><a href="/ui/rollouts">Rollouts</a><a href="/ui/artifacts">Artifacts</a></div>
  </div>
  ${input.flash}
  <div class="ops-review-strip">
    <div class="ops-review-shell">
      <div class="summary-grid">${input.summaryCards}</div>
      <div class="ops-filter-card">${input.filters}</div>
    </div>
    <div class="ops-review-rail">
      ${input.notes ?? '<div class="ops-review-note"><strong>Artifact-backed view</strong><span class="muted-text">This screen only reads existing benchmark or episode artifacts. It does not re-run worker or renderer logic.</span></div>'}
    </div>
  </div>
</section>
<section class="card">
  <div class="section-head"><div><h2>${input.tableTitle}</h2><span class="muted-text">${input.tableSubtitle}</span></div><input type="search" data-table-filter="${input.tableId}" aria-label="${input.tableTitle}" placeholder="${input.filterPlaceholder}"/></div>
  <div class="table-wrap"><table id="${input.tableId}"><thead><tr>${input.headers}</tr></thead><tbody>${input.rows || renderTableEmptyRow(input.emptyColspan, input.emptyText)}</tbody></table></div>
</section>`;
}

type RepairAcceptancePageBodyInput = {
  flash: string;
  filters: string;
  summaryCards: string;
  notes?: string;
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
