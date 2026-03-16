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
.cg-advanced-shell summary::after{content:"고급";margin-left:auto;display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #cfe0e3;background:#f4fbfa;color:#21545d;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.cg-advanced-shell[open] summary{border-bottom:1px solid #dbe8ea}
.cg-advanced-shell[open] summary::after{content:"접기"}
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
#pick-candidates details.card summary::after{content:"점검";float:right;color:#0f766e;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
#pick-candidates details[open].card summary::after{content:"접기"}
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
  return `<section class="cg-phase-card${extraClass}"${idAttribute}><div class="cg-phase-head"><div><div class="cg-section-kicker">단계 ${esc(
    step
  )}</div><h2>${esc(title)}</h2><p class="cg-phase-copy">${esc(copy)}</p></div><span class="cg-phase-badge">${esc(
    step
  )}</span></div><div class="cg-phase-stack">${content}</div></section>`;
}

export function buildCharacterGeneratorTopSection(input: CharacterGeneratorTopInput): string {
  return `<section class="card cg-top-card"><div class="cg-top-layout"><div class="cg-hero"><div class="cg-eyebrow">단계형 캐릭터 워크벤치</div><div class="cg-title-row"><div class="cg-title-block"><h1>캐릭터 생성기</h1><p class="cg-subtitle">런을 순서대로 진행하세요. 기본값을 정하고, 레퍼런스 맥락을 고정하고, 워크플로 정책을 잠근 뒤, 필요할 때만 고급 제어를 열고, 마지막으로 비교와 승인으로 이동합니다. 워크벤치 사이를 빠르게 오케스트레이션하려면 <a href="/ui/studio">스튜디오</a>로 돌아가세요.</p></div></div><div class="cg-metric-grid"><div class="cg-metric"><span class="cg-metric-label">모드</span><span class="cg-metric-value">프롬프트 + 레퍼런스</span></div><div class="cg-metric"><span class="cg-metric-label">레퍼런스 입력</span><span class="cg-metric-value">필요 시 에셋 기반</span></div><div class="cg-metric"><span class="cg-metric-label">판단 흐름</span><span class="cg-metric-value">비교 -> 승인</span></div><div class="cg-metric"><span class="cg-metric-label">기본 시드</span><span class="cg-metric-value">${esc(
    input.defaultSeed
  )}</span></div></div><div class="cg-flow-grid"><div class="cg-flow-step"><strong>01 기본 입력</strong><span>모드, 제공자, 프리셋, 종, 주제가 이번 런의 범위를 결정합니다.</span></div><div class="cg-flow-step"><strong>02 레퍼런스 / 팩 맥락</strong><span>업로드한 에셋에 런을 고정하고 다운스트림 팩 검토 경로를 확인합니다.</span></div><div class="cg-flow-step"><strong>03 워크플로 정책</strong><span>검토 리소스를 쓰기 전에 후보 수와 승인 정책을 먼저 정합니다.</span></div><div class="cg-flow-step"><strong>04 고급 제어</strong><span>재현성 확보나 수리 작업이 필요할 때만 시드와 프롬프트 수정을 엽니다.</span></div><div class="cg-flow-step"><strong>05 후보 비교</strong><span>활성 작업을 검토하고 뷰를 비교한 뒤 의도적으로 선택합니다.</span></div><div class="cg-flow-step"><strong>06 승인 / 롤백</strong><span>비교 결과가 무엇을 앞으로 보낼지 보여준 뒤에만 복구 도구를 사용합니다.</span></div></div><div class="cg-status-stack">${
    input.message ? `<div class="notice">${esc(input.message)}</div>` : ""
  }${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}<div class="cg-summary-note"><strong>운영자 의도:</strong> 동시에 내리는 결정을 줄이고, 검토 자세를 더 강하게 유지하며, 생성에서 비교, 승인, 롤백으로 이어지는 인계를 눈에 보이게 유지합니다.</div></div></div><aside class="cg-ops-rail"><div class="cg-ops-card"><h2>운영 레일</h2><div class="cg-ops-list"><div class="cg-ops-item"><strong>기본 -> 맥락</strong><span>먼저 런 프로필을 정하고, 그다음 레퍼런스 에셋이 이번 패스를 고정해야 하는지 판단합니다.</span></div><div class="cg-ops-item"><strong>정책 -> 고급</strong><span>후보 수와 HITL 정책을 계속 보이게 두고, 정밀 재실행이 필요할 때만 고급 제어를 엽니다.</span></div><div class="cg-ops-item"><strong>비교 -> 승인</strong><span>하단 단계에서 후보를 비교하고, 팩 경로를 승인하거나 롤백으로 라우팅합니다.</span></div></div></div><div class="cg-ops-card"><h2>바로 가기</h2><div class="cg-link-list"><a href="#cg-stage-basic">기본 입력</a><a href="#cg-stage-context">레퍼런스 맥락</a><a href="#cg-stage-policy">워크플로 정책</a><a href="#cg-stage-advanced">고급 제어</a><a href="#cg-active-job">후보 비교</a><a href="#cg-approval-lane">승인 레인</a><a href="#cg-recent-jobs">최근 작업</a></div></div></aside></div><form method="post" action="/ui/character-generator/create" class="cg-form-shell"><section class="cg-form-block" id="cg-stage-basic"><div class="cg-form-head"><span class="cg-step">01</span><div><h2>기본 입력</h2><p class="cg-form-copy">수리용 노브나 선택 전략을 고민하기 전에 이번 런의 핵심 경로부터 정하세요.</p></div></div><div class="cg-field-grid tight"><label>모드<select name="mode"><option value="new">new (프롬프트)</option><option value="reference">reference (내 이미지 사용)</option></select><small>레퍼런스 모드는 선택한 에셋을 생성 경로에 주입합니다.</small></label><label>제공자 <span class="hint" data-tooltip="외부 제공자가 실패하면 mock으로 폴백합니다">?</span><select name="provider"><option value="mock">mock (기본 무료)</option><option value="comfyui">comfyui (선택)</option><option value="remoteApi">remoteApi (선택)</option></select><small>제공자 폴백은 유지됩니다. 외부 제공자가 오프라인이면 mock으로 되돌아갑니다.</small></label><label>프롬프트 프리셋<select name="promptPreset">${input.styleOptions}</select><small>팩이 상속해야 할 비주얼 언어를 고르세요.</small></label><label>종<select name="species">${input.speciesOptions}</select><small>이 값을 명시해 두면 이후 비교 판단이 일관되게 유지됩니다.</small></label><label>주제 (선택)<input name="topic" placeholder="지우개 고양이 마스코트"/><small>짧은 주제 라벨이 비교와 히스토리 화면에서 더 잘 읽힙니다.</small></label></div></section><section class="cg-form-block" id="cg-stage-context"><div class="cg-form-head"><span class="cg-step">02</span><div><h2>레퍼런스 / 팩 맥락</h2><p class="cg-form-copy">실행 전에 올바른 소스에 런을 고정하고 팩 검토 경로가 보이도록 유지하세요.</p></div></div><div class="cg-field-grid tight"><label>레퍼런스 에셋<select name="referenceAssetId"><option value="">(없음)</option>${input.referenceOptions}</select><small>포즈, 실루엣, 마스코트 연속성을 물려주고 싶을 때 업로드한 에셋을 선택합니다.</small></label></div><div class="cg-context-grid"><article class="cg-context-card"><h3>레퍼런스 입력</h3><p>더 나은 시작 이미지나 QC 점검이 먼저 필요하면 에셋 화면으로 나가 정규화 출력을 검토한 뒤 더 강한 레퍼런스로 돌아오세요.</p><div class="cg-inline-links"><a href="/ui/assets">에셋 열기</a><a href="/ui/studio">스튜디오 열기</a></div></article><article class="cg-context-card"><h3>팩 검토 경로</h3><p>승인, 비교, 롤백은 여전히 캐릭터 워크벤치에 있습니다. 이 페이지는 다른 패스를 돌리기 전에 그 인계를 분명하게 보여줘야 합니다.</p><div class="cg-inline-links"><a href="/ui/characters">캐릭터 열기</a><a href="/ui/studio">허브 열기</a></div></article></div></section><section class="cg-form-block" id="cg-stage-policy"><div class="cg-form-head"><span class="cg-step">03</span><div><h2>워크플로 정책</h2><p class="cg-form-copy">후보 생성이 시작되기 전에 검토량과 승인 정책을 정해 비교와 복구를 예측 가능하게 유지하세요.</p></div></div><div class="cg-field-grid tight"><label>후보 수 <span class="hint" data-tooltip="후보가 너무 많으면 비용과 시간이 증가합니다">?</span><input name="candidateCount" value="4" inputmode="numeric"/><small>개수가 많을수록 탐색 범위는 넓어지지만 운영자의 검토 부담도 커집니다.</small></label><label>자동 선택<select name="autoPick"><option value="false">false (수동 선택)</option><option value="true">true (자동 선택)</option></select><small>의도적인 비교 단계를 원하면 수동 선택을 유지하세요.</small></label><label>HITL 선택 요구<select name="requireHitlPick"><option value="true">true</option><option value="false">false</option></select><small>다운스트림 활성화가 명시적 승인 후에만 이뤄져야 한다면 이 옵션을 켜 두세요.</small></label></div><div class="cg-guardrail-grid"><div class="cg-guardrail"><strong>금지어</strong><span>${esc(
    input.forbiddenTermsSummary
  )}</span></div><div class="cg-guardrail"><strong>네거티브 용어</strong><span>${esc(
    input.negativeTermsSummary
  )}</span></div></div></section><details class="cg-advanced-shell" id="cg-stage-advanced"><summary><span class="cg-step">04</span><div><h2>고급 제어</h2><p class="cg-form-copy">결정론적 재실행, 프롬프트 수정, 알려진 실패 모드의 강한 억제가 필요할 때만 여세요.</p></div></summary><div class="cg-advanced-body"><div class="cg-field-grid"><label>시드 <span class="hint" data-tooltip="같은 입력과 시드를 쓰면 결정론적 결과를 유지합니다">?</span><input name="seed" value="${esc(
    input.defaultSeed
  )}" inputmode="numeric"/><small>같은 프롬프트로 결정론적 재현을 원할 때는 시드를 재사용하세요.</small></label><label>포지티브 프롬프트 (선택)<textarea name="positivePrompt" rows="4" placeholder="귀여운 네모 머리 고양이 마스코트, 흑백 라인아트, 발 모양 손, 지우개 가루 꼬리"></textarea><small>필요한 추가 지시만 넣으세요. 기본 스타일 의도는 이미 프리셋에 포함되어 있습니다.</small></label><label>네거티브 프롬프트 (선택)<textarea name="negativePrompt" rows="4" placeholder="사람 손가락, 광택 애니메이션 음영, 사실적 털, 긴 몸, 텍스트"></textarea><small>비교나 QC에서 같은 실패가 반복될 때 정밀 억제용으로 사용합니다.</small></label></div><div class="cg-toggle-list"><label class="cg-toggle"><input type="checkbox" name="boostNegativePrompt" value="true"/><span>손, 텍스트, 워터마크 같은 알려진 실패 모드를 더 강하게 억제하도록 네거티브 프롬프트를 강화합니다.</span></label></div></div></details><div class="cg-submit-row"><p class="cg-submit-copy">제출하면 후보 생성 런이 시작되고, 화면은 아래의 비교 및 승인 단계로 넘어갑니다. ComfyUI를 사용할 수 없으면 기존 폴백 동작이 유지되어 런은 mock으로 라우팅됩니다.</p><button type="submit" data-primary-action="1" data-primary-label="캐릭터 후보 생성 실행">캐릭터 후보 생성 실행</button></div></form></section>`;
}

