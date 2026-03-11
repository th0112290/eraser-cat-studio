import { renderTableEmptyRow, UI_TEXT } from "./uiText";

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

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildAssetsPageBody(input: AssetsPageBodyInput): string {
  const t = UI_TEXT.assets;
  const previewCards = input.previews.length
    ? input.previews
      .map((entry) =>
        `<article class="preview-card"><div class="preview-head"><div><h4>${esc(entry.label)}</h4><p><code>${esc(entry.key)}</code></p></div><span class="asset-mini-badge ${
          entry.localExists ? "asset-mini-badge-ready" : "asset-mini-badge-muted"
        }">${entry.localExists ? "ready" : "missing"}</span></div>${
          entry.localExists
            ? `<div class="preview-frame"><img src="${esc(entry.url)}" alt="${esc(entry.label)} preview" loading="lazy" width="960" height="960"/></div>`
            : `<div class="asset-empty asset-empty-inline"><strong>${t.localPreviewMissing}</strong><span>Open the asset URL if the processed local output has not landed yet.</span></div>`
        }<p><a href="${esc(entry.url)}">${t.openPreview}: ${esc(entry.label)}</a></p></article>`
      )
      .join("")
    : "";

  const selectedDetails = input.selectedAsset
    ? `<aside class="card asset-detail-panel"><div class="asset-section-head"><div><p class="asset-kicker">Inspection</p><h2>${t.selectedAsset}</h2><p class="asset-copy">Inspect the selected record, confirm QC status, and open locally rendered previews without leaving the advanced view.</p></div><div class="asset-link-row"><a class="asset-link-chip" href="/api/assets/${encodeURIComponent(
        input.selectedAsset.id
      )}">${t.openJson}</a></div></div><div class="asset-summary-grid"><div class="asset-summary-card"><span>ID</span><strong>${esc(
        input.selectedAsset.id
      )}</strong></div><div class="asset-summary-card"><span>Status</span><strong><span class="badge ${esc(
        input.selectedAsset.statusClassName
      )}">${esc(input.selectedAsset.status)}</span></strong></div><div class="asset-summary-card"><span>QC</span><strong><span class="badge ${esc(
        input.selectedAsset.qcClassName
      )}" title="${esc(input.selectedAsset.qcReason)}">${esc(input.selectedAsset.qcLevel)}</span></strong></div><div class="asset-summary-card"><span>MIME</span><strong><code>${esc(
        input.selectedAsset.mime
      )}</code></strong></div></div><div class="asset-meta-grid"><div><span>original</span><code>${esc(
        input.selectedAsset.originalKey
      )}</code></div><div><span>normalized-1024</span><code>${esc(input.selectedAsset.normalized1024Key)}</code></div><div><span>normalized-2048</span><code>${esc(
        input.selectedAsset.normalized2048Key
      )}</code></div><div><span>QC reason</span><code>${esc(input.selectedAsset.qcReason || "-")}</code></div></div>${
        previewCards.length > 0
          ? `<div><div class="asset-subhead"><h3>Preview Outputs</h3><p>Use these local artifacts to confirm crops, normalization, and publish-ready handoff.</p></div><div class="preview-grid">${previewCards}</div></div>`
          : `<div class="asset-empty"><strong>${t.noPreviewImages}</strong><span>Preview cards will appear here when the asset pipeline produces local image outputs.</span></div>`
      }<details class="asset-json"><summary>QC payload</summary><pre>${esc(input.selectedAsset.qcJson)}</pre></details></aside>`
    : `<aside class="card asset-detail-panel asset-detail-empty"><div class="asset-section-head"><div><p class="asset-kicker">Inspection</p><h2>${t.selectedAsset}</h2><p class="asset-copy">Pick an asset from the list or land here from upload redirect to inspect previews, storage keys, and QC payload.</p></div></div><div class="asset-empty"><strong>${t.noSelectedAsset}</strong><span>Use the recent asset table on the left to move this panel into inspection mode.</span></div></aside>`;

  return `<style>.asset-hero,.asset-upload-card,.asset-list-card,.asset-detail-panel{position:relative;overflow:hidden;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 18px 44px rgba(15,23,42,.07)}.asset-hero::before,.asset-upload-card::before,.asset-list-card::before,.asset-detail-panel::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#1257c7,rgba(18,87,199,.16))}.asset-hero,.asset-upload-card,.asset-list-card,.asset-detail-panel{padding:18px}.asset-hero{display:grid;gap:14px;grid-template-columns:minmax(0,1.2fr) minmax(220px,.8fr);background:linear-gradient(180deg,#fbfdff,#f3f7fd)}.asset-shell{display:grid;gap:14px;grid-template-columns:minmax(360px,1fr) minmax(460px,1.08fr);align-items:start}.asset-main-col{display:grid;gap:14px}.asset-kicker{margin:0 0 8px;color:#1257c7;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.asset-copy,.asset-subhead p{margin:8px 0 0;color:#5b6b82;font-size:14px;line-height:1.55}.asset-link-row{display:flex;gap:8px;flex-wrap:wrap}.asset-link-chip{display:inline-flex;align-items:center;padding:8px 11px;border-radius:999px;border:1px solid #d4deec;background:#fff;color:#142033;font-size:12px;font-weight:700;text-decoration:none}.asset-link-chip:hover{text-decoration:none;box-shadow:0 10px 20px rgba(18,87,199,.08)}.asset-shell label,.asset-hero label{display:grid;gap:6px;color:#142033;font-size:13px;font-weight:600}.asset-shell input:not([type=file]),.asset-shell select,.asset-hero input:not([type=file]),.asset-hero select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d4deec;border-radius:12px;background:#fff;color:#142033}.asset-shell input[type=file]{padding:9px 10px;border:1px dashed #c1d2e7;border-radius:12px;background:#fff}.asset-shell input:not([type=file]):focus,.asset-shell select:focus,.asset-hero input:not([type=file]):focus,.asset-hero select:focus{outline:none;border-color:#8eb1ef;box-shadow:0 0 0 3px rgba(18,87,199,.12)}.asset-shell button{appearance:none;padding:10px 14px;border-radius:12px;border:1px solid #0f4aad;background:linear-gradient(180deg,#1660d0,#0f4fad);color:#fff;font-weight:700;cursor:pointer;box-shadow:0 12px 24px rgba(18,87,199,.18)}.asset-inline-note{margin:12px 0 0;color:#5b6b82;font-size:12px}.asset-output{margin:14px 0 0;min-height:120px;padding:14px 16px;border-radius:16px;border:1px solid #233554;background:linear-gradient(180deg,#0f1726,#142033);color:#dfe9ff;overflow:auto;font-size:12px;line-height:1.55}.asset-output[data-state=busy]{border-color:#385b91}.asset-output[data-state=error]{border-color:#7a2818;background:linear-gradient(180deg,#2a1110,#3a1513)}.asset-output[data-state=success]{border-color:#1d5d47}.asset-section-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.asset-table-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}.asset-counter{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid #c8d9fb;background:#ebf3ff;color:#1257c7;font-size:12px;font-weight:700}.asset-filter-note{color:#5b6b82;font-size:12px}.asset-table-wrap{margin-top:12px;max-height:440px;overflow:auto;border:1px solid #dce5f3;border-radius:16px;background:#fff}.asset-table-wrap table{margin:0;min-width:100%;border-collapse:separate;border-spacing:0}.asset-table-wrap thead th{position:sticky;top:0;background:#f6f9ff;z-index:1}.asset-table-wrap tbody tr:hover{background:#f8fbff}.asset-table-wrap tbody tr[data-selected=true]{background:#eef4ff;box-shadow:inset 3px 0 0 #1257c7}.asset-table-wrap .notice{margin:0;border:1px dashed #d4deec;background:#f8fbff;color:#47627e}.asset-detail-panel{position:sticky;top:14px}.asset-summary-grid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:16px}.asset-summary-card{padding:12px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}.asset-summary-card span{display:block;margin-bottom:8px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.asset-summary-card strong{display:block;font-size:14px;line-height:1.45}.asset-summary-card code,.asset-meta-grid code,.preview-card code,.asset-output,.asset-json pre{font-family:"IBM Plex Mono","Cascadia Code","SFMono-Regular",Consolas,monospace}.asset-meta-grid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}.asset-meta-grid div{padding:12px;border:1px solid #d4deec;border-radius:14px;background:#fff}.asset-meta-grid span{display:block;margin-bottom:8px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.asset-subhead{margin-top:18px}.asset-subhead h3{margin:0;font-size:18px}.preview-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:12px}.preview-card{border:1px solid #dce5f3;border-radius:14px;padding:12px;background:#f9fcff}.preview-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.preview-card h4{margin:0 0 8px}.preview-card p{margin:8px 0 0;color:#5b6b82;font-size:13px;line-height:1.5}.preview-frame{margin-top:10px;padding:10px;border:1px solid #dce5f3;border-radius:12px;background:#fff}.preview-frame img{display:block;width:100%;max-height:220px;object-fit:contain}.asset-mini-badge{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid #d4deec;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.asset-mini-badge-ready{background:#effcf5;border-color:#b8e7c8;color:#0f6b45}.asset-mini-badge-muted{background:#f5f7fb;color:#5b6b82}.asset-empty{display:grid;gap:6px;padding:14px 16px;border:1px dashed #d4deec;border-radius:14px;background:#f8fbff;color:#5b6b82;margin-top:16px}.asset-empty strong{color:#142033}.asset-empty-inline{margin-top:10px}.asset-json{margin-top:18px;border:1px solid #d6e0ef;border-radius:14px;background:#fbfcfe}.asset-json summary{cursor:pointer;padding:12px 14px;font-weight:700}.asset-json pre{margin:0;padding:0 14px 14px;overflow:auto;color:#27354a}.badge{display:inline-flex;align-items:center}.asset-hero-links{display:flex;gap:8px;flex-wrap:wrap;align-content:flex-start}.asset-detail-empty{position:static}@media (max-width:1100px){.asset-hero,.asset-shell,.asset-summary-grid,.asset-meta-grid{grid-template-columns:1fr}.asset-detail-panel{position:static}}</style><section class="card asset-hero"><div><p class="asset-kicker">Asset Inspection</p><h1>${t.title}</h1><p class="asset-copy">${t.intro.replace(
    "Studio",
    '<a href="/ui/studio">Studio</a>'
  )}</p></div><div class="asset-hero-links"><a href="/ui/studio" class="asset-link-chip">Open Studio</a><a href="/api/assets" class="asset-link-chip">Open /api/assets</a></div></section><section class="asset-shell"><div class="asset-main-col"><section class="card asset-upload-card"><div class="asset-section-head"><div><p class="asset-kicker">Intake</p><h2>${t.upload}</h2><p class="asset-copy">Push a source image into the asset pipeline and jump straight into inspection when processing starts.</p></div></div><form id="asset-upload-form" enctype="multipart/form-data" class="grid"><div class="grid two"><label>Asset Type<select name="assetType"><option value="character_reference">character_reference (reference)</option><option value="character_view">character_view (view variant)</option><option value="background">background (environment)</option><option value="chart_source">chart_source (chart source)</option></select></label><label>File<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label></div><button id="asset-upload-submit" type="submit">${t.uploadAction}</button></form><p class="asset-inline-note">Supported inputs: PNG, JPEG, WebP. Successful upload redirects to the new asset detail record.</p><pre id="asset-upload-result" class="asset-output" data-state="idle" role="status" aria-live="polite" aria-atomic="true">${t.uploadResultIdle}</pre></section><section class="card asset-list-card"><div class="asset-section-head"><div><p class="asset-kicker">Queue</p><h2>${t.recentAssets}</h2><p class="asset-copy">Filter the current server slice and open an asset row to inspect previews and QC payload.</p></div><span id="asset-filter-count" class="asset-counter">0 visible</span></div><div class="asset-table-tools"><input id="asset-filter" type="search" autocomplete="off" aria-label="Filter recent assets" placeholder="${t.filterPlaceholder}" /><span class="asset-filter-note">Local filter on the currently loaded rows.</span></div><div class="asset-table-wrap"><table id="asset-table"><thead><tr><th>${t.columns.id}</th><th>${t.columns.type}</th><th>${t.columns.status}</th><th>${t.columns.qc}</th><th>${t.columns.mime}</th><th>${t.columns.size}</th><th>${t.columns.created}</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noAssets)
  }</tbody></table></div></section></div>${selectedDetails}</section><script>const selectedAssetId=${JSON.stringify(
    input.selectedAsset?.id ?? ""
  )};const form=document.getElementById(\"asset-upload-form\");const output=document.getElementById(\"asset-upload-result\");const submit=document.getElementById(\"asset-upload-submit\");const filter=document.getElementById(\"asset-filter\");const assetTable=document.getElementById(\"asset-table\");const filterCount=document.getElementById(\"asset-filter-count\");const updateCount=()=>{if(!(assetTable instanceof HTMLTableElement))return;let total=0;let visible=0;assetTable.querySelectorAll(\"tbody tr\").forEach((row)=>{if(!(row instanceof HTMLElement))return;const text=String(row.textContent||\"\").trim();const hasDataRow=!!row.querySelector(\"a\")||row.querySelectorAll(\"td\").length>1;if(hasDataRow)total+=1;if(hasDataRow&&row.style.display!==\"none\")visible+=1;const firstCell=hasDataRow?row.querySelector(\"td\"):null;row.dataset.selected=selectedAssetId&&firstCell&&String(firstCell.textContent||\"\").trim()===selectedAssetId?\"true\":\"false\";});if(filterCount instanceof HTMLElement)filterCount.textContent=visible+\" of \"+total+\" visible\";};const applyFilter=()=>{if(!(filter instanceof HTMLInputElement)||!(assetTable instanceof HTMLTableElement))return;const q=filter.value.trim().toLowerCase();assetTable.querySelectorAll(\"tbody tr\").forEach((row)=>{if(!(row instanceof HTMLElement))return;const text=String(row.textContent||\"\").toLowerCase();row.style.display=!q||text.includes(q)?\"\":\"none\";});updateCount();};if(filter){filter.addEventListener(\"input\",applyFilter);}applyFilter();if(form&&output&&submit){form.addEventListener(\"submit\",async(event)=>{event.preventDefault();submit.disabled=true;output.dataset.state=\"busy\";output.textContent=${JSON.stringify(
    t.uploadInProgress
  )};const fd=new FormData(form);try{const res=await fetch(\"/api/assets/upload\",{method:\"POST\",body:fd});const json=await res.json();output.dataset.state=res.ok?\"success\":\"error\";output.textContent=JSON.stringify(json,null,2);if(res.ok&&json&&json.data&&json.data.assetId){window.location.href=\"/ui/assets?assetId=\"+encodeURIComponent(json.data.assetId);} }catch(error){output.dataset.state=\"error\";output.textContent=String(error);}finally{submit.disabled=false;}});}</script>`;
}

