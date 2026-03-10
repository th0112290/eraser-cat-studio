function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

type StudioChannelProfileSummary = {
  source: string;
  channelName: string;
  channelId: string;
  language: string;
  tone: string;
  pacing: string;
  stylePresetCount: number;
  forbiddenTermsSummary: string;
  negativeTermsSummary: string;
  updatedAt: string;
  editorHref: string;
};

type StudioPackStateSummary = {
  activePackId: string;
  activePackVersion: string;
  activePackStatus: string;
  latestPackId: string;
  latestPackCreatedAt: string;
  approvedCount: number;
  archivedCount: number;
  pendingCount: number;
  compareHref: string;
  charactersHref: string;
  generatorHref: string;
};

type StudioBodyInput = {
  message?: string;
  error?: string;
  channelProfile: StudioChannelProfileSummary;
  packState: StudioPackStateSummary;
};

function renderMetaRow(label: string, value: string): string {
  return `<div class="studio-meta-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function buildStudioScript(seed: { activePackId: string; compareHref: string }): string {
  return `(() => {
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
  const selectionTitle = q("studio-selection-title");
  const selectionMeta = q("studio-selection-meta");
  const selectionFields = q("studio-selection-fields");
  const selectionLinks = q("studio-selection-links");
  let refreshTimer = null;

  const safe = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\\"", "&quot;").replaceAll("'", "&#39;");
  const readText = (v, fallback = "-") => {
    const text = String(v ?? "").trim();
    return text ? text : fallback;
  };
  const readPath = (root, path) => {
    let current = root;
    for (const key of path) {
      if (!current || typeof current !== "object" || !(key in current)) return null;
      current = current[key];
    }
    return current;
  };
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
  const renderSelection = (title, metaText, fields, links) => {
    if (selectionTitle instanceof HTMLElement) selectionTitle.textContent = title;
    if (selectionMeta instanceof HTMLElement) selectionMeta.textContent = metaText;
    if (selectionFields instanceof HTMLElement) {
      if (!fields.length) {
        selectionFields.innerHTML = "<div class=\\"studio-selection-empty\\">No details were recorded for this selection.</div>";
      } else {
        selectionFields.innerHTML = fields.map((field) => "<div class=\\"studio-meta-row\\"><span>" + safe(field.label) + "</span><strong>" + safe(field.value) + "</strong></div>").join("");
      }
    }
    if (selectionLinks instanceof HTMLElement) {
      selectionLinks.innerHTML = (links || []).map((link) => "<a href=\\"" + safe(link.href) + "\\">" + safe(link.label) + "</a>").join("");
    }
  };
  const summarizePackJson = (packJson) => {
    const selectedByView = readPath(packJson, ["selectedByView"]);
    const selectedViews = selectedByView && typeof selectedByView === "object" ? Object.keys(selectedByView).filter((key) => selectedByView[key]) : [];
    return {
      mascotProfile: readText(readPath(packJson, ["mascot", "profile"]) || readPath(packJson, ["profile"]) || readPath(packJson, ["profileAssetId"]), "(not recorded)"),
      lineage: readText(readPath(packJson, ["sourceImageRef"]) || readPath(packJson, ["hash"]) || readPath(packJson, ["schemaId"]), "(not recorded)"),
      selectedViews: selectedViews.length ? selectedViews.join(", ") : "(not recorded)"
    };
  };
  const loadPackInspector = async (packId) => {
    if (!packId) return;
    renderSelection("Loading Pack...", "Reading pack metadata from the API...", [], []);
    try {
      const res = await fetch("/api/character-packs/" + encodeURIComponent(packId));
      if (!res.ok) throw new Error("Pack detail failed: " + res.status);
      const json = await res.json();
      const pack = json?.data;
      if (!pack) throw new Error("Pack detail missing data");
      const summary = summarizePackJson(pack.json);
      const latestEpisode = Array.isArray(pack.episodes) && pack.episodes.length > 0 ? pack.episodes[0] : null;
      const rollbackState = String(pack.status || "").toUpperCase() === "APPROVED" ? "active" : "rollback candidate";
      renderSelection(
        "Pack " + readText(pack.id),
        "Channel and pack metadata for compare, rollback, and mascot profile checks.",
        [
          { label: "channel", value: readText(pack.channelId) },
          { label: "version", value: "v" + readText(pack.version) },
          { label: "status", value: readText(pack.status) },
          { label: "mascot profile", value: summary.mascotProfile },
          { label: "selected views", value: summary.selectedViews },
          { label: "lineage", value: summary.lineage },
          { label: "latest episode", value: latestEpisode ? readText(latestEpisode.id) + " / " + readText(latestEpisode.topic) : "-" },
          { label: "rollback state", value: rollbackState }
        ],
        [
          { label: "Pack Detail", href: "/ui/characters?characterPackId=" + encodeURIComponent(packId) },
          summary.mascotProfile && summary.mascotProfile !== "(not recorded)" ? { label: "Profiles", href: "/ui/profiles?q=" + encodeURIComponent(summary.mascotProfile) } : null,
          { label: "Preview", href: "/artifacts/characters/" + encodeURIComponent(packId) + "/preview.mp4" },
          { label: "QC Report", href: "/artifacts/characters/" + encodeURIComponent(packId) + "/qc_report.json" },
          ${seed.compareHref ? `{ label: "Compare", href: ${JSON.stringify(seed.compareHref)} }` : "null"}
        ].filter(Boolean)
      );
    } catch (error) {
      renderSelection("Pack Lookup Failed", String(error), [], [{ label: "Open Characters", href: "/ui/characters" }]);
    }
  };
  const loadEpisodeInspector = async (episodeId) => {
    if (!episodeId) return;
    renderSelection("Loading Episode...", "Reading episode metadata from the API...", [], []);
    try {
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId));
      if (!res.ok) throw new Error("Episode detail failed: " + res.status);
      const json = await res.json();
      const data = json?.data;
      const episode = data?.episode;
      if (!episode) throw new Error("Episode detail missing data");
      const style = readPath(episode, ["datasetVersionSnapshot", "style"]) || {};
      const latestJob = Array.isArray(data.jobs) && data.jobs.length > 0 ? data.jobs[0] : null;
      renderSelection(
        "Episode " + readText(episode.id),
        "Latest run context, style profile, and artifact readiness for the selected episode.",
        [
          { label: "channel", value: readText(readPath(episode, ["channel", "name"]) || readPath(episode, ["channelId"])) },
          { label: "topic", value: readText(episode.topic) },
          { label: "status", value: readText(episode.status) },
          { label: "character pack", value: readText(episode.characterPackId, "(none)") },
          { label: "style preset", value: readText(readPath(style, ["stylePresetId"]), "(auto)") },
          { label: "hook boost", value: readText(readPath(style, ["hookBoost"]), "-") },
          { label: "latest job", value: latestJob ? readText(latestJob.type) + " / " + readText(latestJob.status) : "(none)" },
          { label: "artifacts", value: "preview=" + (data?.artifacts?.previewExists ? "yes" : "no") + " / final=" + (data?.artifacts?.finalExists ? "yes" : "no") }
        ],
        [
          { label: "Episode Detail", href: "/ui/episodes/" + encodeURIComponent(episodeId) },
          { label: "Shot Editor", href: "/ui/episodes/" + encodeURIComponent(episodeId) + "/editor" },
          { label: "Profiles", href: "/ui/profiles" },
          { label: "Publish", href: "/ui/publish?episodeId=" + encodeURIComponent(episodeId) }
        ]
      );
    } catch (error) {
      renderSelection("Episode Lookup Failed", String(error), [], [{ label: "Open Episodes", href: "/ui/episodes" }]);
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
      assetsBody.innerHTML = list.map((asset) => "<tr><td><a href=\\"/ui/assets?assetId=" + encodeURIComponent(String(asset.id || "")) + "\\">" + safe(asset.id) + "</a></td><td>" + safe(asset.assetType) + "</td><td>" + safe(asset.status) + "</td><td>" + safe(asset.createdAt) + "</td></tr>").join("");
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
        const latestEpisodeId = readText(pack?.latestEpisode?.id, "-");
        return "<tr data-pack-id=\\"" + safe(packId) + "\\" data-pack-status=\\"" + safe(pack.status) + "\\" data-pack-version=\\"" + safe(pack.version) + "\\" data-pack-episode-id=\\"" + safe(latestEpisodeId) + "\\"><td><a href=\\"/ui/characters?characterPackId=" + encodeURIComponent(packId) + "\\">" + safe(packId) + "</a></td><td>" + safe(pack.version) + "</td><td>" + safe(pack.status) + "</td><td>" + safe(latestEpisodeId) + "</td></tr>";
      }).join("");
      packsBody.querySelectorAll("tr[data-pack-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const packId = row.dataset.packId || "";
          if (selectedPack instanceof HTMLInputElement) selectedPack.value = packId;
          const linkedEpisodeId = String(row.dataset.packEpisodeId || "").trim();
          if (episodeInput instanceof HTMLInputElement && linkedEpisodeId && linkedEpisodeId !== "-") episodeInput.value = linkedEpisodeId;
          void loadPackInspector(packId);
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
      episodesBody.innerHTML = list.map((episode) => {
        const latestJob = Array.isArray(episode.jobs) && episode.jobs.length > 0 ? episode.jobs[0] : null;
        return "<tr data-episode-id=\\"" + safe(episode.id) + "\\" data-episode-topic=\\"" + safe(episode.topic || "") + "\\"><td><a href=\\"/ui/episodes/" + encodeURIComponent(String(episode.id || "")) + "\\">" + safe(episode.id) + "</a></td><td>" + safe(episode.topic || "-") + "</td><td>" + safe(episode.status) + "</td><td>" + safe(latestJob ? latestJob.type + " (" + latestJob.status + ")" : "-") + "</td></tr>";
      }).join("");
      episodesBody.querySelectorAll("tr[data-episode-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const episodeId = row.dataset.episodeId || "";
          const episodeTopic = row.dataset.episodeTopic || "";
          if (episodeInput instanceof HTMLInputElement) episodeInput.value = episodeId;
          if (topicInput instanceof HTMLInputElement && episodeTopic) topicInput.value = episodeTopic;
          void loadEpisodeInspector(episodeId);
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
      jobsBody.innerHTML = list.map((job) => "<tr><td><a href=\\"/ui/jobs/" + encodeURIComponent(String(job.id || "")) + "\\">" + safe(job.id) + "</a></td><td>" + safe(job.type) + "</td><td>" + safe(job.status) + "</td><td>" + safe(job.progress) + "%</td><td>" + safe(job.episodeId || "-") + "</td></tr>").join("");
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
        body: JSON.stringify({ topic, targetDurationSec: 600, characterPackId: selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() || undefined : undefined })
      });
      if (!res.ok) throw new Error(await readError(res, "Episode create failed"));
      const json = await res.json();
      const episodeId = String(json?.data?.episode?.id || "");
      if (episodeInput instanceof HTMLInputElement && episodeId) episodeInput.value = episodeId;
      setStatus("Episode created: " + (episodeId || "(no id)"));
      if (episodeId) void loadEpisodeInspector(episodeId);
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
        body: JSON.stringify({
          topic,
          targetDurationSec: 600,
          characterPackId: selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() || undefined : undefined,
          pipeline: { stopAfterPreview: true, autoRenderFinal: false }
        })
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
  if (${JSON.stringify(seed.activePackId)}) {
    if (selectedPack instanceof HTMLInputElement && !selectedPack.value.trim()) selectedPack.value = ${JSON.stringify(seed.activePackId)};
    void loadPackInspector(${JSON.stringify(seed.activePackId)});
  }
  startAutoRefresh();
})();`;
}

export function buildStudioBody(input: StudioBodyInput): string {
  const seed = {
    activePackId: input.packState.activePackId,
    compareHref: input.packState.compareHref
  };
  const flash = `${input.message ? `<div class="notice">${esc(input.message)}</div>` : ""}${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}`;
  return `${flash}
