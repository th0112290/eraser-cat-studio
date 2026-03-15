import { UI_SHELL_FLAT_NAV, UI_SHELL_NAV_GROUPS, UI_SHELL_SHORTCUTS } from "./uiShellConfig";

function esc(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderNav(): string {
  return UI_SHELL_NAV_GROUPS.map(
    (group) => `<section class="shell-nav-group" aria-label="${esc(group.label)}">
      <div class="shell-nav-head"><span>${esc(group.label)}</span><small>${esc(group.description)}</small></div>
      <div class="shell-nav-links">${group.items
        .map(
          (item) =>
            `<a href="${esc(item.href)}" data-hotkey="${esc(item.hotkey ?? "")}"><strong>${esc(item.label)}</strong><small>${esc(
              item.description
            )}</small></a>`
        )
        .join("")}</div>
    </section>`
  ).join("");
}

function renderShortcutRows(): string {
  return UI_SHELL_SHORTCUTS.map((item) => `<tr><td>${esc(item.key)}</td><td>${esc(item.action)}</td></tr>`).join("");
}

export function renderUiPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)}</title>
  <style>
    :root{--bg:#eef4f3;--bg2:#e2ecea;--ink:#102126;--muted:#405663;--line:#c4d7dc;--card:#ffffffec;--card-strong:#ffffff;--primary:#0e7a74;--primary-ink:#f1fffc;--good:#166534;--warn:#975a16;--bad:#b42318;--ring:#7cc9c3;--shadow:#11354622}
    *{box-sizing:border-box}
    body{margin:0;font-family:"SUIT Variable","Sora","Pretendard Variable","Noto Sans KR",sans-serif;color:var(--ink);background:radial-gradient(980px 420px at 16% -8%,#caebe5 0,#caebe500 72%),radial-gradient(980px 520px at 88% -18%,#ffe4c7 0,#ffe4c700 70%),linear-gradient(180deg,var(--bg),var(--bg2));min-height:100vh}
    .skip-link{position:absolute;left:16px;top:-44px;padding:8px 12px;border-radius:10px;background:#0f172a;color:#f8fbff;font-weight:700;z-index:30;transition:top .15s ease}.skip-link:focus{top:12px}
    .shell-header{position:sticky;top:0;z-index:20;backdrop-filter:blur(12px);background:#ffffffd9;border-bottom:1px solid #b7ccd2;box-shadow:0 10px 24px #0f2c3512}
    .shell-inner{max-width:1320px;margin:0 auto;padding:12px 18px 14px;display:grid;gap:12px}
    .shell-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .shell-brand{display:grid;gap:8px;max-width:760px}
    .shell-brand-mark{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c3f3b}
    .shell-brand-mark strong{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:38px;padding:0 12px;border-radius:12px;background:linear-gradient(180deg,#0f766e,#0d5f59);color:#f2fffd}
    .shell-brand h1{margin:0;font-size:28px;letter-spacing:-.03em}
    .shell-brand p{margin:0;color:var(--muted);line-height:1.55}
    .shell-meta{display:grid;gap:8px;justify-items:end}
    .shell-chip-row,.shell-status-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .shell-chip,.shell-status{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;border:1px solid #c8dce0;background:#f8fbfb;color:#24424b;font-size:12px;font-weight:700}
    .shell-status strong{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#0d5f59}
    .shell-shortcuts{display:flex;gap:8px;align-items:center}.shell-shortcuts .muted-text{font-size:11px}
    .shell-nav-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .shell-nav-group{display:grid;gap:10px;padding:12px;border:1px solid #d3e0e2;border-radius:18px;background:linear-gradient(180deg,#ffffffdf,#f4faf9)}
    .shell-nav-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.shell-nav-head span{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#0c3f3b}.shell-nav-head small{font-size:11px;color:#5d7380}
    .shell-nav-links{display:grid;gap:8px}
    .shell-nav-links a{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:9px 10px;border-radius:12px;border:1px solid transparent;background:#f7fbfb;color:#103a40;text-decoration:none;transition:.18s ease}
    .shell-nav-links a:hover{background:#eef8f6;border-color:#b5d9d3;text-decoration:none}
    .shell-nav-links a.active{background:linear-gradient(180deg,#dff6ef,#d3ece5);border-color:#8fc7be;color:#0d3d3a}
    .shell-nav-links strong{font-size:13px}
    .shell-nav-links small{font-size:11px;color:#60717c;line-height:1.35;max-width:150px;text-align:right}
    main{max-width:1320px;margin:20px auto;padding:0 18px 28px;display:grid;gap:14px}
    .card{background:linear-gradient(180deg,var(--card),var(--card-strong));border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 14px 32px var(--shadow)}
    .card h1,.card h2,.card h3{margin-top:0}.card h1{font-size:28px;letter-spacing:-.02em}.card h2{font-size:20px;letter-spacing:-.01em}
    .notice,.success-state{padding:10px 11px;border-left:4px solid #0f766e;background:#e8f8f5;border-radius:10px}.warning-state{padding:10px 11px;border-left:4px solid var(--warn);background:#fff7e8;border-radius:10px}.error,.error-state{padding:10px 11px;border-left:4px solid var(--bad);background:#fff1f2;border-radius:10px}.empty-state{padding:12px 13px;border:1px dashed #c6d8e0;background:#f8fbff;color:#516571;border-radius:12px}
    .dashboard-shell,.detail-shell,.compare-shell,.table-shell,.grid,.stack,.status-panel{display:grid;gap:10px}.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
    .page-intro,.detail-hero,.compare-hero{position:relative;overflow:hidden;display:grid;gap:12px;padding:18px;border-radius:18px;border:1px solid #c7dade;background:linear-gradient(140deg,#f7fcfb 0%,#ffffff 54%,#eef8f5 100%);box-shadow:0 16px 36px #11354618}
    .page-intro::before,.detail-hero::before,.compare-hero::before{content:"";position:absolute;inset:0 auto auto 0;height:4px;width:100%;background:linear-gradient(90deg,#0e7a74,#d97706)}
    .page-intro-head,.section-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
    .hero-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.95fr);gap:14px;align-items:start}.hero-panel,.status-panel{padding:14px;border-radius:16px;border:1px solid #d5e4e7;background:#ffffffde}
    .status-list{display:grid;gap:8px;margin:6px 0 0}.status-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:10px}
    .status-row .label,.muted-text{color:#55657a;font-size:12px}.sticky-action-bar,.quick-links,.inline-actions,.actions,.table-tools,.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .sticky-action-bar{position:sticky;top:150px;padding:12px;border-radius:16px;border:1px solid #c9dfe3;background:#ffffffe8;box-shadow:0 10px 24px #11354614}
    .quick-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));align-items:start}
    .form-card{display:grid;gap:10px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}.form-card h3{margin:0;font-size:15px}.field{display:grid;gap:5px}.field label{font-size:12px;font-weight:700;color:#334155}.field small,.section-intro{color:#4b5f69;line-height:1.5}.field input{width:100%}
    .link-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.link-grid a{display:block;padding:10px 12px;border:1px solid #d0dfef;border-radius:10px;background:#f8fbff;color:#114a45;font-weight:700}
    .summary-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(148px,1fr))}.summary-card{display:grid;gap:6px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:14px}.summary-card .metric{font-size:26px;font-weight:800;letter-spacing:-.03em}.summary-card .caption{font-size:12px;color:#5b687a;line-height:1.4}
    .mono{font-family:"Cascadia Code","JetBrains Mono","Fira Code",monospace;font-size:12px;word-break:break-all}
    .table-wrap{overflow:auto;border:1px solid #d3e2eb;border-radius:14px;background:#fff}.table-wrap table{border:none;border-radius:0;min-width:720px}.table-wrap th{position:sticky;top:0;z-index:1}tbody tr:nth-child(even){background:#fbfdff}tbody tr:hover{background:#f1f8ff}
    .table-tools input[type="search"]{min-width:220px;max-width:360px}.search-cluster{display:grid;gap:6px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
    .kbd{display:inline-block;border:1px solid #d0dceb;border-bottom-width:2px;border-radius:7px;padding:1px 6px;background:#f8fbff;color:#0f3f5f;font-size:12px;font-weight:700}
    .quick-links a{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #c7d9eb;background:#f8fbff;color:#0f4e6a;font-size:12px;font-weight:700}
    a{color:#0f766e;text-decoration:none}a:hover{text-decoration:underline}
    table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #dbe6f1;border-radius:12px;overflow:hidden}th,td{border-bottom:1px solid #e8eef5;padding:8px 9px;text-align:left;vertical-align:top}th{background:#f2f9fc;color:#2f4552;font-weight:700}
    .badge{display:inline-block;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700}.badge.ok{background:#e9f8ee;color:var(--good)}.badge.warn{background:#fff7e8;color:var(--warn)}.badge.bad{background:#fff1f2;color:var(--bad)}.badge.muted{background:#eef2f7;color:#475569}
    input,select,textarea,button{font:inherit;border:1px solid #c7d5e4;border-radius:10px;padding:8px 10px;background:#fff}input:focus,select:focus,textarea:focus{outline:2px solid var(--ring);border-color:#0f766e}textarea{width:100%;min-height:220px;resize:vertical}
    button{background:linear-gradient(180deg,#119189,#0e7a74);color:var(--primary-ink);border:none;font-weight:800;letter-spacing:.01em;cursor:pointer;transition:.18s ease;box-shadow:0 7px 16px #0f766e35}.button-link,.secondary{background:linear-gradient(180deg,#fbfdff,#f2f8fc);color:#164d68;border:1px solid #bdd2e3;box-shadow:none}
    pre{margin:0;background:#0f172a;color:#d6e4ff;padding:11px;border-radius:10px;overflow:auto;font-size:12px}
    .toast-wrap{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:9999}.toast{background:#0f172a;color:#f8fbff;border-radius:11px;padding:10px 12px;box-shadow:0 10px 24px #0000002b;min-width:240px;max-width:460px}.toast.ok{background:#14532d}.toast.warn{background:#9a5a00}.toast.bad{background:#7f1d1d}.toast .title{font-weight:800;margin-bottom:4px}
    .submit-loading{opacity:.72;pointer-events:none}.submit-loading::after{content:"...";margin-left:4px}.field-error{color:#b42318;font-size:12px;padding-top:2px}.hint{display:inline-block;border-bottom:1px dotted #8ca1bf;color:#305f99;cursor:help;font-size:12px}
    .shortcut-help{position:fixed;inset:0;background:#0f172a73;display:none;align-items:center;justify-content:center;z-index:9998;padding:20px}.shortcut-help.open{display:flex}.shortcut-card{width:min(680px,92vw);background:#ffffff;border-radius:14px;border:1px solid var(--line);padding:16px;box-shadow:0 20px 44px #00000026}.shortcut-card h2{margin:0 0 8px}.shortcut-card table{font-size:14px}
    .sr-live{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
    @media (max-width:1140px){.shell-nav-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:900px){.hero-grid{grid-template-columns:1fr}.sticky-action-bar{position:static}}
    @media (max-width:720px){.shell-inner{padding:10px 12px 12px}.shell-meta{justify-items:stretch}.shell-chip-row,.shell-status-row{justify-content:flex-start}.shell-nav-grid{grid-template-columns:1fr}main{padding:0 12px 22px}.card{border-radius:13px;padding:12px}th,td{padding:7px;font-size:12px}.status-row{padding:7px 9px}.quick-grid{grid-template-columns:1fr}.table-wrap table{min-width:620px}.actions{gap:6px}.field small{font-size:11px}}
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <header class="shell-header">
    <div class="shell-inner">
      <div class="shell-top">
        <div class="shell-brand">
          <div class="shell-brand-mark"><strong>EC</strong><span>Eraser Cat Control Plane</span></div>
          <h1>Object-Centered Operator Console</h1>
          <p>Global shell reference for dashboard, list, detail, workbench, and compare surfaces. Lists are entry points. Decision work happens on detail, compare, and recovery panels.</p>
        </div>
        <div class="shell-meta">
          <div class="shell-chip-row"><span class="shell-chip">Observe / Create / Review / System</span><span class="shell-chip" id="shell-current-object">No scoped object</span><span class="shell-chip" id="shell-current-state">Nominal</span></div>
          <div class="shell-status-row"><span class="shell-status"><strong>Status</strong><span>status-first routing</span></span><span class="shell-status"><strong>Compare</strong><span>first-class review</span></span><span class="shell-status"><strong>Recovery</strong><span>fallback stays visible</span></span><span class="shell-status"><strong>Clock</strong><span id="shell-live-clock">--:--:--</span></span></div>
          <div class="shell-shortcuts"><span class="muted-text">Shortcuts: <span class="kbd">?</span> help, <span class="kbd">/</span> filter, <span class="kbd">r</span> primary action</span><button id="shortcut-open" type="button" class="secondary" aria-haspopup="dialog" aria-expanded="false" aria-controls="shortcut-help">Shortcuts</button></div>
        </div>
      </div>
      <nav aria-label="Primary"><div class="shell-nav-grid">${renderNav()}</div></nav>
    </div>
  </header>
  <main id="main-content">
    <section class="page-intro" aria-label="Page intro">
      <div class="grid">
        <div class="page-intro-head">
          <div class="stack">
            <span class="muted-text" id="shell-page-group">Observe</span>
            <h2 id="shell-page-title">${esc(title)}</h2>
            <p class="section-intro" id="shell-page-summary">Object-centered control plane for fast routing, detail work, compare-heavy review, and recovery-aware operations.</p>
          </div>
          <div class="quick-links">
            <span class="shell-chip"><strong>Path</strong><span id="shell-page-path">/ui</span></span>
            <span class="shell-chip"><strong>Object</strong><span id="shell-page-object">No scoped object</span></span>
          </div>
        </div>
        <div class="status-panel" aria-label="Page status">
          <div class="status-row"><span class="label">Filter State</span><strong id="shell-filter-state">URL state idle</strong></div>
          <div class="status-row"><span class="label">Alert State</span><strong id="shell-alert-state">Nominal</strong></div>
          <div class="status-row"><span class="label">Recovery</span><strong id="shell-recovery-state">Jobs / Health / Compare</strong></div>
        </div>
      </div>
    </section>
    <section class="sticky-action-bar" aria-label="Sticky action bar">
      <span class="muted-text">Action hierarchy</span>
      <button id="shell-primary-action" type="button"><span class="kbd">R</span><span id="shell-primary-label">Run primary action</span></button>
      <button id="shell-filter-action" type="button" class="secondary"><span class="kbd">/</span><span>Focus filter</span></button>
      <button id="shell-copy-link" type="button" class="secondary">Copy link</button>
      <div class="quick-links">
        <span class="shell-chip" id="shell-filter-chip">URL state idle</span>
        <span class="shell-chip" id="shell-alert-chip">Nominal</span>
      </div>
    </section>
    ${body}
  </main>
  <div id="global-live" class="sr-live" aria-live="polite"></div>
  <div id="toast-wrap" class="toast-wrap" aria-live="polite" aria-atomic="true"></div>
  <div id="shortcut-help" class="shortcut-help" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="shortcut-title">
    <div class="shortcut-card">
      <h2 id="shortcut-title">Keyboard Shortcuts</h2>
      <table><thead><tr><th>Key</th><th>Action</th></tr></thead><tbody>${renderShortcutRows()}</tbody></table>
      <div class="actions" style="margin-top:10px"><button id="shortcut-close" type="button">Close</button></div>
    </div>
  </div>
  <script>
    (() => {
      const flatNav = ${JSON.stringify(UI_SHELL_FLAT_NAV)};
      const toastWrap = document.getElementById("toast-wrap");
      const live = document.getElementById("global-live");
      const shortcut = document.getElementById("shortcut-help");
      const openShortcut = document.getElementById("shortcut-open");
      const closeShortcut = document.getElementById("shortcut-close");
      let lastShortcutFocus = null;
      const speak = (text) => { if (live) live.textContent = text; };
      const classifyError = (msg) => { const text = String(msg || "").toLowerCase(); if (text.includes("503") || text.includes("unavailable") || text.includes("redis")) return { label: "Service unavailable", tone: "bad" }; if (text.includes("404") || text.includes("not found")) return { label: "Not found", tone: "warn" }; if (text.includes("400") || text.includes("required") || text.includes("validation")) return { label: "Invalid input", tone: "warn" }; return { label: "Unknown error", tone: "bad" }; };
      const toast = (title, message, tone = "ok", timeoutMs = 5000) => { if (!toastWrap) return; const node = document.createElement("div"); node.className = "toast " + tone; node.innerHTML = "<div class=\\"title\\">" + title + "</div><div>" + message + "</div>"; toastWrap.appendChild(node); speak(title + ": " + message); setTimeout(() => node.remove(), timeoutMs); };
      window.__ecsToast = toast; window.__ecsSpeak = speak;
      const openDialog = () => { if (!(shortcut instanceof HTMLElement)) return; lastShortcutFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; shortcut.classList.add("open"); shortcut.setAttribute("aria-hidden", "false"); if (openShortcut instanceof HTMLButtonElement) openShortcut.setAttribute("aria-expanded", "true"); const focusTarget = shortcut.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"); if (focusTarget instanceof HTMLElement) focusTarget.focus(); };
      const closeDialog = () => { if (!(shortcut instanceof HTMLElement)) return; shortcut.classList.remove("open"); shortcut.setAttribute("aria-hidden", "true"); if (openShortcut instanceof HTMLButtonElement) openShortcut.setAttribute("aria-expanded", "false"); if (lastShortcutFocus instanceof HTMLElement) lastShortcutFocus.focus(); };
      if (openShortcut instanceof HTMLButtonElement) openShortcut.addEventListener("click", () => { if (shortcut instanceof HTMLElement && shortcut.classList.contains("open")) closeDialog(); else openDialog(); });
      if (closeShortcut instanceof HTMLButtonElement) closeShortcut.addEventListener("click", closeDialog);
      if (shortcut instanceof HTMLElement) shortcut.addEventListener("click", (event) => { if (event.target === shortcut) closeDialog(); });
      const url = new URL(window.location.href);
      const pathname = url.pathname;
      document.querySelectorAll("header nav a[href]").forEach((node) => { if (!(node instanceof HTMLAnchorElement)) return; const href = node.getAttribute("href"); if (!href) return; const isActive = href === "/ui" ? pathname === "/ui" : pathname === href || pathname.startsWith(href + "/"); if (isActive) node.classList.add("active"); });
      const message = url.searchParams.get("message");
      const error = url.searchParams.get("error");
      if (message) { toast("Success", message, "ok"); document.querySelectorAll(".notice").forEach((el, idx) => { if (idx === 0) el.remove(); }); }
      if (error) { const c = classifyError(error); toast(c.label, error, c.tone, 7000); document.querySelectorAll(".error").forEach((el, idx) => { if (idx === 0) el.remove(); }); }
      document.querySelectorAll("[data-copy]").forEach((node) => { if (!(node instanceof HTMLElement)) return; node.addEventListener("click", async () => { const text = String(node.dataset.copy || "").trim(); if (!text) return; try { await navigator.clipboard.writeText(text); toast("Copied", text, "ok", 2000); } catch (e) { toast("Copy failed", String(e), "bad", 5000); } }); });
      const persistQueryState = (key, value) => { const nextUrl = new URL(window.location.href); if (value) nextUrl.searchParams.set(key, value); else nextUrl.searchParams.delete(key); window.history.replaceState({}, "", nextUrl); };
      document.querySelectorAll("input[data-table-filter]").forEach((node) => { if (!(node instanceof HTMLInputElement)) return; const targetId = String(node.dataset.tableFilter || "").trim(); const table = targetId ? document.getElementById(targetId) : null; if (!(table instanceof HTMLTableElement)) return; const queryKey = "filter-" + targetId; const initialValue = url.searchParams.get(queryKey); if (initialValue && !node.value) node.value = initialValue; const rows = () => Array.from(table.querySelectorAll("tbody tr")); const applyFilter = () => { const q = node.value.trim().toLowerCase(); rows().forEach((tr) => { const text = String(tr.textContent || "").toLowerCase(); tr.style.display = !q || text.includes(q) ? "" : "none"; }); persistQueryState(queryKey, node.value.trim()); }; node.addEventListener("input", applyFilter); applyFilter(); });
      document.querySelectorAll("form").forEach((form) => { form.addEventListener("submit", (event) => { const failedShotIds = form.querySelector("input[name='failedShotIds']"); if (failedShotIds instanceof HTMLInputElement) { const value = failedShotIds.value.trim(); if (value.length > 0 && !/^shot_[\\w-]+(\\s*,\\s*shot_[\\w-]+)*$/.test(value)) { event.preventDefault(); const next = failedShotIds.nextElementSibling; if (!next || !(next instanceof HTMLElement) || !next.classList.contains("field-error")) { const msg = document.createElement("div"); msg.className = "field-error"; msg.textContent = "Format: shot_1,shot_2"; failedShotIds.insertAdjacentElement("afterend", msg); } toast("Validation", "failedShotIds format is invalid.", "warn"); failedShotIds.focus(); return; } } const submit = form.querySelector("button[type='submit']"); if (submit instanceof HTMLButtonElement) { if (submit.dataset.busy === "1") { event.preventDefault(); return; } submit.dataset.busy = "1"; submit.classList.add("submit-loading"); submit.disabled = true; } const runGroup = form.dataset.runGroup; if (runGroup) { document.querySelectorAll("form[data-run-group='" + runGroup + "'] button[type='submit']").forEach((node) => { if (!(node instanceof HTMLButtonElement)) return; node.dataset.busy = "1"; node.classList.add("submit-loading"); node.disabled = true; }); } }); });
      document.querySelectorAll("[data-tooltip]").forEach((node) => { if (node instanceof HTMLElement && !node.title) node.title = String(node.dataset.tooltip || ""); });
      const runLive = document.getElementById("run-profile-live");
      if (runLive instanceof HTMLElement) {
        const episodeId = String(runLive.dataset.episodeId || "").trim();
        const hintForError = (msg) => { const text = String(msg || "").toLowerCase(); if (text.includes("shots.json")) return "Hint: run COMPILE_SHOTS first."; if (text.includes("redis") || text.includes("queue") || text.includes("503") || text.includes("unavailable")) return "Hint: check queue/redis at /ui/health."; return "Hint: check lastError on /ui/jobs."; };
        const renderLive = (item) => { if (!item) { runLive.innerHTML = "No recent run history."; return; } const status = String(item.status || "UNKNOWN"); const type = String(item.type || "-"); const progress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0; const jobId = String(item.id || ""); const base = "Recent job: " + type + " / " + status + " / " + progress + "%"; if (status === "FAILED") { const err = String(item.lastError || "(none)"); runLive.textContent = base + " | " + err + " | " + hintForError(err); runLive.classList.remove("notice"); runLive.classList.add("error"); return; } runLive.textContent = base; runLive.classList.remove("error"); runLive.classList.add("notice"); if (jobId) { const a = document.createElement("a"); a.href = "/ui/jobs/" + encodeURIComponent(jobId); a.textContent = " (job)"; runLive.appendChild(a); } };
        const poll = async () => { if (!episodeId) return; try { const res = await fetch("/api/jobs?episodeId=" + encodeURIComponent(episodeId) + "&limit=10", { headers: { accept: "application/json" } }); if (!res.ok) throw new Error("poll failed: " + res.status); const json = await res.json(); const list = Array.isArray(json && json.data) ? json.data : []; renderLive(list.length > 0 ? list[0] : null); } catch (e) { runLive.classList.remove("notice"); runLive.classList.add("error"); runLive.textContent = "Status refresh failed: " + String(e); } };
        let timer = null; const startPolling = () => { if (timer !== null) return; timer = setInterval(() => { void poll(); }, 5000); }; const stopPolling = () => { if (timer === null) return; clearInterval(timer); timer = null; }; const onVisibility = () => { if (document.hidden) { stopPolling(); return; } void poll(); startPolling(); }; void poll(); startPolling(); document.addEventListener("visibilitychange", onVisibility); window.addEventListener("beforeunload", () => { stopPolling(); document.removeEventListener("visibilitychange", onVisibility); });
      }
      let pendingGo = "";
      window.addEventListener("keydown", (e) => {
        const target = e.target;
        const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
        if (editing) return;
        if (e.key === "?") { e.preventDefault(); if (shortcut instanceof HTMLElement && shortcut.classList.contains("open")) closeDialog(); else openDialog(); return; }
        if (e.key === "Escape") { if (shortcut instanceof HTMLElement && shortcut.classList.contains("open")) { e.preventDefault(); closeDialog(); } pendingGo = ""; return; }
        if (e.key === "g") { pendingGo = "g"; setTimeout(() => { pendingGo = ""; }, 1500); return; }
        if (pendingGo === "g") {
          const chord = "g " + e.key.toLowerCase();
          pendingGo = "";
          const targetNav = flatNav.find((item) => String(item.hotkey || "").toLowerCase() === chord);
          if (targetNav) { window.location.href = targetNav.href; return; }
        }
        if (e.key === "r") { const primary = document.querySelector("button[data-primary-action='1'], form button[type='submit']"); if (primary instanceof HTMLButtonElement && !primary.disabled) { e.preventDefault(); primary.click(); } }
        if (e.key === "/") { const search = document.querySelector("input[data-table-filter]"); if (search instanceof HTMLInputElement) { e.preventDefault(); search.focus(); } }
      });
    })();
  </script>
</body>
</html>`;
}
