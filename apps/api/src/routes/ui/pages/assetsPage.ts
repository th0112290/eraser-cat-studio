import { renderTableEmptyRow } from "./uiText";

type AssetPreviewEntry = {
  label: string;
  key: string;
  url: string;
  localExists: boolean;
};

type SelectedAssetInput = {
  id: string;
  status: string;
  statusClassName: string;
  mime: string;
  originalKey: string;
  normalized1024Key: string;
  normalized2048Key: string;
  qcLevel: string;
  qcClassName: string;
  qcReason: string;
  qcJson: string;
};

type AssetsPageBodyInput = {
  rows: string;
  selectedAsset: SelectedAssetInput | null;
  previews: AssetPreviewEntry[];
};

const ASSET_PAGE_STYLE = `<style>
.asset-hero,.asset-upload-card,.asset-list-card,.asset-detail-panel,.asset-guide-card,.asset-next-card,.asset-route-card{position:relative;overflow:hidden;border:1px solid #d6e0ef;border-radius:20px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 18px 44px rgba(15,23,42,.07)}
.asset-hero::before,.asset-upload-card::before,.asset-list-card::before,.asset-detail-panel::before,.asset-guide-card::before,.asset-next-card::before,.asset-route-card::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#1257c7,rgba(18,87,199,.16))}
.asset-hero,.asset-upload-card,.asset-list-card,.asset-detail-panel,.asset-guide-card,.asset-next-card,.asset-route-card{padding:18px}
.asset-hero{display:grid;gap:14px;background:linear-gradient(180deg,#fbfdff,#f3f8ff)}
.asset-shell{display:grid;gap:14px;grid-template-columns:minmax(280px,.78fr) minmax(0,1.06fr) minmax(360px,.98fr);align-items:start}
.asset-left-rail,.asset-main-col,.asset-right-rail{display:grid;gap:14px}
.asset-right-rail{position:sticky;top:20px;max-height:calc(100vh - 28px);overflow:auto;padding-right:2px;scrollbar-gutter:stable}
.asset-flow-grid{display:grid;gap:10px;grid-template-columns:repeat(4,minmax(0,1fr))}
.asset-flow-step{display:grid;gap:5px;padding:12px 14px;border:1px solid #d6e0ef;border-radius:16px;background:linear-gradient(180deg,#fff,#f7fbff)}
.asset-flow-step strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#215378}
.asset-flow-step span{font-size:12px;color:#506273;line-height:1.5}
.asset-kicker{margin:0 0 6px;color:#1257c7;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.asset-copy,.asset-subhead p,.asset-guide-list li,.asset-next-item span,.asset-route-item p{margin:6px 0 0;color:#5b6b82;font-size:13px;line-height:1.55}
.asset-link-row,.asset-link-grid,.asset-hero-links{display:flex;gap:8px;flex-wrap:wrap}
.asset-link-chip{display:inline-flex;align-items:center;justify-content:center;padding:7px 10px;border-radius:999px;border:1px solid #d4deec;background:#fff;color:#142033;font-size:12px;font-weight:700;text-decoration:none;appearance:none;cursor:pointer}
.asset-link-chip:hover{text-decoration:none;box-shadow:0 10px 20px rgba(18,87,199,.08)}
.asset-link-chip:focus-visible,.asset-json summary:focus-visible{outline:2px solid #1257c7;outline-offset:2px}
.asset-shell label,.asset-hero label{display:grid;gap:6px;color:#142033;font-size:13px;font-weight:700}
.asset-shell input:not([type=file]),.asset-shell select,.asset-hero input:not([type=file]),.asset-hero select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d4deec;border-radius:12px;background:#fff;color:#142033}
.asset-shell input[type=file]{padding:9px 10px;border:1px dashed #c1d2e7;border-radius:12px;background:#fff}
.asset-shell input:not([type=file]):focus,.asset-shell select:focus,.asset-hero input:not([type=file]):focus,.asset-hero select:focus{outline:none;border-color:#8eb1ef;box-shadow:0 0 0 3px rgba(18,87,199,.12)}
.asset-shell button{appearance:none;padding:10px 14px;border-radius:12px;border:1px solid #0f4aad;background:linear-gradient(180deg,#1660d0,#0f4fad);color:#fff;font-weight:700;cursor:pointer;box-shadow:0 12px 24px rgba(18,87,199,.18)}
.asset-shell button:focus-visible{outline:2px solid #1257c7;outline-offset:2px}
.asset-inline-note{margin:10px 0 0;color:#5b6b82;font-size:12px;line-height:1.5}
.asset-output{margin:12px 0 0;min-height:120px;padding:14px 16px;border-radius:16px;border:1px solid #233554;background:linear-gradient(180deg,#0f1726,#142033);color:#dfe9ff;overflow:auto;font-size:12px;line-height:1.55}
.asset-output[data-state=busy]{border-color:#385b91}
.asset-output[data-state=error]{border-color:#7a2818;background:linear-gradient(180deg,#2a1110,#3a1513)}
.asset-output[data-state=success]{border-color:#1d5d47}
.asset-section-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.asset-table-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px}
.asset-counter{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid #c8d9fb;background:#ebf3ff;color:#1257c7;font-size:12px;font-weight:700}
.asset-filter-note{color:#5b6b82;font-size:12px;line-height:1.5}
.asset-table-wrap{margin-top:10px;max-height:560px;overflow:auto;border:1px solid #dce5f3;border-radius:16px;background:#fff}
.asset-table-wrap table{margin:0;min-width:760px;border-collapse:separate;border-spacing:0}
.asset-table-wrap thead th{position:sticky;top:0;background:#f6f9ff;z-index:1}
.asset-table-wrap tbody tr:hover{background:#f8fbff}
.asset-table-wrap tbody tr:focus-within{outline:2px solid #1257c7;outline-offset:-2px}
.asset-table-wrap tbody tr[data-selected=true]{background:#eef4ff;box-shadow:inset 3px 0 0 #1257c7}
.asset-table-wrap .notice{margin:0;border:1px dashed #d4deec;background:#f8fbff;color:#47627e}
.asset-summary-grid,.asset-meta-grid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}
.asset-summary-card,.asset-meta-grid div{padding:12px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
.asset-summary-card span,.asset-meta-grid span{display:block;margin-bottom:6px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.asset-summary-card strong{display:block;font-size:14px;line-height:1.45}
.asset-summary-card code,.asset-meta-grid code,.preview-card code,.asset-output,.asset-json pre{font-family:"IBM Plex Mono","Cascadia Code","SFMono-Regular",Consolas,monospace}
.asset-subhead{margin-top:16px}
.asset-subhead h3{margin:0;font-size:18px}
.preview-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:12px}
.preview-card{border:1px solid #dce5f3;border-radius:14px;padding:12px;background:#f9fcff}
.preview-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.preview-card h4{margin:0 0 8px}
.preview-card p{margin:8px 0 0;color:#5b6b82;font-size:13px;line-height:1.5}
.preview-frame{margin-top:10px;padding:10px;border:1px solid #dce5f3;border-radius:12px;background:#fff}
.preview-frame img{display:block;width:100%;max-height:220px;object-fit:contain}
.asset-mini-badge{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid #d4deec;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.asset-mini-badge-ready{background:#effcf5;border-color:#b8e7c8;color:#0f6b45}
.asset-mini-badge-muted{background:#f5f7fb;color:#5b6b82}
.asset-empty{display:grid;gap:6px;padding:14px 16px;border:1px dashed #d4deec;border-radius:14px;background:#f8fbff;color:#5b6b82;margin-top:14px}
.asset-empty strong{color:#142033}
.asset-empty-inline{margin-top:10px}
.asset-json{margin-top:16px;border:1px solid #d6e0ef;border-radius:14px;background:#fbfcfe}
.asset-json summary{cursor:pointer;padding:12px 14px;font-weight:700;list-style:none}
.asset-json summary::-webkit-details-marker{display:none}
.asset-json summary::after{content:"Show";float:right;color:#1257c7;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.asset-json[open] summary::after{content:"Hide"}
.asset-json pre{margin:0;padding:0 14px 14px;overflow:auto;color:#27354a}
.asset-guide-card h2,.asset-upload-card h2,.asset-list-card h2,.asset-detail-panel h2,.asset-next-card h2,.asset-route-card h2{margin:0;font-size:20px}
.asset-guide-list{margin:12px 0 0;padding-left:18px;display:grid;gap:8px}
.asset-next-grid,.asset-route-grid{display:grid;gap:10px;margin-top:12px}
.asset-next-item,.asset-route-item{display:grid;gap:6px;padding:12px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fff,#f8fbff)}
.asset-next-item strong,.asset-route-item strong{font-size:13px}
.asset-route-item .asset-link-grid{margin-top:2px}
.badge{display:inline-flex;align-items:center}
.asset-detail-empty{position:static}
.asset-right-rail>*{scroll-margin-top:20px}
@media (max-width:1320px){.asset-shell{grid-template-columns:minmax(260px,.88fr) minmax(0,1.12fr)}.asset-right-rail{grid-column:1 / -1;position:static;max-height:none;overflow:visible}.asset-flow-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:920px){.asset-shell,.asset-summary-grid,.asset-meta-grid{grid-template-columns:1fr}.asset-left-rail,.asset-main-col,.asset-right-rail{gap:12px}}
@media (max-width:640px){.asset-hero,.asset-upload-card,.asset-list-card,.asset-detail-panel,.asset-guide-card,.asset-next-card,.asset-route-card{padding:16px;border-radius:18px}.asset-flow-grid{grid-template-columns:1fr}.asset-table-wrap table{min-width:680px}}
</style>`;

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildAssetsPageBody(input: AssetsPageBodyInput): string {
  const primaryPreviewHref = input.previews.length > 0 ? input.previews[0]?.url ?? "" : "";
  const qcLevel = input.selectedAsset?.qcLevel ?? "";
  const assetLooksReady = /pass|ready|ok/i.test(qcLevel);
  const assetQcPending = /n\/a/i.test(qcLevel);

  const previewCards = input.previews.length
    ? input.previews
        .map((entry) => {
          const previewBody = entry.localExists
            ? `<div class="preview-frame"><img src="${esc(entry.url)}" alt="${esc(entry.label)} preview" loading="lazy" width="960" height="960"/></div>`
            : `<div class="asset-empty asset-empty-inline"><strong>Local preview missing</strong><span>The preview route exists, but the generated image is not on disk yet.</span></div>`;

          return `<article class="preview-card"><div class="preview-head"><div><h4>${esc(entry.label)}</h4><p><code>${esc(entry.key)}</code></p></div><span class="asset-mini-badge ${
            entry.localExists ? "asset-mini-badge-ready" : "asset-mini-badge-muted"
          }">${entry.localExists ? "Ready" : "Pending"}</span></div>${previewBody}<p><a href="${esc(entry.url)}">Open preview: ${esc(
            entry.label
          )}</a></p></article>`;
        })
        .join("")
    : "";

  const qcHeadline = input.selectedAsset
    ? /pass|ready|ok/i.test(input.selectedAsset.qcLevel)
      ? "QC and route readiness look good. You can hand this asset off immediately."
      : /n\/a/i.test(input.selectedAsset.qcLevel)
        ? "QC has not finished yet. Keep the inspector open and use the route rail for the next check."
        : "QC is still the gating signal. Confirm the reason before pushing this asset downstream."
    : "Choose one asset first so the inspector can turn into the decision rail for this surface.";

  const qcDetail = input.selectedAsset
    ? `Status ${input.selectedAsset.status} / QC ${input.selectedAsset.qcLevel}. Keep JSON behind the main decision UI and use it only for evidence or recovery.`
    : "Pick an asset from the list or upload a new one. The right rail then shows summary, next safe action, linked routes, and raw evidence.";
  const inspectorRail = `<section class="card asset-route-card"><div class="asset-section-head"><div><p class="asset-kicker">Sticky Inspector</p><h2>Summary first, raw evidence second</h2><p class="asset-copy">The rail is deliberately decision-first. Start with object state and next safe action, then open raw QC only when you need evidence or recovery detail.</p></div></div><div class="asset-link-grid"><a class="asset-link-chip" href="#asset-selected-detail">Selected Asset</a><a class="asset-link-chip" href="#asset-next-actions">Next Actions</a><a class="asset-link-chip" href="#asset-linked-routes">Linked Routes</a></div></section>`;
  const creationNav = `<section class="card asset-route-card"><div class="asset-section-head"><div><p class="asset-kicker">Creation Handoff</p><h2>Return, pin, and reopen</h2><p class="asset-copy">Keep URL state only. The current asset, pinned reopen links, and the return path stay visible without adding new stored server state.</p></div></div><div class="asset-route-grid"><article class="asset-route-item"><strong>Current Object</strong><p id="asset-nav-current">${input.selectedAsset ? `Asset ${esc(input.selectedAsset.id)}` : "No current asset"}</p><div class="asset-link-grid" id="asset-nav-actions"></div></article><article class="asset-route-item"><strong>Pinned Asset</strong><p>Pin one reference asset to reopen it from other creation surfaces.</p><div class="asset-link-grid" id="asset-pin-list"></div></article><article class="asset-route-item"><strong>Recent Assets</strong><p>Recent reopen links are kept locally so deep-link travel stays cheap.</p><div class="asset-link-grid" id="asset-recent-list"></div></article></div></section>`;
  const nextActions = input.selectedAsset
    ? `<section class="card asset-next-card" id="asset-next-actions"><div class="asset-section-head"><div><p class="asset-kicker">Next Safe Action</p><h2>Next Actions</h2><p class="asset-copy">${qcHeadline}</p></div></div><div class="asset-next-grid"><article class="asset-next-item"><strong>1. Confirm current evidence</strong><span>${qcDetail}</span><div class="asset-link-grid"><a class="asset-link-chip" href="/api/assets/${encodeURIComponent(
        input.selectedAsset.id
      )}">Open API JSON</a>${
        primaryPreviewHref ? `<a class="asset-link-chip" href="${esc(primaryPreviewHref)}">Open primary preview</a>` : ""
      }</div></article><article class="asset-next-item"><strong>2. Route into the next surface</strong><span>${
        assetLooksReady
          ? "This asset is ready for downstream use. Jump straight into Studio for dispatch or Generator for a new run."
          : assetQcPending
            ? "Keep the handoff available, but verify readiness before using this asset as a reference."
            : "Use Studio for dispatch visibility, then hand off to Generator only after the QC reason is understood."
      }</span><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/studio" data-asset-nav-target="studio">Open Studio</a><a class="asset-link-chip" href="/ui/character-generator" data-asset-nav-target="generator">Open Generator</a></div></article><article class="asset-next-item"><strong>3. Keep recovery close</strong><span>When compare, review, or rollback work starts later, reopen this exact object and keep raw evidence behind the main decision UI.</span><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/jobs">Open Jobs</a><a class="asset-link-chip" href="/ui/assets?assetId=${encodeURIComponent(
        input.selectedAsset.id
      )}" data-asset-nav-target="asset">Reopen this asset</a></div></article></div></section>`
    : `<section class="card asset-next-card" id="asset-next-actions"><div class="asset-section-head"><div><p class="asset-kicker">Next Safe Action</p><h2>Next Actions</h2><p class="asset-copy">${qcHeadline}</p></div></div><div class="asset-empty"><strong>No asset selected</strong><span>${qcDetail}</span></div><div class="asset-link-grid" style="margin-top:12px"><a class="asset-link-chip" href="/ui/studio" data-asset-nav-target="studio">Open Studio</a><a class="asset-link-chip" href="/ui/character-generator" data-asset-nav-target="generator">Open Generator</a></div></section>`;
  const linkedRoutes = input.selectedAsset
    ? `<section class="card asset-route-card" id="asset-linked-routes"><div class="asset-section-head"><div><p class="asset-kicker">Linked Routes</p><h2>Three destinations, three distinct jobs</h2><p class="asset-copy">Do not overload Assets. This page confirms the object and then pushes it into the surface that owns the next decision.</p></div></div><div class="asset-route-grid"><article class="asset-route-item"><div class="preview-head"><strong>Studio / Dispatch Hub</strong><span class="asset-mini-badge ${assetLooksReady ? "asset-mini-badge-ready" : "asset-mini-badge-muted"}">${assetLooksReady ? "Immediate route" : "Review first"}</span></div><p>Use Studio to bind topic, episode, and next fast-flow action around the current asset.</p><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/studio" data-asset-nav-target="studio">Open Studio</a><a class="asset-link-chip" href="/ui/jobs">Open Jobs</a></div></article><article class="asset-route-item"><div class="preview-head"><strong>Character Generator / Run Workbench</strong><span class="asset-mini-badge ${assetLooksReady ? "asset-mini-badge-ready" : "asset-mini-badge-muted"}">${assetLooksReady ? "Reference ready" : "Hold"}</span></div><p>Use Generator for candidate compare, approval, regenerate, recreate, and rollback decisions.</p><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/character-generator" data-asset-nav-target="generator">Open Generator</a><a class="asset-link-chip" href="/ui/studio" data-asset-nav-target="studio">Return to Studio</a></div></article><article class="asset-route-item"><div class="preview-head"><strong>Characters / Pack Review</strong><span class="asset-mini-badge asset-mini-badge-muted">Inspection</span></div><p>Use Characters for deep preview, QC, lineage, and jobs review once a pack already exists.</p><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/characters" data-asset-nav-target="characters">Open Characters</a><a class="asset-link-chip" href="/ui/character-generator" data-asset-nav-target="generator">Jump to Generator</a></div></article></div></section>`
    : `<section class="card asset-route-card" id="asset-linked-routes"><div class="asset-section-head"><div><p class="asset-kicker">Linked Routes</p><h2>Route after selection</h2><p class="asset-copy">Once one asset is selected, this rail turns into direct handoff links for Studio, Generator, and Characters.</p></div></div><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/studio" data-asset-nav-target="studio">Open Studio</a><a class="asset-link-chip" href="/ui/character-generator" data-asset-nav-target="generator">Open Generator</a><a class="asset-link-chip" href="/ui/characters" data-asset-nav-target="characters">Open Characters</a></div></section>`;
  const selectedDetails = input.selectedAsset
    ? `<section class="card asset-detail-panel" id="asset-selected-detail"><div class="asset-section-head"><div><p class="asset-kicker">Selected Asset</p><h2>Selected Asset</h2><p class="asset-copy">Read the current object before leaving this surface. Keep QC, normalized keys, preview availability, and the current handoff state visible in one place.</p></div><div class="asset-link-row"><a class="asset-link-chip" href="/api/assets/${encodeURIComponent(
          input.selectedAsset.id
        )}">Open API JSON</a><button type="button" class="asset-link-chip" id="asset-copy-link">Copy deep link</button><button type="button" class="asset-link-chip" id="asset-pin-current">Pin current asset</button><a class="asset-link-chip" href="#" id="asset-return-link" hidden>Return</a></div></div><div class="asset-summary-grid"><div class="asset-summary-card"><span>ID</span><strong>${esc(
          input.selectedAsset.id
        )}</strong></div><div class="asset-summary-card"><span>Status</span><strong><span class="badge ${esc(
          input.selectedAsset.statusClassName
      )}">${esc(input.selectedAsset.status)}</span></strong></div><div class="asset-summary-card"><span>QC</span><strong><span class="badge ${esc(
        input.selectedAsset.qcClassName
      )}" title="${esc(input.selectedAsset.qcReason)}">${esc(input.selectedAsset.qcLevel)}</span></strong></div><div class="asset-summary-card"><span>MIME</span><strong><code>${esc(
        input.selectedAsset.mime
      )}</code></strong></div></div><div class="asset-meta-grid"><div><span>Original Key</span><code>${esc(
        input.selectedAsset.originalKey
      )}</code></div><div><span>Normalized 1024</span><code>${esc(input.selectedAsset.normalized1024Key)}</code></div><div><span>Normalized 2048</span><code>${esc(
        input.selectedAsset.normalized2048Key
      )}</code></div><div><span>QC Reason</span><code>${esc(input.selectedAsset.qcReason || "-")}</code></div></div>${
        previewCards.length > 0
          ? `<div><div class="asset-subhead"><h3>Preview Outputs</h3><p>Use previews to confirm the object can move into compare or review surfaces without detouring into raw payloads.</p></div><div class="preview-grid">${previewCards}</div></div>`
          : `<div class="asset-empty"><strong>No preview outputs yet</strong><span>This asset can still be routed, but preview evidence has not been generated yet.</span></div>`
      }<details class="asset-json"><summary>Raw QC payload</summary><pre>${esc(input.selectedAsset.qcJson)}</pre></details></section>`
    : `<section class="card asset-detail-panel asset-detail-empty" id="asset-selected-detail"><div class="asset-section-head"><div><p class="asset-kicker">Selected Asset</p><h2>Selected Asset</h2><p class="asset-copy">Pick one asset from the table or upload a new input. The inspector then becomes the detail rail for route choice, QC context, and raw evidence.</p></div></div><div class="asset-empty"><strong>No asset selected</strong><span>The right rail is waiting for one concrete object before it expands into detail mode.</span></div></section>`;
  const heroSection = `<section class="card asset-hero"><div class="asset-section-head"><div><p class="asset-kicker">Assets Workbench</p><h2>Upload, review, then hand off without losing context</h2><p class="asset-copy">Use this surface to intake a reference, check readiness, and decide the next route. The right rail stays summary-first so Studio, Character Generator, and Characters stay one click away without burying QC or evidence.</p></div><div class="asset-hero-links"><a href="/ui/studio" class="asset-link-chip" data-asset-nav-target="studio">Open Studio</a><a href="/ui/character-generator" class="asset-link-chip" data-asset-nav-target="generator">Open Generator</a><a href="/ui/characters" class="asset-link-chip" data-asset-nav-target="characters">Open Characters</a></div></div><div class="asset-flow-grid"><div class="asset-flow-step"><strong>01 Intake</strong><span>Upload a new source and land directly on its object page.</span></div><div class="asset-flow-step"><strong>02 Review</strong><span>Use the table and preview cards to confirm type, status, and QC readiness.</span></div><div class="asset-flow-step"><strong>03 Inspector</strong><span>Keep summary, next action, and evidence visible in the sticky rail.</span></div><div class="asset-flow-step"><strong>04 Route</strong><span>Jump to Studio, Generator, or Characters with the current asset preserved.</span></div></div></section>`;
  const creationNavScript = `<script>(() => {const selectedAssetId=${JSON.stringify(
    input.selectedAsset?.id ?? ""
  )};const uploadInProgress="Uploading asset...";const ns="ecs.ui.creation.nav.v1";const q=(id)=>document.getElementById(id);const form=q("asset-upload-form");const output=q("asset-upload-result");const submit=q("asset-upload-submit");const currentRoot=q("asset-nav-current");const actionsRoot=q("asset-nav-actions");const pinRoot=q("asset-pin-list");const recentRoot=q("asset-recent-list");const copyButton=q("asset-copy-link");const pinButton=q("asset-pin-current");const returnLink=q("asset-return-link");const params=new URLSearchParams(window.location.search);const currentUrl=window.location.pathname+window.location.search;const returnTo=params.get("returnTo")||"";const focus=params.get("focus")||"asset-selected-detail";const currentObject=params.get("currentObject")||(selectedAssetId?"asset:"+selectedAssetId:"");const parse=(value,fallback)=>{try{const parsed=JSON.parse(String(value||""));return parsed==null?fallback:parsed;}catch{return fallback;}};const readList=(kind)=>{if(typeof window==="undefined"||!window.localStorage){return [];}const parsed=parse(window.localStorage.getItem(ns+".recent."+kind),[]);return Array.isArray(parsed)?parsed:[];};const writeList=(kind,items)=>{try{window.localStorage.setItem(ns+".recent."+kind,JSON.stringify(items.slice(0,6)));}catch{}};const readPin=(kind)=>{if(typeof window==="undefined"||!window.localStorage){return null;}const parsed=parse(window.localStorage.getItem(ns+".pin."+kind),null);return parsed&&typeof parsed==="object"?parsed:null;};const writePin=(kind,item)=>{try{window.localStorage.setItem(ns+".pin."+kind,JSON.stringify(item));}catch{}};const pushRecent=(kind,item)=>{if(!item||!item.id){return;}const next=[item].concat(readList(kind).filter((entry)=>entry&&entry.id!==item.id));writeList(kind,next);};const escapeHtml=(value)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");const buildHref=(pathname,entries)=>{const url=new URL(pathname,window.location.origin);Object.entries(entries||{}).forEach(([key,value])=>{if(value!==undefined&&value!==null&&String(value).trim()!==""){url.searchParams.set(key,String(value));}});return url.pathname+url.search;};const assetHref=(assetId,extra)=>buildHref("/ui/assets",{assetId,currentObject:"asset:"+assetId,focus:"asset-selected-detail",...(extra||{})});const selectedObject=selectedAssetId?"asset:"+selectedAssetId:currentObject;const resolveTargetHref=(target)=>{if(target==="asset"){return selectedAssetId?assetHref(selectedAssetId,{returnTo:returnTo||undefined}):currentUrl;}if(target==="studio"){return buildHref("/ui/studio",{assetId:selectedAssetId||undefined,returnTo:currentUrl,currentObject:selectedObject||undefined,focus:"studio-selection"});}if(target==="generator"){return buildHref("/ui/character-generator",{referenceAssetId:selectedAssetId||undefined,assetId:selectedAssetId||undefined,returnTo:currentUrl,currentObject:selectedObject||undefined,focus:"cg-stage-context"});}if(target==="characters"){return buildHref("/ui/characters",{returnTo:currentUrl,currentObject:selectedObject||undefined,focus:"pack-review-current"});}return null;};const renderLinks=(root,items,empty)=>{if(!(root instanceof HTMLElement)){return;}const valid=Array.isArray(items)?items.filter((entry)=>entry&&entry.href&&entry.label):[];root.innerHTML=valid.length?valid.map((entry)=>'<a class="asset-link-chip" href="'+escapeHtml(entry.href)+'">'+escapeHtml(entry.label)+"</a>").join(""):'<span class="asset-filter-note">'+escapeHtml(empty)+"</span>";};const handleCopy=async()=>{try{await navigator.clipboard.writeText(window.location.href);if(typeof window.__ecsToast==="function"){window.__ecsToast("Assets","Deep link copied.","ok");}}catch(error){if(typeof window.__ecsToast==="function"){window.__ecsToast("Assets",String(error),"warn");}}};const handlePin=()=>{if(!selectedAssetId){return;}writePin("asset",{id:selectedAssetId,label:"Asset "+selectedAssetId,href:assetHref(selectedAssetId,{returnTo:returnTo||undefined})});renderNav();};const renderNav=()=>{if(currentRoot instanceof HTMLElement){currentRoot.textContent=selectedAssetId?"Asset "+selectedAssetId:selectedObject||"No current asset";}if(actionsRoot instanceof HTMLElement){const links=[];if(selectedAssetId){links.push('<a class="asset-link-chip" href="'+escapeHtml(resolveTargetHref("studio")||"#")+'">Studio</a>');links.push('<a class="asset-link-chip" href="'+escapeHtml(resolveTargetHref("generator")||"#")+'">Generator</a>');links.push('<a class="asset-link-chip" href="'+escapeHtml(resolveTargetHref("characters")||"#")+'">Characters</a>');}actionsRoot.innerHTML=links.join("")+(returnTo?'<a class="asset-link-chip" href="'+escapeHtml(returnTo)+'">Return</a>':"")+'<button type="button" class="asset-link-chip" id="asset-copy-link-nav">Copy deep link</button>'+(selectedAssetId?'<button type="button" class="asset-link-chip" id="asset-pin-current-nav">Pin current asset</button>':"");document.getElementById("asset-copy-link-nav")?.addEventListener("click",handleCopy);document.getElementById("asset-pin-current-nav")?.addEventListener("click",handlePin);}const pinnedAsset=readPin("asset");renderLinks(pinRoot,pinnedAsset?[pinnedAsset]:[],"No pinned asset yet.");renderLinks(recentRoot,readList("assets"),"No recent reopen links yet.");};const decorateHandoffLinks=()=>{document.querySelectorAll("[data-asset-nav-target]").forEach((node)=>{if(!(node instanceof HTMLAnchorElement)){return;}const href=resolveTargetHref(String(node.dataset.assetNavTarget||""));if(href){node.href=href;}});};if(selectedAssetId){pushRecent("assets",{id:selectedAssetId,label:"Asset "+selectedAssetId,href:assetHref(selectedAssetId,{returnTo:returnTo||undefined})});const normalizedHref=assetHref(selectedAssetId,{returnTo:returnTo||undefined});if(window.location.pathname+window.location.search!==normalizedHref){window.history.replaceState(null,"",normalizedHref);}}renderNav();decorateHandoffLinks();copyButton?.addEventListener("click",handleCopy);pinButton?.addEventListener("click",handlePin);if(returnLink instanceof HTMLAnchorElement){if(returnTo){returnLink.hidden=false;returnLink.href=returnTo;}else{returnLink.hidden=true;}}if(form&&output&&submit){form.addEventListener("submit",async(event)=>{event.preventDefault();event.stopImmediatePropagation();submit.disabled=true;output.dataset.state="busy";output.textContent=uploadInProgress;const fd=new FormData(form);try{const res=await fetch("/api/assets/upload",{method:"POST",body:fd});const json=await res.json();output.dataset.state=res.ok?"success":"error";output.textContent=JSON.stringify(json,null,2);if(res.ok&&json&&json.data&&json.data.assetId){const assetId=String(json.data.assetId);window.location.href=assetHref(assetId,{returnTo:currentUrl});}}catch(error){output.dataset.state="error";output.textContent=String(error);}finally{submit.disabled=false;}},true);}if(focus&&!window.location.hash){const focusTarget=document.getElementById(focus);if(focusTarget instanceof HTMLElement){setTimeout(()=>focusTarget.scrollIntoView({block:"start",behavior:"smooth"}),120);}}})();</script>`;
  const clientScript = `<script>const selectedAssetId=${JSON.stringify(
    input.selectedAsset?.id ?? ""
  )};const form=document.getElementById("asset-upload-form");const output=document.getElementById("asset-upload-result");const submit=document.getElementById("asset-upload-submit");const filter=document.getElementById("asset-filter");const assetTable=document.getElementById("asset-table");const filterCount=document.getElementById("asset-filter-count");const updateCount=()=>{if(!(assetTable instanceof HTMLTableElement))return;let total=0;let visible=0;assetTable.querySelectorAll("tbody tr").forEach((row)=>{if(!(row instanceof HTMLElement))return;const text=String(row.textContent||"").trim();const hasDataRow=!!row.querySelector("a")||row.querySelectorAll("td").length>1;if(hasDataRow)total+=1;if(hasDataRow&&row.style.display!=="none")visible+=1;const firstCell=hasDataRow?row.querySelector("td"):null;row.dataset.selected=selectedAssetId&&firstCell&&String(firstCell.textContent||"").trim()===selectedAssetId?"true":"false";});if(filterCount instanceof HTMLElement)filterCount.textContent=visible+" / "+total+" shown";};const applyFilter=()=>{if(!(filter instanceof HTMLInputElement)||!(assetTable instanceof HTMLTableElement))return;const q=filter.value.trim().toLowerCase();assetTable.querySelectorAll("tbody tr").forEach((row)=>{if(!(row instanceof HTMLElement))return;const text=String(row.textContent||"").toLowerCase();row.style.display=!q||text.includes(q)?"":"none";});updateCount();};if(filter){filter.addEventListener("input",applyFilter);}applyFilter();if(form&&output&&submit){form.addEventListener("submit",async(event)=>{event.preventDefault();submit.disabled=true;output.dataset.state="busy";output.textContent="Uploading asset...";const fd=new FormData(form);try{const res=await fetch("/api/assets/upload",{method:"POST",body:fd});const json=await res.json();output.dataset.state=res.ok?"success":"error";output.textContent=JSON.stringify(json,null,2);if(res.ok&&json&&json.data&&json.data.assetId){window.location.href="/ui/assets?assetId="+encodeURIComponent(json.data.assetId);}}catch(error){output.dataset.state="error";output.textContent=String(error);}finally{submit.disabled=false;}});}</script>`;

  return `${ASSET_PAGE_STYLE}${heroSection}<section class="asset-shell"><div class="asset-left-rail"><section class="card asset-upload-card"><div class="asset-section-head"><div><p class="asset-kicker">Intake</p><h2>Upload Asset</h2><p class="asset-copy">Upload a new source file and land directly on its object detail. Use this for references, views, backgrounds, or chart inputs.</p></div></div><form id="asset-upload-form" enctype="multipart/form-data" class="grid"><div class="grid two"><label>Asset Type<select name="assetType"><option value="character_reference">character_reference (reference)</option><option value="character_view">character_view (view)</option><option value="background">background</option><option value="chart_source">chart_source</option></select></label><label>File<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label></div><button id="asset-upload-submit" type="submit" data-primary-action="1" data-primary-label="Upload asset and open detail">Upload asset</button></form><p class="asset-inline-note">Accepted formats: PNG, JPEG, WebP. After a successful upload, this surface reopens on the new asset object automatically.</p><pre id="asset-upload-result" class="asset-output" data-state="idle" role="status" aria-live="polite" aria-atomic="true">Waiting for upload...</pre></section><section class="card asset-guide-card"><div class="asset-section-head"><div><p class="asset-kicker">Review Protocol</p><h2>Keep the help layer short</h2><p class="asset-copy">Use this page to answer only three questions before you leave it.</p></div></div><ol class="asset-guide-list"><li>Is the selected object the correct asset for the next route?</li><li>Does QC or preview availability block the handoff?</li><li>Do you need raw payloads, or is the summary enough for the next decision?</li></ol></section></div><div class="asset-main-col"><section class="card asset-list-card"><div class="asset-section-head"><div><p class="asset-kicker">Review Queue</p><h2>Recent Assets</h2><p class="asset-copy">Choose one asset and keep the inspector visible while you decide the next route. This list is for selection, not deep evidence reading.</p></div><span id="asset-filter-count" class="asset-counter">0 / 0 shown</span></div><div class="asset-table-tools"><input id="asset-filter" type="search" autocomplete="off" aria-label="Filter recent assets" placeholder="Filter by id, type, status, or QC" /><span class="asset-filter-note">This is a local filter over the currently loaded rows.</span></div><div class="asset-table-wrap"><table id="asset-table"><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>QC</th><th>MIME</th><th>Size</th><th>Created At</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, "No assets yet.")
  }</tbody></table></div></section></div><div class="asset-right-rail">${inspectorRail}${selectedDetails}${nextActions}${linkedRoutes}${creationNav}</div></section>${clientScript}${creationNavScript}`;
}
