function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type CharacterGeneratorTopInput = {
  message?: string;
  error?: string;
  styleOptions: string;
  speciesOptions: string;
  referenceOptions: string;
  defaultSeed: number;
  forbiddenTermsSummary: string;
  negativeTermsSummary: string;
};

function buildCharacterGeneratorPageStyles(): string {
  return `<style>
.cg-page-shell{display:grid;gap:14px}
.cg-top-card{padding:0;overflow:hidden;border-color:#b6d6d8;background:linear-gradient(180deg,#fffefd,#f5faf8 36%,#edf4f7)}
.cg-top-layout{display:grid;grid-template-columns:minmax(0,1.52fr) minmax(300px,.92fr);gap:0}
.cg-hero{display:grid;gap:18px;padding:24px 24px 20px;position:relative}
.cg-hero::after{content:"";position:absolute;left:-56px;bottom:-90px;width:280px;height:280px;border-radius:999px;background:radial-gradient(circle,#0e7a7416 0,#0e7a7400 72%);pointer-events:none}
.cg-eyebrow{display:inline-flex;align-items:center;gap:8px;align-self:start;padding:7px 12px;border-radius:999px;border:1px solid #bfd8d5;background:#eef9f7;color:#0d4b48;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.cg-title-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cg-title-block h1{margin:0;font-size:35px;letter-spacing:-.04em}
.cg-subtitle{margin:8px 0 0;max-width:780px;color:#425466;font-size:14px;line-height:1.65}
.cg-metric-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.cg-metric{display:grid;gap:4px;padding:12px 14px;border:1px solid #d6e6e3;border-radius:16px;background:linear-gradient(180deg,#ffffffde,#f4fbfa);box-shadow:inset 0 1px 0 #fff}
.cg-metric-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5a6b79;font-weight:800}
.cg-metric-value{font-size:15px;font-weight:800;color:#102126}
.cg-flow-grid{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr))}
.cg-flow-step{display:grid;gap:6px;padding:14px;border:1px solid #d3e4e5;border-radius:16px;background:linear-gradient(180deg,#ffffff,#f4fbfa)}
.cg-flow-step strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#265a63}
.cg-flow-step span{font-size:13px;color:#4b6170;line-height:1.5}
.cg-status-stack{display:grid;gap:10px}
.cg-summary-note{padding:12px 14px;border-radius:12px;border:1px solid #d7e6e3;background:linear-gradient(180deg,#f9fdfd,#f1f7f6);color:#35515c;font-size:13px;line-height:1.55}
.cg-summary-note strong{color:#14353b}
.cg-top-card .notice,.cg-top-card .error{margin:0}
.cg-ops-rail{display:grid;gap:14px;padding:24px;border-left:1px solid #d8e8e5;background:linear-gradient(180deg,#ecf8f6,#f8fbff)}
.cg-ops-card{display:grid;gap:10px;padding:14px;border:1px solid #cfe2e7;border-radius:16px;background:#ffffffc7;box-shadow:inset 0 1px 0 #fff}
.cg-ops-card h2{margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#255c62}
.cg-ops-list{display:grid;gap:10px}
.cg-ops-item{display:grid;gap:3px;padding:10px 12px;border-radius:12px;background:#f6fbfc;border:1px solid #d7e7eb}
.cg-ops-item strong{font-size:13px}
.cg-ops-item span{font-size:12px;color:#4f6270;line-height:1.45}
.cg-nav-stack{display:grid;gap:10px}
.cg-nav-note{margin:0;color:#4f6270;font-size:12px;line-height:1.5}
.cg-link-list{display:flex;flex-wrap:wrap;gap:8px}
.cg-link-list a,.cg-link-list button,.cg-inline-links a,.cg-inline-links button{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;border:1px solid #bed5dd;background:#fff;color:#0f4e6a;font-size:12px;font-weight:800}
.cg-link-list button,.cg-inline-links button{appearance:none;cursor:pointer}
.cg-link-list a:hover,.cg-link-list button:hover,.cg-inline-links a:hover,.cg-inline-links button:hover{text-decoration:none;background:#eef7ff}
.cg-link-list a:focus-visible,.cg-link-list button:focus-visible,.cg-inline-links a:focus-visible,.cg-inline-links button:focus-visible,.cg-form-shell button:focus-visible,.cg-form-shell input:focus-visible,.cg-form-shell select:focus-visible,.cg-form-shell textarea:focus-visible,.cg-advanced-shell summary:focus-visible,.cg-override-editor textarea:focus-visible,.cg-override-editor button:focus-visible{outline:2px solid #0f766e;outline-offset:2px}
.cg-form-shell{display:grid;gap:14px;padding:0 24px 24px}
.cg-form-block{display:grid;gap:14px;padding:18px;border:1px solid #d3e2e7;border-radius:18px;background:linear-gradient(180deg,#ffffffeb,#f7fbfb)}
.cg-form-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
.cg-step{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 10px;border-radius:999px;background:linear-gradient(180deg,#0f766e,#0c635d);color:#effffb;font-size:13px;font-weight:900;letter-spacing:.08em}
.cg-form-head h2{margin:0;font-size:17px}
.cg-form-copy{margin:4px 0 0;color:#4a5d69;font-size:13px;line-height:1.55;max-width:70ch}
.cg-field-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.cg-field-grid.tight{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.cg-field-grid label,.cg-form-block>label,.cg-advanced-body label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#223846}
.cg-field-grid label small,.cg-form-block>label small,.cg-advanced-body label small{font-weight:500;color:#5a6d7a;line-height:1.45}
.cg-form-shell input,.cg-form-shell select,.cg-form-shell textarea{background:#fff;border:1px solid #c7d7df;border-radius:12px;padding:10px 12px;color:#142033;box-sizing:border-box;width:100%}
.cg-form-shell textarea{min-height:128px;resize:vertical}
.cg-context-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.cg-context-card{display:grid;gap:10px;padding:14px;border-radius:16px;border:1px solid #d7e6ea;background:linear-gradient(180deg,#fbfdfd,#f2f7f8)}
.cg-context-card h3{margin:0;font-size:14px}
.cg-context-card p{margin:0;color:#4e6370;font-size:13px;line-height:1.5}
.cg-inline-links{display:flex;flex-wrap:wrap;gap:8px}
.cg-toggle-list{display:grid;gap:10px}
.cg-toggle{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid #d5e3e7;border-radius:14px;background:#fbfeff;font-weight:700;color:#223846}
.cg-toggle input{margin:2px 0 0;padding:0;width:16px;height:16px}
.cg-guardrail-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.cg-guardrail{display:grid;gap:6px;padding:12px 14px;border-radius:14px;border:1px solid #d6e4e8;background:linear-gradient(180deg,#fbfdfd,#f2f7f7)}
.cg-guardrail strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#31545f}
.cg-guardrail span{font-size:13px;color:#213842;line-height:1.5}
.cg-rig-surface{display:grid;gap:14px}
.cg-rig-grid,.cg-signal-flag-grid,.cg-action-cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.cg-rig-card,.cg-signal-flag,.cg-action-banner{display:grid;gap:8px;padding:15px 16px;border:1px solid #d6e4ea;border-radius:16px;background:linear-gradient(180deg,#fdfefe,#f6fafc)}
.cg-rig-card.ok,.cg-signal-flag.ok,.cg-action-banner.ok{border-color:#c9e7d8;background:linear-gradient(180deg,#f8fffb,#edf9f1)}
.cg-rig-card.warn,.cg-signal-flag.warn,.cg-action-banner.warn{border-color:#eadab0;background:linear-gradient(180deg,#fffdf6,#faf5e8)}
.cg-rig-card.bad,.cg-signal-flag.bad,.cg-action-banner.bad,.cg-action-card.bad{border-color:#efc6c6;background:linear-gradient(180deg,#fff8f8,#fdeeee)}
.cg-rig-card.muted,.cg-signal-flag.muted,.cg-action-banner.muted,.cg-action-card.muted{border-color:#d8e4ea;background:linear-gradient(180deg,#fbfdfe,#f4f8fa)}
.cg-rig-kicker{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#3a6b78;font-weight:800}
.cg-rig-card h3,.cg-signal-flag h4{margin:0;font-size:15px}
.cg-rig-copy,.cg-signal-flag p,.cg-action-banner p{margin:0;color:#4f6270;font-size:13px;line-height:1.55}
.cg-rig-meta{display:flex;flex-wrap:wrap;gap:8px}
.cg-diagnostic-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.cg-diagnostic-card{display:grid;gap:8px;padding:15px 16px;border:1px solid #d6e4ea;border-radius:16px;background:linear-gradient(180deg,#ffffff,#f5fafc)}
.cg-diagnostic-card h4{margin:0;font-size:15px}
.cg-diagnostic-card p{margin:0;color:#4f6270;font-size:13px;line-height:1.55}
.cg-diagnostic-card a{font-weight:800}
.cg-repair-plan-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:12px}
.cg-repair-plan-summary,.cg-repair-plan-card{display:grid;gap:10px;padding:15px 16px;border:1px solid #d6e4ea;border-radius:16px;background:linear-gradient(180deg,#ffffff,#f5fafc)}
.cg-repair-plan-card.bad{border-color:#f0c7c7;background:linear-gradient(180deg,#fff8f8,#fdf0f0)}
.cg-repair-plan-card.warn{border-color:#eadab0;background:linear-gradient(180deg,#fffdf8,#faf6eb)}
.cg-repair-plan-card.ok{border-color:#c9e7d8;background:linear-gradient(180deg,#f8fffb,#edf9f1)}
.cg-repair-plan-summary h4,.cg-repair-plan-card h4{margin:0;font-size:15px}
.cg-repair-plan-summary p,.cg-repair-plan-copy{margin:0;color:#4f6270;font-size:13px;line-height:1.55}
.cg-override-console{display:grid;gap:14px}
.cg-override-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.cg-override-editor{display:grid;gap:10px;padding:15px 16px;border:1px solid #d6e4ea;border-radius:16px;background:linear-gradient(180deg,#ffffff,#f5fafc)}
.cg-override-editor h4{margin:0;font-size:15px}
.cg-override-editor p{margin:0;color:#4f6270;font-size:13px;line-height:1.55}
.cg-override-meta{font-size:12px;color:#506473;line-height:1.55}
.cg-override-editor textarea{min-height:240px;width:100%;box-sizing:border-box;background:#fff;border:1px solid #c7d7df;border-radius:12px;padding:10px 12px;color:#142033;font-family:"JetBrains Mono","SFMono-Regular",Consolas,monospace;resize:vertical}
.cg-override-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cg-override-actions form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0}
.cg-override-console .notice{margin:0}
.cg-signal-table{overflow:auto;border:1px solid #d4e1ea;border-radius:14px;background:#fff}
.cg-signal-table table{margin:0;border:none;border-radius:0;min-width:760px}
.cg-signal-table th{position:sticky;top:0;z-index:1}
.cg-action-banner strong{font-size:15px;color:#152934}
.cg-action-banner .cg-inline-links{margin-top:2px}
.cg-action-card{display:grid;gap:10px}
.cg-action-card.bad{box-shadow:inset 0 0 0 1px rgba(199,67,67,.06)}
.cg-action-card.warn{border-color:#eadab0;background:linear-gradient(180deg,#fffdf8,#faf6eb)}
.cg-action-card.ok{border-color:#c9e7d8;background:linear-gradient(180deg,#f8fffb,#edf9f1)}
.cg-advanced-shell{border:1px solid #d3e2e7;border-radius:18px;background:linear-gradient(180deg,#ffffffea,#f7fbfb);overflow:hidden}
.cg-advanced-shell summary{list-style:none;cursor:pointer;padding:18px;display:flex;align-items:flex-start;gap:12px}
.cg-advanced-shell summary::-webkit-details-marker{display:none}
.cg-advanced-shell summary::after{content:"Show advanced";margin-left:auto;display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #cfe0e3;background:#f4fbfa;color:#21545d;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.cg-advanced-shell[open] summary{border-bottom:1px solid #dbe8ea}
.cg-advanced-shell[open] summary::after{content:"Hide advanced"}
.cg-advanced-body{padding:0 18px 18px;display:grid;gap:12px}
.cg-submit-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:16px 18px;border:1px solid #d4e3e8;border-radius:18px;background:linear-gradient(180deg,#fff,#f7fbfb)}
.cg-submit-copy{font-size:13px;color:#516371;max-width:720px;line-height:1.55}
.cg-submit-row button{min-width:280px}
.cg-main-grid{display:grid;gap:14px;grid-template-columns:minmax(0,1.24fr) minmax(320px,.96fr);align-items:start}
.cg-phase-card{display:grid;gap:14px;padding:18px;border:1px solid #d5e3e7;border-radius:18px;background:linear-gradient(180deg,#ffffff,#f7fbfc)}
.cg-phase-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cg-phase-copy{margin:0;color:#506473;font-size:13px;line-height:1.55;max-width:62ch}
.cg-phase-badge{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:42px;padding:0 12px;border-radius:999px;border:1px solid #bfd8d5;background:#eef9f7;color:#0d4b48;font-size:13px;font-weight:900;letter-spacing:.08em}
.cg-phase-stack,.cg-approval-lane{display:grid;gap:14px}
.cg-slot{display:grid;gap:14px}
.cg-section-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cg-section-head p{margin:0;color:#506473;font-size:13px;line-height:1.5}
.cg-section-kicker{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#3a6b78;font-weight:800;margin-bottom:4px}
.cg-history-card{display:grid;gap:12px}
.cg-history-tools{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center}
.cg-history-tools input{min-width:260px;max-width:360px}
.cg-stage-map{display:grid;gap:12px;padding:18px;border:1px solid #d5e3e7;border-radius:18px;background:linear-gradient(180deg,#ffffff,#f7fbfc)}
.cg-stage-map-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cg-stage-map-head p{margin:0;color:#506473;font-size:13px;line-height:1.55;max-width:68ch}
.cg-stage-track{display:grid;gap:10px;grid-template-columns:repeat(6,minmax(0,1fr))}
.cg-stage-tile{display:grid;gap:8px;padding:14px;border:1px solid #d4e3e8;border-radius:16px;background:linear-gradient(180deg,#fcfefe,#f4f9f9)}
.cg-stage-index{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;background:#edf8f6;border:1px solid #cce2de;color:#0f5f58;font-size:12px;font-weight:900;letter-spacing:.08em}
.cg-stage-title{font-size:14px;font-weight:800;color:#17353c}
.cg-stage-copy{font-size:12px;color:#4f6270;line-height:1.5}
.cg-stage-links{display:flex;gap:8px;flex-wrap:wrap}
.cg-stage-links a{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #cfe0e3;background:#fff;color:#0f4e6a;font-size:11px;font-weight:800}
.cg-stage-links a:hover{text-decoration:none;background:#eef7ff}
.cg-table-wrap,.asset-table-wrap{overflow:auto;border:1px solid #d4e1ea;border-radius:14px;background:#fff}
.cg-table-wrap table,.asset-table-wrap table{margin:0;border:none;border-radius:0;min-width:880px}
.cg-table-wrap th,.asset-table-wrap th{position:sticky;top:0;z-index:1}
#generation-status{border:1px solid #d1e3de;border-left-width:4px;background:linear-gradient(180deg,#eef9f6,#f7fcfc);font-family:"JetBrains Mono","SFMono-Regular",Consolas,monospace;white-space:pre-wrap;line-height:1.55}
#recommended-actions .grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
#recommended-actions .grid>.card{padding:14px;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f8fbff);box-shadow:none;border-color:#d8e4ef}
#recommended-actions .grid>.card p:first-child{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
#regenerate-view .grid.two,#recreate-pack .grid.two,#pick-candidates .grid.two{align-items:start}
#regenerate-view label,#recreate-pack label,#pick-candidates label{display:grid;gap:6px}
#pick-candidates details.card{padding:0;overflow:hidden;border-radius:16px;box-shadow:none;background:#fcfeff}
#pick-candidates details.card summary{padding:14px 16px;cursor:pointer;list-style:none}
#pick-candidates details.card summary::-webkit-details-marker{display:none}
#pick-candidates details.card summary::after{content:"Open";float:right;color:#0f766e;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
#pick-candidates details[open].card summary::after{content:"Hide"}
#pick-candidates details.card>*:not(summary){padding:0 14px 14px}
#pick-candidates .asset-table-wrap{margin-top:0!important}
@media (max-width:1160px){.cg-top-layout,.cg-main-grid,.cg-flow-grid{grid-template-columns:1fr}.cg-stage-track{grid-template-columns:repeat(2,minmax(0,1fr))}.cg-ops-rail{border-left:none;border-top:1px solid #d8e8e5}}
@media (max-width:720px){.cg-hero,.cg-ops-rail{padding:18px}.cg-title-block h1{font-size:28px}.cg-form-shell{padding:0 18px 18px}.cg-form-block,.cg-phase-card,.cg-submit-row,.cg-stage-map{padding:14px;border-radius:16px}.cg-advanced-shell summary,.cg-advanced-body{padding-left:14px;padding-right:14px}.cg-stage-track{grid-template-columns:1fr}.cg-submit-row button{min-width:100%}.cg-history-tools input{min-width:100%;max-width:none}.cg-table-wrap table,.asset-table-wrap table{min-width:680px}}
</style>`;
}

