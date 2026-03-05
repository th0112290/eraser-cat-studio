function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildStudioBody(input: { message?: string; error?: string }): string {
  return `${input.message ? `<div class="notice">${esc(input.message)}</div>` : ""}${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}
<section class="card studio-shell">
  <style>
    .studio-shell{display:grid;gap:10px}
    .studio-hint{margin:0;color:#425466;font-size:13px}
    .studio-grid{display:grid;gap:12px;grid-template-columns:minmax(360px,1.1fr) minmax(340px,1fr)}
    .studio-col{display:grid;gap:12px}
    .studio-section{background:#fff}
    .studio-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .studio-table-wrap{overflow:auto;max-height:320px;border:1px solid #dce5f3;border-radius:10px}
    .studio-table-wrap table{margin:0}
    .studio-table-wrap tbody tr:hover{background:#f8fbff}
    .studio-table-wrap tbody tr:focus-within{outline:2px solid #0f5bd8;outline-offset:-2px}
    .studio-actions{display:flex;gap:8px;flex-wrap:wrap}
    @media (max-width:1100px){.studio-grid{grid-template-columns:1fr}}
  </style>
  <h1>통합 스튜디오</h1>
  <p class="studio-hint">에셋 업로드, 캐릭터 생성, 에피소드 생성/렌더/퍼블리시 진입까지 한 화면에서 처리합니다.</p>
  <div id="studio-status" class="notice" aria-live="polite">준비 완료: 왼쪽에서 생성하고 오른쪽에서 이력을 확인하세요.</div>
  <details class="card" style="margin:0">
    <summary><strong>빠른 시작 가이드</strong> (클릭해서 펼치기)</summary>
    <ol style="margin:10px 0 0;padding-left:18px">
      <li>에셋 업로드 또는 기존 에셋 점검</li>
      <li>캐릭터 생성 시작 또는 기존 캐릭터 팩 선택</li>
      <li>원클릭 생성(생성+미리보기) 또는 에피소드 수동 생성</li>
      <li>최근 작업 목록에서 진행 상태 확인</li>
      <li>필요 시 에디터/퍼블리시로 이동</li>
    </ol>
  </details>
  <div class="studio-actions">
    <label><input id="studio-auto-refresh" type="checkbox" checked/> 자동 새로고침</label>
    <label>주기
      <select id="studio-refresh-interval">
        <option value="3000">3초</option>
        <option value="5000" selected>5초</option>
        <option value="10000">10초</option>
      </select>
    </label>
  </div>
</section>
<section class="card studio-grid">
  <div class="studio-col">
    <section class="candidate studio-section">
      <h2 style="margin:0">1) 에셋 업로드</h2>
      <form id="studio-asset-upload-form" enctype="multipart/form-data" class="grid">
        <div class="grid two">
          <label>에셋 유형<select name="assetType"><option value="character_reference">character_reference (레퍼런스)</option><option value="character_view">character_view (뷰 변형)</option><option value="background">background (배경)</option><option value="chart_source">chart_source (차트)</option></select></label>
          <label>파일<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label>
        </div>
        <button id="studio-asset-upload-submit" type="submit">업로드</button>
      </form>
      <pre id="studio-asset-upload-result">대기 중</pre>
    </section>
    <section class="candidate studio-section">
      <h2 style="margin:0">2) 캐릭터 생성</h2>
      <form method="post" action="/ui/character-generator/create" class="grid">
        <div class="grid two">
          <label>모드<select name="mode"><option value="new">new (프롬프트 기반)</option><option value="reference">reference (레퍼런스 기반)</option></select></label>
          <label>프로바이더<select name="provider"><option value="mock">mock (기본 무료)</option><option value="comfyui">comfyui (옵션)</option><option value="remoteApi">remoteApi (옵션)</option></select></label>
          <label>프롬프트 프리셋<select name="promptPreset"><option value="default">default</option><option value="anime_clean">anime_clean</option><option value="brand_mascot">brand_mascot</option><option value="toon_bold">toon_bold</option></select></label>
          <label>후보 수<input name="candidateCount" type="number" min="1" max="8" value="4"/></label>
          <label>주제(선택)<input name="topic" placeholder="캐릭터 생성 데모"/></label>
          <label>시드(seed)<input name="seed" type="number" value="20260305"/></label>
        </div>
        <label>긍정 프롬프트(선택)<textarea name="positivePrompt" rows="2" placeholder="friendly orange cat mascot, clean silhouette"></textarea></label>
        <label>부정 프롬프트(선택)<textarea name="negativePrompt" rows="2" placeholder="text, watermark, extra fingers, noisy background"></textarea></label>
        <button type="submit" data-primary-action="1">캐릭터 생성 시작</button>
      </form>
    </section>
    <section class="candidate studio-section">
      <h2 style="margin:0">3) 다음 단계 (에피소드/렌더/퍼블리시)</h2>
      <div class="grid two">
        <label>에피소드 주제<input id="studio-topic" placeholder="예: 고양이 캐릭터 소개 영상"/></label>
        <label>episodeId<input id="studio-episode-id" placeholder="cmm..."/></label>
        <label>선택 캐릭터 팩<input id="studio-selected-pack" placeholder="오른쪽 목록에서 선택" readonly/></label>
      </div>
      <div class="studio-actions">
        <button type="button" id="studio-oneclick" data-primary-action="1">원클릭 시작(생성+미리보기)</button>
        <button type="button" id="studio-create-episode" class="secondary">에피소드 생성</button>
        <button type="button" id="studio-open-editor" class="secondary">에디터 열기</button>
        <button type="button" id="studio-enqueue-preview" class="secondary">미리보기 렌더 큐 등록</button>
        <button type="button" id="studio-open-publish" class="secondary">퍼블리시 열기</button>
      </div>
    </section>
  </div>
  <div class="studio-col">
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">최근 에셋</h2><button type="button" id="studio-refresh-assets" class="secondary">새로고침</button></div>
      <input id="studio-filter-assets" placeholder="에셋 검색 (id/유형/상태)" />
      <div class="studio-table-wrap"><table id="studio-assets-table"><thead><tr><th>ID</th><th>유형</th><th>상태</th><th>생성시각</th></tr></thead><tbody><tr><td colspan="4">로딩 중...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">생성된 캐릭터 팩</h2><button type="button" id="studio-refresh-packs" class="secondary">새로고침</button></div>
      <input id="studio-filter-packs" placeholder="캐릭터 팩 검색 (id/상태/episode)" />
      <div class="studio-table-wrap"><table id="studio-packs-table"><thead><tr><th>ID</th><th>버전</th><th>상태</th><th>에피소드</th></tr></thead><tbody><tr><td colspan="4">로딩 중...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">최근 에피소드</h2><button type="button" id="studio-refresh-episodes" class="secondary">새로고침</button></div>
      <input id="studio-filter-episodes" placeholder="에피소드 검색 (id/topic/status)" />
      <div class="studio-table-wrap"><table id="studio-episodes-table"><thead><tr><th>ID</th><th>주제</th><th>상태</th><th>최근작업</th></tr></thead><tbody><tr><td colspan="4">로딩 중...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">최근 작업</h2><button type="button" id="studio-refresh-jobs" class="secondary">새로고침</button></div>
      <input id="studio-filter-jobs" placeholder="작업 검색 (id/type/status/episode)" />
      <div class="studio-table-wrap"><table id="studio-jobs-table"><thead><tr><th>작업</th><th>유형</th><th>상태</th><th>진행률</th><th>에피소드</th></tr></thead><tbody><tr><td colspan="5">로딩 중...</td></tr></tbody></table></div>
    </section>
  </div>
</section>
<script>
(() => {
  const q = (id) => document.getElementById(id);
  const assetsBody = q("studio-assets-table")?.querySelector("tbody");
  const packsBody = q("studio-packs-table")?.querySelector("tbody");
  const episodesBody = q("studio-episodes-table")?.querySelector("tbody");
  const jobsBody = q("studio-jobs-table")?.querySelector("tbody");
  const statusBox = q("studio-status");
  const selectedPack = q("studio-selected-pack");
  const episodeInput = q("studio-episode-id");
  const topicInput = q("studio-topic");
  const autoRefreshInput = q("studio-auto-refresh");
  const refreshIntervalInput = q("studio-refresh-interval");
  let refreshTimer = null;

  const safe = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
  const setStatus = (text) => { if (statusBox instanceof HTMLElement) statusBox.textContent = text; };
  const applyFilter = (inputEl, tbodyEl) => {
    if (!(inputEl instanceof HTMLInputElement) || !(tbodyEl instanceof HTMLElement)) return;
    const qText = inputEl.value.trim().toLowerCase();
    tbodyEl.querySelectorAll("tr").forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const text = String(row.textContent || "").toLowerCase();
      row.style.display = !qText || text.includes(qText) ? "" : "none";
    });
  };
  const readError = async (res, fallback) => {
    try {
      const json = await res.json();
      if (json && typeof json.error === "string" && json.error.trim()) return json.error.trim();
      return fallback;
    } catch {
      return fallback;
    }
  };

  const loadAssets = async () => {
    if (!(assetsBody instanceof HTMLElement)) return;
    assetsBody.innerHTML = "<tr><td colspan='4'>로딩 중...</td></tr>";
    try {
      const res = await fetch("/api/assets?limit=30");
      if (!res.ok) throw new Error("에셋 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        assetsBody.innerHTML = "<tr><td colspan='4'>에셋이 없습니다.</td></tr>";
        return;
      }
      assetsBody.innerHTML = list.map((asset) => "<tr><td><a href=\"/ui/assets?assetId=" + encodeURIComponent(String(asset.id || "")) + "\">" + safe(asset.id) + "</a></td><td>" + safe(asset.assetType) + "</td><td>" + safe(asset.status) + "</td><td>" + safe(asset.createdAt) + "</td></tr>").join("");
      applyFilter(q("studio-filter-assets"), assetsBody);
    } catch (e) {
      assetsBody.innerHTML = "<tr><td colspan='4'>실패: " + safe(String(e)) + "</td></tr>";
    }
  };

  const loadPacks = async () => {
    if (!(packsBody instanceof HTMLElement)) return;
    packsBody.innerHTML = "<tr><td colspan='4'>로딩 중...</td></tr>";
    try {
      const res = await fetch("/api/character-packs?limit=30");
      if (!res.ok) throw new Error("캐릭터 팩 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        packsBody.innerHTML = "<tr><td colspan='4'>캐릭터 팩이 없습니다.</td></tr>";
        return;
      }
      packsBody.innerHTML = list.map((pack) => {
        const packId = String(pack.id || "");
        return "<tr data-pack-id=\"" + safe(packId) + "\"><td><a href=\"/ui/characters?characterPackId=" + encodeURIComponent(packId) + "\">" + safe(packId) + "</a></td><td>" + safe(pack.version) + "</td><td>" + safe(pack.status) + "</td><td>" + safe(pack.episodeId || "-") + "</td></tr>";
      }).join("");
      packsBody.querySelectorAll("tr[data-pack-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const packId = row.dataset.packId || "";
          if (selectedPack instanceof HTMLInputElement) selectedPack.value = packId;
          const episodeCell = row.children.length > 3 ? row.children[3] : null;
          if (episodeCell instanceof HTMLElement) {
            const linkedEpisodeId = String(episodeCell.textContent || "").trim();
            if (episodeInput instanceof HTMLInputElement && linkedEpisodeId && linkedEpisodeId !== "-") episodeInput.value = linkedEpisodeId;
          }
        });
      });
      applyFilter(q("studio-filter-packs"), packsBody);
    } catch (e) {
      packsBody.innerHTML = "<tr><td colspan='4'>실패: " + safe(String(e)) + "</td></tr>";
    }
  };

  const loadEpisodes = async () => {
    if (!(episodesBody instanceof HTMLElement)) return;
    episodesBody.innerHTML = "<tr><td colspan='4'>로딩 중...</td></tr>";
    try {
      const res = await fetch("/api/episodes?limit=30");
      if (!res.ok) throw new Error("에피소드 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        episodesBody.innerHTML = "<tr><td colspan='4'>에피소드가 없습니다.</td></tr>";
        return;
      }
      episodesBody.innerHTML = list.map((episode) => "<tr data-episode-id=\"" + safe(episode.id) + "\" data-episode-topic=\"" + safe(episode.topic || "") + "\"><td><a href=\"/ui/episodes/" + encodeURIComponent(String(episode.id || "")) + "\">" + safe(episode.id) + "</a></td><td>" + safe(episode.topic || "-") + "</td><td>" + safe(episode.status) + "</td><td>" + safe(episode.latestJobType || "-") + "</td></tr>").join("");
      episodesBody.querySelectorAll("tr[data-episode-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const episodeId = row.dataset.episodeId || "";
          const episodeTopic = row.dataset.episodeTopic || "";
          if (episodeInput instanceof HTMLInputElement) episodeInput.value = episodeId;
          if (topicInput instanceof HTMLInputElement && episodeTopic) topicInput.value = episodeTopic;
        });
      });
      applyFilter(q("studio-filter-episodes"), episodesBody);
    } catch (e) {
      episodesBody.innerHTML = "<tr><td colspan='4'>실패: " + safe(String(e)) + "</td></tr>";
    }
  };

  const loadJobs = async () => {
    if (!(jobsBody instanceof HTMLElement)) return;
    jobsBody.innerHTML = "<tr><td colspan='5'>로딩 중...</td></tr>";
    try {
      const res = await fetch("/api/jobs?limit=30");
      if (!res.ok) throw new Error("작업 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        jobsBody.innerHTML = "<tr><td colspan='5'>작업이 없습니다.</td></tr>";
        return;
      }
      jobsBody.innerHTML = list.map((job) => "<tr><td><a href=\"/ui/jobs/" + encodeURIComponent(String(job.id || "")) + "\">" + safe(job.id) + "</a></td><td>" + safe(job.type) + "</td><td>" + safe(job.status) + "</td><td>" + safe(job.progress) + "%</td><td>" + safe(job.episodeId || "-") + "</td></tr>").join("");
      applyFilter(q("studio-filter-jobs"), jobsBody);
    } catch (e) {
      jobsBody.innerHTML = "<tr><td colspan='5'>실패: " + safe(String(e)) + "</td></tr>";
    }
  };

  const startAutoRefresh = () => {
    if (refreshTimer) clearInterval(refreshTimer);
    const enabled = autoRefreshInput instanceof HTMLInputElement ? autoRefreshInput.checked : false;
    if (!enabled) return;
    const intervalMs = refreshIntervalInput instanceof HTMLSelectElement ? Number.parseInt(refreshIntervalInput.value, 10) || 5000 : 5000;
    refreshTimer = setInterval(() => { void loadAssets(); void loadPacks(); void loadEpisodes(); void loadJobs(); }, intervalMs);
  };

  q("studio-refresh-assets")?.addEventListener("click", () => { void loadAssets(); });
  q("studio-refresh-packs")?.addEventListener("click", () => { void loadPacks(); });
  q("studio-refresh-episodes")?.addEventListener("click", () => { void loadEpisodes(); });
  q("studio-refresh-jobs")?.addEventListener("click", () => { void loadJobs(); });
  q("studio-filter-assets")?.addEventListener("input", () => applyFilter(q("studio-filter-assets"), assetsBody));
  q("studio-filter-packs")?.addEventListener("input", () => applyFilter(q("studio-filter-packs"), packsBody));
  q("studio-filter-episodes")?.addEventListener("input", () => applyFilter(q("studio-filter-episodes"), episodesBody));
  q("studio-filter-jobs")?.addEventListener("input", () => applyFilter(q("studio-filter-jobs"), jobsBody));
  autoRefreshInput?.addEventListener("change", startAutoRefresh);
  refreshIntervalInput?.addEventListener("change", startAutoRefresh);

  q("studio-asset-upload-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = q("studio-asset-upload-form");
    const output = q("studio-asset-upload-result");
    const submit = q("studio-asset-upload-submit");
    if (!(form instanceof HTMLFormElement) || !(output instanceof HTMLElement) || !(submit instanceof HTMLButtonElement)) return;
    submit.disabled = true;
    output.textContent = "업로드 중...";
    try {
      const fd = new FormData(form);
      const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const json = await res.json();
      output.textContent = JSON.stringify(json, null, 2);
      if (res.ok && json?.data?.assetId) window.location.href = "/ui/assets?assetId=" + encodeURIComponent(json.data.assetId);
    } catch (error) {
      output.textContent = String(error);
    } finally {
      submit.disabled = false;
    }
  });

  q("studio-create-episode")?.addEventListener("click", async () => {
    try {
      const topic = topicInput instanceof HTMLInputElement && topicInput.value.trim() ? topicInput.value.trim() : "Studio Demo Episode";
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, targetDurationSec: 600 })
      });
      if (!res.ok) throw new Error(await readError(res, "에피소드 생성 실패"));
      const json = await res.json();
      const episodeId = String(json?.data?.episode?.id || "");
      if (episodeInput instanceof HTMLInputElement && episodeId) episodeInput.value = episodeId;
      setStatus("에피소드 생성 완료: " + (episodeId || "(id 없음)"));
      void loadEpisodes();
    } catch (error) {
      setStatus("에피소드 생성 실패: " + String(error));
    }
  });

  q("studio-oneclick")?.addEventListener("click", async () => {
    try {
      const topic = topicInput instanceof HTMLInputElement && topicInput.value.trim() ? topicInput.value.trim() : "Studio Oneclick Episode";
      const createRes = await fetch("/api/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, targetDurationSec: 600, pipeline: { stopAfterPreview: true, autoRenderFinal: false } })
      });
      if (!createRes.ok) throw new Error(await readError(createRes, "에피소드 생성 실패"));
      const createJson = await createRes.json();
      const jobId = String(createJson?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else window.location.href = "/ui/episodes";
    } catch (error) {
      setStatus("원클릭 시작 실패: " + String(error));
    }
  });

  q("studio-open-editor")?.addEventListener("click", () => {
    const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
    if (!episodeId) return setStatus("episodeId를 먼저 입력하세요.");
    window.location.href = "/ui/episodes/" + encodeURIComponent(episodeId) + "/editor";
  });

  q("studio-enqueue-preview")?.addEventListener("click", async () => {
    try {
      const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
      if (!episodeId) throw new Error("episodeId를 먼저 입력하세요.");
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId) + "/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobType: "RENDER_PREVIEW" })
      });
      if (!res.ok) throw new Error(await readError(res, "미리보기 렌더 등록 실패"));
      const json = await res.json();
      const jobId = String(json?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else setStatus("미리보기 렌더를 등록했습니다.");
    } catch (error) {
      setStatus("미리보기 렌더 등록 실패: " + String(error));
    }
  });

  q("studio-open-publish")?.addEventListener("click", () => {
    const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
    window.location.href = "/ui/publish" + (episodeId ? ("?episodeId=" + encodeURIComponent(episodeId)) : "");
  });

  void loadAssets();
  void loadPacks();
  void loadEpisodes();
  void loadJobs();
  startAutoRefresh();
})();
</script>`;
}
