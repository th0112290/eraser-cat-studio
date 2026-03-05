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
  const previewCards = input.previews.length
    ? input.previews
      .map(
        (entry) =>
          `<div class="preview-card"><h4>${esc(entry.label)}</h4><p><code>${esc(entry.key)}</code></p>${entry.localExists ? `<img src="${esc(entry.url)}" alt="${esc(entry.label)} 미리보기"/>` : "<p>로컬 미리보기 파일을 찾을 수 없습니다.</p>"}<p><a href="${esc(entry.url)}">열기: ${esc(entry.label)}</a></p></div>`
      )
      .join("")
    : "";

  const selectedDetails = input.selectedAsset
    ? `<div class="card"><h3>선택한 에셋</h3><p>ID: <strong>${esc(input.selectedAsset.id)}</strong></p><p>상태: <span class="badge ${esc(input.selectedAsset.statusClassName)}">${esc(input.selectedAsset.status)}</span></p><p>QC: <span class="badge ${esc(input.selectedAsset.qcClassName)}" title="${esc(input.selectedAsset.qcReason)}">${esc(input.selectedAsset.qcLevel)}</span></p><p>MIME: <code>${esc(input.selectedAsset.mime)}</code></p><p>원본 키: <code>${esc(input.selectedAsset.originalKey)}</code></p><p>정규화 1024: <code>${esc(input.selectedAsset.normalized1024Key)}</code></p><p>정규화 2048: <code>${esc(input.selectedAsset.normalized2048Key)}</code></p><p><a href="/api/assets/${encodeURIComponent(input.selectedAsset.id)}">JSON 열기</a></p>${previewCards.length > 0 ? `<div class="preview-grid">${previewCards}</div>` : "<p>미리보기 가능한 이미지가 없습니다.</p>"}<pre>${esc(input.selectedAsset.qcJson)}</pre></div>`
    : `<div class="card"><h3>선택한 에셋</h3><p>에셋이 없습니다.</p></div>`;

  return `<style>.asset-shell{display:grid;gap:12px;grid-template-columns:minmax(360px,1fr) minmax(460px,1.35fr)}.asset-table-wrap{max-height:420px;overflow:auto;border:1px solid #dce5f3;border-radius:10px}.asset-table-wrap table{margin:0}.asset-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.preview-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:10px}.preview-card{border:1px solid #dce5f3;border-radius:10px;padding:10px;background:#f9fcff}.preview-card img{display:block;width:100%;max-height:220px;object-fit:contain;border:1px solid #dce5f3;border-radius:8px;background:#fff}@media (max-width:1100px){.asset-shell{grid-template-columns:1fr}}</style><section class="card"><h1>에셋 (상세 모드)</h1><div class="notice">빠른 작업은 <a href="/ui/studio">통합 스튜디오</a>에서 진행하고, 이 페이지는 에셋 검수/세부 점검에 사용하세요.</div></section><section class="asset-shell"><section class="card"><h2>업로드</h2><form id="asset-upload-form" enctype="multipart/form-data" class="grid"><div class="grid two"><label>에셋 유형<select name="assetType"><option value="character_reference">character_reference (레퍼런스)</option><option value="character_view">character_view (뷰 변형)</option><option value="background">background (배경)</option><option value="chart_source">chart_source (차트 소스)</option></select></label><label>파일<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label></div><button id="asset-upload-submit" type="submit">업로드 + 에셋 처리 시작</button></form><pre id="asset-upload-result">대기 중</pre></section><section class="card"><div class="asset-head"><h2 style="margin:0">최근 에셋</h2><input id="asset-filter" placeholder="검색 (ID/유형/상태)" /></div><div class="asset-table-wrap"><table id="asset-table"><thead><tr><th>ID</th><th>유형</th><th>상태</th><th>QC</th><th>MIME</th><th>용량</th><th>생성 시각</th></tr></thead><tbody>${input.rows || '<tr><td colspan="7">에셋이 없습니다.</td></tr>'}</tbody></table></div></section></section>${selectedDetails}<script>const form=document.getElementById(\"asset-upload-form\");const output=document.getElementById(\"asset-upload-result\");const submit=document.getElementById(\"asset-upload-submit\");const filter=document.getElementById(\"asset-filter\");const assetTable=document.getElementById(\"asset-table\");const applyFilter=()=>{if(!(filter instanceof HTMLInputElement)||!(assetTable instanceof HTMLTableElement))return;const q=filter.value.trim().toLowerCase();assetTable.querySelectorAll(\"tbody tr\").forEach((row)=>{if(!(row instanceof HTMLElement))return;const text=String(row.textContent||\"\").toLowerCase();row.style.display=!q||text.includes(q)?\"\":\"none\";});};if(filter){filter.addEventListener(\"input\",applyFilter);}if(form&&output&&submit){form.addEventListener(\"submit\",async(event)=>{event.preventDefault();submit.disabled=true;output.textContent=\"업로드 중...\";const fd=new FormData(form);try{const res=await fetch(\"/api/assets/upload\",{method:\"POST\",body:fd});const json=await res.json();output.textContent=JSON.stringify(json,null,2);if(res.ok&&json&&json.data&&json.data.assetId){window.location.href=\"/ui/assets?assetId=\"+encodeURIComponent(json.data.assetId);} }catch(error){output.textContent=String(error);}finally{submit.disabled=false;}});}</script>`;
}