function renderSlot(content: string, className: string, id?: string): string {
  if (!content) {
    return "";
  }
  const idAttribute = id ? ` id="${id}"` : "";
  return `<div class="${className}"${idAttribute}>${content}</div>`;
}

function renderPhaseCard(step: string, title: string, copy: string, content: string, id?: string, className = ""): string {
  if (!content) {
    return "";
  }
  const idAttribute = id ? ` id="${id}"` : "";
  const extraClass = className ? ` ${className}` : "";
  return `<section class="cg-phase-card${extraClass}"${idAttribute}><div class="cg-phase-head"><div><div class="cg-section-kicker">Stage ${esc(
    step
  )}</div><h2>${esc(title)}</h2><p class="cg-phase-copy">${esc(copy)}</p></div><span class="cg-phase-badge">${esc(
    step
  )}</span></div><div class="cg-phase-stack">${content}</div></section>`;
}
function buildCharacterGeneratorStageMap(): string {
  const tiles = [
    {
      step: "01",
      title: "Inputs",
      copy: "Set the run mode, provider, preset, species, and topic before creating a new generation object.",
      links: [
        { href: "#cg-stage-basic", label: "Open inputs" },
        { href: "/ui/studio", label: "Studio" }
      ]
    },
    {
      step: "02",
      title: "References",
      copy: "Bind the best reference asset and keep the handoff to downstream review surfaces obvious.",
      links: [
        { href: "#cg-stage-context", label: "Open references" },
        { href: "/ui/assets", label: "Assets" }
      ]
    },
    {
      step: "03",
      title: "Workflow Policy",
      copy: "Set candidate volume, auto-pick rules, and HITL expectations before compare starts.",
      links: [{ href: "#cg-stage-policy", label: "Open policy" }]
    },
    {
      step: "04",
      title: "Candidates",
      copy: "Read the active Generation Run object, route diagnostics, and the next safe action in one place.",
      links: [
        { href: "#cg-active-job", label: "Current run" },
        { href: "#cg-recent-jobs", label: "Recent runs" }
      ]
    },
    {
      step: "05",
      title: "Compare",
      copy: "Move candidate compare and pack handoff here before deeper inspection in Characters.",
      links: [
        { href: "#pick-candidates", label: "Open compare" },
        { href: "/ui/characters", label: "Characters" }
      ]
    },
    {
      step: "06",
      title: "Approve / Rollback",
      copy: "Use the dedicated approval lane for regenerate, recreate, approve, and rollback decisions.",
      links: [
        { href: "#cg-approval-lane", label: "Approval lane" },
        { href: "/ui/studio", label: "Studio" }
      ]
    }
  ];

  return `<section class="card cg-stage-map"><div class="cg-stage-map-head"><div><div class="cg-section-kicker">Stage Rail</div><h2>Inputs -> References -> Workflow Policy -> Candidates -> Compare -> Approve / Rollback</h2></div><p>This workbench keeps the run object readable from creation through compare. Use Studio for dispatch, Generator for staged run control, and Characters for deeper preview, QC, lineage, and jobs review.</p></div><div class="cg-stage-track">${tiles
    .map(
      (tile) =>
        `<article class="cg-stage-tile"><span class="cg-stage-index">${esc(tile.step)}</span><div class="cg-stage-title">${esc(
          tile.title
        )}</div><div class="cg-stage-copy">${esc(tile.copy)}</div><div class="cg-stage-links">${tile.links
          .map((link) => `<a href="${esc(link.href)}">${esc(link.label)}</a>`)
          .join("")}</div></article>`
    )
    .join("")}</div></section>`;
}