export function buildCharacterGeneratorStatusScript(): string {
  return `<script>(function(){const el=document.getElementById("generation-status");if(!el){return;}const retryBtn=document.getElementById("generation-retry");const jobId=el.dataset.jobId;if(!jobId){return;}let timer=null;let failCount=0;const stageLabel=(status)=>{switch(String(status||"").toUpperCase()){case"QUEUED":return"대기";case"RUNNING":return"실행 중";case"SUCCEEDED":return"성공";case"FAILED":return"실패";case"CANCELLED":return"취소됨";default:return String(status||"알 수 없음");}};const formatScore=(value)=>typeof value==="number"&&Number.isFinite(value)?value.toFixed(2):"-";const shortView=(view)=>view==="threeQuarter"?"3/4":view==="profile"?"측면":"정면";const summarizePreflight=(stage)=>{if(!stage||!stage.preflightByView){return"";}const entries=["front","threeQuarter","profile"].filter((view)=>stage.preflightByView&&stage.preflightByView[view]).map((view)=>{const diagnostics=stage.preflightByView[view];const detail=(Array.isArray(diagnostics&&diagnostics.missingStructureKinds)?diagnostics.missingStructureKinds.slice(0,2).join("+"):"")||(Array.isArray(diagnostics&&diagnostics.missingReferenceRoles)?diagnostics.missingReferenceRoles.slice(0,1).join("+"):"")||(Array.isArray(diagnostics&&diagnostics.reasonCodes)?diagnostics.reasonCodes[0]:"")||"";return shortView(view)+":"+String(diagnostics&&diagnostics.status||"unknown")+(detail?":"+detail:"");});return entries.length>0?" / 사전점검="+entries.join(","):"";};const schedule=(ms)=>{if(timer){clearTimeout(timer);}timer=setTimeout(()=>{void tick();},ms);};const toast=(title,msg,tone)=>{if(typeof window.__ecsToast==="function"){window.__ecsToast(title,msg,tone||"warn");}};const speak=(msg)=>{if(typeof window.__ecsSpeak==="function"){window.__ecsSpeak(msg);}};const tick=async()=>{try{const res=await fetch("/api/character-generator/jobs/"+encodeURIComponent(jobId));if(!res.ok){throw new Error("상태 조회 실패: "+res.status);}const json=await res.json();const data=json&&json.data?json.data:null;if(!data){throw new Error("상태 응답에 데이터가 없습니다.");}failCount=0;if(retryBtn){retryBtn.style.display="none";}const manifestStatus=data.manifest&&data.manifest.status?" / 매니페스트="+data.manifest.status:"";const packCoherence=data.packCoherence||data.manifest&&data.manifest.packCoherence?data.packCoherence||data.manifest.packCoherence:null;const autoReroute=data.autoReroute||data.manifest&&data.manifest.autoReroute?data.autoReroute||data.manifest.autoReroute:null;const selectionRisk=data.selectionRisk||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.selectionRisk||data.manifest.providerMeta.selectionDiagnostics.selectionRisk:null;const qualityEmbargo=data.qualityEmbargo||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.qualityEmbargo||data.manifest.providerMeta.selectionDiagnostics.qualityEmbargo:null;const finalQualityFirewall=data.finalQualityFirewall||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.finalQualityFirewall||data.manifest.providerMeta.selectionDiagnostics.finalQualityFirewall:null;const decisionOutcome=data.decisionOutcome||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.decisionOutcome||data.manifest.providerMeta.selectionDiagnostics.decisionOutcome:null;const coherenceSummary=packCoherence?" / 일관성="+String(packCoherence.severity||"none")+":"+formatScore(packCoherence.score):"";const rerouteSummary=autoReroute&&autoReroute.attempted?" / 재라우팅="+String(autoReroute.recovered===true?"복구됨":autoReroute.recovered===false?"실패":"시도됨")+(autoReroute.strategy?"@"+String(autoReroute.strategy):""):"";const selectionRiskSummary=selectionRisk&&selectionRisk.level&&String(selectionRisk.level)!=="none"?" / 선택위험="+String(selectionRisk.level)+(selectionRisk.suggestedAction?"@"+String(selectionRisk.suggestedAction):""):"";const qualityEmbargoSummary=qualityEmbargo&&qualityEmbargo.level&&String(qualityEmbargo.level)!=="none"?" / 품질보류="+String(qualityEmbargo.level)+(qualityEmbargo.suggestedAction?"@"+String(qualityEmbargo.suggestedAction):""):"";const finalQualityFirewallSummary=finalQualityFirewall&&finalQualityFirewall.level&&String(finalQualityFirewall.level)!=="none"?" / 최종방화벽="+String(finalQualityFirewall.level)+(finalQualityFirewall.suggestedAction?"@"+String(finalQualityFirewall.suggestedAction):""):"";const decisionSummary=decisionOutcome&&decisionOutcome.status?" / 판단="+String(decisionOutcome.status)+(decisionOutcome.kind?"@"+String(decisionOutcome.kind):""):"";const selectionSource=data.finalSelectionSource?" / 선택소스="+String(data.finalSelectionSource):"";const routeSummary=data.selectedWorkflowRuntimeSummary&&String(data.selectedWorkflowRuntimeSummary)!=="-"?" / 경로="+String(data.selectedWorkflowRuntimeSummary):"";const lastStage=Array.isArray(data.workflowStages)&&data.workflowStages.length>0?data.workflowStages[data.workflowStages.length-1]:null;const stageVariant=lastStage?[String(lastStage.origin||""),String(lastStage.passLabel||"")].filter((value)=>value&&value!=="").join("@"):"";const stageExit=lastStage?"통과"+String(Array.isArray(lastStage.passedViews)?lastStage.passedViews.length:0)+"/실패"+String(Array.isArray(lastStage.failedViews)?lastStage.failedViews.length:0):"";const stageSummary=lastStage?" / 단계="+String(lastStage.stage||"unknown")+(stageVariant?"@"+stageVariant:"")+"#"+String(lastStage.roundsAttempted||0)+(stageExit?":"+stageExit:""):Array.isArray(data.workflowStages)&&data.workflowStages.length>0?" / 단계수="+String(data.workflowStages.length):"";const preflightSummary=summarizePreflight(lastStage);const triageSummary=lastStage&&lastStage.repairTriageByView?(()=>{const entries=["front","threeQuarter","profile"].filter((view)=>lastStage.repairTriageByView&&lastStage.repairTriageByView[view]).map((view)=>shortView(view)+":"+String(lastStage.repairTriageByView[view].decision||"unknown"));return entries.length>0?" / 트리아지="+entries.join(","):"";})():"";const repairAcceptanceSummary=lastStage&&lastStage.repairAcceptanceByView?(()=>{const entries=["front","threeQuarter","profile"].filter((view)=>lastStage.repairAcceptanceByView&&lastStage.repairAcceptanceByView[view]).map((view)=>shortView(view)+":"+String(lastStage.repairAcceptanceByView[view].decision||"unknown"));return entries.length>0?" / 수리승인="+entries.join(","):"";})():"";const nextAction=Array.isArray(data.recommendedActions)&&data.recommendedActions.length>0&&data.recommendedActions[0]&&data.recommendedActions[0].label?" / 다음="+String(data.recommendedActions[0].label):"";const text="상태="+stageLabel(data.status)+" 진행률="+data.progress+"%"+manifestStatus+coherenceSummary+rerouteSummary+selectionRiskSummary+qualityEmbargoSummary+finalQualityFirewallSummary+decisionSummary+selectionSource+routeSummary+stageSummary+preflightSummary+triageSummary+repairAcceptanceSummary+nextAction;el.textContent=text;speak(text);if(data.status==="SUCCEEDED"||data.status==="FAILED"||data.status==="CANCELLED"){if(data.manifestExists){toast("생성기", "작업이 끝났습니다. 결과 페이지로 이동합니다.", data.status==="SUCCEEDED"?"ok":"warn");setTimeout(()=>{window.location.href="/ui/character-generator?jobId="+encodeURIComponent(jobId);},500);}return;}schedule(2000);}catch(error){failCount+=1;const wait=Math.min(15000,2000*Math.pow(2,failCount));el.textContent="폴링 실패. "+wait+"ms 후 재시도합니다.";if(retryBtn){retryBtn.style.display="inline-block";}toast("상태 폴링", String(error), "warn");schedule(wait);}};if(retryBtn){retryBtn.addEventListener("click",()=>{failCount=0;void tick();});}void tick();})();</script>`;
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
  const jobsSection = `<section class="card cg-history-card" id="cg-recent-jobs"><div class="cg-section-head"><div><div class="cg-section-kicker">히스토리</div><h2>최근 생성 작업</h2></div><p>런을 다시 열고 매니페스트 상태를 확인한 뒤, 콘솔을 벗어나지 않고 수동 보정으로 되돌아갈 수 있습니다.</p></div><div class="cg-history-tools"><div class="quick-links"><a href="#cg-active-job">활성 작업</a><a href="#recommended-actions">권장 액션</a><a href="#pick-candidates">HITL 선택</a></div><input type="search" data-table-filter="cg-jobs-table" placeholder="작업 필터 (작업/주제/상태/매니페스트)"/></div><div class="cg-table-wrap"><table id="cg-jobs-table"><thead><tr><th>작업</th><th>에피소드</th><th>주제</th><th>상태</th><th>진행률</th><th>매니페스트</th><th>생성 시각</th></tr></thead><tbody>${
    input.rows ||
    '<tr><td colspan="7"><div class="notice">아직 생성 작업이 없습니다. 위의 실행 버튼으로 시작하세요.</div></td></tr>'
  }</tbody></table></div></section>`;

  const compareLane = renderPhaseCard(
    "05",
    "후보 비교",
    "활성 작업을 검토하고, 현재 팩 상태를 비교하고, 프리뷰를 점검한 뒤 승인이나 복구 제어를 건드리기 전에 선택을 마무리하세요.",
    `${renderSlot(input.selectedSection, "cg-slot", "cg-active-job")}${renderSlot(input.compareSection, "cg-slot")}${renderSlot(
      input.pickSection,
      "cg-slot"
    )}${renderSlot(input.previewSection, "cg-slot")}`
  );
  const approvalLane = renderPhaseCard(
    "06",
    "승인 / 롤백",
    "비교 결과가 올바른 다음 수순을 분명하게 보여준 뒤에만 권장 액션, 롤백 맥락, 재실행 제어를 사용하세요.",
    `${renderSlot(input.recommendedActionsSection, "cg-slot")}${renderSlot(
      input.rollbackSection,
      "cg-slot"
    )}${renderSlot(input.regenerateSection, "cg-slot")}${renderSlot(input.recreateSection, "cg-slot")}`,
    "cg-approval-lane",
    "cg-approval-lane"
  );

  return `${buildCharacterGeneratorPageStyles()}<div class="cg-page-shell">${input.topSection}<div class="cg-main-grid">${compareLane}${approvalLane}</div>${jobsSection}</div>${input.statusScript}`;
}
