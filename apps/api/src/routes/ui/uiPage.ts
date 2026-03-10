function esc(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderUiPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title><style>
:root{--bg:#edf5f4;--bg2:#dde9e7;--ink:#102126;--muted:#48606b;--muted-strong:#2d434c;--line:#bfd2d6;--line-strong:#9eb7bc;--card:#ffffffef;--card-strong:#ffffff;--soft:#f4faf9;--soft-strong:#eef6f5;--primary:#0d7972;--primary-strong:#0c645f;--primary-ink:#f3fffd;--accent:#d97706;--accent-soft:#fff3e2;--good:#166534;--warn:#9a5a00;--bad:#b42318;--ring:#7cc9c3;--shadow:#0b28311c;--shadow-strong:#08202a2f;--nav-bg:#ffffffc7}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:"SUIT Variable","Sora","Pretendard Variable","Noto Sans KR",sans-serif;color:var(--ink);background:
radial-gradient(880px 420px at 14% -6%,#c0ebe1 0,#c0ebe100 72%),
radial-gradient(920px 520px at 88% -14%,#ffe0bc 0,#ffe0bc00 70%),
linear-gradient(180deg,var(--bg),var(--bg2));min-height:100vh;position:relative}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(16,33,38,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(16,33,38,.02) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(180deg,rgba(0,0,0,.34),transparent 82%)}
body::after{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0))}
.shell-skip{position:absolute;left:16px;top:-44px;padding:10px 14px;border-radius:12px;background:#0f172a;color:#fff;font-weight:700;z-index:40}
.shell-skip:focus-visible{top:16px}
.shell-header{position:sticky;top:0;z-index:20;backdrop-filter:blur(16px);background:linear-gradient(180deg,var(--nav-bg),#ffffffae);border-bottom:1px solid #b6cad0;box-shadow:0 8px 20px rgba(10,24,31,.06)}
.shell-nav{max-width:1280px;margin:0 auto;padding:12px 18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.brand-block{display:grid;gap:2px;margin-right:auto;padding:10px 14px 10px 12px;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(243,251,250,.7));border:1px solid rgba(158,183,188,.85);box-shadow:0 12px 26px rgba(8,32,42,.08)}
.brand-kicker{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#3d5d63;font-weight:800}
.brand-name{font-size:16px;letter-spacing:-.02em;color:#0b3e3a;font-weight:800}
.brand-meta{font-size:12px;color:#58717d}
.nav-links{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.nav-links a{color:#134f55;text-decoration:none;padding:8px 12px;border-radius:999px;border:1px solid transparent;transition:.2s ease;font-weight:700;background:transparent}
.nav-links a:hover{background:#e7f5f2;border-color:#badbd6;transform:translateY(-1px)}
.nav-links a.active{background:linear-gradient(180deg,#dff4ef,#d3ede7);border-color:#8ec7c0;color:#0d3d3a;box-shadow:inset 0 1px 0 rgba(255,255,255,.9)}
main{max-width:1280px;margin:22px auto;padding:0 18px 34px;display:grid;gap:16px}
.card{background:linear-gradient(180deg,var(--card),var(--card-strong));border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 16px 34px var(--shadow);position:relative;overflow:hidden}
.card::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.75),rgba(255,255,255,0))}
.card h1,.card h2,.card h3{margin-top:0}
.card h1{margin-bottom:8px;font-size:30px;letter-spacing:-.03em}
.card h2{font-size:20px;letter-spacing:-.02em}
.card h3{font-size:15px;letter-spacing:-.01em}
.card ul,.card ol{margin:0;padding-left:18px}
.card-subtle{background:linear-gradient(180deg,var(--soft),var(--soft-strong))}
.eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:rgba(13,121,114,.1);border:1px solid rgba(13,121,114,.14);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#0f5a55;font-weight:800}
.card-intro,.section-intro,.lede{margin:0;color:var(--muted);line-height:1.55}
.hero-grid{display:grid;gap:14px;grid-template-columns:minmax(0,1.35fr) minmax(280px,.9fr);align-items:start}
.hero-copy{display:grid;gap:10px}
.hero-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.hero-panel{display:grid;gap:10px;padding:14px;border-radius:18px;background:linear-gradient(180deg,rgba(10,48,60,.96),rgba(14,67,77,.92));color:#eaf8ff;border:1px solid rgba(116,176,187,.26);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.hero-panel h3{margin:0;color:#f8fdff}
.hero-panel .muted-text,.hero-panel .section-intro{color:#c5dde6}
.metric-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.metric-card{display:grid;gap:6px;padding:14px;border-radius:18px;background:linear-gradient(180deg,#f8fcfc,#eff7f5);border:1px solid #d8e6e6}
.metric-card .metric-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5a7079;font-weight:800}
.metric-card .metric-value{font-size:30px;line-height:1;font-weight:850;letter-spacing:-.04em;color:#102126}
.metric-card .metric-meta{font-size:12px;color:#5b6f77;line-height:1.45}
.grid{display:grid;gap:10px}
.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.three{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.dashboard-shell,.section-stack,.stack{display:grid;gap:12px}
.status-list{display:grid;gap:8px;margin:6px 0 0}
.status-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border:1px solid #d7e5ea;background:linear-gradient(180deg,#fbfeff,#f4f9fb);border-radius:14px}
.status-row .label{font-size:13px;color:#334a54}
.status-row strong{color:#12262d}
.quick-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));align-items:start}
.form-card{display:grid;gap:10px;padding:14px;border:1px solid #d7e6ea;background:linear-gradient(180deg,#fbfefe,#f1f7f6);border-radius:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.85)}
.form-card h3,.form-card h2{margin:0}
.field{display:grid;gap:6px}
.field label{font-size:12px;font-weight:700;color:#334155}
.field small,.inline-help{font-size:12px;color:#5f6f7c;line-height:1.45}
.field input,.field select,.field textarea{width:100%}
.link-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.link-grid a{display:grid;gap:4px;padding:12px 14px;border:1px solid #d1e1e3;border-radius:16px;background:linear-gradient(180deg,#fbffff,#eef7f5);color:#104a45;font-weight:750;box-shadow:0 10px 20px rgba(10,24,31,.04)}
.link-grid a:hover{text-decoration:none;background:#edf8f5;border-color:#b7d8d2;transform:translateY(-1px)}
.guide-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.section-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap}
.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.muted-text{color:#55657a;font-size:12px}
.table-wrap{overflow:auto;border:1px solid #d6e3e6;border-radius:18px;background:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.9)}
.table-wrap table{border:none;border-radius:0;min-width:720px}
.table-wrap th{position:sticky;top:0;z-index:1}
tbody tr:nth-child(even){background:#fbfdff}
tbody tr:hover{background:#edf7f7}
.table-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:6px 0 10px}
.table-tools input[type="search"]{min-width:220px;max-width:360px}
.search-cluster{display:grid;gap:6px;min-width:min(100%,420px)}
.search-cluster label{font-size:12px;font-weight:800;color:#334a54}
.search-cluster input[type="search"]{min-width:220px;max-width:100%}
.kbd{display:inline-block;border:1px solid #d0dceb;border-bottom-width:2px;border-radius:7px;padding:1px 6px;background:#f8fbff;color:#0f3f5f;font-size:12px;font-weight:700}
.quick-links{display:flex;flex-wrap:wrap;gap:8px}
.quick-links a,.table-link-group a{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid #c9dbdf;background:#f8fbff;color:#104b56;font-size:12px;font-weight:700}
.quick-links a:hover,.table-link-group a:hover{text-decoration:none;background:#eef8fb}
.split-grid{display:grid;gap:12px;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr)}
.pill-row{display:flex;gap:8px;flex-wrap:wrap}
.table-stack{display:grid;gap:4px}
.table-link-group{display:flex;gap:6px;flex-wrap:wrap}
.toggle-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;border:1px solid #cadee2;background:linear-gradient(180deg,#fbfdff,#eff6f8);font-size:12px;font-weight:700;color:#104b56}
.toggle-pill input{margin:0;width:16px;height:16px;padding:0}
.wrap-anywhere,.table-wrap td,.table-wrap th,td,th{overflow-wrap:anywhere;word-break:break-word}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
a{color:#0f766e;text-decoration:none}
a:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #dbe6f1;border-radius:14px;overflow:hidden}
th,td{border-bottom:1px solid #e8eef5;padding:9px 10px;text-align:left;vertical-align:top}
th{background:#f2f9fc;color:#2f4552;font-weight:700}
.badge{display:inline-block;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:800}
.badge.ok{background:#e9f8ee;color:var(--good)}
.badge.warn{background:#fff7e8;color:var(--warn)}
.badge.bad{background:#fff1f2;color:var(--bad)}
.badge.muted{background:#eef2f7;color:#475569}
input,select,textarea,button{font:inherit;border:1px solid #c7d5e4;border-radius:12px;padding:9px 11px;background:#fff}
input:focus,select:focus,textarea:focus,button:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--ring);outline-offset:2px;border-color:#0f766e}
textarea{width:100%;min-height:120px;resize:vertical}
textarea[data-tall="1"]{min-height:220px}
button{background:linear-gradient(180deg,#119189,#0e7a74);color:var(--primary-ink);border:none;font-weight:800;letter-spacing:.01em;cursor:pointer;transition:.18s ease;box-shadow:0 8px 18px rgba(15,118,110,.24)}
button:hover{transform:translateY(-1px);box-shadow:0 12px 24px rgba(15,118,110,.28)}
.secondary{background:linear-gradient(180deg,#fbfdff,#f2f8fc);color:#164d68;border:1px solid #bdd2e3;box-shadow:none}
a.secondary{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
pre{margin:0;background:#0f172a;color:#d6e4ff;padding:11px;border-radius:14px;overflow:auto;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
details{border:1px solid #d8e4e7;border-radius:14px;background:#f8fcfc;padding:10px 12px}
details summary{cursor:pointer;font-weight:700;color:#123f4a}
.table-detail{padding:8px 10px}
.notice{padding:11px 12px;border-left:4px solid #0f766e;background:#e8f8f5;border-radius:12px}
.error{padding:11px 12px;border-left:4px solid var(--bad);background:#fff1f2;border-radius:12px}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.inline{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap}
.empty-state{display:grid;gap:8px;padding:16px;border:1px dashed #c7d9dc;border-radius:16px;background:rgba(255,255,255,.55)}
.toast-wrap{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:9999}
.toast{background:#0f172a;color:#f8fbff;border-radius:14px;padding:11px 12px;box-shadow:0 12px 26px rgba(0,0,0,.22);min-width:240px;max-width:460px}
.toast.ok{background:#14532d}.toast.warn{background:#9a5a00}.toast.bad{background:#7f1d1d}.toast .title{font-weight:800;margin-bottom:4px}
.submit-loading{opacity:.72;pointer-events:none}.submit-loading::after{content:"...";margin-left:4px}
.field-error{color:#b42318;font-size:12px;padding-top:2px}
.hint{display:inline-block;border-bottom:1px dotted #8ca1bf;color:#305f99;cursor:help;font-size:12px}
.shortcut-help{position:fixed;inset:0;background:#0f172a73;display:flex;align-items:center;justify-content:center;z-index:9998;padding:18px}
.shortcut-help[hidden]{display:none}
.shortcut-card{width:min(620px,90vw);max-height:min(80vh,720px);overflow:auto;background:#ffffff;border-radius:20px;border:1px solid var(--line);padding:16px;box-shadow:0 20px 44px rgba(0,0,0,.15)}
.shortcut-card h2{margin:0 0 8px}.shortcut-card table{font-size:14px}
.sr-live{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
main>.card{animation:fadeUp .34s ease both}
main>.card:nth-child(2){animation-delay:.04s}
main>.card:nth-child(3){animation-delay:.08s}
main>.card:nth-child(4){animation-delay:.12s}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media (max-width:920px){.hero-grid,.split-grid{grid-template-columns:1fr}.brand-block{width:100%}}
@media (max-width:720px){.shell-nav{gap:8px;padding:10px 12px}.nav-links{gap:6px}.nav-links a{padding:7px 10px}main{padding:0 12px 24px}.card{border-radius:18px;padding:14px}th,td{padding:7px;font-size:12px}.status-row{padding:8px 10px}.quick-grid{grid-template-columns:1fr}.table-wrap table{min-width:620px}.actions{gap:6px}.field small{font-size:11px}.card h1{font-size:26px}.metric-card .metric-value{font-size:26px}.shortcut-help{padding:12px}}
</style></head><body><a class="shell-skip" href="#main-content">Skip to content</a><header class="shell-header"><nav class="shell-nav"><div class="brand-block"><span class="brand-kicker">Creative Ops Control Plane</span><strong class="brand-name">Eraser Cat Console</strong><span class="brand-meta">Pipeline health, assets, packs, episodes, and shipping in one cockpit.</span></div><div class="nav-links"><a href="/ui">Dashboard</a><a href="/ui/studio">Studio</a><a href="/ui/jobs">Jobs</a><a href="/ui/assets">Assets</a><a href="/ui/characters">Characters</a><a href="/ui/character-generator">Character Generator</a><a href="/ui/hitl">HITL</a><a href="/ui/episodes">Episodes</a><a href="/ui/publish">Publish</a><a href="/ui/health">Health</a><a href="/ui/rollouts">Rollouts</a><a href="/ui/benchmarks">Benchmarks</a><a href="/ui/profiles">Profiles</a><a href="/ui/artifacts">Artifacts</a><button id="shortcut-open" type="button" class="secondary" aria-label="Open keyboard shortcuts" aria-haspopup="dialog" aria-expanded="false">?</button></div></nav></header><main id="main-content">${body}</main><div id="global-live" class="sr-live" role="status" aria-live="polite" aria-atomic="true"></div><div id="toast-wrap" class="toast-wrap" aria-live="polite" aria-atomic="true"></div><div id="shortcut-help" class="shortcut-help" hidden><div class="shortcut-card" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" tabindex="-1"><h2 id="shortcut-title">Keyboard Shortcuts</h2><p class="muted-text">Press Escape to close this dialog.</p><table><thead><tr><th>Key</th><th>Action</th></tr></thead><tbody><tr><td>?</td><td>Toggle help</td></tr><tr><td>g then s</td><td>Go to studio</td></tr><tr><td>g then e</td><td>Go to episodes</td></tr><tr><td>g then j</td><td>Go to jobs</td></tr><tr><td>g then a</td><td>Go to assets</td></tr><tr><td>g then h</td><td>Go to health</td></tr><tr><td>r</td><td>Run primary action</td></tr><tr><td>/</td><td>Focus current table search</td></tr></tbody></table><div class="actions" style="margin-top:10px"><button id="shortcut-close" type="button">Close</button></div></div></div><script>
(() => {
  const toastWrap = document.getElementById('toast-wrap');
  const live = document.getElementById('global-live');
  const shortcut = document.getElementById('shortcut-help');
  const shortcutCard = shortcut ? shortcut.querySelector('.shortcut-card') : null;
  const openShortcut = document.getElementById('shortcut-open');
  const closeShortcut = document.getElementById('shortcut-close');
  let lastShortcutFocus = null;

  const speak = (text) => {
    if (!live) return;
    live.textContent = '';
    window.setTimeout(() => {
      live.textContent = text;
    }, 20);
  };

  const classifyError = (msg) => {
    const text = (msg || '').toLowerCase();
    if (text.includes('503') || text.includes('unavailable') || text.includes('redis')) return { label: 'Service unavailable', tone: 'bad' };
    if (text.includes('404') || text.includes('not found')) return { label: 'Not found', tone: 'warn' };
    if (text.includes('400') || text.includes('required') || text.includes('validation')) return { label: 'Invalid input', tone: 'warn' };
    return { label: 'Unknown error', tone: 'bad' };
  };

  const toast = (title, message, tone = 'ok', timeoutMs = 5000) => {
    if (!toastWrap) return;
    const node = document.createElement('div');
    node.className = 'toast ' + tone;
    node.innerHTML = '<div class="title">' + title + '</div><div>' + message + '</div>';
    toastWrap.appendChild(node);
    speak(title + ': ' + message);
    window.setTimeout(() => node.remove(), timeoutMs);
  };

  window.__ecsToast = toast;
  window.__ecsSpeak = speak;

  const getDialogFocusables = () => {
    if (!(shortcutCard instanceof HTMLElement)) return [];
    return Array.from(shortcutCard.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((node) => node instanceof HTMLElement && !node.hasAttribute('disabled'));
  };

  const openShortcutDialog = () => {
    if (!(shortcut instanceof HTMLElement) || !(shortcutCard instanceof HTMLElement)) return;
    lastShortcutFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    shortcut.hidden = false;
    openShortcut?.setAttribute('aria-expanded', 'true');
    const focusables = getDialogFocusables();
    const target = focusables[0] ?? shortcutCard;
    window.setTimeout(() => target.focus(), 0);
  };

  const closeShortcutDialog = () => {
    if (!(shortcut instanceof HTMLElement)) return;
    shortcut.hidden = true;
    openShortcut?.setAttribute('aria-expanded', 'false');
    if (lastShortcutFocus instanceof HTMLElement) {
      lastShortcutFocus.focus();
      lastShortcutFocus = null;
      return;
    }
    if (openShortcut instanceof HTMLElement) openShortcut.focus();
  };

  if (openShortcut instanceof HTMLButtonElement) {
    openShortcut.addEventListener('click', () => {
      if (shortcut instanceof HTMLElement && !shortcut.hidden) {
        closeShortcutDialog();
        return;
      }
      openShortcutDialog();
    });
  }

  if (closeShortcut instanceof HTMLButtonElement) {
    closeShortcut.addEventListener('click', closeShortcutDialog);
  }

  if (shortcut instanceof HTMLElement) {
    shortcut.addEventListener('click', (event) => {
      if (event.target === shortcut) closeShortcutDialog();
    });
  }

  const url = new URL(window.location.href);
  const pathname = url.pathname;
  document.querySelectorAll('header nav a[href]').forEach((node) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    const href = node.getAttribute('href');
    if (!href) return;
    const isActive = href === '/ui'
      ? pathname === '/ui'
      : pathname === href || pathname.startsWith(href + '/');
    if (isActive) node.classList.add('active');
  });

  const message = url.searchParams.get('message');
  const error = url.searchParams.get('error');
  if (message) {
    toast('Success', message, 'ok');
    document.querySelectorAll('.notice').forEach((el, idx) => { if (idx === 0) el.remove(); });
  }
  if (error) {
    const c = classifyError(error);
    toast(c.label, error, c.tone, 7000);
    document.querySelectorAll('.error').forEach((el, idx) => { if (idx === 0) el.remove(); });
  }

  document.querySelectorAll('[data-copy]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.addEventListener('click', async () => {
      const text = String(node.dataset.copy || '').trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied', text, 'ok', 2000);
      } catch (e) {
        toast('Copy failed', String(e), 'bad', 5000);
      }
    });
  });

  const filterControllers = [];
  const applyFilterParam = (value) => {
    const next = new URL(window.location.href);
    if (value) next.searchParams.set('q', value);
    else next.searchParams.delete('q');
    history.replaceState({}, '', next.pathname + next.search + next.hash);
  };

  document.querySelectorAll('input[data-table-filter]').forEach((node) => {
    if (!(node instanceof HTMLInputElement)) return;
    const targetId = String(node.dataset.tableFilter || '').trim();
    const table = targetId ? document.getElementById(targetId) : null;
    if (!(table instanceof HTMLTableElement)) return;
    const rows = () => Array.from(table.querySelectorAll('tbody tr'));
    const applyFilter = () => {
      const q = node.value.trim().toLowerCase();
      rows().forEach((tr) => {
        const text = String(tr.textContent || '').toLowerCase();
        tr.style.display = !q || text.includes(q) ? '' : 'none';
      });
    };
    const initial = url.searchParams.get('q');
    if (initial && !node.value) node.value = initial;
    node.addEventListener('input', () => {
      applyFilter();
      applyFilterParam(node.value.trim());
      filterControllers.forEach((entry) => {
        if (entry.input === node) return;
        entry.input.value = node.value;
        entry.apply();
      });
    });
    filterControllers.push({ input: node, apply: applyFilter });
    applyFilter();
  });

  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      const failedShotIds = form.querySelector('input[name="failedShotIds"]');
      if (failedShotIds instanceof HTMLInputElement) {
        const value = failedShotIds.value.trim();
        if (value.length > 0 && !/^shot_[\\w-]+(\\s*,\\s*shot_[\\w-]+)*$/.test(value)) {
          event.preventDefault();
          const next = failedShotIds.nextElementSibling;
          if (!next || !(next instanceof HTMLElement) || !next.classList.contains('field-error')) {
            const msg = document.createElement('div');
            msg.className = 'field-error';
            msg.textContent = 'Format: shot_1,shot_2';
            failedShotIds.insertAdjacentElement('afterend', msg);
          }
          toast('Validation', 'failedShotIds format is invalid.', 'warn');
          failedShotIds.focus();
          return;
        }
      }
      const submit = form.querySelector('button[type="submit"]');
      if (submit instanceof HTMLButtonElement) {
        if (submit.dataset.busy === '1') {
          event.preventDefault();
          return;
        }
        submit.dataset.busy = '1';
        submit.classList.add('submit-loading');
        submit.disabled = true;
      }
      const runGroup = form.dataset.runGroup;
      if (runGroup) {
        document.querySelectorAll('form[data-run-group="' + runGroup + '"] button[type="submit"]').forEach((node) => {
          if (!(node instanceof HTMLButtonElement)) return;
          node.dataset.busy = '1';
          node.classList.add('submit-loading');
          node.disabled = true;
        });
      }
    });
  });

  document.querySelectorAll('[data-tooltip]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const text = String(node.dataset.tooltip || '').trim();
    if (!text) return;
    if (!node.title) node.title = text;
    if (!node.getAttribute('aria-label') && (node.textContent || '').trim().length <= 1) {
      node.setAttribute('aria-label', text);
    }
    if (node.tabIndex < 0) node.tabIndex = 0;
  });

  const runLive = document.getElementById('run-profile-live');
  if (runLive instanceof HTMLElement) {
    const episodeId = String(runLive.dataset.episodeId || '').trim();
    const hintForError = (msg) => {
      const text = String(msg || '').toLowerCase();
      if (text.includes('shots.json')) return 'Hint: run COMPILE_SHOTS first.';
      if (text.includes('redis') || text.includes('queue') || text.includes('503') || text.includes('unavailable')) return 'Hint: check queue or redis at /ui/health.';
      return 'Hint: check lastError on /ui/jobs.';
    };
    const renderLive = (item) => {
      if (!item) {
        runLive.innerHTML = 'No recent run history.';
        return;
      }
      const status = String(item.status || 'UNKNOWN');
      const type = String(item.type || '-');
      const progress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0;
      const jobId = String(item.id || '');
      const base = 'Recent job: ' + type + ' / ' + status + ' / ' + progress + '%';
      if (status === 'FAILED') {
        const err = String(item.lastError || '(none)');
        runLive.textContent = base + ' | ' + err + ' | ' + hintForError(err);
        runLive.classList.remove('notice');
        runLive.classList.add('error');
        speak('Recent job failed. ' + type + ', ' + status + ', ' + progress + ' percent.');
        return;
      }
      runLive.textContent = base;
      runLive.classList.remove('error');
      runLive.classList.add('notice');
      if (jobId) {
        const a = document.createElement('a');
        a.href = '/ui/jobs/' + encodeURIComponent(jobId);
        a.textContent = ' (job)';
        runLive.appendChild(a);
      }
      speak(base);
    };
    const poll = async () => {
      if (!episodeId) return;
      try {
        const res = await fetch('/api/jobs?episodeId=' + encodeURIComponent(episodeId) + '&limit=10', { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('poll failed: ' + res.status);
        const json = await res.json();
        const list = Array.isArray(json && json.data) ? json.data : [];
        const latest = list.length > 0 ? list[0] : null;
        renderLive(latest);
      } catch (e) {
        runLive.classList.remove('notice');
        runLive.classList.add('error');
        runLive.textContent = 'Status refresh failed: ' + String(e);
      }
    };
    let timer = null;
    const startPolling = () => {
      if (timer !== null) return;
      timer = window.setInterval(() => { void poll(); }, 5000);
    };
    const stopPolling = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }
      void poll();
      startPolling();
    };
    void poll();
    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  let pendingGo = false;
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);

    if (shortcut instanceof HTMLElement && !shortcut.hidden) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeShortcutDialog();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = getDialogFocusables();
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
          return;
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
          return;
        }
      }
    }

    if (editing) return;
    if (e.key === '?') {
      e.preventDefault();
      if (shortcut instanceof HTMLElement && !shortcut.hidden) closeShortcutDialog();
      else openShortcutDialog();
      return;
    }
    if (pendingGo) {
      pendingGo = false;
      if (e.key === 's') window.location.href = '/ui/studio';
      if (e.key === 'e') window.location.href = '/ui/episodes';
      if (e.key === 'j') window.location.href = '/ui/jobs';
      if (e.key === 'a') window.location.href = '/ui/assets';
      if (e.key === 'h') window.location.href = '/ui/health';
      return;
    }
    if (e.key === 'g') {
      pendingGo = true;
      window.setTimeout(() => { pendingGo = false; }, 1500);
      return;
    }
    if (e.key === 'r') {
      const primary = document.querySelector('button[data-primary-action="1"], form button[type="submit"]');
      if (primary instanceof HTMLButtonElement && !primary.disabled) {
        e.preventDefault();
        primary.click();
      }
    }
    if (e.key === '/') {
      const search = document.querySelector('input[data-table-filter]');
      if (search instanceof HTMLInputElement) {
        e.preventDefault();
        search.focus();
      }
    }
  });
})();
</script></body></html>`;
}