export function buildCharacterGeneratorTopSection(input: CharacterGeneratorTopInput): string {
  return `<section class="card cg-top-card">
    <div class="cg-top-layout">
      <div class="cg-hero">
        <div class="cg-eyebrow">Generation Run / staged decision flow</div>
        <div class="cg-title-row">
          <div class="cg-title-block">
            <h1>Character Generator</h1>
            <p class="cg-subtitle">Use this surface as the staged run workbench for creation. Keep Inputs, References, Workflow Policy, Candidates, Compare, and Approve / Rollback separate so the current Generation Run stays readable before the handoff into Characters.</p>
          </div>
        </div>
        <div class="cg-metric-grid">
          <div class="cg-metric"><span class="cg-metric-label">Primary object</span><span class="cg-metric-value">Generation Run</span></div>
          <div class="cg-metric"><span class="cg-metric-label">Approval object</span><span class="cg-metric-value">Character Pack</span></div>
          <div class="cg-metric"><span class="cg-metric-label">Decision path</span><span class="cg-metric-value">Candidates -> Compare -> Approve</span></div>
          <div class="cg-metric"><span class="cg-metric-label">Default seed</span><span class="cg-metric-value">${esc(
            input.defaultSeed
          )}</span></div>
        </div>
        <div class="cg-flow-grid">
          <div class="cg-flow-step"><strong>01 Inputs</strong><span>Declare the run mode, provider, preset, species, and topic before creating a new object.</span></div>
          <div class="cg-flow-step"><strong>02 References</strong><span>Choose the reference asset that should stay attached to compare, approval, and reopen travel.</span></div>
          <div class="cg-flow-step"><strong>03 Workflow Policy</strong><span>Set candidate count and HITL expectations before the candidate set arrives.</span></div>
          <div class="cg-flow-step"><strong>04 Candidates</strong><span>Read the Generation Run object, risk summary, and next safe action before taking action.</span></div>
          <div class="cg-flow-step"><strong>05 Compare</strong><span>Compare candidates here, then hand the chosen pack off to Characters for deep inspection.</span></div>
          <div class="cg-flow-step"><strong>06 Approve / Rollback</strong><span>Keep regenerate, recreate, approve, and rollback controls in the dedicated approval lane.</span></div>
        </div>
        <div class="cg-status-stack">
          ${input.message ? `<div class="notice">${esc(input.message)}</div>` : ""}
          ${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}
          <div class="cg-summary-note"><strong>Summary-first pattern.</strong> Keep the current object, next safe action, linked routes, and evidence in that order. Raw detail belongs behind the main decision UI, not ahead of it.</div>
        </div>
      </div>
      <aside class="cg-ops-rail">
        <div class="cg-ops-card">
          <h2>Ops-aware workbench</h2>
          <div class="cg-ops-list">
            <div class="cg-ops-item"><strong>Inputs -> References</strong><span>Make the run setup legible before you create anything. A weak reference choice will echo into compare and approval.</span></div>
            <div class="cg-ops-item"><strong>Policy -> Candidates</strong><span>Candidate count and HITL rules are policy, not evidence. Keep them visible before you read scores or diagnostics.</span></div>
            <div class="cg-ops-item"><strong>Compare -> Character Pack</strong><span>Treat compare as the handoff bridge from run object to pack object.</span></div>
            <div class="cg-ops-item"><strong>Approve -> Rollback</strong><span>Approval closes the Generator lane. Deep preview, QC, lineage, and jobs review belong in Characters.</span></div>
          </div>
        </div>
        <div class="cg-ops-card">
          <h2>Quick jumps</h2>
          <div class="cg-link-list">
            <a href="#cg-stage-basic">Inputs</a>
            <a href="#cg-stage-context">References</a>
            <a href="#cg-stage-policy">Policy</a>
            <a href="#cg-stage-advanced">Advanced</a>
            <a href="#cg-active-job">Current run</a>
            <a href="#cg-approval-lane">Approval lane</a>
            <a href="/ui/characters">Characters</a>
            <a href="#cg-recent-jobs">Recent runs</a>
          </div>
        </div>
        <div class="cg-ops-card" id="cg-creation-nav">
          <h2>Creation handoff</h2>
          <p class="cg-nav-note">Use URL state only. Keep returnTo, current object, focus, pinned reopen links, and recent reopen links visible in the rail.</p>
          <div class="cg-link-list" id="cg-nav-actions"></div>
          <div class="cg-nav-stack">
            <div class="cg-ops-item"><strong>Current object</strong><span id="cg-nav-current">No current run, pack, or reference asset is pinned yet.</span></div>
            <div class="cg-ops-item"><strong>Pinned reopen</strong><div class="cg-link-list" id="cg-nav-pins"></div></div>
            <div class="cg-ops-item"><strong>Recent reopen</strong><div class="cg-link-list" id="cg-nav-recents"></div></div>
          </div>
        </div>
      </aside>
    </div>
    <form method="post" action="/ui/character-generator/create" class="cg-form-shell">
      <input type="hidden" name="returnTo" id="cg-return-to" value=""/>
      <input type="hidden" name="currentObject" id="cg-current-object" value=""/>
      <input type="hidden" name="focus" id="cg-focus" value="cg-active-job"/>
      <section class="cg-form-block" id="cg-stage-basic">
        <div class="cg-form-head">
          <span class="cg-step">01</span>
          <div>
            <h2>Inputs</h2>
            <p class="cg-form-copy">Create a new Generation Run only after the mode, provider, preset, species, and topic are explicit. This keeps compare and approval travel predictable later.</p>
          </div>
        </div>
        <div class="cg-field-grid tight">
          <label>Run mode<select name="mode"><option value="new">new</option><option value="reference">reference</option></select><small>Use reference mode when the run must stay visibly anchored to an existing asset.</small></label>
          <label>Provider<select name="provider"><option value="mock">mock</option><option value="comfyui">comfyui</option><option value="remoteApi">remoteApi</option><option value="vertexImagen">vertexImagen</option></select><small>Use remoteApi or vertexImagen for premium still/rescue runs when configured; keep mock available for fallback or local validation.</small></label>
          <label>Prompt preset<select name="promptPreset">${input.styleOptions}</select><small>Presets should carry the stable styling intent that later compare and approval decisions inherit.</small></label>
          <label>Species<select name="species">${input.speciesOptions}</select><small>Make species explicit early so compare does not need to recover from basic intent drift.</small></label>
          <label>Topic<input name="topic" placeholder="Introduce the current character angle or episode need"/><small>This topic appears again in run history, reopen travel, and linked review surfaces.</small></label>
        </div>
      </section>
      <section class="cg-form-block" id="cg-stage-context">
        <div class="cg-form-head">
          <span class="cg-step">02</span>
          <div>
            <h2>References</h2>
            <p class="cg-form-copy">Choose the reference asset that should travel with this run. Keep the reference obvious so Studio, Generator, and Characters can reopen the same object chain later.</p>
          </div>
        </div>
        <div class="cg-field-grid tight">
          <label>Reference asset<select name="referenceAssetId"><option value="">No reference selected</option>${input.referenceOptions}</select><small>Use the asset that should stay attached to candidate compare and later pack review.</small></label>
        </div>
        <div class="cg-context-grid">
          <article class="cg-context-card">
            <h3>Asset handoff</h3>
            <p>Reference quality still matters before any candidate score exists. Reopen Assets when the current object needs a faster QC or preview check.</p>
            <div class="cg-inline-links"><a href="/ui/assets">Assets</a><a href="/ui/studio">Studio</a></div>
          </article>
          <article class="cg-context-card">
            <h3>Characters handoff</h3>
            <p>Generator owns staged compare and approval. Characters owns the slower read of preview, QC, lineage, and jobs after a pack exists.</p>
            <div class="cg-inline-links"><a href="/ui/characters">Characters</a><a href="/ui/studio">Studio dispatch</a></div>
          </article>
        </div>
      </section>
      <section class="cg-form-block" id="cg-stage-policy">
        <div class="cg-form-head">
          <span class="cg-step">03</span>
          <div>
            <h2>Workflow Policy</h2>
            <p class="cg-form-copy">Configure the candidate set before scores, compare, or repair decisions appear. Policy should be legible on its own.</p>
          </div>
        </div>
        <div class="cg-field-grid tight">
          <label>Candidate count<input name="candidateCount" value="4" inputmode="numeric"/><small>Use enough coverage for compare without hiding the decision in an oversized workset.</small></label>
          <label>Auto-pick<select name="autoPick"><option value="false">false</option><option value="true">true</option></select><small>Auto-pick stays useful for fallback, but compare still needs a readable manual lane.</small></label>
          <label>Require HITL pick<select name="requireHitlPick"><option value="true">true</option><option value="false">false</option></select><small>Keep the review contract explicit when approval should not proceed without a manual choice.</small></label>
        </div>
        <div class="cg-guardrail-grid">
          <div class="cg-guardrail"><strong>Forbidden terms</strong><span>${esc(input.forbiddenTermsSummary)}</span></div>
          <div class="cg-guardrail"><strong>Negative prompt baseline</strong><span>${esc(input.negativeTermsSummary)}</span></div>
        </div>
      </section>
      <details class="cg-advanced-shell" id="cg-stage-advanced">
        <summary><span class="cg-step">A</span><div><h2>Advanced controls</h2><p class="cg-form-copy">Open only when the staged run really needs prompt overrides, seed pinning, or stronger negative prompting. Keep the default path easy to scan.</p></div></summary>
        <div class="cg-advanced-body">
          <div class="cg-field-grid">
            <label>Seed<input name="seed" value="${esc(
              input.defaultSeed
            )}" inputmode="numeric"/><small>Pin the seed when the compare surface needs controlled reruns instead of a fresh exploration.</small></label>
            <label>Positive prompt override<textarea name="positivePrompt" rows="4" placeholder="Add only the extra direction that should override the current preset."></textarea><small>Use this sparingly. The main preset should still carry most of the stable styling intent.</small></label>
            <label>Negative prompt override<textarea name="negativePrompt" rows="4" placeholder="List the failure patterns or unwanted traits that should be suppressed."></textarea><small>Reserve this for repeated QC or compare failure patterns, not routine runs.</small></label>
          </div>
          <div class="cg-toggle-list">
            <label class="cg-toggle"><input type="checkbox" name="boostNegativePrompt" value="true"/><span>Strengthen the negative prompt when repeated failure families need a stronger block.</span></label>
          </div>
        </div>
      </details>
      <div class="cg-submit-row">
        <p class="cg-submit-copy">Submitting here creates the Generation Run object and moves the page into the candidate lane. Keep summary, next safe action, linked routes, and evidence readable before compare starts.</p>
        <button type="submit" data-primary-action="1" data-primary-label="Create generation run">Create generation run</button>
      </div>
      <div class="cg-context-grid">
        <article class="cg-context-card">
          <h3>Stage 04 / Generation Run object</h3>
          <p>Once the run exists, read status, route summary, risk, and next safe action in the same lane before leaving the page.</p>
          <div class="cg-inline-links"><a href="#cg-active-job">Current run</a><a href="#cg-recent-jobs">Recent runs</a></div>
        </article>
        <article class="cg-context-card">
          <h3>Stage 05-06 / Character Pack object</h3>
          <p>Pack compare and approval stay here first. After the handoff, Characters becomes the deep inspection surface for preview, QC, lineage, and jobs.</p>
          <div class="cg-inline-links"><a href="#cg-approval-lane">Approval lane</a><a href="/ui/characters">Characters</a></div>
        </article>
      </div>
    </form>
  </section>`;
}