<section class="card studio-shell">
  <style>
    .studio-shell{display:grid;gap:10px}
    .studio-hint{margin:0;color:#425466;font-size:13px}
    .studio-grid{display:grid;gap:12px;grid-template-columns:minmax(320px,1fr) minmax(320px,1fr) minmax(280px,.82fr);align-items:start}
    .studio-col{display:grid;gap:12px}
    .studio-section{background:#fff}
    .studio-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .studio-table-wrap{overflow:auto;max-height:320px;border:1px solid #dce5f3;border-radius:10px}
    .studio-table-wrap table{margin:0}
    .studio-table-wrap tbody tr:hover{background:#f8fbff}
    .studio-table-wrap tbody tr:focus-within{outline:2px solid #0f5bd8;outline-offset:-2px}
    .studio-actions{display:flex;gap:8px;flex-wrap:wrap}
    .studio-rail{display:grid;gap:12px;position:sticky;top:84px}
    .studio-rail-card{display:grid;gap:10px;padding:14px;border:1px solid #dce5f3;border-radius:14px;background:linear-gradient(180deg,#fcfffe,#f4faf8)}
    .studio-rail-card h2,.studio-rail-card h3{margin:0}
    .studio-rail-kicker{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#0f766e}
    .studio-meta{display:grid;gap:8px}
    .studio-meta-row{display:grid;gap:3px;padding:8px 10px;border:1px solid #dbe6f1;border-radius:10px;background:#fff}
    .studio-meta-row span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5b687a}
    .studio-meta-row strong,.studio-meta-row code{font-size:13px;color:#102126}
    .studio-selection-empty{padding:10px 11px;border:1px dashed #b8cfe0;border-radius:10px;background:#f8fbff;color:#4b647a}
    .studio-filter-row{display:grid;gap:6px}
    .studio-filter-row label{font-size:12px;font-weight:700;color:#334155}
    .studio-links{display:flex;flex-wrap:wrap;gap:8px}
    .studio-links a{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid #c7d9eb;background:#fff;color:#0f4e6a;font-size:12px;font-weight:700}
    .studio-links a:hover{text-decoration:none;background:#eef7ff}
    .studio-badges{display:flex;flex-wrap:wrap;gap:6px}
    .studio-note{margin:0;color:#4b647a;font-size:12px;line-height:1.5}
    @media (max-width:1260px){.studio-grid{grid-template-columns:1fr}.studio-rail{position:static}}
  </style>
  <h1>Studio</h1>
  <p class="studio-hint">Run asset upload, character generation, episode creation, render, publish, and pack inspection from one control surface.</p>
  <div id="studio-status" class="notice" aria-live="polite">Ready: create on the left, inspect history in the middle, and verify ops context on the right.</div>
  <details class="card" style="margin:0">
    <summary><strong>Quick Start Guide</strong> (click to expand)</summary>
    <ol style="margin:10px 0 0;padding-left:18px">
      <li>Upload assets or inspect existing assets.</li>
      <li>Start character generation or select an existing character pack.</li>
      <li>Create an episode or jump into the editor.</li>
      <li>Track progress from recent jobs and the inspector rail.</li>
      <li>Use Rollouts, Characters, and ChannelBible links for deeper ops work.</li>
    </ol>
  </details>
  <div class="studio-actions">
    <label><input id="studio-auto-refresh" type="checkbox" checked/> Auto refresh</label>
    <label for="studio-refresh-interval">Interval
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
          <label>Topic (optional)<input name="topic" placeholder="character generation demo..."/></label>
          <label>Seed<input name="seed" type="number" value="20260305"/></label>
        </div>
        <label>Positive Prompt (optional)<textarea name="positivePrompt" rows="2" placeholder="friendly orange cat mascot, clean silhouette..."></textarea></label>
        <label>Negative Prompt (optional)<textarea name="negativePrompt" rows="2" placeholder="text, watermark, extra fingers, noisy background..."></textarea></label>
        <button type="submit" data-primary-action="1">Start Character Generation</button>
      </form>
    </section>
    <section class="candidate studio-section">
      <h2 style="margin:0">3) Next Step (Episode/Render/Publish)</h2>
      <div class="grid two">
        <label for="studio-topic">Episode Topic<input id="studio-topic" placeholder="ex) character intro video..."/></label>
        <label for="studio-episode-id">episodeId<input id="studio-episode-id" placeholder="cmm..."/></label>
        <label for="studio-selected-pack">Selected Character Pack<input id="studio-selected-pack" placeholder="select from recent packs..." readonly/></label>
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
      <div class="studio-filter-row"><label for="studio-filter-assets">Filter assets</label><input id="studio-filter-assets" type="search" aria-label="Filter recent assets" placeholder="Search assets by id, type, status..."/></div>
      <div class="studio-table-wrap"><table id="studio-assets-table"><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Created</th></tr></thead><tbody><tr><td colspan="4">Loading...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">Generated Character Packs</h2><button type="button" id="studio-refresh-packs" class="secondary">Refresh</button></div>
      <div class="studio-filter-row"><label for="studio-filter-packs">Filter packs</label><input id="studio-filter-packs" type="search" aria-label="Filter generated character packs" placeholder="Search packs by id, status, episode..."/></div>
      <div class="studio-table-wrap"><table id="studio-packs-table"><thead><tr><th>ID</th><th>Version</th><th>Status</th><th>Episode</th></tr></thead><tbody><tr><td colspan="4">Loading...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">Recent Episodes</h2><button type="button" id="studio-refresh-episodes" class="secondary">Refresh</button></div>
      <div class="studio-filter-row"><label for="studio-filter-episodes">Filter episodes</label><input id="studio-filter-episodes" type="search" aria-label="Filter recent episodes" placeholder="Search episodes by id, topic, status..."/></div>
      <div class="studio-table-wrap"><table id="studio-episodes-table"><thead><tr><th>ID</th><th>Topic</th><th>Status</th><th>Latest Job</th></tr></thead><tbody><tr><td colspan="4">Loading...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">Recent Jobs</h2><button type="button" id="studio-refresh-jobs" class="secondary">Refresh</button></div>
      <div class="studio-filter-row"><label for="studio-filter-jobs">Filter jobs</label><input id="studio-filter-jobs" type="search" aria-label="Filter recent jobs" placeholder="Search jobs by id, type, status, episode..."/></div>
      <div class="studio-table-wrap"><table id="studio-jobs-table"><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Episode</th></tr></thead><tbody><tr><td colspan="5">Loading...</td></tr></tbody></table></div>
    </section>
  </div>
  <aside class="studio-rail">
    <section class="studio-rail-card">
      <div class="studio-rail-kicker">Channel Profile</div>
      <h2>${esc(input.channelProfile.channelName)}</h2>
      <p class="studio-note">Operator-facing summary of the active channel profile. Use this as the default reference before changing packs or queueing previews.</p>
      <div class="studio-meta">
        ${renderMetaRow("Source", input.channelProfile.source)}
        ${renderMetaRow("Channel", `${input.channelProfile.channelId || "(default)"} / ${input.channelProfile.language}`)}
        ${renderMetaRow("Tone & Pacing", `${input.channelProfile.tone} / ${input.channelProfile.pacing}`)}
        ${renderMetaRow("Style Presets", String(input.channelProfile.stylePresetCount))}
        ${renderMetaRow("Forbidden Terms", input.channelProfile.forbiddenTermsSummary)}
        ${renderMetaRow("Negative Terms", input.channelProfile.negativeTermsSummary)}
        ${renderMetaRow("Updated", input.channelProfile.updatedAt)}
      </div>
      <div class="studio-links"><a href="${esc(input.channelProfile.editorHref)}">Open ChannelBible</a><a href="/ui/profiles">Open Profiles</a><a href="/ui/rollouts">Open Rollouts</a></div>
    </section>
    <section class="studio-rail-card">
      <div class="studio-rail-kicker">Pack Control</div>
      <h3>Active Pack Snapshot</h3>
      <div class="studio-meta">
        ${renderMetaRow("Active Pack", input.packState.activePackId || "(none)")}
        ${renderMetaRow("Status", `${input.packState.activePackStatus} / v${input.packState.activePackVersion}`)}
        ${renderMetaRow("Latest Pack", input.packState.latestPackId || "(none)")}
        ${renderMetaRow("Recent Activity", input.packState.latestPackCreatedAt)}
      </div>
      <div class="studio-badges">
        <span class="badge ok">approved ${esc(input.packState.approvedCount)}</span>
        <span class="badge warn">archived ${esc(input.packState.archivedCount)}</span>
        <span class="badge muted">pending ${esc(input.packState.pendingCount)}</span>
      </div>
      <div class="studio-links"><a href="${esc(input.packState.charactersHref)}">Open Characters</a><a href="${esc(input.packState.generatorHref)}">Open Generator</a>${input.packState.compareHref ? `<a href="${esc(input.packState.compareHref)}">Open Compare</a>` : ""}</div>
    </section>
    <section class="studio-rail-card">
      <div class="studio-rail-kicker">Current Selection</div>
      <h3 id="studio-selection-title">No Selection</h3>
      <p id="studio-selection-meta" class="studio-note">Select a character pack or episode from the tables to inspect the current pipeline context.</p>
      <div id="studio-selection-fields" class="studio-meta"><div class="studio-selection-empty">No pack or episode is selected yet.</div></div>
      <div id="studio-selection-links" class="studio-links"></div>
    </section>
  </aside>
</section>
<script type="application/json" id="studio-inspector-seed">${jsonScript(seed)}</script>
<script>
${buildStudioScript(seed)}
</script>`;
}
