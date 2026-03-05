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
        `<div class="preview-card"><h4>${esc(entry.label)}</h4><p><code>${esc(entry.key)}</code></p>${
          entry.localExists
            ? `<img src="${esc(entry.url)}" alt="${esc(entry.label)} preview"/>`
            : `<p>${t.localPreviewMissing}</p>`
        }<p><a href="${esc(entry.url)}">${t.openPreview}: ${esc(entry.label)}</a></p></div>`
      )
      .join("")
    : "";

  const selectedDetails = input.selectedAsset
    ? `<div class="card"><h3>${t.selectedAsset}</h3><p>ID: <strong>${esc(input.selectedAsset.id)}</strong></p><p>Status: <span class="badge ${esc(
        input.selectedAsset.statusClassName
      )}">${esc(input.selectedAsset.status)}</span></p><p>QC: <span class="badge ${esc(input.selectedAsset.qcClassName)}" title="${esc(
        input.selectedAsset.qcReason
      )}">${esc(input.selectedAsset.qcLevel)}</span></p><p>MIME: <code>${esc(input.selectedAsset.mime)}</code></p><p>original: <code>${esc(
        input.selectedAsset.originalKey
      )}</code></p><p>normalized-1024: <code>${esc(input.selectedAsset.normalized1024Key)}</code></p><p>normalized-2048: <code>${esc(
        input.selectedAsset.normalized2048Key
      )}</code></p><p><a href="/api/assets/${encodeURIComponent(input.selectedAsset.id)}">${t.openJson}</a></p>${
        previewCards.length > 0 ? `<div class="preview-grid">${previewCards}</div>` : `<p>${t.noPreviewImages}</p>`
      }<pre>${esc(input.selectedAsset.qcJson)}</pre></div>`
    : `<div class="card"><h3>${t.selectedAsset}</h3><p>${t.noSelectedAsset}</p></div>`;

  return `<style>.asset-shell{display:grid;gap:12px;grid-template-columns:minmax(360px,1fr) minmax(460px,1.35fr)}.asset-table-wrap{max-height:420px;overflow:auto;border:1px solid #dce5f3;border-radius:10px}.asset-table-wrap table{margin:0}.asset-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.preview-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:10px}.preview-card{border:1px solid #dce5f3;border-radius:10px;padding:10px;background:#f9fcff}.preview-card img{display:block;width:100%;max-height:220px;object-fit:contain;border:1px solid #dce5f3;border-radius:8px;background:#fff}@media (max-width:1100px){.asset-shell{grid-template-columns:1fr}}</style><section class="card"><h1>${t.title}</h1><div class="notice">${t.intro.replace(
    "Studio",
    '<a href="/ui/studio">Studio</a>'
  )}</div></section><section class="asset-shell"><section class="card"><h2>${t.upload}</h2><form id="asset-upload-form" enctype="multipart/form-data" class="grid"><div class="grid two"><label>Asset Type<select name="assetType"><option value="character_reference">character_reference (reference)</option><option value="character_view">character_view (view variant)</option><option value="background">background (environment)</option><option value="chart_source">chart_source (chart source)</option></select></label><label>File<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label></div><button id="asset-upload-submit" type="submit">${t.uploadAction}</button></form><pre id="asset-upload-result">${t.uploadResultIdle}</pre></section><section class="card"><div class="asset-head"><h2 style="margin:0">${t.recentAssets}</h2><input id="asset-filter" placeholder="${t.filterPlaceholder}" /></div><div class="asset-table-wrap"><table id="asset-table"><thead><tr><th>${t.columns.id}</th><th>${t.columns.type}</th><th>${t.columns.status}</th><th>${t.columns.qc}</th><th>${t.columns.mime}</th><th>${t.columns.size}</th><th>${t.columns.created}</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noAssets)
  }</tbody></table></div></section></section>${selectedDetails}<script>const form=document.getElementById(\"asset-upload-form\");const output=document.getElementById(\"asset-upload-result\");const submit=document.getElementById(\"asset-upload-submit\");const filter=document.getElementById(\"asset-filter\");const assetTable=document.getElementById(\"asset-table\");const applyFilter=()=>{if(!(filter instanceof HTMLInputElement)||!(assetTable instanceof HTMLTableElement))return;const q=filter.value.trim().toLowerCase();assetTable.querySelectorAll(\"tbody tr\").forEach((row)=>{if(!(row instanceof HTMLElement))return;const text=String(row.textContent||\"\").toLowerCase();row.style.display=!q||text.includes(q)?\"\":\"none\";});};if(filter){filter.addEventListener(\"input\",applyFilter);}if(form&&output&&submit){form.addEventListener(\"submit\",async(event)=>{event.preventDefault();submit.disabled=true;output.textContent=${JSON.stringify(
    t.uploadInProgress
  )};const fd=new FormData(form);try{const res=await fetch(\"/api/assets/upload\",{method:\"POST\",body:fd});const json=await res.json();output.textContent=JSON.stringify(json,null,2);if(res.ok&&json&&json.data&&json.data.assetId){window.location.href=\"/ui/assets?assetId=\"+encodeURIComponent(json.data.assetId);} }catch(error){output.textContent=String(error);}finally{submit.disabled=false;}});}</script>`;
}

