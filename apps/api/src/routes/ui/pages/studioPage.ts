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
    : "No recent pack output";
  const packDriftHeadline =
    input.packState.latestPackId &&
    input.packState.activePackId &&
    input.packState.latestPackId !== input.packState.activePackId
      ? "The latest pack output differs from the current active pack."
      : "The active pack matches the latest reviewed output.";
  const reviewPressureHeadline =
    input.packState.pendingCount > 0
      ? `${input.packState.pendingCount} decisions are still waiting for review.`
      : "No unresolved review items are blocking dispatch right now.";
  const guardrailHeadline =
    input.channelProfile.forbiddenTermsSummary !== "(none)" || input.channelProfile.negativeTermsSummary !== "(none)"
      ? "Channel guardrails are active for this creation lane."
      : "Channel guardrails are light, so manual review must stay sharper.";
  const workbenchLinks = [
    renderStudioWorkbenchLink("Assets", "Check intake quality and reference readiness before dispatch.", "/ui/assets"),
    renderStudioWorkbenchLink(
      "Character Generator",
      "Handle candidate compare, approval, regenerate, recreate, and rollback from the staged run workbench.",
      input.packState.generatorHref
    ),
    renderStudioWorkbenchLink(
      "Characters",
      "Read preview, QC, lineage, and jobs in the slower deep review surface.",
      input.packState.charactersHref
    ),
    renderStudioWorkbenchLink("Episodes", "Open the episode queue and editor handoff surface.", "/ui/episodes"),
    renderStudioWorkbenchLink("Jobs", "Monitor execution, queue health, and recovery routes.", "/ui/jobs"),
    renderStudioWorkbenchLink("Profiles", "Inspect channel rules, prompt presets, and rollout bindings.", "/ui/profiles")
  ].join("");  return `<style>
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
    .studio-link{appearance:none;cursor:pointer;color:#142033;text-decoration:none}
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
     .studio-selection-grid{display:grid;gap:10px}
     .studio-selection-block{display:grid;gap:8px;padding:12px;border:1px solid #d8e1ec;border-radius:14px;background:#fff}
     .studio-selection-block>span{color:#5b6b82;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
     .studio-selection-copy{margin:0;color:#5b6b82;font-size:13px;line-height:1.55}
     .studio-selection-links{display:flex;gap:8px;flex-wrap:wrap}
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
      <p class="studio-eyebrow">Dispatch Hub</p>
      <div class="studio-title-row">
        <div>
          <h1>Studio</h1>
          <p class="studio-hint">Use Studio as the calm routing layer for creation. Check the current selection, confirm the next safe action, then hand the object to the surface that owns the deeper decision.</p>
        </div>
      </div>
      <div class="studio-pill-row">
        <span class="studio-pill">Fast dispatch only</span>
        <span class="studio-pill">Assets for intake</span>
        <span class="studio-pill">Generator for staged runs</span>
        <span class="studio-pill">Characters for deep review</span>
      </div>
      <div class="studio-status">
        <span class="studio-status-label">Dispatch state</span>
        <div id="studio-status" role="status" aria-live="polite" aria-atomic="true">Ready: inspect the current selection, then choose the next owner surface.</div>
      </div>
      <div class="studio-workbench-grid">${workbenchLinks}</div>
    </section>
    <section class="studio-runtime-card">
      <div>
        <p class="studio-eyebrow" style="color:#be6727">Next surfaces</p>
        <h2 style="margin:0">Keep the choice short, then move to the surface that owns the work</h2>
        <p class="studio-copy">Studio should not absorb deep compare or long review. Use it to bind the current object, episode context, and fast-flow route before handing off.</p>
      </div>
      <div class="studio-plan-list">
        ${renderStudioNextAction("1", "Intake", "Check asset readiness first", "Use Assets to confirm upload quality, QC posture, and preview readiness before you bind the object to a new run or episode.", [
          { label: "Open Assets", href: "/ui/assets" },
          { label: "Open intake rail", href: "#studio-intake" }
        ])}
        ${renderStudioNextAction("2", "Create / Review", "Generator owns staged run control, Characters owns deep review", "Use Character Generator for compare, approval, regenerate, recreate, and rollback. Use Characters when preview, QC, lineage, and jobs must stay on screen longer.", [
          { label: "Open Generator", href: input.packState.generatorHref },
          { label: "Open Characters", href: input.packState.charactersHref },
          ...(input.packState.compareHref ? [{ label: "Open Compare", href: input.packState.compareHref }] : [])
        ])}
        ${renderStudioNextAction("3", "Dispatch", "Bind the object and keep moving", "Once the object, topic, and episode anchor are clear, continue through the dispatch rail instead of reopening every detail surface again.", [
          { label: "Open dispatch rail", href: "#studio-dispatch" },
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
          <div class="studio-kicker">Current state summary</div>
          <h2>Read the current lane before dispatch</h2>
          <p class="studio-monitor-note">Selection, active pack state, and channel profile should stay visible before you jump into Generator, Characters, or the episode queue.</p>
        </div>
      </div>
      <div class="studio-signal-grid">
        <section class="studio-signal">
          <span class="studio-signal-label">Selected Pack</span>
          <strong id="studio-signal-pack" class="studio-signal-value">No pack selected</strong>
          <span class="studio-signal-note">Choose a pack or asset from the live feeds to pin the current object into the dispatch rail.</span>
        </section>
        <section class="studio-signal">
          <span class="studio-signal-label">Episode Anchor</span>
          <strong id="studio-signal-episode" class="studio-signal-value">No episode selected</strong>
          <span id="studio-signal-topic" class="studio-signal-note">Topic and episode bindings appear here once the selection is concrete.</span>
        </section>
        <section class="studio-signal">
          <span class="studio-signal-label">Operating mode</span>
          <strong class="studio-signal-value">Fast dispatch -> owner surface</strong>
          <span class="studio-signal-note">Studio routes work. Generator and Characters carry the longer decision reads.</span>
        </section>
      </div>
      <div class="studio-overview-grid">
        <article class="studio-overview-card"><span>Channel</span><strong>${esc(input.channelProfile.channelName)}</strong><p>${esc(input.channelProfile.channelId || "(default)")} / ${esc(input.channelProfile.language)}</p></article>
        <article class="studio-overview-card"><span>Active Pack</span><strong>${esc(activePackSummary)}</strong><p>${esc(input.packState.activePackStatus || "No recorded active state")}</p></article>
        <article class="studio-overview-card"><span>Latest Output</span><strong>${esc(latestPackSummary)}</strong><p>approved ${esc(String(input.packState.approvedCount))} / archived ${esc(String(input.packState.archivedCount))}</p></article>
        <article class="studio-overview-card"><span>Profile Updated</span><strong>${esc(input.channelProfile.updatedAt)}</strong><p>${esc(input.channelProfile.tone)} / ${esc(input.channelProfile.pacing)}</p></article>
      </div>
    </section>
    <section class="studio-section">
      <div class="studio-head">
        <div class="studio-head-copy">
          <div class="studio-kicker">Review pressure</div>
          <h2>Keep the blocking signals obvious</h2>
          <p class="studio-monitor-note">Dispatch stays fast only when drift, pending review, and guardrails are readable at a glance.</p>
        </div>
      </div>
      <div class="studio-risk-grid">
        <article class="studio-risk-card">
          <span class="studio-risk-level ${input.packState.latestPackId && input.packState.activePackId && input.packState.latestPackId !== input.packState.activePackId ? "attn" : "good"}">Pack Drift</span>
          <strong>${esc(packDriftHeadline)}</strong>
          <p>Active pack: ${esc(activePackSummary)}. Latest output: ${esc(latestPackSummary)}.</p>
        </article>
        <article class="studio-risk-card">
          <span class="studio-risk-level ${input.packState.pendingCount > 0 ? "watch" : "good"}">Review Load</span>
          <strong>${esc(reviewPressureHeadline)}</strong>
          <p>approved ${esc(String(input.packState.approvedCount))} / archived ${esc(String(input.packState.archivedCount))} / pending ${esc(String(input.packState.pendingCount))}</p>
        </article>
        <article class="studio-risk-card">
          <span class="studio-risk-level ${input.channelProfile.forbiddenTermsSummary !== "(none)" || input.channelProfile.negativeTermsSummary !== "(none)" ? "watch" : "good"}">Guardrails</span>
          <strong>${esc(guardrailHeadline)}</strong>
          <p>forbidden ${esc(input.channelProfile.forbiddenTermsSummary)} / negative ${esc(input.channelProfile.negativeTermsSummary)}</p>
        </article>
      </div>
    </section>
    <section class="studio-section">
      <div class="studio-head">
        <div class="studio-head-copy">
          <div class="studio-kicker">Recent objects</div>
          <h2>Live dispatch feeds</h2>
          <p class="studio-monitor-note">Pick one object from the feed, then keep moving in the dispatch rail. These tables are for fast selection, not long evidence reading.</p>
        </div>
        <div class="studio-links"><a href="#studio-live-controls" class="studio-link">Open live controls</a></div>
      </div>
      <div class="studio-activity-grid">
        ${renderStudioFeedCard({
          kicker: "Assets",
          title: "Recent Assets",
          note: "Open Assets when intake quality or reference readiness still needs a direct check.",
          counterId: "studio-assets-count",
          refreshId: "studio-refresh-assets",
          filterId: "studio-filter-assets",
          filterLabel: "Filter recent assets",
          filterPlaceholder: "Filter by id, type, or status",
          filterNote: "This is a local filter over the current page results.",
          tableId: "studio-assets-table",
          tableHead: "<tr><th>ID</th><th>Type</th><th>Status</th><th>Created At</th></tr>",
          loadingColspan: 4,
          loadingTitle: "Loading assets",
          loadingDetail: "Pulling the latest intake objects now."
        })}
        ${renderStudioFeedCard({
          kicker: "Packs",
          title: "Recent Character Packs",
          note: "Select a pack to pin it into the dispatch rail or reopen deeper review.",
          counterId: "studio-packs-count",
          refreshId: "studio-refresh-packs",
          filterId: "studio-filter-packs",
          filterLabel: "Filter character packs",
          filterPlaceholder: "Filter by id, status, or episode",
          filterNote: "Click a row to select it.",
          tableId: "studio-packs-table",
          tableHead: "<tr><th>ID</th><th>Version</th><th>Status</th><th>Episode</th></tr>",
          loadingColspan: 4,
          loadingTitle: "Loading packs",
          loadingDetail: "Reading the latest creation outputs now."
        })}
        ${renderStudioFeedCard({
          kicker: "Episodes",
          title: "Recent Episodes",
          note: "Select an episode to prefill the dispatch rail before editor or preview work.",
          counterId: "studio-episodes-count",
          refreshId: "studio-refresh-episodes",
          filterId: "studio-filter-episodes",
          filterLabel: "Filter recent episodes",
          filterPlaceholder: "Filter by id, topic, or status",
          filterNote: "Click a row to bind the episode anchor.",
          tableId: "studio-episodes-table",
          tableHead: "<tr><th>ID</th><th>Topic</th><th>Status</th><th>Latest Job</th></tr>",
          loadingColspan: 4,
          loadingTitle: "Loading episodes",
          loadingDetail: "Refreshing the current episode queue now."
        })}
        ${renderStudioFeedCard({
          kicker: "Jobs",
          title: "Recent Jobs",
          note: "Keep queue health visible without leaving the dispatch surface.",
          counterId: "studio-jobs-count",
          refreshId: "studio-refresh-jobs",
          filterId: "studio-filter-jobs",
          filterLabel: "Filter recent jobs",
          filterPlaceholder: "Filter by id, type, status, or episode",
          filterNote: "Shows only the latest jobs in this page feed.",
          tableId: "studio-jobs-table",
          tableHead: "<tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Episode</th></tr>",
          loadingColspan: 5,
          loadingTitle: "Loading jobs",
          loadingDetail: "Reading the latest execution elements now."
        })}
      </div>
    </section>
  </div>
  <aside class="studio-ops-rail">
    <section class="studio-ops-card" id="studio-selection">
      <p class="studio-ops-kicker">Selected object</p>
      <h2 id="studio-selection-title" style="margin:0">Choose one object first</h2>
      <p id="studio-selection-meta" class="studio-monitor-note">Once an asset, pack, or episode is selected, this rail turns into the fixed summary for object state, next route, and reopen travel.</p>
      <div id="studio-selection-fields" class="studio-selection-grid"><div class="studio-selection-empty">No object is pinned yet.</div></div>
      <div id="studio-selection-links" class="studio-links" style="margin-top:12px"></div>
      <div class="studio-selection-grid" style="margin-top:12px">
        <section class="studio-selection-block">
          <span>Creation Handoff</span>
          <p id="studio-nav-current" class="studio-selection-copy">No current object deep link is active yet.</p>
          <div id="studio-nav-actions" class="studio-selection-links"></div>
        </section>
        <section class="studio-selection-block">
          <span>Pinned Reopen</span>
          <div id="studio-nav-pins" class="studio-selection-links"></div>
        </section>
        <section class="studio-selection-block">
          <span>Recent Reopen</span>
          <div id="studio-nav-recents" class="studio-selection-links"></div>
        </section>
      </div>
    </section>
    <section class="studio-ops-card" id="studio-dispatch">
      <p class="studio-ops-kicker">Dispatch rail</p>
      <h2 style="margin:0">Bind the object, then move into the owner surface</h2>
      <p class="studio-monitor-note">Use this rail for fast-flow binding only. Approval, compare, and long review should stay in Generator or Characters.</p>
      <div class="studio-links"><a href="/ui/character-generator" class="studio-link" id="studio-dispatch-generator">Open Generator</a><a href="/ui/characters" class="studio-link" id="studio-dispatch-characters">Open Characters</a></div>
      <div class="studio-binding-grid">
        <label class="studio-binding"><span>Episode Topic</span><input id="studio-topic" placeholder="Introduce the current character angle"/></label>
        <label class="studio-binding"><span>Episode ID</span><input id="studio-episode-id" placeholder="cmm..."/></label>
        <label class="studio-binding"><span>Selected Pack</span><input id="studio-selected-pack" placeholder="Choose from the live feeds" readonly/></label>
      </div>
      <div style="display:grid;gap:12px;margin-top:16px">
        <div class="studio-action-cluster">
          <span class="studio-cluster-label">Quick flow</span>
          <button type="button" id="studio-oneclick" data-primary-action="1" data-primary-label="Start one-click preview flow">Start one-click flow (create + preview)</button>
          <button type="button" id="studio-create-episode" class="secondary">Create episode only</button>
        </div>
        <div class="studio-action-cluster">
          <span class="studio-cluster-label">Episode work</span>
          <button type="button" id="studio-open-editor" class="secondary">Open editor</button>
          <button type="button" id="studio-enqueue-preview" class="secondary">Queue preview render</button>
          <button type="button" id="studio-open-publish" class="secondary">Open publish handoff</button>
        </div>
      </div>
    </section>
    <details class="studio-ops-card studio-ops-details" id="studio-intake">
      <summary class="studio-ops-summary"><span>Fast intake</span><span class="studio-guide-note">Short upload lane</span></summary>
      <div class="studio-ops-body">
        <p class="studio-monitor-note" style="margin-top:0">Use this only when you need a quick asset upload without leaving Studio.</p>
        <form id="studio-asset-upload-form" enctype="multipart/form-data" class="grid">
          <div class="grid two">
            <label>Asset Type<select name="assetType"><option value="character_reference">character_reference (reference)</option><option value="character_view">character_view (view)</option><option value="background">background</option><option value="chart_source">chart_source</option></select></label>
            <label>File<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label>
          </div>
          <div class="studio-actions">
            <button id="studio-asset-upload-submit" type="submit">Upload</button>
            <a href="/ui/assets" class="studio-link">Open Assets</a>
          </div>
        </form>
        <p class="studio-field-note">After a successful upload, Studio reopens on the new asset object automatically.</p>
        <pre id="studio-asset-upload-result" class="studio-output" role="status" aria-live="polite" aria-atomic="true">Waiting</pre>
      </div>
    </details>
    <details class="studio-ops-card studio-ops-details" id="studio-live-controls">
      <summary class="studio-ops-summary"><span>Live controls</span><span class="studio-guide-note">Auto refresh and manual refresh</span></summary>
      <div class="studio-ops-body">
        <p class="studio-monitor-note" style="margin-top:0">Keep the feeds fresh while you are dispatching. If the page should slow down, disable auto refresh and pull manually.</p>
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
      <p class="studio-ops-kicker">Channel profile</p>
      <h2 style="margin:0">${esc(input.channelProfile.channelName)}</h2>
      <p class="studio-monitor-note">Keep the channel profile readable before you kick off a run or move the object toward rollout and publishing work.</p>
      <div class="studio-meta">
        ${renderMetaRow("Source", input.channelProfile.source)}
        ${renderMetaRow("Channel", `${input.channelProfile.channelId || "(default)"} / ${input.channelProfile.language}`)}
        ${renderMetaRow("Tone / Pacing", `${input.channelProfile.tone} / ${input.channelProfile.pacing}`)}
        ${renderMetaRow("Style Presets", String(input.channelProfile.stylePresetCount))}
        ${renderMetaRow("Forbidden Terms", input.channelProfile.forbiddenTermsSummary)}
        ${renderMetaRow("Negative Terms", input.channelProfile.negativeTermsSummary)}
        ${renderMetaRow("Updated At", input.channelProfile.updatedAt)}
      </div>
      <div class="studio-links" style="margin-top:12px">
        <a href="${esc(input.channelProfile.editorHref)}" class="studio-link">Open channel editor</a>
        <a href="/ui/profiles" class="studio-link">Open profiles</a>
        <a href="/ui/rollouts" class="studio-link">Open rollouts</a>
      </div>
    </section>
  </aside>
</section><script>
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
  const navCurrent = q("studio-nav-current");
  const navActions = q("studio-nav-actions");
  const navPins = q("studio-nav-pins");
  const navRecents = q("studio-nav-recents");
  const dispatchGeneratorLink = q("studio-dispatch-generator");
  const dispatchCharactersLink = q("studio-dispatch-characters");
  const compareHref = ${JSON.stringify(seed.compareHref)};
  const activePackId = ${JSON.stringify(seed.activePackId)};
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") || "";
  const initialPackId = params.get("packId") || "";
  const initialEpisodeId = params.get("episodeId") || "";
  let selectedAssetId = params.get("assetId") || "";
  let selectionObject =
    params.get("currentObject") ||
    (selectedAssetId
      ? "asset:" + selectedAssetId
      : initialPackId
        ? "pack:" + initialPackId
        : initialEpisodeId
          ? "episode:" + initialEpisodeId
          : activePackId
            ? "pack:" + activePackId
            : "");
  const focusTargetId = params.get("focus") || "studio-selection";
  let refreshTimer = null;

  const creationNs = "ecs.ui.creation.nav.v1";
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
  const parseJson = (value, fallback) => {
    try {
      const parsed = JSON.parse(String(value || ""));
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  };
  const readList = (kind) => {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const parsed = parseJson(window.localStorage.getItem(creationNs + ".recent." + kind), []);
    return Array.isArray(parsed) ? parsed : [];
  };
  const writeList = (kind, items) => {
    try {
      window.localStorage.setItem(creationNs + ".recent." + kind, JSON.stringify(items.slice(0, 6)));
    } catch {}
  };
  const readPin = (kind) => {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const parsed = parseJson(window.localStorage.getItem(creationNs + ".pin." + kind), null);
    return parsed && typeof parsed === "object" ? parsed : null;
  };
  const writePin = (kind, item) => {
    try {
      window.localStorage.setItem(creationNs + ".pin." + kind, JSON.stringify(item));
    } catch {}
  };
  const pushRecent = (kind, item) => {
    if (!item || !item.id) return;
    const next = [item].concat(readList(kind).filter((entry) => entry && entry.id !== item.id));
    writeList(kind, next);
  };
  const buildHref = (pathname, entries) => {
    const url = new URL(pathname, window.location.origin);
    Object.entries(entries || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.pathname + url.search;
  };
  const currentPackId = () => (selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() : "");
  const currentEpisodeId = () => (episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "");
  const currentStudioObject = () =>
    selectionObject ||
    (selectedAssetId
      ? "asset:" + selectedAssetId
      : currentPackId()
        ? "pack:" + currentPackId()
        : currentEpisodeId()
          ? "episode:" + currentEpisodeId()
          : "");
  const buildStudioHref = (extra = {}) =>
    buildHref("/ui/studio", {
      assetId: selectedAssetId || undefined,
      packId: currentPackId() || undefined,
      episodeId: currentEpisodeId() || undefined,
      returnTo: returnTo || undefined,
      currentObject: currentStudioObject() || undefined,
      focus: "studio-selection",
      ...extra
    });
  const buildAssetHref = (assetId, extra = {}) =>
    buildHref("/ui/assets", {
      assetId,
      returnTo: buildStudioHref({ assetId, currentObject: "asset:" + assetId }),
      currentObject: "asset:" + assetId,
      focus: "asset-selected-detail",
      ...extra
    });
  const buildGeneratorHref = (extra = {}) =>
    buildHref("/ui/character-generator", {
      referenceAssetId: selectedAssetId || undefined,
      assetId: selectedAssetId || undefined,
      returnTo: buildStudioHref(),
      currentObject: currentStudioObject() || undefined,
      focus: "cg-stage-context",
      ...extra
    });
  const buildCharactersHref = (packId, extra = {}) =>
    buildHref("/ui/characters", {
      characterPackId: packId || undefined,
      returnTo: buildStudioHref(packId ? { packId, currentObject: "pack:" + packId } : {}),
      currentObject: packId ? "pack:" + packId : currentStudioObject() || undefined,
      focus: "pack-review-current",
      ...extra
    });
  const buildCompareSurfaceHref = (packId) =>
    packId && activePackId && packId !== activePackId
      ? buildHref("/ui/character-generator/compare", {
          leftPackId: packId,
          rightPackId: activePackId,
          returnTo: buildStudioHref({ packId, currentObject: "pack:" + packId }),
          currentObject: "pack:" + packId,
          focus: "pack-compare-hero"
        })
      : compareHref;
  const renderNavLinks = (root, items, empty) => {
    if (!(root instanceof HTMLElement)) return;
    const valid = Array.isArray(items) ? items.filter((entry) => entry && entry.href && entry.label) : [];
    root.innerHTML = valid.length
      ? valid.map((entry) => "<a href=\\"" + safe(entry.href) + "\\" class=\\"studio-link\\">" + safe(entry.label) + "</a>").join("")
      : "<span class=\\"studio-monitor-note\\">" + safe(empty) + "</span>";
  };
  const syncStudioUrl = () => {
    const nextHref = buildStudioHref();
    if (window.location.pathname + window.location.search !== nextHref) {
      window.history.replaceState(null, "", nextHref);
    }
  };
  const pinCurrentSelection = () => {
    if (selectionObject.startsWith("asset:") && selectedAssetId) {
      writePin("asset", { id: selectedAssetId, label: "Asset " + selectedAssetId, href: buildAssetHref(selectedAssetId) });
      return;
    }
    const packId = currentPackId();
    if (selectionObject.startsWith("pack:") && packId) {
      writePin("pack", { id: packId, label: "Pack " + packId, href: buildCharactersHref(packId) });
    }
  };
  const renderCreationNav = () => {
    const packId = currentPackId();
    const currentLabel =
      selectionObject.startsWith("asset:") && selectedAssetId
        ? "Asset " + selectedAssetId
        : selectionObject.startsWith("pack:") && packId
          ? "Character Pack " + packId
          : selectionObject.startsWith("episode:") && currentEpisodeId()
            ? "Episode " + currentEpisodeId()
            : currentStudioObject() || "No active creation object is selected.";
    if (navCurrent instanceof HTMLElement) navCurrent.textContent = currentLabel;
    if (dispatchGeneratorLink instanceof HTMLAnchorElement) dispatchGeneratorLink.href = buildGeneratorHref();
    if (dispatchCharactersLink instanceof HTMLAnchorElement) dispatchCharactersLink.href = buildCharactersHref(packId);
    if (navActions instanceof HTMLElement) {
      const actions = [];
      if (selectedAssetId) actions.push({ href: buildAssetHref(selectedAssetId), label: "Asset detail" });
      if (packId) actions.push({ href: buildCharactersHref(packId), label: "Characters" });
      actions.push({ href: buildGeneratorHref(), label: "Generator" });
      if (packId && buildCompareSurfaceHref(packId)) actions.push({ href: buildCompareSurfaceHref(packId), label: "Compare" });
      if (returnTo) actions.push({ href: returnTo, label: "Return" });
      navActions.innerHTML =
        actions.map((entry) => "<a href=\\"" + safe(entry.href) + "\\" class=\\"studio-link\\">" + safe(entry.label) + "</a>").join("") +
        '<button type="button" id="studio-copy-link" class="studio-link">Copy Deep Link</button>' +
        ((selectionObject.startsWith("asset:") && selectedAssetId) || (selectionObject.startsWith("pack:") && packId)
          ? '<button type="button" id="studio-pin-current" class="studio-link">Pin Current</button>'
          : "");
      document.getElementById("studio-copy-link")?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
        } catch {}
      });
      document.getElementById("studio-pin-current")?.addEventListener("click", () => {
        pinCurrentSelection();
        renderCreationNav();
      });
    }
    renderNavLinks(navPins, [readPin("asset"), readPin("pack"), readPin("run")].filter(Boolean), "Pinned reopen???袁⑹춦 ??곷뮸??덈뼄.");
    renderNavLinks(
      navRecents,
      readList("assets").slice(0, 2).concat(readList("packs").slice(0, 2)).concat(readList("runs").slice(0, 2)),
      "筌ㅼ뮄??creation reopen 筌띻낱寃뺝첎? ?袁⑹춦 ??곷뮸??덈뼄."
    );
  };
  const rememberSelection = (kind, id) => {
    if (!id) return;
    if (kind === "asset") {
      pushRecent("assets", { id, label: "Asset " + id, href: buildAssetHref(id) });
      selectedAssetId = id;
      selectionObject = "asset:" + id;
    }
    if (kind === "pack") {
      pushRecent("packs", { id, label: "Pack " + id, href: buildCharactersHref(id) });
      selectionObject = "pack:" + id;
    }
    if (kind === "episode") {
      selectionObject = "episode:" + id;
    }
    syncStudioUrl();
    renderCreationNav();
  };
  const setStatus = (text) => { if (statusBox instanceof HTMLElement) statusBox.textContent = text; };
  const setCounter = (id, count) => {
    const el = q(id);
    if (el instanceof HTMLElement) el.textContent = String(count) + "揶?嚥≪뮆諭??;
  };
  const setSignal = (id, value, fallback) => {
    const el = q(id);
    if (el instanceof HTMLElement) el.textContent = value && value.trim() ? value.trim() : fallback;
  };
  const updateSelectionSummary = () => {
    setSignal("studio-signal-pack", selectedPack instanceof HTMLInputElement ? selectedPack.value : "", "?醫뤾문??????곸벉");
    setSignal("studio-signal-episode", episodeInput instanceof HTMLInputElement ? episodeInput.value : "", "?醫뤾문???癒곕돗???굡 ??곸벉");
    setSignal("studio-signal-topic", topicInput instanceof HTMLInputElement ? topicInput.value : "", "雅뚯눘?ｅ첎? ?袁⑹춦 ??쇱젟??? ??녿릭??щ빍??");
  };
  const markSelectedRows = (tbodyEl, kind, value) => {
    if (!(tbodyEl instanceof HTMLElement)) return;
    tbodyEl.querySelectorAll("tr").forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const rowValue =
        kind === "asset"
          ? row.dataset.assetId || ""
          : kind === "pack"
            ? row.dataset.packId || ""
            : row.dataset.episodeId || "";
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
  const renderSelection = (title, metaText, summaryFields, nextAction, routeLinks, evidenceLinks = []) => {
    if (selectionTitle instanceof HTMLElement) selectionTitle.textContent = title;
    if (selectionMeta instanceof HTMLElement) selectionMeta.textContent = metaText;
    if (selectionFields instanceof HTMLElement) {
      const summaryHtml = Array.isArray(summaryFields) && summaryFields.length
        ? summaryFields.map((field) => "<div class=\\"studio-meta-row\\"><span>" + safe(field.label) + "</span><strong>" + safe(field.value) + "</strong></div>").join("")
        : "<div class=\\"studio-selection-empty\\">Waiting for a concrete object summary.</div>";
      const nextActionHtml =
        nextAction && (nextAction.title || nextAction.detail)
          ? "<section class=\\"studio-selection-block\\"><span>Next Safe Action</span><strong>" + safe(nextAction.title || "-") + "</strong><p class=\\"studio-selection-copy\\">" + safe(nextAction.detail || "-") + "</p></section>"
          : "";
      const evidenceHtml =
        Array.isArray(evidenceLinks) && evidenceLinks.length
          ? "<section class=\\"studio-selection-block\\"><span>Evidence</span><div class=\\"studio-selection-links\\">" + evidenceLinks.map((link) => "<a href=\\"" + safe(link.href) + "\\" class=\\"studio-link\\">" + safe(link.label) + "</a>").join("") + "</div></section>"
          : "";
      selectionFields.innerHTML = "<section class=\\"studio-selection-block\\"><span>Object Summary</span>" + summaryHtml + "</section>" + nextActionHtml + evidenceHtml;
    }
    if (selectionLinks instanceof HTMLElement) {
      const linkedRoutes = Array.isArray(routeLinks)
        ? routeLinks.map((link) => "<a href=\\"" + safe(link.href) + "\\" class=\\"studio-link\\">" + safe(link.label) + "</a>").join("")
        : "";
      selectionLinks.innerHTML = linkedRoutes ? "<span class=\\"studio-cluster-label\\">Linked Routes</span>" + linkedRoutes : "";
    }
  };
  const loadAssetInspector = async (assetId) => {
    if (!assetId) return;
    renderSelection("Asset loading...", "Studio is reading the current asset object now.", [], null, [], []);
    try {
      const res = await fetch("/api/assets/" + encodeURIComponent(assetId));
      if (!res.ok) throw new Error("Asset detail lookup failed: " + res.status);
      const json = await res.json();
      const asset = json?.data;
      if (!asset) throw new Error("Asset detail payload is empty.");
      const ready = String(asset.status || "").toUpperCase() === "READY";
      renderSelection(
        "Asset " + readText(asset.id),
        "Studio uses this as a dispatch summary only. Read deep QC or asset evidence in Assets when you need the slower inspection surface.",
        [
          { label: "Type", value: readText(asset.assetType || asset.type) },
          { label: "Status", value: readText(asset.status) },
          { label: "Channel", value: readText(asset.channelId) },
          { label: "Mime", value: readText(asset.mime) },
          { label: "Size", value: readText(asset.sizeBytes, "-") },
          { label: "Created", value: readText(asset.createdAt) }
        ],
        {
          title: ready ? "Hand off to Character Generator" : "Check readiness in Assets first",
          detail: ready
            ? "This reference asset is ready. Open Generator to create the run object and continue through compare or approval."
            : "If the asset is not READY yet, keep Studio in dispatch mode only and confirm status plus evidence in Assets first."
        },
        [
          { label: "Assets detail", href: buildAssetHref(assetId) },
          { label: "Character Generator", href: buildGeneratorHref({ referenceAssetId: assetId, assetId, currentObject: "asset:" + assetId }) },
          { label: "Studio dispatch", href: buildStudioHref({ assetId, currentObject: "asset:" + assetId }) }
        ],
        [{ label: "API JSON", href: "/api/assets/" + encodeURIComponent(assetId) }]
      );
      markSelectedRows(assetsBody, "asset", assetId);
      rememberSelection("asset", assetId);
    } catch (error) {
      renderSelection("Asset lookup failed", String(error), [], null, [{ label: "Assets", href: "/ui/assets" }], []);
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
    renderSelection("Pack loading...", "Studio is reading the current Character Pack object now.", [], null, [], []);
    try {
      const res = await fetch("/api/character-packs/" + encodeURIComponent(packId));
      if (!res.ok) throw new Error("Character pack detail lookup failed: " + res.status);
      const json = await res.json();
      const pack = json?.data;
      if (!pack) throw new Error("Character pack detail payload is empty.");
      const summary = summarizePackJson(pack.json);
      const latestEpisode = Array.isArray(pack.episodes) && pack.episodes.length > 0 ? pack.episodes[0] : null;
      const rollbackState = String(pack.status || "").toUpperCase() === "APPROVED" ? "Active baseline" : "Rollback candidate";
      const approvedPack = String(pack.status || "").toUpperCase() === "APPROVED";
      renderSelection(
        "Pack " + readText(pack.id),
        "Studio uses this pack summary to route you into the owner surface. Keep deeper compare or inspection in Character Generator or Characters.",
        [
          { label: "Channel", value: readText(pack.channelId) },
          { label: "Version", value: "v" + readText(pack.version) },
          { label: "Status", value: readText(pack.status) },
          { label: "Mascot Profile", value: summary.mascotProfile },
          { label: "Selected Views", value: summary.selectedViews },
          { label: "Lineage", value: summary.lineage },
          { label: "Latest Episode", value: latestEpisode ? readText(latestEpisode.id) + " / " + readText(latestEpisode.topic) : "-" },
          { label: "Rollback State", value: rollbackState }
        ],
        {
          title: approvedPack ? "Use Characters for deep review, then rollback only if needed" : "Finish compare and approval in Character Generator",
          detail: approvedPack
            ? "This pack is already approved. Read preview, QC, lineage, and jobs in Characters, and reopen Generator only if replacement or rollback is required."
            : "This pack is not approved yet, so compare, pick, regenerate, recreate, and approve should stay in Character Generator."
        },
        [
          { label: "Characters review", href: buildCharactersHref(packId) },
          { label: "Character Generator", href: buildGeneratorHref({ currentObject: "pack:" + packId }) },
          latestEpisode ? { label: "Latest Episode", href: "/ui/episodes/" + encodeURIComponent(readText(latestEpisode.id)) } : null,
          summary.mascotProfile && summary.mascotProfile !== "(not recorded)" ? { label: "Profiles", href: "/ui/profiles?q=" + encodeURIComponent(summary.mascotProfile) } : null,
          buildCompareSurfaceHref(packId) ? { label: "Compare", href: buildCompareSurfaceHref(packId) } : null
        ].filter(Boolean),
        [
          { label: "pack.json", href: "/artifacts/characters/" + encodeURIComponent(packId) + "/pack.json" },
          { label: "QC report", href: "/artifacts/characters/" + encodeURIComponent(packId) + "/qc_report.json" }
        ]
      );
      rememberSelection("pack", packId);
    } catch (error) {
      renderSelection("Pack lookup failed", String(error), [], null, [{ label: "Characters", href: "/ui/characters" }], []);
    }
  };
  const loadEpisodeInspector = async (episodeId) => {
    if (!episodeId) return;
    renderSelection("Episode loading...", "Studio is reading the current episode object now.", [], null, [], []);
    try {
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId));
      if (!res.ok) throw new Error("Episode detail lookup failed: " + res.status);
      const json = await res.json();
      const data = json?.data;
      const episode = data?.episode;
      if (!episode) throw new Error("Episode detail payload is empty.");
      const style = readPath(episode, ["datasetVersionSnapshot", "style"]) || {};
      const latestJob = Array.isArray(data.jobs) && data.jobs.length > 0 ? data.jobs[0] : null;
      const previewExists = Boolean(data?.artifacts?.previewExists);
      const finalExists = Boolean(data?.artifacts?.finalExists);
      renderSelection(
        "Episode " + readText(episode.id),
        "The selected Episode object keeps the latest execution, style binding, and output readiness visible before you open editor or publish work.",
        [
          { label: "Channel", value: readText(readPath(episode, ["channel", "name"]) || readPath(episode, ["channelId"])) },
          { label: "Topic", value: readText(episode.topic) },
          { label: "Status", value: readText(episode.status) },
          { label: "Character Pack", value: readText(episode.characterPackId, "(none)") },
          { label: "Style Preset", value: readText(readPath(style, ["stylePresetId"]), "(manual)") },
          { label: "Hook Boost", value: readText(readPath(style, ["hookBoost"]), "-") },
          { label: "Latest Job", value: latestJob ? readText(latestJob.type) + " / " + readText(latestJob.status) : "(none)" },
          { label: "Outputs", value: "preview=" + (previewExists ? "yes" : "no") + " / final=" + (finalExists ? "yes" : "no") }
        ],
        {
          title: !previewExists
            ? "Queue preview render next"
            : !finalExists
              ? "Move into editor or publish handoff"
              : "Continue into publish or linked output review",
          detail: !previewExists
            ? "Preview is not ready yet, so enqueue a preview job from the dispatch rail or from the episode detail surface."
            : !finalExists
              ? "Preview is ready. Continue into manual edit or publish handoff."
              : "The main outputs are ready. Continue into publish or linked output review."
        },
        [
          { label: "Episode detail", href: "/ui/episodes/" + encodeURIComponent(episodeId) },
          { label: "Open editor", href: "/ui/episodes/" + encodeURIComponent(episodeId) + "/editor" },
          { label: "Profiles", href: "/ui/profiles" },
          { label: "Publish", href: "/ui/publish?episodeId=" + encodeURIComponent(episodeId) },
          episode.characterPackId ? { label: "Characters", href: buildCharactersHref(readText(episode.characterPackId)) } : null
        ].filter(Boolean),
        []
      );
      rememberSelection("episode", episodeId);
    } catch (error) {
      renderSelection("Episode lookup failed", String(error), [], null, [{ label: "Episodes", href: "/ui/episodes" }], []);
    }
  };
  const loadAssets = async () => {
    if (!(assetsBody instanceof HTMLElement)) return;
    assetsBody.innerHTML = renderStateRow(4, "loading", "?癒???븍뜄???삳뮉 餓?, "筌ㅼ뮇???癒????낆젾 ??됲맜??? 揶쎛?紐꾩궎??餓λ쵐???덈뼄.");
    try {
      const res = await fetch("/api/assets?limit=30");
      if (!res.ok) throw new Error("?癒??筌뤴뫖以?鈺곌퀬????쎈솭: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-assets-count", list.length);
      if (!list.length) {
        assetsBody.innerHTML = renderStateRow(4, "empty", "?癒????袁⑹춦 ??곷뮸??덈뼄", "??딅쓠?怨쀫뮞, 癰궰???? 獄쏄퀗瑗? 筌△뫂?????뮞????낆쨮??쀫퉸 ?癒?????뵠?袁⑥뵬?紐꾩뱽 ??뽰삂??뤾쉭??");
        return;
      }
      assetsBody.innerHTML = list
        .map((asset) => {
          const assetId = String(asset.id || "");
          return "<tr data-asset-id=\\"" + safe(assetId) + "\\"><td><a href=\\"" + safe(buildStudioHref({ assetId, currentObject: "asset:" + assetId })) + "\\">" + safe(asset.id) + "</a></td><td>" + safe(asset.assetType) + "</td><td>" + safe(asset.status) + "</td><td>" + safe(asset.createdAt) + "</td></tr>";
        })
        .join("");
      assetsBody.querySelectorAll("tr[data-asset-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const assetId = row.dataset.assetId || "";
          markSelectedRows(assetsBody, "asset", assetId);
          updateSelectionSummary();
          void loadAssetInspector(assetId);
          setStatus("?癒???醫뤾문: " + (assetId || "??????용뮉 ?癒??));
        });
      });
      markSelectedRows(assetsBody, "asset", selectedAssetId);
      applyFilter(q("studio-filter-assets"), assetsBody);
    } catch (e) {
      setCounter("studio-assets-count", 0);
      assetsBody.innerHTML = renderStateRow(4, "error", "?癒????곕굡???????????곸벉", String(e));
    }
  };

  const loadPacks = async () => {
    if (!(packsBody instanceof HTMLElement)) return;
    packsBody.innerHTML = renderStateRow(4, "loading", "筌?Ŧ??????븍뜄???삳뮉 餓?, "筌ㅼ뮇????밴쉐 ?곗뮆???揶쎛?紐꾩궎??餓λ쵐???덈뼄.");
    try {
      const res = await fetch("/api/character-packs?limit=30");
      if (!res.ok) throw new Error("筌?Ŧ?????鈺곌퀬????쎈솭: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-packs-count", list.length);
      if (!list.length) {
        packsBody.innerHTML = renderStateRow(4, "empty", "筌?Ŧ?????뱀뵠 ?袁⑹춦 ??곷뮸??덈뼄", "??쇱벉 ??뱀뱽 ??쎈??곸췅??餓Β??쑨? ??롢늺 筌?Ŧ?????밴쉐疫꿸퀡? ??苑??");
        return;
      }
      packsBody.innerHTML = list.map((pack) => {
        const packId = String(pack.id || "");
        const linkedEpisodeId = readText(readPath(pack, ["latestEpisode", "id"]) || pack.episodeId, "-");
        return "<tr data-pack-id=\\"" + safe(packId) + "\\" data-pack-status=\\"" + safe(pack.status) + "\\" data-pack-version=\\"" + safe(pack.version) + "\\" data-pack-episode-id=\\"" + safe(linkedEpisodeId) + "\\"><td><a href=\\"" + safe(buildStudioHref({ packId, currentObject: "pack:" + packId })) + "\\">" + safe(packId) + "</a></td><td>" + safe(pack.version) + "</td><td>" + safe(pack.status) + "</td><td>" + safe(linkedEpisodeId) + "</td></tr>";
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
          setStatus("筌?Ŧ??????醫뤾문: " + (packId || "??????용뮉 ??));
        });
      });
      markSelectedRows(packsBody, "pack", selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() : "");
      applyFilter(q("studio-filter-packs"), packsBody);
    } catch (e) {
      setCounter("studio-packs-count", 0);
      packsBody.innerHTML = renderStateRow(4, "error", "筌?Ŧ???????곕굡???????????곸벉", String(e));
    }
  };

  const loadEpisodes = async () => {
    if (!(episodesBody instanceof HTMLElement)) return;
    episodesBody.innerHTML = renderStateRow(4, "loading", "?癒곕돗???굡 ?븍뜄???삳뮉 餓?, "筌ㅼ뮇???癒곕돗???굡 ???怨밴묶????녿┛?酉釉??餓λ쵐???덈뼄.");
    try {
      const res = await fetch("/api/episodes?limit=30");
      if (!res.ok) throw new Error("?癒곕돗???굡 鈺곌퀬????쎈솭: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-episodes-count", list.length);
      if (!list.length) {
        episodesBody.innerHTML = renderStateRow(4, "empty", "?癒곕돗???굡揶쎛 ?袁⑹춦 ??곷뮸??덈뼄", "?遺용뮞??ν뒄 燁삳?諭?癒?퐣 ?癒곕돗???굡????밴쉐?????袁⑥뵬???癒?カ????뽰삂??뤾쉭??");
        return;
      }
      episodesBody.innerHTML = list
        .map(
          (episode) =>
            "<tr data-episode-id=\\"" +
            safe(episode.id) +
            "\\" data-episode-topic=\\"" +
            safe(episode.topic || "") +
            "\\"><td><a href=\\"" +
            safe(buildStudioHref({ episodeId: String(episode.id || ""), currentObject: "episode:" + String(episode.id || "") })) +
            "\\">" +
            safe(episode.id) +
            "</a></td><td>" +
            safe(episode.topic || "-") +
            "</td><td>" +
            safe(episode.status) +
            "</td><td>" +
            safe(episode.latestJobType || "-") +
            "</td></tr>"
        )
        .join("");
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
          setStatus("?癒곕돗???굡 ?醫뤾문: " + (episodeId || "??????용뮉 ?癒곕돗???굡"));
        });
      });
      markSelectedRows(episodesBody, "episode", episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "");
      applyFilter(q("studio-filter-episodes"), episodesBody);
    } catch (e) {
      setCounter("studio-episodes-count", 0);
      episodesBody.innerHTML = renderStateRow(4, "error", "?癒곕돗???굡 ??곕굡???????????곸벉", String(e));
    }
  };

  const loadJobs = async () => {
    if (!(jobsBody instanceof HTMLElement)) return;
    jobsBody.innerHTML = renderStateRow(5, "loading", "?臾믩씜 ?븍뜄???삳뮉 餓?, "筌ㅼ뮇?????遺얠쟿筌롫??껆뵳?? 疫꿸퀡?롧뵳???餓λ쵐???덈뼄.");
    try {
      const res = await fetch("/api/jobs?limit=30");
      if (!res.ok) throw new Error("?臾믩씜 鈺곌퀬????쎈솭: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-jobs-count", list.length);
      if (!list.length) {
        jobsBody.innerHTML = renderStateRow(5, "empty", "?臾믩씜???袁⑹춦 ??곷뮸??덈뼄", "?袁ⓥ봺?? ???쐭, ??고닜?귐딅뻻 ??ｍ롧몴???뽰삂???臾믩씜 ??됱뵬??筌?쑴??紐꾩뒄.");
        return;
      }
      jobsBody.innerHTML = list.map((job) => {
        const progress = Number.isFinite(Number(job.progress)) ? safe(job.progress) + "%" : "-";
        return "<tr><td><a href=\\"/ui/jobs/" + encodeURIComponent(String(job.id || "")) + "\\">" + safe(job.id) + "</a></td><td>" + safe(job.type) + "</td><td>" + safe(job.status) + "</td><td>" + progress + "</td><td>" + safe(job.episodeId || "-") + "</td></tr>";
      }).join("");
      applyFilter(q("studio-filter-jobs"), jobsBody);
    } catch (e) {
      setCounter("studio-jobs-count", 0);
      jobsBody.innerHTML = renderStateRow(5, "error", "?臾믩씜 ??곕굡???????????곸벉", String(e));
    }
  };

  const refreshAll = async () => {
    setStatus("?癒?? 筌?Ŧ????? ?癒곕돗???굡, ?臾믩씜????녿┛?酉釉??餓?..");
    await Promise.allSettled([loadAssets(), loadPacks(), loadEpisodes(), loadJobs()]);
    setStatus("??곕굡 ??녿┛???袁⑥┷. ??뺣짗??野꺜?醫뤿릭????쇱벉 ??곌쾿甕겹끉?귞몴??醫뤾문??뤾쉭??");
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
    syncStudioUrl();
    renderCreationNav();
  });
  episodeInput?.addEventListener("input", () => {
    markSelectedRows(episodesBody, "episode", episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "");
    updateSelectionSummary();
    syncStudioUrl();
    renderCreationNav();
  });
  topicInput?.addEventListener("input", updateSelectionSummary);

  q("studio-asset-upload-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = q("studio-asset-upload-form");
    const output = q("studio-asset-upload-result");
    const submit = q("studio-asset-upload-submit");
    if (!(form instanceof HTMLFormElement) || !(output instanceof HTMLElement) || !(submit instanceof HTMLButtonElement)) return;
    submit.disabled = true;
    output.textContent = "??낆쨮??餓?..";
    try {
      const fd = new FormData(form);
      const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const json = await res.json();
      output.textContent = JSON.stringify(json, null, 2);
      if (res.ok && json?.data?.assetId) {
        setStatus("?癒????낆쨮???袁⑥┷. ?癒???怨멸쉭??????餓?..");
        window.location.href = buildAssetHref(String(json.data.assetId));
      }
    } catch (error) {
      output.textContent = String(error);
      setStatus("?癒????낆쨮????쎈솭: " + String(error));
    } finally {
      submit.disabled = false;
    }
  });

  q("studio-create-episode")?.addEventListener("click", async () => {
    try {
      const topic = topicInput instanceof HTMLInputElement && topicInput.value.trim() ? topicInput.value.trim() : "??쎈뮔?遺우궎 ?遺용뮞??ν뒄 ?癒곕돗???굡";
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          targetDurationSec: 600,
          characterPackId: selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() || undefined : undefined
        })
      });
      if (!res.ok) throw new Error(await readError(res, "?癒곕돗???굡 ??밴쉐 ??쎈솭"));
      const json = await res.json();
      const episodeId = String(json?.data?.episode?.id || "");
      if (episodeInput instanceof HTMLInputElement && episodeId) episodeInput.value = episodeId;
      updateSelectionSummary();
      setStatus("?癒곕돗???굡 ??밴쉐?? " + (episodeId || "(id ??곸벉)"));
      if (episodeId) void loadEpisodeInspector(episodeId);
      void loadEpisodes();
    } catch (error) {
      setStatus("?癒곕돗???굡 ??밴쉐 ??쎈솭: " + String(error));
    }
  });

  q("studio-oneclick")?.addEventListener("click", async () => {
    try {
      const topic = topicInput instanceof HTMLInputElement && topicInput.value.trim() ? topicInput.value.trim() : "??쎈뮔?遺우궎 ?袁ⓥ봺???癒곕돗???굡";
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
      if (!createRes.ok) throw new Error(await readError(createRes, "?癒곕돗???굡 ??밴쉐 ??쎈솭"));
      const createJson = await createRes.json();
      const jobId = String(createJson?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else window.location.href = "/ui/episodes";
    } catch (error) {
      setStatus("?癒곌깻????뽰삂 ??쎈솭: " + String(error));
    }
  });

  q("studio-open-editor")?.addEventListener("click", () => {
    const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
    if (!episodeId) return setStatus("?믪눘? episodeId????낆젾??뤾쉭??");
    window.location.href = "/ui/episodes/" + encodeURIComponent(episodeId) + "/editor";
  });

  q("studio-enqueue-preview")?.addEventListener("click", async () => {
    try {
      const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
      if (!episodeId) throw new Error("?믪눘? episodeId????낆젾??뤾쉭??");
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId) + "/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobType: "RENDER_PREVIEW" })
      });
      if (!res.ok) throw new Error(await readError(res, "?袁ⓥ봺?????源낆쨯 ??쎈솭"));
      const json = await res.json();
      const jobId = String(json?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else setStatus("?袁ⓥ봺?????쐭揶쎛 ?癒?퓠 ?源낆쨯??뤿???щ빍??");
    } catch (error) {
      setStatus("?袁ⓥ봺?????源낆쨯 ??쎈솭: " + String(error));
    }
  });

  q("studio-open-publish")?.addEventListener("click", () => {
    const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
    window.location.href = "/ui/publish" + (episodeId ? ("?episodeId=" + encodeURIComponent(episodeId)) : "");
  });

  updateSelectionSummary();
  if (selectedPack instanceof HTMLInputElement && initialPackId) selectedPack.value = initialPackId;
  if (episodeInput instanceof HTMLInputElement && initialEpisodeId) episodeInput.value = initialEpisodeId;
  renderCreationNav();
  if (selectedAssetId) {
    void loadAssetInspector(selectedAssetId);
  } else if (initialPackId) {
    markSelectedRows(packsBody, "pack", initialPackId);
    void loadPackInspector(initialPackId);
  } else if (initialEpisodeId) {
    markSelectedRows(episodesBody, "episode", initialEpisodeId);
    void loadEpisodeInspector(initialEpisodeId);
  } else if (activePackId) {
    if (selectedPack instanceof HTMLInputElement && !selectedPack.value.trim()) selectedPack.value = activePackId;
    markSelectedRows(packsBody, "pack", activePackId);
    void loadPackInspector(activePackId);
  }
  void loadAssets();
  void loadPacks();
  void loadEpisodes();
  void loadJobs();
  startAutoRefresh();
  if (focusTargetId && !window.location.hash) {
    const focusTarget = document.getElementById(focusTargetId);
    if (focusTarget instanceof HTMLElement) {
      setTimeout(() => focusTarget.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
    }
  }
})();
</script>`;
}







