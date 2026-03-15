function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type StudioChannelProfileSummary = {
  source: string;
  channelName: string;
  channelId: string;
  language: string;
  tone: string;
  pacing: string;
  stylePresetCount: number;
  forbiddenTermsSummary: string;
  negativeTermsSummary: string;
  updatedAt: string;
  editorHref: string;
};

type StudioPackStateSummary = {
  activePackId: string;
  activePackVersion: string;
  activePackStatus: string;
  latestPackId: string;
  latestPackCreatedAt: string;
  approvedCount: number;
  archivedCount: number;
  pendingCount: number;
  compareHref: string;
  charactersHref: string;
  generatorHref: string;
};

type StudioBodyInput = {
  message?: string;
  error?: string;
  styleOptions: string;
  speciesOptions: string;
  channelProfile: StudioChannelProfileSummary;
  packState: StudioPackStateSummary;
};

function renderMetaRow(label: string, value: string): string {
  return `<div class="studio-meta-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

type StudioLinkItem = {
  label: string;
  href: string;
};

type StudioFeedCardInput = {
  kicker: string;
  title: string;
  note: string;
  counterId: string;
  refreshId: string;
  filterId: string;
  filterLabel: string;
  filterPlaceholder: string;
  filterNote: string;
  tableId: string;
  tableHead: string;
  loadingColspan: number;
  loadingTitle: string;
  loadingDetail: string;
};

function renderStudioWorkbenchLink(label: string, note: string, href: string): string {
  return `<a href="${esc(href)}" class="studio-workbench-link"><strong>${esc(label)}</strong><span>${esc(note)}</span></a>`;
}

function renderStudioNextAction(step: string, label: string, title: string, copy: string, links: StudioLinkItem[]): string {
  return `<article class="studio-next-card"><div class="studio-kicker"><span class="studio-step">${esc(step)}</span><span>${esc(
    label
  )}</span></div><h3>${esc(title)}</h3><p class="studio-copy">${esc(copy)}</p><div class="studio-links">${links
    .map((link) => `<a href="${esc(link.href)}" class="studio-link">${esc(link.label)}</a>`)
    .join("")}</div></article>`;
}

function renderStudioFeedCard(input: StudioFeedCardInput): string {
  return `<section class="studio-section studio-feed-card"><div class="studio-head"><div class="studio-head-copy"><div class="studio-kicker">${esc(
    input.kicker
  )}</div><h2>${esc(input.title)}</h2><p class="studio-monitor-note">${esc(input.note)}</p></div><div class="studio-actions"><span id="${esc(
    input.counterId
  )}" class="studio-counter">Waiting</span><button type="button" id="${esc(
    input.refreshId
  )}" class="secondary">Refresh</button></div></div><div class="studio-table-tools"><input id="${esc(
    input.filterId
  )}" type="search" autocomplete="off" aria-label="${esc(input.filterLabel)}" placeholder="${esc(
    input.filterPlaceholder
  )}" /><span class="studio-filter-note">${esc(
    input.filterNote
  )}</span></div><div class="studio-table-wrap"><table id="${esc(
    input.tableId
  )}"><thead>${input.tableHead}</thead><tbody><tr><td colspan="${input.loadingColspan}"><div class="studio-state studio-state-loading"><strong>${esc(
    input.loadingTitle
  )}</strong><span>${esc(input.loadingDetail)}</span></div></td></tr></tbody></table></div></section>`;
}

export function buildStudioBody(input: StudioBodyInput): string {
  const seed = {
    activePackId: input.packState.activePackId,
    compareHref: input.packState.compareHref
  };
  const activePackSummary = input.packState.activePackId
    ? `${input.packState.activePackId} / v${input.packState.activePackVersion || "-"}`
    : "No active pack";
  const latestPackSummary = input.packState.latestPackId
    ? `${input.packState.latestPackId} @ ${input.packState.latestPackCreatedAt}`
    : "No recent pack activity";
  const packDriftHeadline =
    input.packState.latestPackId &&
    input.packState.activePackId &&
    input.packState.latestPackId !== input.packState.activePackId
      ? "Latest pack is newer than the active pack."
      : "Active pack matches the latest reviewed output.";
  const reviewPressureHeadline =
    input.packState.pendingCount > 0
      ? `${input.packState.pendingCount} pack decision(s) are still waiting.`
      : "No pending pack approvals are blocking dispatch.";
  const guardrailHeadline =
    input.channelProfile.forbiddenTermsSummary !== "(none)" || input.channelProfile.negativeTermsSummary !== "(none)"
      ? "Prompt guardrails are active on this channel."
      : "Prompt guardrails are currently light.";
  const workbenchLinks = [
    renderStudioWorkbenchLink("Assets", "Review intake, QC, and previews.", "/ui/assets"),
    renderStudioWorkbenchLink("Character Generator", "Run staged generation with compare and approval.", input.packState.generatorHref),
    renderStudioWorkbenchLink("Characters", "Review packs, compare versions, and rollback safely.", input.packState.charactersHref),
    renderStudioWorkbenchLink("Episodes", "Open editor and episode detail workbenches.", "/ui/episodes"),
    renderStudioWorkbenchLink("Jobs", "Watch queue execution and recover failures.", "/ui/jobs"),
    renderStudioWorkbenchLink("Profiles", "Inspect prompt rules and channel policy.", "/ui/profiles")
  ].join("");
  return `<style>
    .studio-shell{display:grid;gap:14px;padding:18px;border:1px solid #d6e0ef;background:linear-gradient(180deg,#fbfdff,#f3f7fd);box-shadow:0 18px 46px rgba(15,23,42,.08)}
    .studio-hero{display:grid;gap:14px;grid-template-columns:minmax(0,1.2fr) minmax(280px,.9fr)}
    .studio-hero-card,.studio-runtime-card,.studio-signal,.studio-guide,.studio-section{position:relative;overflow:hidden;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 16px 40px rgba(15,23,42,.06)}
    .studio-hero-card,.studio-runtime-card,.studio-signal,.studio-section{padding:18px}
    .studio-hero-card::before,.studio-section::before,.studio-signal::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#1257c7,rgba(18,87,199,.15))}
    .studio-runtime-card::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#be6727,rgba(190,103,39,.18))}
    .studio-guide{padding:0}
    .studio-guide summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;justify-content:space-between;gap:10px;font-weight:700}
    .studio-guide summary::-webkit-details-marker{display:none}
    .studio-guide-body{padding:0 18px 18px;color:#5b6b82}
    .studio-guide-body ol{margin:0;padding-left:18px;display:grid;gap:8px}
    .studio-eyebrow,.studio-kicker{margin:0 0 8px;color:#1257c7;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .studio-kicker{display:flex;align-items:center;gap:10px;color:#5b6b82}
    .studio-hero-card h1{margin:0;font-size:34px;line-height:1;letter-spacing:-.04em}
    .studio-hint,.studio-copy,.studio-monitor-note,.studio-guide-note{margin:10px 0 0;color:#5b6b82;font-size:14px;line-height:1.55}
    .studio-pill-row,.studio-actions,.studio-links,.studio-stage-meta{display:flex;gap:8px;flex-wrap:wrap}
    .studio-pill,.studio-counter,.studio-meta-chip,.studio-link{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;border:1px solid #d6e0ef;background:#fff;font-size:12px;font-weight:700;white-space:nowrap}
    .studio-pill{background:#f5f8fe}
    .studio-counter{background:#ebf3ff;border-color:#c8d9fb;color:#1257c7}
    .studio-meta-chip{background:#f7f9fc;color:#395170}
    .studio-link{color:#142033;text-decoration:none}
    .studio-link:hover{text-decoration:none;box-shadow:0 8px 20px rgba(18,87,199,.08);border-color:#b8cde9}
    .studio-status{margin-top:14px;padding:14px 16px;border-radius:16px;border:1px solid #d9e5fb;background:linear-gradient(180deg,#f7faff,#edf4ff)}
    .studio-status-label{display:block;margin:0 0 8px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    #studio-status{margin:0;padding:0;border:0;background:none;box-shadow:none;color:#142033;font-weight:600}
    .studio-runtime-card{display:grid;gap:14px;background:linear-gradient(180deg,#fffefd,#fff7f1)}
    .studio-runtime-controls{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
    .studio-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid #ecd5c3;background:rgba(255,255,255,.78);font-weight:600}
    .studio-grid{display:grid;gap:14px;grid-template-columns:minmax(380px,1.08fr) minmax(360px,.92fr) minmax(300px,.86fr);align-items:start}
    .studio-col{display:grid;gap:14px}
    .studio-ops-rail{display:grid;gap:14px;position:sticky;top:84px}
    .studio-ops-card{position:relative;overflow:hidden;padding:18px;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#f7fffc,#f4f8ff);box-shadow:0 16px 40px rgba(15,23,42,.06)}
    .studio-ops-card::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#0f766e,rgba(15,118,110,.15))}
    .studio-ops-kicker{margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .studio-meta{display:grid;gap:8px}
    .studio-meta-row{display:grid;gap:4px;padding:10px 12px;border:1px solid #d8e1ec;border-radius:14px;background:#fff}
    .studio-meta-row span{color:#5b6b82;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    .studio-meta-row strong{font-size:13px;color:#142033}
    .studio-selection-empty{padding:12px;border:1px dashed #bfd4e8;border-radius:14px;background:#f8fbff;color:#5b6b82;font-size:13px}
    .studio-section{background:linear-gradient(180deg,#fff,#f9fbff)}
    .studio-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .studio-head-copy{max-width:58ch}
    .studio-step{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:10px;border:1px solid #c8d9fb;background:#ebf3ff;color:#1257c7;font-size:13px;font-weight:700}
    .studio-section h2{margin:0;font-size:22px;letter-spacing:-.03em}
    .studio-field-note{margin:12px 0 0;color:#5b6b82;font-size:12px;line-height:1.5}
    .studio-page-input,.studio-toolbar-input{}
    .studio-shell label,.studio-grid label,.studio-board label{display:grid;gap:6px;font-size:13px;font-weight:600;color:#142033}
    .studio-shell input:not([type="checkbox"]):not([type="file"]),.studio-shell select,.studio-shell textarea,.studio-grid input:not([type="checkbox"]):not([type="file"]),.studio-grid select,.studio-grid textarea,.studio-board input:not([type="checkbox"]):not([type="file"]),.studio-board select,.studio-board textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d4deec;border-radius:12px;background:#fff;color:#142033;transition:border-color .15s ease,box-shadow .15s ease}
    .studio-shell input[type="file"],.studio-grid input[type="file"],.studio-board input[type="file"]{padding:9px 10px;border:1px dashed #c1d2e7;border-radius:12px;background:#fff}
    .studio-shell input:not([type="checkbox"]):not([type="file"]):focus,.studio-shell select:focus,.studio-shell textarea:focus,.studio-grid input:not([type="checkbox"]):not([type="file"]):focus,.studio-grid select:focus,.studio-grid textarea:focus,.studio-board input:not([type="checkbox"]):not([type="file"]):focus,.studio-board select:focus,.studio-board textarea:focus{outline:none;border-color:#8eb1ef;box-shadow:0 0 0 3px rgba(18,87,199,.12)}
    .studio-shell textarea,.studio-grid textarea,.studio-board textarea{resize:vertical;min-height:88px}
    .studio-shell button,.studio-grid button,.studio-board button{appearance:none;padding:10px 14px;border-radius:12px;border:1px solid #c1d2e7;background:#fff;color:#142033;font-weight:700;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
    .studio-shell button:hover,.studio-grid button:hover,.studio-board button:hover{transform:translateY(-1px);border-color:#aac2e9;box-shadow:0 10px 24px rgba(15,23,42,.08)}
    .studio-shell button[data-primary-action="1"],.studio-grid button[data-primary-action="1"],.studio-board button[data-primary-action="1"]{border-color:#0f4aad;background:linear-gradient(180deg,#1660d0,#0f4fad);color:#fff;box-shadow:0 12px 24px rgba(18,87,199,.18)}
    .studio-shell button.secondary,.studio-grid button.secondary,.studio-board button.secondary{background:#f5f8fe}
    .studio-output{margin:14px 0 0;min-height:120px;padding:14px 16px;border:1px solid #233554;border-radius:16px;background:linear-gradient(180deg,#0f1726,#142033);color:#dfe9ff;overflow:auto;font-size:12px;line-height:1.55}
    .studio-binding-grid{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:14px}
    .studio-binding{padding:12px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
    .studio-binding span{display:block;margin-bottom:8px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
    .studio-action-cluster{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fff,#f8fbff)}
    .studio-cluster-label{margin-right:4px;color:#5b6b82;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .studio-table-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}
    .studio-filter-note{color:#5b6b82;font-size:12px}
    .studio-table-wrap{overflow:auto;max-height:340px;border:1px solid #dce5f3;border-radius:16px;background:#fff}
    .studio-table-wrap table{margin:0;min-width:100%;border-collapse:separate;border-spacing:0}
    .studio-table-wrap thead th{position:sticky;top:0;background:#f6f9ff;z-index:1}
    .studio-table-wrap tbody tr:hover{background:#f8fbff}
    .studio-table-wrap tbody tr:focus-within{outline:2px solid #0f5bd8;outline-offset:-2px}
    .studio-table-wrap tbody tr[data-selected="true"]{background:#eef4ff;box-shadow:inset 3px 0 0 #1257c7}
    .studio-state{display:grid;gap:4px;padding:14px 16px;margin:4px 0;border-radius:14px;border:1px solid transparent;text-align:left}
    .studio-state strong{font-size:13px}
    .studio-state span{color:#5b6b82;font-size:12px;line-height:1.45}
    .studio-state-loading{border-color:#d9e5fb;background:linear-gradient(180deg,#f6f9ff,#edf4ff)}
    .studio-state-empty{border-color:#e3eaf4;background:linear-gradient(180deg,#fbfcfe,#f5f8fc)}
    .studio-state-error{border-color:#f0c6b7;background:linear-gradient(180deg,#fff8f5,#fff1ed)}
    .studio-state-error strong,.studio-state-error span{color:#8b3520}
    .studio-signal-grid{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))}
    .studio-signal{display:grid;gap:8px;min-height:112px}
    .studio-signal-label{color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    .studio-signal-value{font-size:18px;font-weight:700;line-height:1.3;letter-spacing:-.02em}
    .studio-signal-note{color:#5b6b82;font-size:13px;line-height:1.5}
    .studio-title-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .studio-workbench-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:16px}
    .studio-workbench-link{display:grid;gap:6px;padding:14px;border:1px solid #d6e0ef;border-radius:16px;background:linear-gradient(180deg,#fff,#f8fbff);text-decoration:none;color:#142033}
    .studio-workbench-link strong{font-size:13px}
    .studio-workbench-link span{font-size:12px;line-height:1.5;color:#5b6b82}
    .studio-workbench-link:hover{text-decoration:none;box-shadow:0 12px 24px rgba(18,87,199,.08);border-color:#b8cde9}
    .studio-plan-list{display:grid;gap:10px}
    .studio-next-card{padding:14px;border:1px solid #ecd5c3;border-radius:16px;background:rgba(255,255,255,.82)}
    .studio-next-card h3{margin:0;font-size:18px;letter-spacing:-.02em}
    .studio-board{display:grid;gap:14px;grid-template-columns:minmax(0,1.28fr) minmax(320px,.92fr);align-items:start}
    .studio-main-col{display:grid;gap:14px}
    .studio-overview-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:14px}
    .studio-overview-card{padding:14px;border:1px solid #d4deec;border-radius:16px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
    .studio-overview-card span{display:block;margin-bottom:8px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
    .studio-overview-card strong{display:block;font-size:15px;line-height:1.4}
    .studio-overview-card p{margin:8px 0 0;color:#5b6b82;font-size:13px;line-height:1.5}
    .studio-risk-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
    .studio-risk-card{display:grid;gap:8px;min-height:132px;padding:16px;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff)}
    .studio-risk-card strong{font-size:18px;line-height:1.35;letter-spacing:-.02em}
    .studio-risk-card p{margin:0;color:#5b6b82;font-size:13px;line-height:1.55}
    .studio-risk-level{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid #d4deec;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;justify-self:start}
    .studio-risk-level.attn{background:#fff7e8;border-color:#ecd5c3;color:#8b4c1c}
    .studio-risk-level.watch{background:#eef4ff;border-color:#c8d9fb;color:#1257c7}
    .studio-risk-level.good{background:#effcf5;border-color:#b8e7c8;color:#0f6b45}
    .studio-activity-grid{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}
    .studio-feed-card{min-height:0}
    .studio-ops-summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;justify-content:space-between;gap:10px;font-weight:700}
    .studio-ops-summary::-webkit-details-marker{display:none}
    .studio-ops-details{padding:0}
    .studio-ops-body{padding:0 18px 18px;display:grid;gap:12px}
    .studio-shell code,.studio-shell pre,.studio-shell input,.studio-shell select,.studio-shell textarea,.studio-grid code,.studio-grid pre,.studio-grid input,.studio-grid select,.studio-grid textarea,.studio-board code,.studio-board pre,.studio-board input,.studio-board select,.studio-board textarea{font-family:"IBM Plex Mono","Cascadia Code","SFMono-Regular",Consolas,monospace}
    @media (max-width:1240px){.studio-hero,.studio-grid,.studio-signal-grid,.studio-runtime-controls,.studio-binding-grid,.studio-board,.studio-activity-grid{grid-template-columns:1fr}.studio-ops-rail{position:static}}
    @media (max-width:720px){.studio-shell,.studio-hero-card,.studio-runtime-card,.studio-section,.studio-signal,.studio-risk-card{padding:16px}.studio-head{flex-direction:column}.studio-action-cluster{align-items:stretch}.studio-action-cluster button{width:100%}}
  </style>
${input.message ? `<div class="notice">${esc(input.message)}</div>` : ""}${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}
<section class="card studio-shell">
  <div class="studio-hero">
    <section class="studio-hero-card">
      <p class="studio-eyebrow">Orchestration Hub</p>
      <div class="studio-title-row">
        <div>
          <h1>Studio</h1>
          <p class="studio-hint">Review current state, recent object activity, and risk before stepping into the workbench that owns the next decision. Studio should point you forward, not dump every control onto one screen.</p>
        </div>
      </div>
      <div class="studio-pill-row">
        <span class="studio-pill">Current state summary</span>
        <span class="studio-pill">Recent object activity</span>
        <span class="studio-pill">Risk signals</span>
        <span class="studio-pill">Dedicated workbench handoff</span>
      </div>
      <div class="studio-status">
        <span class="studio-status-label">Operator status</span>
        <div id="studio-status" role="status" aria-live="polite" aria-atomic="true">Ready: review state, choose the next action, then hand work off to the right workbench.</div>
      </div>
      <div class="studio-workbench-grid">${workbenchLinks}</div>
    </section>
    <section class="studio-runtime-card">
      <div>
        <p class="studio-eyebrow" style="color:#be6727">Top 3 Next Actions</p>
        <h2 style="margin:0">Move the pipeline with fewer simultaneous decisions</h2>
        <p class="studio-copy">Each action below narrows the operator to one decision surface instead of keeping every input visible at once.</p>
      </div>
      <div class="studio-plan-list">
        ${renderStudioNextAction("1", "Review", "Inspect fresh intake in Assets", "Use the review workbench to confirm QC, preview outputs, and whether a source is ready to anchor downstream work.", [
          { label: "Open Assets", href: "/ui/assets" },
          { label: "Open Studio Intake", href: "#studio-intake" }
        ])}
        ${renderStudioNextAction("2", "Stage", "Generate or compare the next pack", "Step into Character Generator for the staged run flow, or Characters when you need compare, approval, or rollback context.", [
          { label: "Open Character Generator", href: input.packState.generatorHref },
          { label: "Open Characters", href: input.packState.charactersHref },
          ...(input.packState.compareHref ? [{ label: "Open Compare", href: input.packState.compareHref }] : [])
        ])}
        ${renderStudioNextAction("3", "Dispatch", "Bind the selected pack and move an episode", "Use the dispatch rail when you are ready to create, preview, edit, or publish without reopening the old all-in-one dashboard.", [
          { label: "Open Dispatch Rail", href: "#studio-dispatch" },
          { label: "Open Episodes", href: "/ui/episodes" },
          { label: "Open Jobs", href: "/ui/jobs" }
        ])}
      </div>
    </section>
  </div>
</section>
<section class="studio-board">
  <div class="studio-main-col">
    <section class="studio-section">
      <div class="studio-head">
        <div class="studio-head-copy">
          <div class="studio-kicker">Current State Summary</div>
          <h2>Read the operating state first</h2>
          <p class="studio-monitor-note">Selection, active pack, and channel policy stay visible here before you dispatch or open the next workbench.</p>
        </div>
      </div>
      <div class="studio-signal-grid">
        <section class="studio-signal">
          <span class="studio-signal-label">Selected Pack</span>
          <strong id="studio-signal-pack" class="studio-signal-value">No pack selected</strong>
          <span class="studio-signal-note">Choose a pack from recent object activity to bind dispatch safely.</span>
        </section>
        <section class="studio-signal">
          <span class="studio-signal-label">Episode Target</span>
          <strong id="studio-signal-episode" class="studio-signal-value">No episode selected</strong>
          <span id="studio-signal-topic" class="studio-signal-note">Topic not set.</span>
        </section>
        <section class="studio-signal">
          <span class="studio-signal-label">Operating Model</span>
          <strong class="studio-signal-value">Review -> Stage -> Dispatch</strong>
          <span class="studio-signal-note">Use the workbench that matches the decision you are making now.</span>
        </section>
      </div>
      <div class="studio-overview-grid">
        <article class="studio-overview-card"><span>Channel</span><strong>${esc(input.channelProfile.channelName)}</strong><p>${esc(input.channelProfile.channelId || "(default)")} / ${esc(input.channelProfile.language)}</p></article>
        <article class="studio-overview-card"><span>Active Pack</span><strong>${esc(activePackSummary)}</strong><p>${esc(input.packState.activePackStatus || "No pack status recorded")}</p></article>
        <article class="studio-overview-card"><span>Latest Pack Activity</span><strong>${esc(latestPackSummary)}</strong><p>Approved ${esc(String(input.packState.approvedCount))} / Archived ${esc(String(input.packState.archivedCount))}</p></article>
        <article class="studio-overview-card"><span>Profile Updated</span><strong>${esc(input.channelProfile.updatedAt)}</strong><p>${esc(input.channelProfile.tone)} / ${esc(input.channelProfile.pacing)}</p></article>
      </div>
    </section>
    <section class="studio-section">
      <div class="studio-head">
        <div class="studio-head-copy">
          <div class="studio-kicker">Risk Signals</div>
          <h2>Scan the friction before you act</h2>
          <p class="studio-monitor-note">These signals keep compare, review, and recovery concerns visible without forcing every control open.</p>
        </div>
      </div>
      <div class="studio-risk-grid">
        <article class="studio-risk-card">
          <span class="studio-risk-level ${input.packState.latestPackId && input.packState.activePackId && input.packState.latestPackId !== input.packState.activePackId ? "attn" : "good"}">Pack Drift</span>
          <strong>${esc(packDriftHeadline)}</strong>
          <p>Active pack: ${esc(activePackSummary)}. Latest activity: ${esc(latestPackSummary)}.</p>
        </article>
        <article class="studio-risk-card">
          <span class="studio-risk-level ${input.packState.pendingCount > 0 ? "watch" : "good"}">Review Pressure</span>
          <strong>${esc(reviewPressureHeadline)}</strong>
          <p>Pack counts: approved ${esc(String(input.packState.approvedCount))} / archived ${esc(String(input.packState.archivedCount))} / pending ${esc(String(input.packState.pendingCount))}.</p>
        </article>
        <article class="studio-risk-card">
          <span class="studio-risk-level ${guardrailHeadline.includes("active") ? "attn" : "good"}">Guardrails</span>
          <strong>${esc(guardrailHeadline)}</strong>
          <p>Forbidden terms: ${esc(input.channelProfile.forbiddenTermsSummary)}. Negative terms: ${esc(input.channelProfile.negativeTermsSummary)}.</p>
        </article>
      </div>
    </section>
    <section class="studio-section">
      <div class="studio-head">
        <div class="studio-head-copy">
          <div class="studio-kicker">Recent Object Activity</div>
          <h2>Review the live feeds</h2>
          <p class="studio-monitor-note">Use these compact feeds to choose the object that needs attention, then continue in the matching workbench or the dispatch rail.</p>
        </div>
        <div class="studio-links"><a href="#studio-live-controls" class="studio-link">Open live controls</a></div>
      </div>
      <div class="studio-activity-grid">
        ${renderStudioFeedCard({
          kicker: "Assets",
          title: "Recent Assets",
          note: "Jump into asset review when QC or preview verification is the next decision.",
          counterId: "studio-assets-count",
          refreshId: "studio-refresh-assets",
          filterId: "studio-filter-assets",
          filterLabel: "Filter recent assets",
          filterPlaceholder: "Search assets (id/type/status)",
          filterNote: "Current page filter",
          tableId: "studio-assets-table",
          tableHead: "<tr><th>ID</th><th>Type</th><th>Status</th><th>Created</th></tr>",
          loadingColspan: 4,
          loadingTitle: "Loading assets",
          loadingDetail: "Fetching the latest asset intake records."
        })}
        ${renderStudioFeedCard({
          kicker: "Packs",
          title: "Generated Character Packs",
          note: "Click a row to bind it into the dispatch rail or open pack review.",
          counterId: "studio-packs-count",
          refreshId: "studio-refresh-packs",
          filterId: "studio-filter-packs",
          filterLabel: "Filter generated character packs",
          filterPlaceholder: "Search packs (id/status/episode)",
          filterNote: "Row click selects pack",
          tableId: "studio-packs-table",
          tableHead: "<tr><th>ID</th><th>Version</th><th>Status</th><th>Episode</th></tr>",
          loadingColspan: 4,
          loadingTitle: "Loading character packs",
          loadingDetail: "Pulling the latest generation outputs."
        })}
        ${renderStudioFeedCard({
          kicker: "Episodes",
          title: "Recent Episodes",
          note: "Click a row to preload episode id and topic into the dispatch rail.",
          counterId: "studio-episodes-count",
          refreshId: "studio-refresh-episodes",
          filterId: "studio-filter-episodes",
          filterLabel: "Filter recent episodes",
          filterPlaceholder: "Search episodes (id/topic/status)",
          filterNote: "Row click selects episode",
          tableId: "studio-episodes-table",
          tableHead: "<tr><th>ID</th><th>Topic</th><th>Status</th><th>Latest Job</th></tr>",
          loadingColspan: 4,
          loadingTitle: "Loading episodes",
          loadingDetail: "Syncing the latest episode queue state."
        })}
        ${renderStudioFeedCard({
          kicker: "Jobs",
          title: "Recent Jobs",
          note: "Watch preview, render, and publish execution without leaving the hub.",
          counterId: "studio-jobs-count",
          refreshId: "studio-refresh-jobs",
          filterId: "studio-filter-jobs",
          filterLabel: "Filter recent jobs",
          filterPlaceholder: "Search jobs (id/type/status/episode)",
          filterNote: "Newest rows only",
          tableId: "studio-jobs-table",
          tableHead: "<tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Episode</th></tr>",
          loadingColspan: 5,
          loadingTitle: "Loading jobs",
          loadingDetail: "Waiting for the latest queue telemetry."
        })}
      </div>
    </section>
  </div>
  <aside class="studio-ops-rail">
    <section class="studio-ops-card" id="studio-dispatch">
      <p class="studio-ops-kicker">Dispatch Rail</p>
      <h2 style="margin:0">Bind a pack and move the episode</h2>
      <p class="studio-monitor-note">This is the only active input surface kept in Studio. Everything noisier stays behind a dedicated workbench or collapsed detail.</p>
      <div class="studio-binding-grid">
        <label class="studio-binding"><span>Episode Topic</span><input id="studio-topic" placeholder="e.g. character intro video"/></label>
        <label class="studio-binding"><span>Episode Id</span><input id="studio-episode-id" placeholder="cmm..."/></label>
        <label class="studio-binding"><span>Selected Character Pack</span><input id="studio-selected-pack" placeholder="select from activity feed" readonly/></label>
      </div>
      <div style="display:grid;gap:12px;margin-top:16px">
        <div class="studio-action-cluster">
          <span class="studio-cluster-label">Pipeline</span>
          <button type="button" id="studio-oneclick" data-primary-action="1" data-primary-label="Start one-click preview flow">Start one-click (create + preview)</button>
          <button type="button" id="studio-create-episode" class="secondary">Create episode only</button>
        </div>
        <div class="studio-action-cluster">
          <span class="studio-cluster-label">Episode Ops</span>
          <button type="button" id="studio-open-editor" class="secondary">Open editor</button>
          <button type="button" id="studio-enqueue-preview" class="secondary">Enqueue preview render</button>
          <button type="button" id="studio-open-publish" class="secondary">Open publish handoff</button>
        </div>
      </div>
    </section>
    <section class="studio-ops-card">
      <p class="studio-ops-kicker">Current Selection</p>
      <h2 id="studio-selection-title" style="margin:0">No Selection</h2>
      <p id="studio-selection-meta" class="studio-monitor-note">Select a pack or episode from recent object activity to inspect route-ready metadata.</p>
      <div id="studio-selection-fields" class="studio-meta"><div class="studio-selection-empty">No pack or episode is selected yet.</div></div>
      <div id="studio-selection-links" class="studio-links" style="margin-top:12px"></div>
    </section>
    <details class="studio-ops-card studio-ops-details" id="studio-intake">
      <summary class="studio-ops-summary"><span>Quick intake</span><span class="studio-guide-note">Collapsed by default</span></summary>
      <div class="studio-ops-body">
        <p class="studio-monitor-note" style="margin-top:0">Use this only for a fast handoff into the Assets review workbench.</p>
        <form id="studio-asset-upload-form" enctype="multipart/form-data" class="grid">
          <div class="grid two">
            <label>Asset Type<select name="assetType"><option value="character_reference">character_reference (reference)</option><option value="character_view">character_view (view variant)</option><option value="background">background (environment)</option><option value="chart_source">chart_source (chart)</option></select></label>
            <label>File<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label>
          </div>
          <div class="studio-actions">
            <button id="studio-asset-upload-submit" type="submit">Upload</button>
            <a href="/ui/assets" class="studio-link">Open Assets</a>
          </div>
        </form>
        <p class="studio-field-note">A successful upload opens the matching asset inspection view automatically.</p>
        <pre id="studio-asset-upload-result" class="studio-output" role="status" aria-live="polite" aria-atomic="true">Waiting</pre>
      </div>
    </details>
    <details class="studio-ops-card studio-ops-details" id="studio-live-controls">
      <summary class="studio-ops-summary"><span>Live feed controls</span><span class="studio-guide-note">Auto refresh and manual sync</span></summary>
      <div class="studio-ops-body">
        <p class="studio-monitor-note" style="margin-top:0">Keep the monitor rail warm while you review activity. Manual refresh stays available when you need a clean sync point.</p>
        <div class="studio-runtime-controls">
          <label class="studio-toggle"><span>Auto refresh</span><input id="studio-auto-refresh" type="checkbox" checked/></label>
          <label>Interval
            <select id="studio-refresh-interval">
              <option value="3000">3s</option>
              <option value="5000" selected>5s</option>
              <option value="10000">10s</option>
            </select>
          </label>
        </div>
        <div class="studio-actions">
          <button type="button" id="studio-refresh-all" class="secondary">Refresh all feeds</button>
        </div>
        <div class="studio-links">
          <a href="/ui/jobs" class="studio-link">Jobs</a>
          <a href="/ui/episodes" class="studio-link">Episodes</a>
          <a href="/ui/rollouts" class="studio-link">Rollouts</a>
        </div>
      </div>
    </details>
    <section class="studio-ops-card">
      <p class="studio-ops-kicker">Channel Profile</p>
      <h2 style="margin:0">${esc(input.channelProfile.channelName)}</h2>
      <p class="studio-monitor-note">Verify the active channel profile before queueing generation or episode preview work.</p>
      <div class="studio-meta">
        ${renderMetaRow("Source", input.channelProfile.source)}
        ${renderMetaRow("Channel", `${input.channelProfile.channelId || "(default)"} / ${input.channelProfile.language}`)}
        ${renderMetaRow("Tone & Pacing", `${input.channelProfile.tone} / ${input.channelProfile.pacing}`)}
        ${renderMetaRow("Style Presets", String(input.channelProfile.stylePresetCount))}
        ${renderMetaRow("Forbidden Terms", input.channelProfile.forbiddenTermsSummary)}
        ${renderMetaRow("Negative Terms", input.channelProfile.negativeTermsSummary)}
        ${renderMetaRow("Updated", input.channelProfile.updatedAt)}
      </div>
      <div class="studio-links" style="margin-top:12px">
        <a href="${esc(input.channelProfile.editorHref)}" class="studio-link">Open ChannelBible</a>
        <a href="/ui/profiles" class="studio-link">Open Profiles</a>
        <a href="/ui/rollouts" class="studio-link">Open Rollouts</a>
      </div>
    </section>
  </aside>
</section>
<script>
(() => {
  const q = (id) => document.getElementById(id);
  const assetsBody = q("studio-assets-table")?.querySelector("tbody");
  const packsBody = q("studio-packs-table")?.querySelector("tbody");
  const episodesBody = q("studio-episodes-table")?.querySelector("tbody");
  const jobsBody = q("studio-jobs-table")?.querySelector("tbody");
  const statusBox = q("studio-status");
  const selectedPack = q("studio-selected-pack");
  const episodeInput = q("studio-episode-id");
  const topicInput = q("studio-topic");
  const autoRefreshInput = q("studio-auto-refresh");
  const refreshIntervalInput = q("studio-refresh-interval");
  const selectionTitle = q("studio-selection-title");
  const selectionMeta = q("studio-selection-meta");
  const selectionFields = q("studio-selection-fields");
  const selectionLinks = q("studio-selection-links");
  let refreshTimer = null;

  const safe = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\\"", "&quot;").replaceAll("'", "&#39;");
  const renderStateRow = (colspan, tone, title, detail) => "<tr><td colspan='" + colspan + "'><div class='studio-state studio-state-" + tone + "'><strong>" + safe(title) + "</strong><span>" + safe(detail) + "</span></div></td></tr>";
  const readText = (v, fallback = "-") => {
    const text = String(v ?? "").trim();
    return text ? text : fallback;
  };
  const readPath = (root, path) => {
    let current = root;
    for (const key of path) {
      if (!current || typeof current !== "object" || !(key in current)) return null;
      current = current[key];
    }
    return current;
  };
  const setStatus = (text) => { if (statusBox instanceof HTMLElement) statusBox.textContent = text; };
  const setCounter = (id, count) => {
    const el = q(id);
    if (el instanceof HTMLElement) el.textContent = String(count) + " loaded";
  };
  const setSignal = (id, value, fallback) => {
    const el = q(id);
    if (el instanceof HTMLElement) el.textContent = value && value.trim() ? value.trim() : fallback;
  };
  const updateSelectionSummary = () => {
    setSignal("studio-signal-pack", selectedPack instanceof HTMLInputElement ? selectedPack.value : "", "No pack selected");
    setSignal("studio-signal-episode", episodeInput instanceof HTMLInputElement ? episodeInput.value : "", "No episode selected");
    setSignal("studio-signal-topic", topicInput instanceof HTMLInputElement ? topicInput.value : "", "Topic not set.");
  };
  const markSelectedRows = (tbodyEl, kind, value) => {
    if (!(tbodyEl instanceof HTMLElement)) return;
    tbodyEl.querySelectorAll("tr").forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const rowValue = kind === "pack" ? row.dataset.packId || "" : row.dataset.episodeId || "";
      row.dataset.selected = value && rowValue === value ? "true" : "false";
    });
  };
  const applyFilter = (inputEl, tbodyEl) => {
    if (!(inputEl instanceof HTMLInputElement) || !(tbodyEl instanceof HTMLElement)) return;
    const qText = inputEl.value.trim().toLowerCase();
    tbodyEl.querySelectorAll("tr").forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const text = String(row.textContent || "").toLowerCase();
      row.style.display = !qText || text.includes(qText) ? "" : "";
      if (qText && !text.includes(qText)) row.style.display = "none";
    });
  };
  const readError = async (res, fallback) => {
    try {
      const json = await res.json();
      if (json && typeof json.error === "string" && json.error.trim()) return json.error.trim();
      return fallback;
    } catch {
      return fallback;
    }
  };
  const renderSelection = (title, metaText, fields, links) => {
    if (selectionTitle instanceof HTMLElement) selectionTitle.textContent = title;
    if (selectionMeta instanceof HTMLElement) selectionMeta.textContent = metaText;
    if (selectionFields instanceof HTMLElement) {
      if (!fields.length) {
        selectionFields.innerHTML = "<div class=\\"studio-selection-empty\\">No details were recorded for this selection.</div>";
      } else {
        selectionFields.innerHTML = fields.map((field) => "<div class=\\"studio-meta-row\\"><span>" + safe(field.label) + "</span><strong>" + safe(field.value) + "</strong></div>").join("");
      }
    }
    if (selectionLinks instanceof HTMLElement) {
      selectionLinks.innerHTML = (links || []).map((link) => "<a href=\\"" + safe(link.href) + "\\" class=\\"studio-link\\">" + safe(link.label) + "</a>").join("");
    }
  };
  const summarizePackJson = (packJson) => {
    const selectedByView = readPath(packJson, ["selectedByView"]);
    const selectedViews = selectedByView && typeof selectedByView === "object" ? Object.keys(selectedByView).filter((key) => selectedByView[key]) : [];
    return {
      mascotProfile: readText(readPath(packJson, ["mascot", "profile"]) || readPath(packJson, ["profile"]) || readPath(packJson, ["profileAssetId"]), "(not recorded)"),
      lineage: readText(readPath(packJson, ["sourceImageRef"]) || readPath(packJson, ["hash"]) || readPath(packJson, ["schemaId"]), "(not recorded)"),
      selectedViews: selectedViews.length ? selectedViews.join(", ") : "(not recorded)"
    };
  };
  const loadPackInspector = async (packId) => {
    if (!packId) return;
    renderSelection("Loading Pack...", "Reading pack metadata from the API...", [], []);
    try {
      const res = await fetch("/api/character-packs/" + encodeURIComponent(packId));
      if (!res.ok) throw new Error("Pack detail failed: " + res.status);
      const json = await res.json();
      const pack = json?.data;
      if (!pack) throw new Error("Pack detail missing data");
      const summary = summarizePackJson(pack.json);
      const latestEpisode = Array.isArray(pack.episodes) && pack.episodes.length > 0 ? pack.episodes[0] : null;
      const rollbackState = String(pack.status || "").toUpperCase() === "APPROVED" ? "active" : "rollback candidate";
      renderSelection(
        "Pack " + readText(pack.id),
        "Channel and pack metadata for compare, rollback, and mascot profile checks.",
        [
          { label: "channel", value: readText(pack.channelId) },
          { label: "version", value: "v" + readText(pack.version) },
          { label: "status", value: readText(pack.status) },
          { label: "mascot profile", value: summary.mascotProfile },
          { label: "selected views", value: summary.selectedViews },
          { label: "lineage", value: summary.lineage },
          { label: "latest episode", value: latestEpisode ? readText(latestEpisode.id) + " / " + readText(latestEpisode.topic) : "-" },
          { label: "rollback state", value: rollbackState }
        ],
        [
          { label: "Pack Detail", href: "/ui/characters?characterPackId=" + encodeURIComponent(packId) },
          summary.mascotProfile && summary.mascotProfile !== "(not recorded)" ? { label: "Profiles", href: "/ui/profiles?q=" + encodeURIComponent(summary.mascotProfile) } : null,
          { label: "QC Report", href: "/artifacts/characters/" + encodeURIComponent(packId) + "/qc_report.json" },
          ${seed.compareHref ? `{ label: "Compare", href: ${JSON.stringify(seed.compareHref)} }` : "null"}
        ].filter(Boolean)
      );
    } catch (error) {
      renderSelection("Pack Lookup Failed", String(error), [], [{ label: "Open Characters", href: "/ui/characters" }]);
    }
  };
  const loadEpisodeInspector = async (episodeId) => {
    if (!episodeId) return;
    renderSelection("Loading Episode...", "Reading episode metadata from the API...", [], []);
    try {
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId));
      if (!res.ok) throw new Error("Episode detail failed: " + res.status);
      const json = await res.json();
      const data = json?.data;
      const episode = data?.episode;
      if (!episode) throw new Error("Episode detail missing data");
      const style = readPath(episode, ["datasetVersionSnapshot", "style"]) || {};
      const latestJob = Array.isArray(data.jobs) && data.jobs.length > 0 ? data.jobs[0] : null;
      renderSelection(
        "Episode " + readText(episode.id),
        "Latest run context, style profile, and artifact readiness for the selected episode.",
        [
          { label: "channel", value: readText(readPath(episode, ["channel", "name"]) || readPath(episode, ["channelId"])) },
          { label: "topic", value: readText(episode.topic) },
          { label: "status", value: readText(episode.status) },
          { label: "character pack", value: readText(episode.characterPackId, "(none)") },
          { label: "style preset", value: readText(readPath(style, ["stylePresetId"]), "(auto)") },
          { label: "hook boost", value: readText(readPath(style, ["hookBoost"]), "-") },
          { label: "latest job", value: latestJob ? readText(latestJob.type) + " / " + readText(latestJob.status) : "(none)" },
          { label: "artifacts", value: "preview=" + (data?.artifacts?.previewExists ? "yes" : "no") + " / final=" + (data?.artifacts?.finalExists ? "yes" : "no") }
        ],
        [
          { label: "Episode Detail", href: "/ui/episodes/" + encodeURIComponent(episodeId) },
          { label: "Shot Editor", href: "/ui/episodes/" + encodeURIComponent(episodeId) + "/editor" },
          { label: "Profiles", href: "/ui/profiles" },
          { label: "Publish", href: "/ui/publish?episodeId=" + encodeURIComponent(episodeId) }
        ]
      );
    } catch (error) {
      renderSelection("Episode Lookup Failed", String(error), [], [{ label: "Open Episodes", href: "/ui/episodes" }]);
    }
  };

  const loadAssets = async () => {
    if (!(assetsBody instanceof HTMLElement)) return;
    assetsBody.innerHTML = renderStateRow(4, "loading", "Loading assets", "Fetching the latest asset intake records.");
    try {
      const res = await fetch("/api/assets?limit=30");
      if (!res.ok) throw new Error("Asset list failed: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-assets-count", list.length);
      if (!list.length) {
        assetsBody.innerHTML = renderStateRow(4, "empty", "No assets yet", "Upload a reference, variant, background, or chart source to start the asset pipeline.");
        return;
      }
      assetsBody.innerHTML = list.map((asset) => "<tr><td><a href=\\"/ui/assets?assetId=" + encodeURIComponent(String(asset.id || "")) + "\\">" + safe(asset.id) + "</a></td><td>" + safe(asset.assetType) + "</td><td>" + safe(asset.status) + "</td><td>" + safe(asset.createdAt) + "</td></tr>").join("");
      applyFilter(q("studio-filter-assets"), assetsBody);
    } catch (e) {
      setCounter("studio-assets-count", 0);
      assetsBody.innerHTML = renderStateRow(4, "error", "Asset feed unavailable", String(e));
    }
  };

  const loadPacks = async () => {
    if (!(packsBody instanceof HTMLElement)) return;
    packsBody.innerHTML = renderStateRow(4, "loading", "Loading character packs", "Pulling the latest generation outputs.");
    try {
      const res = await fetch("/api/character-packs?limit=30");
      if (!res.ok) throw new Error("Character packs failed: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-packs-count", list.length);
      if (!list.length) {
        packsBody.innerHTML = renderStateRow(4, "empty", "No character packs yet", "Open Character Generator when you are ready to stage the next pack.");
        return;
      }
      packsBody.innerHTML = list.map((pack) => {
        const packId = String(pack.id || "");
        const linkedEpisodeId = readText(readPath(pack, ["latestEpisode", "id"]) || pack.episodeId, "-");
        return "<tr data-pack-id=\\"" + safe(packId) + "\\" data-pack-status=\\"" + safe(pack.status) + "\\" data-pack-version=\\"" + safe(pack.version) + "\\" data-pack-episode-id=\\"" + safe(linkedEpisodeId) + "\\"><td><a href=\\"/ui/characters?characterPackId=" + encodeURIComponent(packId) + "\\">" + safe(packId) + "</a></td><td>" + safe(pack.version) + "</td><td>" + safe(pack.status) + "</td><td>" + safe(linkedEpisodeId) + "</td></tr>";
      }).join("");
      packsBody.querySelectorAll("tr[data-pack-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const packId = row.dataset.packId || "";
          if (selectedPack instanceof HTMLInputElement) selectedPack.value = packId;
          const linkedEpisodeId = String(row.dataset.packEpisodeId || "").trim();
          if (episodeInput instanceof HTMLInputElement && linkedEpisodeId && linkedEpisodeId !== "-") episodeInput.value = linkedEpisodeId;
          markSelectedRows(packsBody, "pack", packId);
          updateSelectionSummary();
          void loadPackInspector(packId);
          setStatus("Character pack selected: " + (packId || "unknown pack"));
        });
      });
      markSelectedRows(packsBody, "pack", selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() : "");
      applyFilter(q("studio-filter-packs"), packsBody);
    } catch (e) {
      setCounter("studio-packs-count", 0);
      packsBody.innerHTML = renderStateRow(4, "error", "Character pack feed unavailable", String(e));
    }
  };

  const loadEpisodes = async () => {
    if (!(episodesBody instanceof HTMLElement)) return;
    episodesBody.innerHTML = renderStateRow(4, "loading", "Loading episodes", "Syncing the latest episode queue state.");
    try {
      const res = await fetch("/api/episodes?limit=30");
      if (!res.ok) throw new Error("Episodes failed: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-episodes-count", list.length);
      if (!list.length) {
        episodesBody.innerHTML = renderStateRow(4, "empty", "No episodes yet", "Create an episode from the dispatch card to begin the timeline flow.");
        return;
      }
      episodesBody.innerHTML = list.map((episode) => "<tr data-episode-id=\\"" + safe(episode.id) + "\\" data-episode-topic=\\"" + safe(episode.topic || "") + "\\"><td><a href=\\"/ui/episodes/" + encodeURIComponent(String(episode.id || "")) + "\\">" + safe(episode.id) + "</a></td><td>" + safe(episode.topic || "-") + "</td><td>" + safe(episode.status) + "</td><td>" + safe(episode.latestJobType || "-") + "</td></tr>").join("");
      episodesBody.querySelectorAll("tr[data-episode-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const episodeId = row.dataset.episodeId || "";
          const episodeTopic = row.dataset.episodeTopic || "";
          if (episodeInput instanceof HTMLInputElement) episodeInput.value = episodeId;
          if (topicInput instanceof HTMLInputElement && episodeTopic) topicInput.value = episodeTopic;
          markSelectedRows(episodesBody, "episode", episodeId);
          updateSelectionSummary();
          void loadEpisodeInspector(episodeId);
          setStatus("Episode selected: " + (episodeId || "unknown episode"));
        });
      });
      markSelectedRows(episodesBody, "episode", episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "");
      applyFilter(q("studio-filter-episodes"), episodesBody);
    } catch (e) {
      setCounter("studio-episodes-count", 0);
      episodesBody.innerHTML = renderStateRow(4, "error", "Episode feed unavailable", String(e));
    }
  };

  const loadJobs = async () => {
    if (!(jobsBody instanceof HTMLElement)) return;
    jobsBody.innerHTML = renderStateRow(5, "loading", "Loading jobs", "Waiting for the latest queue telemetry.");
    try {
      const res = await fetch("/api/jobs?limit=30");
      if (!res.ok) throw new Error("Jobs failed: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-jobs-count", list.length);
      if (!list.length) {
        jobsBody.innerHTML = renderStateRow(5, "empty", "No jobs yet", "Start a preview, render, or publish step to populate the job rail.");
        return;
      }
      jobsBody.innerHTML = list.map((job) => {
        const progress = Number.isFinite(Number(job.progress)) ? safe(job.progress) + "%" : "-";
        return "<tr><td><a href=\\"/ui/jobs/" + encodeURIComponent(String(job.id || "")) + "\\">" + safe(job.id) + "</a></td><td>" + safe(job.type) + "</td><td>" + safe(job.status) + "</td><td>" + progress + "</td><td>" + safe(job.episodeId || "-") + "</td></tr>";
      }).join("");
      applyFilter(q("studio-filter-jobs"), jobsBody);
    } catch (e) {
      setCounter("studio-jobs-count", 0);
      jobsBody.innerHTML = renderStateRow(5, "error", "Job feed unavailable", String(e));
    }
  };

  const refreshAll = async () => {
    setStatus("Syncing assets, character packs, episodes, and jobs...");
    await Promise.allSettled([loadAssets(), loadPacks(), loadEpisodes(), loadJobs()]);
    setStatus("Feeds synced. Review activity and choose the next workbench.");
  };

  const startAutoRefresh = () => {
    if (refreshTimer) clearInterval(refreshTimer);
    const enabled = autoRefreshInput instanceof HTMLInputElement ? autoRefreshInput.checked : false;
    if (!enabled) return;
    const intervalMs = refreshIntervalInput instanceof HTMLSelectElement ? Number.parseInt(refreshIntervalInput.value, 10) || 5000 : 5000;
    refreshTimer = setInterval(() => { void loadAssets(); void loadPacks(); void loadEpisodes(); void loadJobs(); }, intervalMs);
  };

  q("studio-refresh-all")?.addEventListener("click", () => { void refreshAll(); });
  q("studio-refresh-assets")?.addEventListener("click", () => { void loadAssets(); });
  q("studio-refresh-packs")?.addEventListener("click", () => { void loadPacks(); });
  q("studio-refresh-episodes")?.addEventListener("click", () => { void loadEpisodes(); });
  q("studio-refresh-jobs")?.addEventListener("click", () => { void loadJobs(); });
  q("studio-filter-assets")?.addEventListener("input", () => applyFilter(q("studio-filter-assets"), assetsBody));
  q("studio-filter-packs")?.addEventListener("input", () => applyFilter(q("studio-filter-packs"), packsBody));
  q("studio-filter-episodes")?.addEventListener("input", () => applyFilter(q("studio-filter-episodes"), episodesBody));
  q("studio-filter-jobs")?.addEventListener("input", () => applyFilter(q("studio-filter-jobs"), jobsBody));
  autoRefreshInput?.addEventListener("change", startAutoRefresh);
  refreshIntervalInput?.addEventListener("change", startAutoRefresh);
  selectedPack?.addEventListener("input", () => {
    markSelectedRows(packsBody, "pack", selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() : "");
    updateSelectionSummary();
  });
  episodeInput?.addEventListener("input", () => {
    markSelectedRows(episodesBody, "episode", episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "");
    updateSelectionSummary();
  });
  topicInput?.addEventListener("input", updateSelectionSummary);

  q("studio-asset-upload-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = q("studio-asset-upload-form");
    const output = q("studio-asset-upload-result");
    const submit = q("studio-asset-upload-submit");
    if (!(form instanceof HTMLFormElement) || !(output instanceof HTMLElement) || !(submit instanceof HTMLButtonElement)) return;
    submit.disabled = true;
    output.textContent = "Uploading...";
    try {
      const fd = new FormData(form);
      const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const json = await res.json();
      output.textContent = JSON.stringify(json, null, 2);
      if (res.ok && json?.data?.assetId) {
        setStatus("Asset uploaded. Opening asset detail...");
        window.location.href = "/ui/assets?assetId=" + encodeURIComponent(json.data.assetId);
      }
    } catch (error) {
      output.textContent = String(error);
      setStatus("Asset upload failed: " + String(error));
    } finally {
      submit.disabled = false;
    }
  });

  q("studio-create-episode")?.addEventListener("click", async () => {
    try {
      const topic = topicInput instanceof HTMLInputElement && topicInput.value.trim() ? topicInput.value.trim() : "Studio Dispatch Episode";
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          targetDurationSec: 600,
          characterPackId: selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() || undefined : undefined
        })
      });
      if (!res.ok) throw new Error(await readError(res, "Episode create failed"));
      const json = await res.json();
      const episodeId = String(json?.data?.episode?.id || "");
      if (episodeInput instanceof HTMLInputElement && episodeId) episodeInput.value = episodeId;
      updateSelectionSummary();
      setStatus("Episode created: " + (episodeId || "(no id)"));
      if (episodeId) void loadEpisodeInspector(episodeId);
      void loadEpisodes();
    } catch (error) {
      setStatus("Episode create failed: " + String(error));
    }
  });

  q("studio-oneclick")?.addEventListener("click", async () => {
    try {
      const topic = topicInput instanceof HTMLInputElement && topicInput.value.trim() ? topicInput.value.trim() : "Studio Preview Episode";
      const createRes = await fetch("/api/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          targetDurationSec: 600,
          characterPackId: selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() || undefined : undefined,
          pipeline: { stopAfterPreview: true, autoRenderFinal: false }
        })
      });
      if (!createRes.ok) throw new Error(await readError(createRes, "Episode create failed"));
      const createJson = await createRes.json();
      const jobId = String(createJson?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else window.location.href = "/ui/episodes";
    } catch (error) {
      setStatus("One-click start failed: " + String(error));
    }
  });

  q("studio-open-editor")?.addEventListener("click", () => {
    const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
    if (!episodeId) return setStatus("Enter episodeId first.");
    window.location.href = "/ui/episodes/" + encodeURIComponent(episodeId) + "/editor";
  });

  q("studio-enqueue-preview")?.addEventListener("click", async () => {
    try {
      const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
      if (!episodeId) throw new Error("Enter episodeId first.");
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId) + "/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobType: "RENDER_PREVIEW" })
      });
      if (!res.ok) throw new Error(await readError(res, "Preview enqueue failed"));
      const json = await res.json();
      const jobId = String(json?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else setStatus("Preview render enqueued.");
    } catch (error) {
      setStatus("Preview enqueue failed: " + String(error));
    }
  });

  q("studio-open-publish")?.addEventListener("click", () => {
    const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
    window.location.href = "/ui/publish" + (episodeId ? ("?episodeId=" + encodeURIComponent(episodeId)) : "");
  });

  updateSelectionSummary();
  if (${JSON.stringify(seed.activePackId)}) {
    if (selectedPack instanceof HTMLInputElement && !selectedPack.value.trim()) selectedPack.value = ${JSON.stringify(seed.activePackId)};
    markSelectedRows(packsBody, "pack", ${JSON.stringify(seed.activePackId)});
    void loadPackInspector(${JSON.stringify(seed.activePackId)});
  }
  void loadAssets();
  void loadPacks();
  void loadEpisodes();
  void loadJobs();
  startAutoRefresh();
})();
</script>`;
}
