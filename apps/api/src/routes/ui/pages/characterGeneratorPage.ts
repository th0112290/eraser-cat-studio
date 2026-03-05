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
  referenceOptions: string;
  defaultSeed: number;
  forbiddenTermsSummary: string;
  negativeTermsSummary: string;
};

export function buildCharacterGeneratorTopSection(input: CharacterGeneratorTopInput): string {
  return `<section class="card"><h1>캐릭터 생성기 (상세 모드)</h1><div class="notice">일반 사용은 <a href="/ui/studio">통합 스튜디오</a>를 권장합니다. 이 페이지는 고급/세부 조정용입니다.</div>${
    input.message ? `<div class="notice">${esc(input.message)}</div>` : ""
  }${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}<form method="post" action="/ui/character-generator/create" class="grid"><h2>1) 생성 모드</h2><div class="grid two"><label>모드<select name="mode"><option value="new">new (prompt)</option><option value="reference">reference (내 이미지 기반)</option></select></label><label>프로바이더 <span class="hint" data-tooltip="외부 provider 실패 시 mock 폴백됩니다">?</span><select name="provider"><option value="mock">mock (기본 무료)</option><option value="comfyui">comfyui (옵션)</option><option value="remoteApi">remoteApi (옵션)</option></select></label></div><h2>2) 스타일/프롬프트</h2><div class="grid two"><label>프롬프트 프리셋<select name="promptPreset">${input.styleOptions}</select></label><label>주제(선택)<input name="topic" placeholder="캐릭터 생성 데모"/></label><label>긍정 프롬프트(선택)<textarea name="positivePrompt" rows="2" placeholder="friendly orange cat mascot, clean silhouette"></textarea></label><label>부정 프롬프트(선택)<textarea name="negativePrompt" rows="2" placeholder="text, watermark, extra fingers, noisy background"></textarea></label><label><input type="checkbox" name="boostNegativePrompt" value="true"/> 부정 프롬프트 강화(손/텍스트/워터마크 억제)</label></div><div class="notice">채널 바이블 룰 자동 반영: forbidden=${esc(
    input.forbiddenTermsSummary
  )} / negative=${esc(input.negativeTermsSummary)}</div><h2>3) 후보 수/시드/HITL 설정</h2><div class="grid two"><label>레퍼런스 에셋(reference 모드)<select name="referenceAssetId"><option value="">(없음)</option>${
    input.referenceOptions
  }</select></label><label>후보 수 <span class="hint" data-tooltip="너무 많으면 비용/시간 증가">?</span><input name="candidateCount" value="4"/></label><label>시드(seed) <span class="hint" data-tooltip="같은 입력+seed면 재현 가능한 결과를 유지">?</span><input name="seed" value="${esc(
    input.defaultSeed
  )}"/></label><label>자동 선택(autoPick)<select name="autoPick"><option value="false">false (직접 선택)</option><option value="true">true (자동 선택)</option></select></label><label>HITL 선택 강제(requireHitlPick)<select name="requireHitlPick"><option value="true">true</option><option value="false">false</option></select></label></div><h2>4) 생성 실행 + 진행 상태</h2><div class="notice">생성 실행 버튼을 누르면 아래 선택된 작업 영역에서 상태를 자동 조회합니다. ComfyUI 미설정/오프라인이면 자동으로 mock 폴백됩니다.</div><button type="submit" data-primary-action="1">캐릭터 후보 생성 실행</button></form></section>`;
}

export function buildCharacterGeneratorStatusScript(): string {
  return `<script>(function(){const el=document.getElementById("generation-status");if(!el){return;}const retryBtn=document.getElementById("generation-retry");const jobId=el.dataset.jobId;if(!jobId){return;}let timer=null;let failCount=0;const stageLabel=(status)=>{switch(String(status||"").toUpperCase()){case"QUEUED":return"대기중";case"RUNNING":return"생성중";case"SUCCEEDED":return"완료";case"FAILED":return"실패";case"CANCELLED":return"취소";default:return String(status||"unknown");}};const schedule=(ms)=>{if(timer){clearTimeout(timer);}timer=setTimeout(()=>{void tick();},ms);};const toast=(title,msg,tone)=>{if(typeof window.__ecsToast==="function"){window.__ecsToast(title,msg,tone||"warn");}};const speak=(msg)=>{if(typeof window.__ecsSpeak==="function"){window.__ecsSpeak(msg);}};const tick=async()=>{try{const res=await fetch("/api/character-generator/jobs/"+encodeURIComponent(jobId));if(!res.ok){throw new Error("상태 조회 실패: "+res.status);}const json=await res.json();const data=json&&json.data?json.data:null;if(!data){throw new Error("상태 조회 응답에 데이터가 없습니다.");}failCount=0;if(retryBtn){retryBtn.style.display="none";}const manifestStatus=data.manifest&&data.manifest.status?" / 매니페스트="+data.manifest.status:"";const text="상태="+stageLabel(data.status)+" 진행률="+data.progress+"%"+manifestStatus;el.textContent=text;speak(text);if(data.status==="SUCCEEDED"||data.status==="FAILED"||data.status==="CANCELLED"){if(data.manifestExists){toast("생성기", "작업이 종료되어 결과 화면으로 이동합니다.", data.status==="SUCCEEDED"?"ok":"warn");setTimeout(()=>{window.location.href="/ui/character-generator?jobId="+encodeURIComponent(jobId);},500);}return;}schedule(2000);}catch(error){failCount+=1;const wait=Math.min(15000,2000*Math.pow(2,failCount));el.textContent="폴링 실패. "+wait+"ms 후 재시도합니다.";if(retryBtn){retryBtn.style.display="inline-block";}toast("상태조회", String(error), "warn");schedule(wait);}};if(retryBtn){retryBtn.addEventListener("click",()=>{failCount=0;void tick();});}void tick();})();</script>`;
}

type CharacterGeneratorPageBodyInput = {
  topSection: string;
  selectedSection: string;
  regenerateSection: string;
  pickSection: string;
  previewSection: string;
  rollbackSection: string;
  compareSection: string;
  rows: string;
  statusScript: string;
};

export function buildCharacterGeneratorPageBody(input: CharacterGeneratorPageBodyInput): string {
  const jobsSection = `<section class="card"><h2>최근 생성 작업</h2><table><thead><tr><th>작업</th><th>에피소드</th><th>주제</th><th>상태</th><th>진행률</th><th>매니페스트</th><th>생성 시각</th></tr></thead><tbody>${
    input.rows ||
    '<tr><td colspan="7"><div class="notice">생성 작업이 없습니다. 위에서 생성 실행 버튼을 눌러주세요.</div></td></tr>'
  }</tbody></table></section>`;
  return `${input.topSection}${input.selectedSection}${input.regenerateSection}${input.pickSection}${input.previewSection}${input.rollbackSection}${input.compareSection}${jobsSection}${input.statusScript}`;
}
