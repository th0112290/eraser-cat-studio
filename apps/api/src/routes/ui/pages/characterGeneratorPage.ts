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
.cg-link-list{display:flex;flex-wrap:wrap;gap:8px}
.cg-link-list a,.cg-inline-links a{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;border:1px solid #bed5dd;background:#fff;color:#0f4e6a;font-size:12px;font-weight:800}
.cg-link-list a:hover,.cg-inline-links a:hover{text-decoration:none;background:#eef7ff}
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
.cg-form-shell input,.cg-form-shell select,.cg-form-shell textarea{background:#fff;border-color:#c7d7df}
.cg-form-shell textarea{min-height:128px}
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
.cg-advanced-shell{border:1px solid #d3e2e7;border-radius:18px;background:linear-gradient(180deg,#ffffffea,#f7fbfb);overflow:hidden}
.cg-advanced-shell summary{list-style:none;cursor:pointer;padding:18px;display:flex;align-items:flex-start;gap:12px}
.cg-advanced-shell summary::-webkit-details-marker{display:none}
.cg-advanced-shell summary::after{content:"Advanced";margin-left:auto;display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #cfe0e3;background:#f4fbfa;color:#21545d;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.cg-advanced-shell[open] summary{border-bottom:1px solid #dbe8ea}
.cg-advanced-shell[open] summary::after{content:"Collapse"}
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
#pick-candidates details.card summary::after{content:"Inspect";float:right;color:#0f766e;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
#pick-candidates details[open].card summary::after{content:"Collapse"}
#pick-candidates details.card>*:not(summary){padding:0 14px 14px}
#pick-candidates .asset-table-wrap{margin-top:0!important}
@media (max-width:1160px){.cg-top-layout,.cg-main-grid,.cg-flow-grid{grid-template-columns:1fr}.cg-ops-rail{border-left:none;border-top:1px solid #d8e8e5}}
@media (max-width:720px){.cg-hero,.cg-ops-rail{padding:18px}.cg-title-block h1{font-size:28px}.cg-form-shell{padding:0 18px 18px}.cg-form-block,.cg-phase-card,.cg-submit-row{padding:14px;border-radius:16px}.cg-advanced-shell summary,.cg-advanced-body{padding-left:14px;padding-right:14px}.cg-submit-row button{min-width:100%}.cg-history-tools input{min-width:100%;max-width:none}.cg-table-wrap table,.asset-table-wrap table{min-width:680px}}
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

export function buildCharacterGeneratorTopSection(input: CharacterGeneratorTopInput): string {
  return `<section class="card cg-top-card"><div class="cg-top-layout"><div class="cg-hero"><div class="cg-eyebrow">Staged Character Workbench</div><div class="cg-title-row"><div class="cg-title-block"><h1>Character Generator</h1><p class="cg-subtitle">Work through the run in order: set the basics, anchor the reference context, lock workflow policy, reveal advanced controls only when needed, then move into compare and approval. For fast orchestration across workbenches, return to <a href="/ui/studio">Studio</a>.</p></div></div><div class="cg-metric-grid"><div class="cg-metric"><span class="cg-metric-label">Modes</span><span class="cg-metric-value">Prompt + Reference</span></div><div class="cg-metric"><span class="cg-metric-label">Reference Intake</span><span class="cg-metric-value">Asset-led when needed</span></div><div class="cg-metric"><span class="cg-metric-label">Decision Flow</span><span class="cg-metric-value">Compare -> Approve</span></div><div class="cg-metric"><span class="cg-metric-label">Default Seed</span><span class="cg-metric-value">${esc(
    input.defaultSeed
  )}</span></div></div><div class="cg-flow-grid"><div class="cg-flow-step"><strong>01 Basic Inputs</strong><span>Mode, provider, preset, species, and topic define the run envelope.</span></div><div class="cg-flow-step"><strong>02 Reference / Pack Context</strong><span>Anchor the run to an uploaded asset and check the downstream pack review path.</span></div><div class="cg-flow-step"><strong>03 Workflow Policy</strong><span>Choose candidate volume and approval policy before you spend review attention.</span></div><div class="cg-flow-step"><strong>04 Advanced Controls</strong><span>Hide seed and prompt surgery until you need reproducibility or repair work.</span></div><div class="cg-flow-step"><strong>05 Candidate Compare</strong><span>Review the active job, compare views, and make the selection deliberately.</span></div><div class="cg-flow-step"><strong>06 Approval / Rollback</strong><span>Use recovery tools only after compare shows you what should move forward.</span></div></div><div class="cg-status-stack">${
    input.message ? `<div class="notice">${esc(input.message)}</div>` : ""
  }${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}<div class="cg-summary-note"><strong>Operator intent:</strong> fewer simultaneous decisions, stronger review posture, and a visible handoff from generation into compare, approval, and rollback.</div></div></div><aside class="cg-ops-rail"><div class="cg-ops-card"><h2>Operator Rail</h2><div class="cg-ops-list"><div class="cg-ops-item"><strong>Basic -> Context</strong><span>Set the run profile first, then decide whether a reference asset should anchor the pass.</span></div><div class="cg-ops-item"><strong>Policy -> Advanced</strong><span>Keep candidate and HITL policy visible. Open advanced controls only when you need precision reruns.</span></div><div class="cg-ops-item"><strong>Compare -> Approve</strong><span>Use the lower stages to compare candidates, approve the pack path, or route into rollback.</span></div></div></div><div class="cg-ops-card"><h2>Jump To</h2><div class="cg-link-list"><a href="#cg-stage-basic">Basic inputs</a><a href="#cg-stage-context">Reference context</a><a href="#cg-stage-policy">Workflow policy</a><a href="#cg-stage-advanced">Advanced controls</a><a href="#cg-active-job">Candidate compare</a><a href="#cg-approval-lane">Approval lane</a><a href="#cg-recent-jobs">Recent jobs</a></div></div></aside></div><form method="post" action="/ui/character-generator/create" class="cg-form-shell"><section class="cg-form-block" id="cg-stage-basic"><div class="cg-form-head"><span class="cg-step">01</span><div><h2>Basic inputs</h2><p class="cg-form-copy">Choose the core route for the run before you think about repair knobs or selection strategy.</p></div></div><div class="cg-field-grid tight"><label>Mode<select name="mode"><option value="new">new (prompt)</option><option value="reference">reference (use your image)</option></select><small>Reference mode injects your selected asset into the generation path.</small></label><label>Provider <span class="hint" data-tooltip="Falls back to mock when external provider fails">?</span><select name="provider"><option value="mock">mock (default free)</option><option value="comfyui">comfyui (optional)</option><option value="remoteApi">remoteApi (optional)</option></select><small>Provider fallback stays intact; offline external providers route back to mock.</small></label><label>Prompt Preset<select name="promptPreset">${input.styleOptions}</select><small>Choose the visual language you expect the pack to inherit.</small></label><label>Species<select name="species">${input.speciesOptions}</select><small>Keep this explicit so later compare decisions stay coherent.</small></label><label>Topic (optional)<input name="topic" placeholder="eraser cat mascot"/><small>Short topic labels scan better in compare and history views.</small></label></div></section><section class="cg-form-block" id="cg-stage-context"><div class="cg-form-head"><span class="cg-step">02</span><div><h2>Reference / pack context</h2><p class="cg-form-copy">Anchor the run to the right source material and keep the pack review path visible before you launch.</p></div></div><div class="cg-field-grid tight"><label>Reference Asset<select name="referenceAssetId"><option value="">(none)</option>${input.referenceOptions}</select><small>Select an uploaded asset when you want the run to inherit pose, silhouette, or mascot continuity.</small></label></div><div class="cg-context-grid"><article class="cg-context-card"><h3>Reference intake</h3><p>Need a better starting image or QC pass first? Step out to Assets, review the normalized outputs, then return here with a stronger reference.</p><div class="cg-inline-links"><a href="/ui/assets">Open Assets</a><a href="/ui/studio">Open Studio</a></div></article><article class="cg-context-card"><h3>Pack review path</h3><p>Approval, compare, and rollback still live in the character workbenches. This page should make that handoff obvious before you run another pass.</p><div class="cg-inline-links"><a href="/ui/characters">Open Characters</a><a href="/ui/studio">Open Hub</a></div></article></div></section><section class="cg-form-block" id="cg-stage-policy"><div class="cg-form-head"><span class="cg-step">03</span><div><h2>Workflow policy</h2><p class="cg-form-copy">Set review volume and approval policy before candidate generation starts so compare and recovery stay predictable.</p></div></div><div class="cg-field-grid tight"><label>Candidate Count <span class="hint" data-tooltip="Too many candidates increases cost/time">?</span><input name="candidateCount" value="4" inputmode="numeric"/><small>Higher counts improve coverage but increase operator review load.</small></label><label>Auto Pick<select name="autoPick"><option value="false">false (pick manually)</option><option value="true">true (auto pick)</option></select><small>Keep manual pick when you want a deliberate compare step.</small></label><label>Require HITL Pick<select name="requireHitlPick"><option value="true">true</option><option value="false">false</option></select><small>Leave this on when downstream activation should wait for explicit approval.</small></label></div><div class="cg-guardrail-grid"><div class="cg-guardrail"><strong>Forbidden Terms</strong><span>${esc(
    input.forbiddenTermsSummary
  )}</span></div><div class="cg-guardrail"><strong>Negative Terms</strong><span>${esc(
    input.negativeTermsSummary
  )}</span></div></div></section><details class="cg-advanced-shell" id="cg-stage-advanced"><summary><span class="cg-step">04</span><div><h2>Advanced controls</h2><p class="cg-form-copy">Open only when you need deterministic reruns, prompt surgery, or stronger suppression of known failure modes.</p></div></summary><div class="cg-advanced-body"><div class="cg-field-grid"><label>Seed <span class="hint" data-tooltip="Same input+seed keeps deterministic results">?</span><input name="seed" value="${esc(
    input.defaultSeed
  )}" inputmode="numeric"/><small>Reuse the seed when you want deterministic repro against the same prompt.</small></label><label>Positive Prompt (optional)<textarea name="positivePrompt" rows="4" placeholder="cute square-head cat mascot, monochrome black line art, paw hands, eraser dust tail"></textarea><small>Add only the extra direction you need; the preset already carries baseline style intent.</small></label><label>Negative Prompt (optional)<textarea name="negativePrompt" rows="4" placeholder="realistic fingers, glossy anime shading, realistic fur, long body, text"></textarea><small>Use this for surgical suppression when compare or QC surfaces repeat failures.</small></label></div><div class="cg-toggle-list"><label class="cg-toggle"><input type="checkbox" name="boostNegativePrompt" value="true"/><span>Strengthen negative prompt to suppress hands, text, watermark, and other known failure modes.</span></label></div></div></details><div class="cg-submit-row"><p class="cg-submit-copy">Submitting starts the candidate run, then the page transitions into the compare and approval stages below. If ComfyUI is unavailable, the existing fallback behavior remains: the run routes to mock.</p><button type="submit" data-primary-action="1">Run Character Candidate Generation</button></div></form></section>`;
}

export function buildCharacterGeneratorStatusScript(): string {
  return `<script>(function(){const el=document.getElementById("generation-status");if(!el){return;}const retryBtn=document.getElementById("generation-retry");const jobId=el.dataset.jobId;if(!jobId){return;}let timer=null;let failCount=0;const stageLabel=(status)=>{switch(String(status||"").toUpperCase()){case"QUEUED":return"QUEUED";case"RUNNING":return"RUNNING";case"SUCCEEDED":return"SUCCEEDED";case"FAILED":return"FAILED";case"CANCELLED":return"CANCELLED";default:return String(status||"unknown");}};const formatScore=(value)=>typeof value==="number"&&Number.isFinite(value)?value.toFixed(2):"-";const shortView=(view)=>view==="threeQuarter"?"t":view==="profile"?"p":"f";const summarizePreflight=(stage)=>{if(!stage||!stage.preflightByView){return"";}const entries=["front","threeQuarter","profile"].filter((view)=>stage.preflightByView&&stage.preflightByView[view]).map((view)=>{const diagnostics=stage.preflightByView[view];const detail=(Array.isArray(diagnostics&&diagnostics.missingStructureKinds)?diagnostics.missingStructureKinds.slice(0,2).join("+"):"")||(Array.isArray(diagnostics&&diagnostics.missingReferenceRoles)?diagnostics.missingReferenceRoles.slice(0,1).join("+"):"")||(Array.isArray(diagnostics&&diagnostics.reasonCodes)?diagnostics.reasonCodes[0]:"")||"";return shortView(view)+":"+String(diagnostics&&diagnostics.status||"unknown")+(detail?":"+detail:"");});return entries.length>0?" / pf="+entries.join(","):"";};const schedule=(ms)=>{if(timer){clearTimeout(timer);}timer=setTimeout(()=>{void tick();},ms);};const toast=(title,msg,tone)=>{if(typeof window.__ecsToast==="function"){window.__ecsToast(title,msg,tone||"warn");}};const speak=(msg)=>{if(typeof window.__ecsSpeak==="function"){window.__ecsSpeak(msg);}};const tick=async()=>{try{const res=await fetch("/api/character-generator/jobs/"+encodeURIComponent(jobId));if(!res.ok){throw new Error("Status fetch failed: "+res.status);}const json=await res.json();const data=json&&json.data?json.data:null;if(!data){throw new Error("No data in status response.");}failCount=0;if(retryBtn){retryBtn.style.display="none";}const manifestStatus=data.manifest&&data.manifest.status?" / manifest="+data.manifest.status:"";const packCoherence=data.packCoherence||data.manifest&&data.manifest.packCoherence?data.packCoherence||data.manifest.packCoherence:null;const autoReroute=data.autoReroute||data.manifest&&data.manifest.autoReroute?data.autoReroute||data.manifest.autoReroute:null;const selectionRisk=data.selectionRisk||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.selectionRisk||data.manifest.providerMeta.selectionDiagnostics.selectionRisk:null;const qualityEmbargo=data.qualityEmbargo||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.qualityEmbargo||data.manifest.providerMeta.selectionDiagnostics.qualityEmbargo:null;const finalQualityFirewall=data.finalQualityFirewall||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.finalQualityFirewall||data.manifest.providerMeta.selectionDiagnostics.finalQualityFirewall:null;const decisionOutcome=data.decisionOutcome||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.decisionOutcome||data.manifest.providerMeta.selectionDiagnostics.decisionOutcome:null;const coherenceSummary=packCoherence?" / coherence="+String(packCoherence.severity||"none")+":"+formatScore(packCoherence.score):"";const rerouteSummary=autoReroute&&autoReroute.attempted?" / reroute="+String(autoReroute.recovered===true?"recovered":autoReroute.recovered===false?"failed":"attempted")+(autoReroute.strategy?"@"+String(autoReroute.strategy):""):"";const selectionRiskSummary=selectionRisk&&selectionRisk.level&&String(selectionRisk.level)!=="none"?" / risk="+String(selectionRisk.level)+(selectionRisk.suggestedAction?"@"+String(selectionRisk.suggestedAction):""):"";const qualityEmbargoSummary=qualityEmbargo&&qualityEmbargo.level&&String(qualityEmbargo.level)!=="none"?" / embargo="+String(qualityEmbargo.level)+(qualityEmbargo.suggestedAction?"@"+String(qualityEmbargo.suggestedAction):""):"";const finalQualityFirewallSummary=finalQualityFirewall&&finalQualityFirewall.level&&String(finalQualityFirewall.level)!=="none"?" / firewall="+String(finalQualityFirewall.level)+(finalQualityFirewall.suggestedAction?"@"+String(finalQualityFirewall.suggestedAction):""):"";const decisionSummary=decisionOutcome&&decisionOutcome.status?" / decision="+String(decisionOutcome.status)+(decisionOutcome.kind?"@"+String(decisionOutcome.kind):""):"";const selectionSource=data.finalSelectionSource?" / selection="+String(data.finalSelectionSource):"";const routeSummary=data.selectedWorkflowRuntimeSummary&&String(data.selectedWorkflowRuntimeSummary)!=="-"?" / route="+String(data.selectedWorkflowRuntimeSummary):"";const lastStage=Array.isArray(data.workflowStages)&&data.workflowStages.length>0?data.workflowStages[data.workflowStages.length-1]:null;const stageVariant=lastStage?[String(lastStage.origin||""),String(lastStage.passLabel||"")].filter((value)=>value&&value!=="").join("@"):"";const stageExit=lastStage?"p"+String(Array.isArray(lastStage.passedViews)?lastStage.passedViews.length:0)+"/f"+String(Array.isArray(lastStage.failedViews)?lastStage.failedViews.length:0):"";const stageSummary=lastStage?" / stage="+String(lastStage.stage||"unknown")+(stageVariant?"@"+stageVariant:"")+"#"+String(lastStage.roundsAttempted||0)+(stageExit?":"+stageExit:""):Array.isArray(data.workflowStages)&&data.workflowStages.length>0?" / stages="+String(data.workflowStages.length):"";const preflightSummary=summarizePreflight(lastStage);const triageSummary=lastStage&&lastStage.repairTriageByView?(()=>{const entries=["front","threeQuarter","profile"].filter((view)=>lastStage.repairTriageByView&&lastStage.repairTriageByView[view]).map((view)=>shortView(view)+":"+String(lastStage.repairTriageByView[view].decision||"unknown"));return entries.length>0?" / triage="+entries.join(","):"";})():"";const repairAcceptanceSummary=lastStage&&lastStage.repairAcceptanceByView?(()=>{const entries=["front","threeQuarter","profile"].filter((view)=>lastStage.repairAcceptanceByView&&lastStage.repairAcceptanceByView[view]).map((view)=>shortView(view)+":"+String(lastStage.repairAcceptanceByView[view].decision||"unknown"));return entries.length>0?" / ra="+entries.join(","):"";})():"";const nextAction=Array.isArray(data.recommendedActions)&&data.recommendedActions.length>0&&data.recommendedActions[0]&&data.recommendedActions[0].label?" / next="+String(data.recommendedActions[0].label):"";const text="status="+stageLabel(data.status)+" progress="+data.progress+"%"+manifestStatus+coherenceSummary+rerouteSummary+selectionRiskSummary+qualityEmbargoSummary+finalQualityFirewallSummary+decisionSummary+selectionSource+routeSummary+stageSummary+preflightSummary+triageSummary+repairAcceptanceSummary+nextAction;el.textContent=text;speak(text);if(data.status==="SUCCEEDED"||data.status==="FAILED"||data.status==="CANCELLED"){if(data.manifestExists){toast("Generator", "Job finished. Redirecting to result page.", data.status==="SUCCEEDED"?"ok":"warn");setTimeout(()=>{window.location.href="/ui/character-generator?jobId="+encodeURIComponent(jobId);},500);}return;}schedule(2000);}catch(error){failCount+=1;const wait=Math.min(15000,2000*Math.pow(2,failCount));el.textContent="Polling failed. Retry in "+wait+"ms.";if(retryBtn){retryBtn.style.display="inline-block";}toast("Status Poll", String(error), "warn");schedule(wait);}};if(retryBtn){retryBtn.addEventListener("click",()=>{failCount=0;void tick();});}void tick();})();</script>`;
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
  const jobsSection = `<section class="card cg-history-card" id="cg-recent-jobs"><div class="cg-section-head"><div><div class="cg-section-kicker">History</div><h2>Recent Generation Jobs</h2></div><p>Re-open a run, inspect manifest status, and pivot back into manual correction without leaving the console.</p></div><div class="cg-history-tools"><div class="quick-links"><a href="#cg-active-job">Active job</a><a href="#recommended-actions">Recommended actions</a><a href="#pick-candidates">HITL pick</a></div><input type="search" data-table-filter="cg-jobs-table" placeholder="Filter jobs (job/topic/status/manifest)"/></div><div class="cg-table-wrap"><table id="cg-jobs-table"><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Status</th><th>Progress</th><th>Manifest</th><th>Created</th></tr></thead><tbody>${
    input.rows ||
    '<tr><td colspan="7"><div class="notice">No generation jobs yet. Click the run button above.</div></td></tr>'
  }</tbody></table></div></section>`;

  const compareLane = renderPhaseCard(
    "05",
    "Candidate compare",
    "Review the active job, compare the current pack state, inspect previews, and make the pick before you touch approval or recovery controls.",
    `${renderSlot(input.selectedSection, "cg-slot", "cg-active-job")}${renderSlot(input.compareSection, "cg-slot")}${renderSlot(
      input.pickSection,
      "cg-slot"
    )}${renderSlot(input.previewSection, "cg-slot")}`
  );
  const approvalLane = renderPhaseCard(
    "06",
    "Approval / rollback",
    "Use recommended actions, rollback context, and rerun controls only after compare makes the right next move obvious.",
    `${renderSlot(input.recommendedActionsSection, "cg-slot")}${renderSlot(
      input.rollbackSection,
      "cg-slot"
    )}${renderSlot(input.regenerateSection, "cg-slot")}${renderSlot(input.recreateSection, "cg-slot")}`,
    "cg-approval-lane",
    "cg-approval-lane"
  );

  return `${buildCharacterGeneratorPageStyles()}<div class="cg-page-shell">${input.topSection}<div class="cg-main-grid">${compareLane}${approvalLane}</div>${jobsSection}</div>${input.statusScript}`;
}
