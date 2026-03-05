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
  return `<section class="card"><h1>Character Generator (Detail Mode)</h1><div class="notice">For regular usage, use <a href="/ui/studio">Studio</a>. This page is for advanced controls.</div>${
    input.message ? `<div class="notice">${esc(input.message)}</div>` : ""
  }${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}<form method="post" action="/ui/character-generator/create" class="grid"><h2>1) Generation Mode</h2><div class="grid two"><label>Mode<select name="mode"><option value="new">new (prompt)</option><option value="reference">reference (use your image)</option></select></label><label>Provider <span class="hint" data-tooltip="Falls back to mock when external provider fails">?</span><select name="provider"><option value="mock">mock (default free)</option><option value="comfyui">comfyui (optional)</option><option value="remoteApi">remoteApi (optional)</option></select></label></div><h2>2) Style/Prompt</h2><div class="grid two"><label>Prompt Preset<select name="promptPreset">${input.styleOptions}</select></label><label>Topic (optional)<input name="topic" placeholder="character generation demo"/></label><label>Positive Prompt (optional)<textarea name="positivePrompt" rows="2" placeholder="friendly orange cat mascot, clean silhouette"></textarea></label><label>Negative Prompt (optional)<textarea name="negativePrompt" rows="2" placeholder="text, watermark, extra fingers, noisy background"></textarea></label><label><input type="checkbox" name="boostNegativePrompt" value="true"/> Strengthen negative prompt (suppress hands/text/watermark)</label></div><div class="notice">Channel bible rule auto-apply: forbidden=${esc(
    input.forbiddenTermsSummary
  )} / negative=${esc(input.negativeTermsSummary)}</div><h2>3) 후보 수/시드/HITL 설정</h2><div class="grid two"><label>레퍼런스 에셋(reference 모드)<select name="referenceAssetId"><option value="">(없음)</option>${
    input.referenceOptions
  }</select></label><label>Candidate Count <span class="hint" data-tooltip="Too many candidates increases cost/time">?</span><input name="candidateCount" value="4"/></label><label>Seed <span class="hint" data-tooltip="Same input+seed keeps deterministic results">?</span><input name="seed" value="${esc(
    input.defaultSeed
  )}"/></label><label>Auto Pick<select name="autoPick"><option value="false">false (pick manually)</option><option value="true">true (auto pick)</option></select></label><label>Require HITL Pick<select name="requireHitlPick"><option value="true">true</option><option value="false">false</option></select></label></div><h2>4) Run Generation + Live Status</h2><div class="notice">After clicking run, status is auto-polled in the selected job panel below. If ComfyUI is not configured/offline, it falls back to mock.</div><button type="submit" data-primary-action="1">Run Character Candidate Generation</button></form></section>`;
}

export function buildCharacterGeneratorStatusScript(): string {
  return `<script>(function(){const el=document.getElementById("generation-status");if(!el){return;}const retryBtn=document.getElementById("generation-retry");const jobId=el.dataset.jobId;if(!jobId){return;}let timer=null;let failCount=0;const stageLabel=(status)=>{switch(String(status||"").toUpperCase()){case"QUEUED":return"QUEUED";case"RUNNING":return"RUNNING";case"SUCCEEDED":return"SUCCEEDED";case"FAILED":return"FAILED";case"CANCELLED":return"CANCELLED";default:return String(status||"unknown");}};const schedule=(ms)=>{if(timer){clearTimeout(timer);}timer=setTimeout(()=>{void tick();},ms);};const toast=(title,msg,tone)=>{if(typeof window.__ecsToast==="function"){window.__ecsToast(title,msg,tone||"warn");}};const speak=(msg)=>{if(typeof window.__ecsSpeak==="function"){window.__ecsSpeak(msg);}};const tick=async()=>{try{const res=await fetch("/api/character-generator/jobs/"+encodeURIComponent(jobId));if(!res.ok){throw new Error("Status fetch failed: "+res.status);}const json=await res.json();const data=json&&json.data?json.data:null;if(!data){throw new Error("No data in status response.");}failCount=0;if(retryBtn){retryBtn.style.display="none";}const manifestStatus=data.manifest&&data.manifest.status?" / manifest="+data.manifest.status:"";const text="status="+stageLabel(data.status)+" progress="+data.progress+"%"+manifestStatus;el.textContent=text;speak(text);if(data.status==="SUCCEEDED"||data.status==="FAILED"||data.status==="CANCELLED"){if(data.manifestExists){toast("Generator", "Job finished. Redirecting to result page.", data.status==="SUCCEEDED"?"ok":"warn");setTimeout(()=>{window.location.href="/ui/character-generator?jobId="+encodeURIComponent(jobId);},500);}return;}schedule(2000);}catch(error){failCount+=1;const wait=Math.min(15000,2000*Math.pow(2,failCount));el.textContent="Polling failed. Retry in "+wait+"ms.";if(retryBtn){retryBtn.style.display="inline-block";}toast("Status Poll", String(error), "warn");schedule(wait);}};if(retryBtn){retryBtn.addEventListener("click",()=>{failCount=0;void tick();});}void tick();})();</script>`;
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
  const jobsSection = `<section class="card"><h2>Recent Generation Jobs</h2><table><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Status</th><th>Progress</th><th>Manifest</th><th>Created</th></tr></thead><tbody>${
    input.rows ||
    '<tr><td colspan="7"><div class="notice">No generation jobs yet. Click the run button above.</div></td></tr>'
  }</tbody></table></section>`;
  return `${input.topSection}${input.selectedSection}${input.regenerateSection}${input.pickSection}${input.previewSection}${input.rollbackSection}${input.compareSection}${jobsSection}${input.statusScript}`;
}
