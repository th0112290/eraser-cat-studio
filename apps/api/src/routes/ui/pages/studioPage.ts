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
  <h1>Studio</h1>
  <p class="studio-hint">Run asset upload, character generation, episode creation/render/publish from one screen.</p>
  <div id="studio-status" class="notice" aria-live="polite">Ready: create on the left, inspect history on the right.</div>
  <details class="card" style="margin:0">
    <summary><strong>Quick Start Guide</strong> (click to expand)</summary>
    <ol style="margin:10px 0 0;padding-left:18px">
      <li>Upload assets or inspect existing assets.</li>
      <li>Start character generation or select an existing character pack.</li>
      <li>Run one-click flow (create + preview) or create episode manually.</li>
      <li>Track progress from recent jobs list.</li>
      <li>Move to editor/publish when needed.</li>
    </ol>
  </details>
  <div class="studio-actions">
    <label><input id="studio-auto-refresh" type="checkbox" checked/> Auto refresh</label>
    <label>Interval
      <select id="studio-refresh-interval">
        <option value="3000">3s</option>
        <option value="5000" selected>5s</option>
        <option value="10000">10s</option>
      </select>
    </label>
  </div>
</section>
<section class="card studio-grid">
  <div class="studio-col">
    <section class="candidate studio-section">
      <h2 style="margin:0">1) Asset Upload</h2>
      <form id="studio-asset-upload-form" enctype="multipart/form-data" class="grid">
        <div class="grid two">
          <label>Asset Type<select name="assetType"><option value="character_reference">character_reference (reference)</option><option value="character_view">character_view (view variant)</option><option value="background">background (environment)</option><option value="chart_source">chart_source (chart)</option></select></label>
          <label>File<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label>
        </div>
        <button id="studio-asset-upload-submit" type="submit">Upload</button>
      </form>
      <pre id="studio-asset-upload-result">Waiting</pre>
    </section>
    <section class="candidate studio-section">
      <h2 style="margin:0">2) Character Generation</h2>
      <form method="post" action="/ui/character-generator/create" class="grid">
        <div class="grid two">
          <label>Mode<select name="mode"><option value="new">new (prompt-based)</option><option value="reference">reference (asset-based)</option></select></label>
          <label>Provider<select name="provider"><option value="mock">mock (default free)</option><option value="comfyui">comfyui (optional)</option><option value="remoteApi">remoteApi (optional)</option></select></label>
          <label>Prompt Preset<select name="promptPreset"><option value="default">default</option><option value="anime_clean">anime_clean</option><option value="brand_mascot">brand_mascot</option><option value="toon_bold">toon_bold</option></select></label>
          <label>Candidates<input name="candidateCount" type="number" min="1" max="8" value="4"/></label>
          <label>Topic (optional)<input name="topic" placeholder="character generation demo"/></label>
          <label>Seed<input name="seed" type="number" value="20260305"/></label>
        </div>
        <label>Positive Prompt (optional)<textarea name="positivePrompt" rows="2" placeholder="friendly orange cat mascot, clean silhouette"></textarea></label>
        <label>Negative Prompt (optional)<textarea name="negativePrompt" rows="2" placeholder="text, watermark, extra fingers, noisy background"></textarea></label>
        <button type="submit" data-primary-action="1">Start Character Generation</button>
      </form>
    </section>
    <section class="candidate studio-section">
      <h2 style="margin:0">3) Next Step (Episode/Render/Publish)</h2>
      <div class="grid two">
        <label>Episode Topic<input id="studio-topic" placeholder="ex) character intro video"/></label>
        <label>episodeId<input id="studio-episode-id" placeholder="cmm..."/></label>
        <label>Selected Character Pack<input id="studio-selected-pack" placeholder="select from right list" readonly/></label>
      </div>
      <div class="studio-actions">
        <button type="button" id="studio-oneclick" data-primary-action="1">Start One-click (create + preview)</button>
        <button type="button" id="studio-create-episode" class="secondary">Create Episode</button>
        <button type="button" id="studio-open-editor" class="secondary">Open Editor</button>
        <button type="button" id="studio-enqueue-preview" class="secondary">Enqueue Preview Render</button>
        <button type="button" id="studio-open-publish" class="secondary">Open Publish</button>
      </div>
    </section>
  </div>
  <div class="studio-col">
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">Recent Assets</h2><button type="button" id="studio-refresh-assets" class="secondary">Refresh</button></div>
      <input id="studio-filter-assets" placeholder="Search assets (id/type/status)" />
      <div class="studio-table-wrap"><table id="studio-assets-table"><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Created</th></tr></thead><tbody><tr><td colspan="4">Loading...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">Generated Character Packs</h2><button type="button" id="studio-refresh-packs" class="secondary">Refresh</button></div>
      <input id="studio-filter-packs" placeholder="Search packs (id/status/episode)" />
      <div class="studio-table-wrap"><table id="studio-packs-table"><thead><tr><th>ID</th><th>Version</th><th>Status</th><th>Episode</th></tr></thead><tbody><tr><td colspan="4">Loading...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">Recent Episodes</h2><button type="button" id="studio-refresh-episodes" class="secondary">Refresh</button></div>
      <input id="studio-filter-episodes" placeholder="Search episodes (id/topic/status)" />
      <div class="studio-table-wrap"><table id="studio-episodes-table"><thead><tr><th>ID</th><th>Topic</th><th>Status</th><th>Latest Job</th></tr></thead><tbody><tr><td colspan="4">Loading...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">Recent Jobs</h2><button type="button" id="studio-refresh-jobs" class="secondary">Refresh</button></div>
      <input id="studio-filter-jobs" placeholder="Search jobs (id/type/status/episode)" />
      <div class="studio-table-wrap"><table id="studio-jobs-table"><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Episode</th></tr></thead><tbody><tr><td colspan="5">Loading...</td></tr></tbody></table></div>
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
      row.style.display = !qText || text.includes(qText) ? "" : "";
      if (qText && !text.includes(qText)) row.style.display = "none";
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
    assetsBody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";
    try {
      const res = await fetch("/api/assets?limit=30");
      if (!res.ok) throw new Error("Asset list failed: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        assetsBody.innerHTML = "<tr><td colspan='4'>No assets.</td></tr>";
        return;
      }
      assetsBody.innerHTML = list.map((asset) => "<tr><td><a href=\"/ui/assets?assetId=" + encodeURIComponent(String(asset.id || "")) + "\">" + safe(asset.id) + "</a></td><td>" + safe(asset.assetType) + "</td><td>" + safe(asset.status) + "</td><td>" + safe(asset.createdAt) + "</td></tr>").join("");
      applyFilter(q("studio-filter-assets"), assetsBody);
    } catch (e) {
      assetsBody.innerHTML = "<tr><td colspan='4'>Failed: " + safe(String(e)) + "</td></tr>";
    }
  };

  const loadPacks = async () => {
    if (!(packsBody instanceof HTMLElement)) return;
    packsBody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";
    try {
      const res = await fetch("/api/character-packs?limit=30");
      if (!res.ok) throw new Error("Character packs failed: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        packsBody.innerHTML = "<tr><td colspan='4'>No character packs.</td></tr>";
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
      packsBody.innerHTML = "<tr><td colspan='4'>Failed: " + safe(String(e)) + "</td></tr>";
    }
  };

  const loadEpisodes = async () => {
    if (!(episodesBody instanceof HTMLElement)) return;
    episodesBody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";
    try {
      const res = await fetch("/api/episodes?limit=30");
      if (!res.ok) throw new Error("Episodes failed: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        episodesBody.innerHTML = "<tr><td colspan='4'>No episodes.</td></tr>";
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
      episodesBody.innerHTML = "<tr><td colspan='4'>Failed: " + safe(String(e)) + "</td></tr>";
    }
  };

  const loadJobs = async () => {
    if (!(jobsBody instanceof HTMLElement)) return;
    jobsBody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";
    try {
      const res = await fetch("/api/jobs?limit=30");
      if (!res.ok) throw new Error("Jobs failed: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        jobsBody.innerHTML = "<tr><td colspan='5'>No jobs.</td></tr>";
        return;
      }
      jobsBody.innerHTML = list.map((job) => "<tr><td><a href=\"/ui/jobs/" + encodeURIComponent(String(job.id || "")) + "\">" + safe(job.id) + "</a></td><td>" + safe(job.type) + "</td><td>" + safe(job.status) + "</td><td>" + safe(job.progress) + "%</td><td>" + safe(job.episodeId || "-") + "</td></tr>").join("");
      applyFilter(q("studio-filter-jobs"), jobsBody);
    } catch (e) {
      jobsBody.innerHTML = "<tr><td colspan='5'>Failed: " + safe(String(e)) + "</td></tr>";
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
    output.textContent = "Uploading...";
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
      if (!res.ok) throw new Error(await readError(res, "Episode create failed"));
      const json = await res.json();
      const episodeId = String(json?.data?.episode?.id || "");
      if (episodeInput instanceof HTMLInputElement && episodeId) episodeInput.value = episodeId;
      setStatus("Episode created: " + (episodeId || "(no id)"));
      void loadEpisodes();
    } catch (error) {
      setStatus("Episode create failed: " + String(error));
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
      if (!createRes.ok) throw new Error(await readError(createRes, "Episode create failed"));
      const createJson = await createRes.json();
      const jobId = String(createJson?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else window.location.href = "/ui/episodes";
    } catch (error) {
      setStatus("One-click start failed: " + String(error));
    }
  });

  q("studio-open-editor")?.addEventListener("click", () => {
    const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
    if (!episodeId) return setStatus("Enter episodeId first.");
    window.location.href = "/ui/episodes/" + encodeURIComponent(episodeId) + "/editor";
  });

  q("studio-enqueue-preview")?.addEventListener("click", async () => {
    try {
      const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
      if (!episodeId) throw new Error("Enter episodeId first.");
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId) + "/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobType: "RENDER_PREVIEW" })
      });
      if (!res.ok) throw new Error(await readError(res, "Preview enqueue failed"));
      const json = await res.json();
      const jobId = String(json?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else setStatus("Preview render enqueued.");
    } catch (error) {
      setStatus("Preview enqueue failed: " + String(error));
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