export function buildCharacterGeneratorStatusScript(): string {
  return `<script>(function(){const el=document.getElementById("generation-status");if(!(el instanceof HTMLElement)){return;}const retryBtn=document.getElementById("generation-retry");const jobId=String(el.dataset.jobId||"");if(!jobId){return;}let timer=null;let failCount=0;const stageLabel=(status)=>{switch(String(status||"").toUpperCase()){case"QUEUED":return"Queued";case"RUNNING":return"Running";case"SUCCEEDED":return"Succeeded";case"FAILED":return"Failed";case"CANCELLED":return"Cancelled";default:return String(status||"unknown");}};const formatScore=(value)=>typeof value==="number"&&Number.isFinite(value)?value.toFixed(2):"-";const shortView=(view)=>view==="threeQuarter"?"3/4":view==="profile"?"profile":"front";const summarizePreflight=(stage)=>{if(!stage||!stage.preflightByView){return"";}const entries=["front","threeQuarter","profile"].filter((view)=>stage.preflightByView&&stage.preflightByView[view]).map((view)=>{const diagnostics=stage.preflightByView[view];const detail=(Array.isArray(diagnostics&&diagnostics.missingStructureKinds)?diagnostics.missingStructureKinds.slice(0,2).join("+"):"")||(Array.isArray(diagnostics&&diagnostics.missingReferenceRoles)?diagnostics.missingReferenceRoles.slice(0,1).join("+"):"")||(Array.isArray(diagnostics&&diagnostics.reasonCodes)?diagnostics.reasonCodes[0]:"")||"";return shortView(view)+":"+String(diagnostics&&diagnostics.status||"unknown")+(detail?":"+detail:"");});return entries.length>0?" / preflight="+entries.join(","):"";};const schedule=(ms)=>{if(timer){clearTimeout(timer);}timer=setTimeout(()=>{void tick();},ms);};const toast=(title,msg,tone)=>{if(typeof window.__ecsToast==="function"){window.__ecsToast(title,msg,tone||"warn");}};const speak=(msg)=>{if(typeof window.__ecsSpeak==="function"){window.__ecsSpeak(msg);}};const tick=async()=>{try{const res=await fetch("/api/character-generator/jobs/"+encodeURIComponent(jobId));if(!res.ok){throw new Error("Failed to read job status: "+res.status);}const json=await res.json();const data=json&&json.data?json.data:null;if(!data){throw new Error("The job status response was empty.");}failCount=0;if(retryBtn instanceof HTMLElement){retryBtn.style.display="none";}const manifestStatus=data.manifest&&data.manifest.status?" / manifest="+String(data.manifest.status):"";const packCoherence=data.packCoherence||data.manifest&&data.manifest.packCoherence?data.packCoherence||data.manifest.packCoherence:null;const autoReroute=data.autoReroute||data.manifest&&data.manifest.autoReroute?data.autoReroute||data.manifest.autoReroute:null;const selectionRisk=data.selectionRisk||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.selectionRisk||data.manifest.providerMeta.selectionDiagnostics.selectionRisk:null;const qualityEmbargo=data.qualityEmbargo||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.qualityEmbargo||data.manifest.providerMeta.selectionDiagnostics.qualityEmbargo:null;const finalQualityFirewall=data.finalQualityFirewall||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.finalQualityFirewall||data.manifest.providerMeta.selectionDiagnostics.finalQualityFirewall:null;const rigStability=data.rigStability||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.rigStability||data.manifest.providerMeta.selectionDiagnostics.rigStability:null;const decisionOutcome=data.decisionOutcome||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.decisionOutcome||data.manifest.providerMeta.selectionDiagnostics.decisionOutcome:null;const coherenceSummary=packCoherence?" / coherence="+String(packCoherence.severity||"none")+":"+formatScore(packCoherence.score):"";const rerouteSummary=autoReroute&&autoReroute.attempted?" / reroute="+String(autoReroute.recovered===true?"recovered":autoReroute.recovered===false?"failed":"attempted")+(autoReroute.strategy?"@"+String(autoReroute.strategy):""):"";const rigSummary=rigStability?" / rig="+String(rigStability.severity||"none")+(rigStability.reviewOnly?"@review-only":"")+(typeof rigStability.anchorConfidenceOverall==="number"&&Number.isFinite(rigStability.anchorConfidenceOverall)?":"+formatScore(rigStability.anchorConfidenceOverall):""):"";const selectionRiskSummary=selectionRisk&&selectionRisk.level&&String(selectionRisk.level)!=="none"?" / selection-risk="+String(selectionRisk.level)+(selectionRisk.suggestedAction?"@"+String(selectionRisk.suggestedAction):""):"";const qualityEmbargoSummary=qualityEmbargo&&qualityEmbargo.level&&String(qualityEmbargo.level)!=="none"?" / quality-embargo="+String(qualityEmbargo.level)+(qualityEmbargo.suggestedAction?"@"+String(qualityEmbargo.suggestedAction):""):"";const firewallSummary=finalQualityFirewall&&finalQualityFirewall.level&&String(finalQualityFirewall.level)!=="none"?" / final-firewall="+String(finalQualityFirewall.level)+(finalQualityFirewall.suggestedAction?"@"+String(finalQualityFirewall.suggestedAction):""):"";const decisionSummary=decisionOutcome&&decisionOutcome.status?" / decision="+String(decisionOutcome.status)+(decisionOutcome.kind?"@"+String(decisionOutcome.kind):""):"";const selectionSource=data.finalSelectionSource?" / selection-source="+String(data.finalSelectionSource):"";const routeSummary=data.selectedWorkflowRuntimeSummary&&String(data.selectedWorkflowRuntimeSummary)!=="-"?" / route="+String(data.selectedWorkflowRuntimeSummary):"";const lastStage=Array.isArray(data.workflowStages)&&data.workflowStages.length>0?data.workflowStages[data.workflowStages.length-1]:null;const stageVariant=lastStage?[String(lastStage.origin||""),String(lastStage.passLabel||"")].filter((value)=>value&&value!=="").join("@"):"";const stageExit=lastStage?"pass="+String(Array.isArray(lastStage.passedViews)?lastStage.passedViews.length:0)+"/fail="+String(Array.isArray(lastStage.failedViews)?lastStage.failedViews.length:0):"";const stageSummary=lastStage?" / stage="+String(lastStage.stage||"unknown")+(stageVariant?"@"+stageVariant:"")+"#"+String(lastStage.roundsAttempted||0)+(stageExit?":"+stageExit:""):Array.isArray(data.workflowStages)&&data.workflowStages.length>0?" / stage="+String(data.workflowStages.length):"";const preflightSummary=summarizePreflight(lastStage);const triageSummary=lastStage&&lastStage.repairTriageByView?(()=>{const entries=["front","threeQuarter","profile"].filter((view)=>lastStage.repairTriageByView&&lastStage.repairTriageByView[view]).map((view)=>shortView(view)+":"+String(lastStage.repairTriageByView[view].decision||"unknown"));return entries.length>0?" / repair-triage="+entries.join(","):"";})():"";const repairSummary=lastStage&&lastStage.repairAcceptanceByView?(()=>{const entries=["front","threeQuarter","profile"].filter((view)=>lastStage.repairAcceptanceByView&&lastStage.repairAcceptanceByView[view]).map((view)=>shortView(view)+":"+String(lastStage.repairAcceptanceByView[view].decision||"unknown"));return entries.length>0?" / repair-acceptance="+entries.join(","):"";})():"";const nextAction=Array.isArray(data.recommendedActions)&&data.recommendedActions.length>0&&data.recommendedActions[0]&&data.recommendedActions[0].label?" / next="+String(data.recommendedActions[0].label):"";const text="job="+stageLabel(data.status)+" progress="+String(data.progress)+"%"+manifestStatus+coherenceSummary+rerouteSummary+rigSummary+selectionRiskSummary+qualityEmbargoSummary+firewallSummary+decisionSummary+selectionSource+routeSummary+stageSummary+preflightSummary+triageSummary+repairSummary+nextAction;el.textContent=text;speak(text);if(data.status==="SUCCEEDED"||data.status==="FAILED"||data.status==="CANCELLED"){if(data.manifestExists){toast("Generation Run","The run settled. Reopening the current object now.",data.status==="SUCCEEDED"?"ok":"warn");setTimeout(()=>{window.location.href="/ui/character-generator?jobId="+encodeURIComponent(jobId);},500);}return;}schedule(2000);}catch(error){failCount+=1;const wait=Math.min(15000,2000*Math.pow(2,failCount));el.textContent="Status refresh failed. Retrying in "+wait+"ms.";if(retryBtn instanceof HTMLElement){retryBtn.style.display="inline-block";}toast("Generation Run",String(error),"warn");schedule(wait);}};if(retryBtn instanceof HTMLElement){retryBtn.addEventListener("click",()=>{failCount=0;void tick();});}void tick();})();</script>`;
}
function buildCharacterGeneratorNavScript(): string {
  return `<script>(function(){const ns="ecs.ui.creation.nav.v1";const parse=(value,fallback)=>{try{const parsed=JSON.parse(String(value||""));return parsed==null?fallback:parsed;}catch{return fallback;}};const readList=(kind)=>{if(typeof window==="undefined"||!window.localStorage){return [];}const parsed=parse(window.localStorage.getItem(ns+".recent."+kind),[]);return Array.isArray(parsed)?parsed:[];};const writeList=(kind,items)=>{try{window.localStorage.setItem(ns+".recent."+kind,JSON.stringify(items.slice(0,6)));}catch{}};const readPin=(kind)=>{if(typeof window==="undefined"||!window.localStorage){return null;}const parsed=parse(window.localStorage.getItem(ns+".pin."+kind),null);return parsed&&typeof parsed==="object"?parsed:null;};const writePin=(kind,item)=>{try{window.localStorage.setItem(ns+".pin."+kind,JSON.stringify(item));}catch{}};const pushRecent=(kind,item)=>{if(!item||!item.id){return;}const next=[item].concat(readList(kind).filter((entry)=>entry&&entry.id!==item.id));writeList(kind,next);};const buildHref=(pathname,params)=>{const url=new URL(pathname,window.location.origin);Object.entries(params||{}).forEach(([key,value])=>{if(value!==undefined&&value!==null&&String(value).trim()!==""){url.searchParams.set(key,String(value));}});return url.pathname+url.search;};const renderLinks=(rootId,items,empty)=>{const root=document.getElementById(rootId);if(!(root instanceof HTMLElement)){return;}const valid=Array.isArray(items)?items.filter((entry)=>entry&&entry.href&&entry.label):[];root.innerHTML=valid.length?valid.map((entry)=>'<a href="'+String(entry.href).replaceAll('"',"&quot;")+'">'+String(entry.label).replaceAll("<","&lt;").replaceAll(">","&gt;")+'</a>').join(""):'<span class="cg-nav-note">'+empty+"</span>";};const params=new URLSearchParams(window.location.search);const currentUrl=window.location.pathname+window.location.search;const returnTo=params.get("returnTo")||"";const focus=params.get("focus")||"cg-active-job";const referenceAssetId=params.get("referenceAssetId")||params.get("assetId")||"";const activeJob=document.getElementById("cg-active-job-meta")||document.getElementById("cg-active-job");const currentRunId=activeJob&&activeJob.dataset?String(activeJob.dataset.currentRunId||params.get("jobId")||""):String(params.get("jobId")||"");const currentPackId=activeJob&&activeJob.dataset?String(activeJob.dataset.currentPackId||""):"";const currentObject=params.get("currentObject")||(currentRunId?"run:"+currentRunId:referenceAssetId?"asset:"+referenceAssetId:currentPackId?"pack:"+currentPackId:"");const referenceSelect=document.querySelector('select[name="referenceAssetId"]');if(referenceSelect instanceof HTMLSelectElement&&referenceAssetId&&!referenceSelect.value){referenceSelect.value=referenceAssetId;}const returnToInput=document.getElementById("cg-return-to");if(returnToInput instanceof HTMLInputElement){returnToInput.value=returnTo;}const currentObjectInput=document.getElementById("cg-current-object");if(currentObjectInput instanceof HTMLInputElement){currentObjectInput.value=currentObject;}const focusInput=document.getElementById("cg-focus");if(focusInput instanceof HTMLInputElement){focusInput.value=focus;}if(referenceAssetId){pushRecent("assets",{id:referenceAssetId,label:"Asset "+referenceAssetId,href:buildHref("/ui/assets",{assetId:referenceAssetId,currentObject:"asset:"+referenceAssetId,focus:"asset-selected-detail"})});}if(currentRunId){pushRecent("runs",{id:currentRunId,label:"Run "+currentRunId,href:buildHref("/ui/character-generator",{jobId:currentRunId,currentObject:"run:"+currentRunId,focus:"cg-active-job"})});}if(currentPackId){pushRecent("packs",{id:currentPackId,label:"Pack "+currentPackId,href:buildHref("/ui/characters",{characterPackId:currentPackId,returnTo:currentUrl,currentObject:"pack:"+currentPackId,focus:"pack-review-current"})});}const actions=[];if(returnTo){actions.push('<a href="'+returnTo.replaceAll('"',"&quot;")+'">Return</a>');}actions.push('<button type="button" id="cg-copy-link">Copy deep link</button>');if(currentRunId){actions.push('<button type="button" id="cg-pin-run">Pin current run</button>');}if(currentPackId){actions.push('<button type="button" id="cg-pin-pack">Pin current pack</button>');}const actionRoot=document.getElementById("cg-nav-actions");if(actionRoot instanceof HTMLElement){actionRoot.innerHTML=actions.join("");}const currentRoot=document.getElementById("cg-nav-current");if(currentRoot instanceof HTMLElement){currentRoot.textContent=currentRunId?"Generation Run "+currentRunId+(currentPackId?" -> Pack "+currentPackId:""):referenceAssetId?"Reference Asset "+referenceAssetId:currentObject||"No current object is pinned yet.";}document.getElementById("cg-copy-link")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(window.location.href);if(typeof window.__ecsToast==="function"){window.__ecsToast("Generator","Deep link copied.","ok");}}catch(error){if(typeof window.__ecsToast==="function"){window.__ecsToast("Generator",String(error),"warn");}}});document.getElementById("cg-pin-run")?.addEventListener("click",()=>{if(!currentRunId){return;}writePin("run",{id:currentRunId,label:"Run "+currentRunId,href:buildHref("/ui/character-generator",{jobId:currentRunId,currentObject:"run:"+currentRunId,focus:"cg-active-job"})});renderLinks("cg-nav-pins",[readPin("run"),readPin("pack")].filter(Boolean),"No pinned run or pack yet.");});document.getElementById("cg-pin-pack")?.addEventListener("click",()=>{if(!currentPackId){return;}writePin("pack",{id:currentPackId,label:"Pack "+currentPackId,href:buildHref("/ui/characters",{characterPackId:currentPackId,returnTo:currentUrl,currentObject:"pack:"+currentPackId,focus:"pack-review-current"})});renderLinks("cg-nav-pins",[readPin("run"),readPin("pack")].filter(Boolean),"No pinned run or pack yet.");});renderLinks("cg-nav-pins",[readPin("run"),readPin("pack")].filter(Boolean),"No pinned run or pack yet.");renderLinks("cg-nav-recents",readList("runs").slice(0,3).concat(readList("packs").slice(0,3)),"No recent reopen links yet.");if(focus&&!window.location.hash){const focusTarget=document.getElementById(focus);if(focusTarget instanceof HTMLElement){setTimeout(()=>focusTarget.scrollIntoView({block:"start",behavior:"smooth"}),120);}}})();</script>`;
}

