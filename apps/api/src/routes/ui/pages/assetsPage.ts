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

const ASSET_PAGE_STYLE = `<style>
.asset-hero,.asset-upload-card,.asset-list-card,.asset-detail-panel,.asset-guide-card,.asset-next-card{position:relative;overflow:hidden;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 18px 44px rgba(15,23,42,.07)}
.asset-hero::before,.asset-upload-card::before,.asset-list-card::before,.asset-detail-panel::before,.asset-guide-card::before,.asset-next-card::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#1257c7,rgba(18,87,199,.16))}
.asset-hero,.asset-upload-card,.asset-list-card,.asset-detail-panel,.asset-guide-card,.asset-next-card{padding:16px}
.asset-hero{display:grid;gap:12px;background:linear-gradient(180deg,#fbfdff,#f5f8fd)}
.asset-shell{display:grid;gap:12px;grid-template-columns:minmax(280px,.78fr) minmax(0,1.08fr) minmax(340px,.94fr);align-items:start}
.asset-left-rail,.asset-main-col,.asset-right-rail{display:grid;gap:12px}
.asset-right-rail{position:sticky;top:10px}
.asset-flow-grid{display:grid;gap:8px;grid-template-columns:repeat(4,minmax(0,1fr))}
.asset-flow-step{display:grid;gap:4px;padding:10px 12px;border:1px solid #d6e0ef;border-radius:14px;background:linear-gradient(180deg,#fff,#f7fbff)}
.asset-flow-step strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#215378}
.asset-flow-step span{font-size:12px;color:#506273;line-height:1.45}
.asset-kicker{margin:0 0 6px;color:#1257c7;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.asset-copy,.asset-subhead p,.asset-guide-list li,.asset-next-item span{margin:6px 0 0;color:#5b6b82;font-size:13px;line-height:1.5}
.asset-link-row,.asset-link-grid,.asset-hero-links{display:flex;gap:8px;flex-wrap:wrap}
.asset-link-chip{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid #d4deec;background:#fff;color:#142033;font-size:12px;font-weight:700;text-decoration:none}
.asset-link-chip:hover{text-decoration:none;box-shadow:0 10px 20px rgba(18,87,199,.08)}
.asset-shell label,.asset-hero label{display:grid;gap:6px;color:#142033;font-size:13px;font-weight:600}
.asset-shell input:not([type=file]),.asset-shell select,.asset-hero input:not([type=file]),.asset-hero select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d4deec;border-radius:12px;background:#fff;color:#142033}
.asset-shell input[type=file]{padding:9px 10px;border:1px dashed #c1d2e7;border-radius:12px;background:#fff}
.asset-shell input:not([type=file]):focus,.asset-shell select:focus,.asset-hero input:not([type=file]):focus,.asset-hero select:focus{outline:none;border-color:#8eb1ef;box-shadow:0 0 0 3px rgba(18,87,199,.12)}
.asset-shell button{appearance:none;padding:10px 14px;border-radius:12px;border:1px solid #0f4aad;background:linear-gradient(180deg,#1660d0,#0f4fad);color:#fff;font-weight:700;cursor:pointer;box-shadow:0 12px 24px rgba(18,87,199,.18)}
.asset-inline-note{margin:10px 0 0;color:#5b6b82;font-size:12px}
.asset-output{margin:12px 0 0;min-height:120px;padding:14px 16px;border-radius:16px;border:1px solid #233554;background:linear-gradient(180deg,#0f1726,#142033);color:#dfe9ff;overflow:auto;font-size:12px;line-height:1.55}
.asset-output[data-state=busy]{border-color:#385b91}
.asset-output[data-state=error]{border-color:#7a2818;background:linear-gradient(180deg,#2a1110,#3a1513)}
.asset-output[data-state=success]{border-color:#1d5d47}
.asset-section-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.asset-table-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px}
.asset-counter{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid #c8d9fb;background:#ebf3ff;color:#1257c7;font-size:12px;font-weight:700}
.asset-filter-note{color:#5b6b82;font-size:12px}
.asset-table-wrap{margin-top:10px;max-height:520px;overflow:auto;border:1px solid #dce5f3;border-radius:16px;background:#fff}
.asset-table-wrap table{margin:0;min-width:100%;border-collapse:separate;border-spacing:0}
.asset-table-wrap thead th{position:sticky;top:0;background:#f6f9ff;z-index:1}
.asset-table-wrap tbody tr:hover{background:#f8fbff}
.asset-table-wrap tbody tr[data-selected=true]{background:#eef4ff;box-shadow:inset 3px 0 0 #1257c7}
.asset-table-wrap .notice{margin:0;border:1px dashed #d4deec;background:#f8fbff;color:#47627e}
.asset-summary-grid{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}
.asset-summary-card{padding:10px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
.asset-summary-card span{display:block;margin-bottom:6px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.asset-summary-card strong{display:block;font-size:14px;line-height:1.45}
.asset-summary-card code,.asset-meta-grid code,.preview-card code,.asset-output,.asset-json pre{font-family:"IBM Plex Mono","Cascadia Code","SFMono-Regular",Consolas,monospace}
.asset-meta-grid{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px}
.asset-meta-grid div{padding:10px;border:1px solid #d4deec;border-radius:14px;background:#fff}
.asset-meta-grid span{display:block;margin-bottom:6px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
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
.asset-json summary{cursor:pointer;padding:12px 14px;font-weight:700}
.asset-json pre{margin:0;padding:0 14px 14px;overflow:auto;color:#27354a}
.asset-guide-card h2,.asset-upload-card h2,.asset-list-card h2,.asset-detail-panel h2,.asset-next-card h2{margin:0;font-size:20px}
.asset-guide-list{margin:12px 0 0;padding-left:18px;display:grid;gap:8px}
.asset-next-grid{display:grid;gap:10px;margin-top:12px}
.asset-next-item{display:grid;gap:6px;padding:12px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fff,#f8fbff)}
.asset-next-item strong{font-size:13px}
.asset-route-card{padding:16px}
.asset-route-grid{display:grid;gap:10px;margin-top:12px}
.asset-route-item{display:grid;gap:6px;padding:12px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fff,#f8fbff)}
.asset-route-item strong{font-size:13px}
.asset-route-item p{margin:0;color:#5b6b82;font-size:13px;line-height:1.5}
.asset-route-item .asset-link-grid{margin-top:2px}
.badge{display:inline-flex;align-items:center}
.asset-detail-empty{position:static}
@media (max-width:1200px){.asset-shell,.asset-flow-grid,.asset-summary-grid,.asset-meta-grid{grid-template-columns:1fr}.asset-right-rail{position:static}}
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
  const t = UI_TEXT.assets;
  const primaryPreviewHref = input.previews.length > 0 ? input.previews[0]?.url ?? "" : "";
  const qcLevel = input.selectedAsset?.qcLevel ?? "";
  const assetLooksReady = /pass|ready|ok/i.test(qcLevel);
  const assetQcPending = /n\/a/i.test(qcLevel);

  const previewCards = input.previews.length
    ? input.previews
        .map((entry) => {
          const previewBody = entry.localExists
            ? `<div class="preview-frame"><img src="${esc(entry.url)}" alt="${esc(entry.label)} 프리뷰" loading="lazy" width="960" height="960"/></div>`
            : `<div class="asset-empty asset-empty-inline"><strong>${t.localPreviewMissing}</strong><span>처리된 로컬 출력이 아직 생성되지 않았다면 원본 에셋 URL을 열어 확인하세요.</span></div>`;

          return `<article class="preview-card"><div class="preview-head"><div><h4>${esc(entry.label)}</h4><p><code>${esc(entry.key)}</code></p></div><span class="asset-mini-badge ${
            entry.localExists ? "asset-mini-badge-ready" : "asset-mini-badge-muted"
          }">${entry.localExists ? "준비됨" : "없음"}</span></div>${previewBody}<p><a href="${esc(entry.url)}">${t.openPreview}: ${esc(
            entry.label
          )}</a></p></article>`;
        })
        .join("")
    : "";

  const qcHeadline = input.selectedAsset
    ? /pass|ready|ok/i.test(input.selectedAsset.qcLevel)
      ? "QC가 다운스트림 작업으로 넘기기에 충분히 안정적입니다."
      : /n\/a/i.test(input.selectedAsset.qcLevel)
        ? "QC가 아직 명확한 판정을 내리지 못했습니다."
        : "인계 전에 의도적인 점검이 필요합니다."
    : "검토 큐에서 항목을 선택하면 점검 패널과 다음 액션이 열립니다.";

  const qcDetail = input.selectedAsset
    ? `상태 ${input.selectedAsset.status} / QC ${input.selectedAsset.qcLevel}. 다음 단계로 넘기기 전 프리뷰와 JSON을 함께 확인하세요.`
    : "검토 큐에서 에셋을 선택한 뒤 스튜디오로 되돌릴지, 캐릭터 생성기에 투입할지, 계속 점검에 둘지 결정하세요.";

  const inspectorRail = `<section class="card asset-route-card"><div class="asset-section-head"><div><p class="asset-kicker">Sticky Inspector</p><h2>고정 점검 레일</h2><p class="asset-copy">가운데 검토 큐에서 선택한 항목이 이 오른쪽 레일에 고정됩니다. 점검, 다음 액션, 링크된 경로를 한 흐름에서 읽으세요.</p></div></div><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/studio">빠른 흐름은 Studio</a><a class="asset-link-chip" href="/ui/characters">깊은 팩 리뷰는 Characters</a></div></section>`;

  const nextActions = input.selectedAsset
    ? `<section class="card asset-next-card"><div class="asset-section-head"><div><p class="asset-kicker">다음 액션</p><h2>${t.nextActions}</h2><p class="asset-copy">${qcHeadline}</p></div></div><div class="asset-next-grid"><article class="asset-next-item"><strong>1. 출력 확인</strong><span>${qcDetail}</span><div class="asset-link-grid"><a class="asset-link-chip" href="/api/assets/${encodeURIComponent(
        input.selectedAsset.id
      )}">${t.openJson}</a>${
        primaryPreviewHref ? `<a class="asset-link-chip" href="${esc(primaryPreviewHref)}">${t.openPreview}</a>` : ""
      }</div></article><article class="asset-next-item"><strong>2. 에셋을 다음 단계로 라우팅</strong><span>${
        assetLooksReady
          ? "이 에셋이 새 생성 런의 기준점이 될 준비가 되었습니다. 빠른 전환은 Studio, 단계형 생성은 Character Generator에서 이어가세요."
          : assetQcPending
            ? "QC 판정이 아직 열려 있습니다. 빠른 디스패치 전에 Studio에서 맥락을 묶고, 필요하면 이 화면에 머물며 점검을 마무리하세요."
            : "다운스트림에 넘기기 전 검토가 더 필요합니다. 생성기로 넘기기보다 스튜디오나 현재 점검 레일에서 먼저 기준을 정리하세요."
      }</span><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/studio">스튜디오 열기</a><a class="asset-link-chip" href="/ui/character-generator">캐릭터 생성기 열기</a></div></article><article class="asset-next-item"><strong>3. 복구 맥락 보존</strong><span>승인, 비교, 롤백 결정을 뒷받침할 수 있도록 JSON과 프리뷰 출력을 함께 유지하세요.</span><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/jobs">작업 열기</a><a class="asset-link-chip" href="/ui/assets?assetId=${encodeURIComponent(
        input.selectedAsset.id
      )}">이 점검 화면 유지</a></div></article></div></section>`
    : `<section class="card asset-next-card"><div class="asset-section-head"><div><p class="asset-kicker">다음 액션</p><h2>${t.nextActions}</h2><p class="asset-copy">${qcHeadline}</p></div></div><div class="asset-empty"><strong>${t.noSelectedAsset}</strong><span>${qcDetail}</span></div><div class="asset-link-grid" style="margin-top:12px"><a class="asset-link-chip" href="/ui/studio">스튜디오 열기</a><a class="asset-link-chip" href="/ui/character-generator">캐릭터 생성기 열기</a></div></section>`;

  const linkedRoutes = input.selectedAsset
    ? `<section class="card asset-route-card"><div class="asset-section-head"><div><p class="asset-kicker">Linked Routes</p><h2>연결된 워크벤치</h2><p class="asset-copy">이 에셋이 어떤 의사결정면으로 이어지는지 미리 고정해 둡니다. 빠른 흐름은 Studio, 생성 허브는 Character Generator, 깊은 수동 검토는 Characters가 담당합니다.</p></div></div><div class="asset-route-grid"><article class="asset-route-item"><div class="preview-head"><strong>Studio / Dispatch Hub</strong><span class="asset-mini-badge ${assetLooksReady ? "asset-mini-badge-ready" : "asset-mini-badge-muted"}">${assetLooksReady ? "빠른 전환" : "맥락 정리"}</span></div><p>에셋, 팩, 에피소드, 작업을 묶어 빠르게 전진시키는 표면입니다. 승인이나 깊은 리뷰는 거기에 남기지 않습니다.</p><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/studio">Studio 열기</a><a class="asset-link-chip" href="/ui/jobs">Jobs 열기</a></div></article><article class="asset-route-item"><div class="preview-head"><strong>Character Generator / 생성 허브</strong><span class="asset-mini-badge ${assetLooksReady ? "asset-mini-badge-ready" : "asset-mini-badge-muted"}">${assetLooksReady ? "reference ready" : "점검 후 권장"}</span></div><p>새 런을 시작하고, 후보를 비교하고, regenerate/recreate/rollback 패턴을 운영하는 단계형 표면입니다.</p><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/character-generator">Character Generator 열기</a><a class="asset-link-chip" href="/ui/studio">Studio로 되돌아가기</a></div></article><article class="asset-route-item"><div class="preview-head"><strong>Characters / Pack Review</strong><span class="asset-mini-badge asset-mini-badge-muted">깊은 검수</span></div><p>이미 생성된 팩의 preview, QC, lineage, jobs를 한곳에서 읽어야 할 때 사용하는 수동 리뷰 표면입니다.</p><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/characters">Characters 열기</a><a class="asset-link-chip" href="/ui/character-generator">승인/롤백으로 이동</a></div></article></div></section>`
    : `<section class="card asset-route-card"><div class="asset-section-head"><div><p class="asset-kicker">Linked Routes</p><h2>연결된 워크벤치</h2><p class="asset-copy">에셋을 선택하면 여기서 Studio, Character Generator, Characters로 이어지는 경로가 더 구체적으로 열립니다.</p></div></div><div class="asset-link-grid"><a class="asset-link-chip" href="/ui/studio">Studio 열기</a><a class="asset-link-chip" href="/ui/character-generator">Character Generator 열기</a><a class="asset-link-chip" href="/ui/characters">Characters 열기</a></div></section>`;

  const selectedDetails = input.selectedAsset
    ? `<section class="card asset-detail-panel"><div class="asset-section-head"><div><p class="asset-kicker">고정 점검 레일</p><h2>${t.selectedAsset}</h2><p class="asset-copy">선택된 레코드를 점검하고 QC 상태, 로컬 출력, 인계 준비도를 한 레일에서 확인한 뒤 다음 워크벤치를 결정하세요.</p></div><div class="asset-link-row"><a class="asset-link-chip" href="/api/assets/${encodeURIComponent(
        input.selectedAsset.id
      )}">${t.openJson}</a></div></div><div class="asset-summary-grid"><div class="asset-summary-card"><span>ID</span><strong>${esc(
        input.selectedAsset.id
      )}</strong></div><div class="asset-summary-card"><span>상태</span><strong><span class="badge ${esc(
        input.selectedAsset.statusClassName
      )}">${esc(input.selectedAsset.status)}</span></strong></div><div class="asset-summary-card"><span>QC</span><strong><span class="badge ${esc(
        input.selectedAsset.qcClassName
      )}" title="${esc(input.selectedAsset.qcReason)}">${esc(input.selectedAsset.qcLevel)}</span></strong></div><div class="asset-summary-card"><span>MIME</span><strong><code>${esc(
        input.selectedAsset.mime
      )}</code></strong></div></div><div class="asset-meta-grid"><div><span>원본</span><code>${esc(
        input.selectedAsset.originalKey
      )}</code></div><div><span>정규화 1024</span><code>${esc(input.selectedAsset.normalized1024Key)}</code></div><div><span>정규화 2048</span><code>${esc(
        input.selectedAsset.normalized2048Key
      )}</code></div><div><span>QC 사유</span><code>${esc(input.selectedAsset.qcReason || "-")}</code></div></div>${
        previewCards.length > 0
          ? `<div><div class="asset-subhead"><h3>프리뷰 출력</h3><p>로컬 산출물로 크롭, 정규화, 검토 인계 준비 상태를 확인하세요.</p></div><div class="preview-grid">${previewCards}</div></div>`
          : `<div class="asset-empty"><strong>${t.noPreviewImages}</strong><span>에셋 파이프라인이 로컬 이미지 출력을 만들면 여기에 프리뷰 카드가 표시됩니다.</span></div>`
      }<details class="asset-json"><summary>QC 페이로드</summary><pre>${esc(input.selectedAsset.qcJson)}</pre></details></section>`
    : `<section class="card asset-detail-panel asset-detail-empty"><div class="asset-section-head"><div><p class="asset-kicker">고정 점검 레일</p><h2>${t.selectedAsset}</h2><p class="asset-copy">검토 큐에서 에셋을 고르거나 업로드 후 리다이렉트로 들어와 프리뷰, 저장소 키, QC 페이로드를 확인하세요.</p></div></div><div class="asset-empty"><strong>${t.noSelectedAsset}</strong><span>가운데 열의 검토 큐에서 항목을 선택하면 이 패널이 점검 모드로 전환됩니다.</span></div></section>`;

  const heroSection = `<section class="card asset-hero"><div class="asset-section-head"><div><p class="asset-kicker">검토 워크벤치</p><h2>입력 + 검토 큐 + Sticky Inspector</h2><p class="asset-copy">왼쪽은 입력, 가운데는 검토 큐, 오른쪽은 sticky inspector다. 이 화면은 에셋을 생성 허브로 바꾸지 않고, 다음 인계 표면을 정확히 고르는 리뷰 레일로 유지합니다. <a href="/ui/studio">스튜디오</a>는 빠른 흐름, <a href="/ui/character-generator">캐릭터 생성기</a>는 단계형 생성, <a href="/ui/characters">캐릭터</a>는 깊은 팩 리뷰를 맡습니다.</p></div><div class="asset-hero-links"><a href="/ui/studio" class="asset-link-chip">Studio 열기</a><a href="/ui/character-generator" class="asset-link-chip">Character Generator 열기</a><a href="/ui/characters" class="asset-link-chip">Characters 열기</a></div></div><div class="asset-flow-grid"><div class="asset-flow-step"><strong>입력</strong><span>새 레퍼런스를 밀어 넣거나 Studio에서 이 표면으로 진입합니다.</span></div><div class="asset-flow-step"><strong>검토 큐</strong><span>현재 슬라이스를 필터링하고 지금 점검할 에셋을 고릅니다.</span></div><div class="asset-flow-step"><strong>Sticky Inspector</strong><span>오른쪽 레일에서 QC, 저장소 키, 프리뷰, JSON을 고정해 읽습니다.</span></div><div class="asset-flow-step"><strong>라우팅</strong><span>선택한 에셋을 빠른 흐름은 Studio, 새 런은 Character Generator, 깊은 팩 검수는 Characters로 넘깁니다.</span></div></div></section>`;

  const clientScript = `<script>const selectedAssetId=${JSON.stringify(
    input.selectedAsset?.id ?? ""
  )};const form=document.getElementById("asset-upload-form");const output=document.getElementById("asset-upload-result");const submit=document.getElementById("asset-upload-submit");const filter=document.getElementById("asset-filter");const assetTable=document.getElementById("asset-table");const filterCount=document.getElementById("asset-filter-count");const updateCount=()=>{if(!(assetTable instanceof HTMLTableElement))return;let total=0;let visible=0;assetTable.querySelectorAll("tbody tr").forEach((row)=>{if(!(row instanceof HTMLElement))return;const text=String(row.textContent||"").trim();const hasDataRow=!!row.querySelector("a")||row.querySelectorAll("td").length>1;if(hasDataRow)total+=1;if(hasDataRow&&row.style.display!=="none")visible+=1;const firstCell=hasDataRow?row.querySelector("td"):null;row.dataset.selected=selectedAssetId&&firstCell&&String(firstCell.textContent||"").trim()===selectedAssetId?"true":"false";});if(filterCount instanceof HTMLElement)filterCount.textContent=visible+" / "+total+"개 표시 중";};const applyFilter=()=>{if(!(filter instanceof HTMLInputElement)||!(assetTable instanceof HTMLTableElement))return;const q=filter.value.trim().toLowerCase();assetTable.querySelectorAll("tbody tr").forEach((row)=>{if(!(row instanceof HTMLElement))return;const text=String(row.textContent||"").toLowerCase();row.style.display=!q||text.includes(q)?"":"none";});updateCount();};if(filter){filter.addEventListener("input",applyFilter);}applyFilter();if(form&&output&&submit){form.addEventListener("submit",async(event)=>{event.preventDefault();submit.disabled=true;output.dataset.state="busy";output.textContent=${JSON.stringify(
    t.uploadInProgress
  )};const fd=new FormData(form);try{const res=await fetch("/api/assets/upload",{method:"POST",body:fd});const json=await res.json();output.dataset.state=res.ok?"success":"error";output.textContent=JSON.stringify(json,null,2);if(res.ok&&json&&json.data&&json.data.assetId){window.location.href="/ui/assets?assetId="+encodeURIComponent(json.data.assetId);}}catch(error){output.dataset.state="error";output.textContent=String(error);}finally{submit.disabled=false;}});}</script>`;

  return `${ASSET_PAGE_STYLE}${heroSection}<section class="asset-shell"><div class="asset-left-rail"><section class="card asset-upload-card"><div class="asset-section-head"><div><p class="asset-kicker">입력</p><h2>${t.upload}</h2><p class="asset-copy">소스 이미지를 파이프라인에 넣고 처리 시작과 동시에 바로 점검으로 이동합니다.</p></div></div><form id="asset-upload-form" enctype="multipart/form-data" class="grid"><div class="grid two"><label>에셋 타입<select name="assetType"><option value="character_reference">character_reference (레퍼런스)</option><option value="character_view">character_view (뷰 변형)</option><option value="background">background (배경)</option><option value="chart_source">chart_source (차트 소스)</option></select></label><label>파일<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label></div><button id="asset-upload-submit" type="submit" data-primary-action="1" data-primary-label="에셋 업로드 후 검토 열기">${t.uploadAction}</button></form><p class="asset-inline-note">지원 입력 형식: PNG, JPEG, WebP. 업로드가 성공하면 새 에셋 상세 레코드로 이동합니다.</p><pre id="asset-upload-result" class="asset-output" data-state="idle" role="status" aria-live="polite" aria-atomic="true">${t.uploadResultIdle}</pre></section><section class="card asset-guide-card"><div class="asset-section-head"><div><p class="asset-kicker">검토 절차</p><h2>${t.reviewProtocol}</h2><p class="asset-copy">저장소 브라우징보다 점검과 다음 결정에 큐의 초점을 유지하세요.</p></div></div><ol class="asset-guide-list"><li>선택한 에셋이 의도한 레퍼런스나 소스 역할과 실제로 맞는지 확인합니다.</li><li>생성이나 오케스트레이션으로 넘기기 전에 QC 등급과 프리뷰 출력을 확인합니다.</li><li>승인, 비교, 롤백 판단이 필요한 경우 JSON과 프리뷰를 복구 맥락으로 함께 사용합니다.</li></ol></section></div><div class="asset-main-col"><section class="card asset-list-card"><div class="asset-section-head"><div><p class="asset-kicker">검토 큐</p><h2>${t.recentAssets}</h2><p class="asset-copy">지금 점검이 필요한 에셋을 고르고, 오른쪽 sticky inspector에서 다음 조치를 결정하세요.</p></div><span id="asset-filter-count" class="asset-counter">0 / 0개 표시 중</span></div><div class="asset-table-tools"><input id="asset-filter" type="search" autocomplete="off" aria-label="최근 에셋 필터" placeholder="${t.filterPlaceholder}" /><span class="asset-filter-note">현재 로드된 행에만 적용되는 로컬 필터입니다.</span></div><div class="asset-table-wrap"><table id="asset-table"><thead><tr><th>${t.columns.id}</th><th>${t.columns.type}</th><th>${t.columns.status}</th><th>${t.columns.qc}</th><th>${t.columns.mime}</th><th>${t.columns.size}</th><th>${t.columns.created}</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noAssets)
  }</tbody></table></div></section></div><div class="asset-right-rail">${inspectorRail}${selectedDetails}${nextActions}${linkedRoutes}</div></section>${clientScript}`;
}