type CharacterGeneratorPageBodyInput = {
  topSection: string;
  selectedSection: string;
  recommendedActionsSection: string;
  regenerateSection: string;
  recreateSection: string;
  pickSection: string;
  previewSection: string;
  rollbackSection: string;
  compareSection: string;
  rows: string;
  statusScript: string;
};

export function buildCharacterGeneratorPageBody(input: CharacterGeneratorPageBodyInput): string {
  const jobsSection = `<section class="card cg-history-card" id="cg-recent-jobs"><div class="cg-section-head"><div><div class="cg-section-kicker">Recent Objects</div><h2>Recent Generation Runs</h2></div><p>Use this reopen rail to jump back into the current Generation Run, compare, recover, or approval flow without rebuilding context.</p></div><div class="cg-history-tools"><div class="quick-links"><a href="#cg-active-job">Current run</a><a href="#recommended-actions">Next safe actions</a><a href="#pick-candidates">HITL compare</a><a href="#cg-approval-lane">Approve / Rollback</a></div><input type="search" data-table-filter="cg-jobs-table" placeholder="Filter recent runs by job, episode, topic, or status"/></div><div class="cg-table-wrap"><table id="cg-jobs-table"><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Status</th><th>Progress</th><th>Manifest</th><th>Created At</th></tr></thead><tbody>${
    input.rows ||
    '<tr><td colspan="7"><div class="notice">No recent generation runs yet. Once a run exists, reopen it here for compare, recovery, or approval work.</div></td></tr>'
  }</tbody></table></div></section>`;

  const compareLane = renderPhaseCard(
    "05",
    "Compare",
    "Keep the run object readable through candidate compare, then hand the chosen pack into Characters for deeper review.",
    `${renderSlot(input.selectedSection, "cg-slot", "cg-active-job")}${renderSlot(
      input.pickSection,
      "cg-slot"
    )}${renderSlot(input.previewSection, "cg-slot")}${renderSlot(input.compareSection, "cg-slot")}`
  );
  const approvalLane = renderPhaseCard(
    "06",
    "Approve / Rollback",
    "Use this lane only after compare is clear. Expose the next safe action first, then run regenerate, recreate, approve, or rollback from the dedicated controls.",
    `${renderSlot(input.recommendedActionsSection, "cg-slot")}${renderSlot(input.regenerateSection, "cg-slot")}${renderSlot(
      input.recreateSection,
      "cg-slot"
    )}${renderSlot(input.rollbackSection, "cg-slot")}`,
    "cg-approval-lane",
    "cg-approval-lane"
  );

  return `${buildCharacterGeneratorPageStyles()}<div class="cg-page-shell">${input.topSection}${buildCharacterGeneratorStageMap()}<div class="cg-main-grid">${compareLane}${approvalLane}</div>${jobsSection}</div>${buildCharacterGeneratorNavScript()}${input.statusScript}`;
}
