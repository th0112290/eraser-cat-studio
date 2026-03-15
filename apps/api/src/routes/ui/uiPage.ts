import { UI_SHELL_CLIENT } from "./uiShellClient";
import { UI_SHELL_FLAT_NAV, UI_SHELL_NAV_GROUPS, UI_SHELL_SHORTCUTS } from "./uiShellConfig";
import { UI_SHELL_STYLES } from "./uiShellStyles";

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
  return UI_SHELL_NAV_GROUPS.map((group) => {
    const links = group.items
      .map((item) => {
        const hotkey = item.hotkey ? `<small>${esc(item.hotkey)}</small>` : "";
        return `<a href="${esc(item.href)}" data-shell-link title="${esc(item.description)}"><strong>${esc(
          item.label
        )}</strong>${hotkey}</a>`;
      })
      .join("");

    return `<section class="shell-nav-group"><div class="shell-nav-head"><span>${esc(group.label)}</span><small>${esc(
      group.description
    )}</small></div><div class="shell-nav-links">${links}</div></section>`;
  }).join("");
}

function renderShortcutRows(): string {
  return UI_SHELL_SHORTCUTS.map(
    (item) => `<tr><td><span class="kbd">${esc(item.key)}</span></td><td>${esc(item.action)}</td></tr>`
  ).join("");
}

export function renderUiPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)}</title>
  <style>${UI_SHELL_STYLES}</style>
</head>
<body data-page-title="${esc(title)}" data-shell-nav='${esc(JSON.stringify(UI_SHELL_FLAT_NAV))}'>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <header class="shell-header">
    <div class="shell-inner">
      <div class="shell-top">
        <div class="shell-brand">
          <div class="shell-brand-mark"><strong>EC</strong><span>Eraser Cat Control Plane</span></div>
          <h1>Object-Centered Operator Console</h1>
          <p>Global shell for dashboard, list, detail, workbench, and compare surfaces. Lists are entry points. Decisions happen in detail, compare, and recovery panels.</p>
        </div>
        <div class="shell-meta">
          <div class="shell-chip-row">
            <span class="shell-chip">Observe / Create / Review / System</span>
            <span class="shell-chip" id="shell-current-object">No scoped object</span>
            <span class="shell-chip" id="shell-current-state">Nominal</span>
          </div>
          <div class="shell-status-row">
            <span class="shell-status"><strong>Status</strong><span>status-first routing</span></span>
            <span class="shell-status"><strong>Compare</strong><span>first-class review</span></span>
            <span class="shell-status"><strong>Recovery</strong><span>fallback stays visible</span></span>
            <span class="shell-status"><strong>Clock</strong><span id="shell-live-clock">--:--:--</span></span>
          </div>
          <div class="shell-shortcuts">
            <span class="muted-text shell-shortcut-copy">Shortcuts: <span class="kbd">?</span> help, <span class="kbd">/</span> filter, <span class="kbd">r</span> primary action</span>
            <button id="shell-nav-toggle" type="button" class="secondary shell-nav-toggle" aria-expanded="false" aria-controls="shell-primary-nav">Menu</button>
            <button id="shortcut-open" type="button" class="secondary" aria-haspopup="dialog" aria-expanded="false" aria-controls="shortcut-help">Shortcuts</button>
          </div>
        </div>
      </div>
      <nav id="shell-primary-nav" aria-label="Primary"><div class="shell-nav-grid">${renderNav()}</div></nav>
    </div>
  </header>
  <main id="main-content">
    <section class="page-intro" aria-label="Page intro">
      <div class="hero-grid">
        <div class="page-intro-head">
          <div class="stack">
            <span class="muted-text shell-page-kicker" id="shell-page-group">Observe</span>
            <h2 id="shell-page-title">${esc(title)}</h2>
            <p class="section-intro shell-page-copy" id="shell-page-summary">Object-centered control plane for fast routing, detail work, compare-heavy review, and recovery-aware operations.</p>
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
  <div id="global-live" class="sr-live" aria-live="polite" aria-atomic="true"></div>
  <div id="toast-wrap" class="toast-wrap" aria-live="polite" aria-atomic="true"></div>
  <div id="shortcut-help" class="shortcut-help" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="shortcut-title">
    <div class="shortcut-card">
      <h2 id="shortcut-title">Keyboard Shortcuts</h2>
      <table><thead><tr><th>Key</th><th>Action</th></tr></thead><tbody>${renderShortcutRows()}</tbody></table>
      <div class="actions" style="margin-top:10px"><button id="shortcut-close" type="button">Close</button></div>
    </div>
  </div>
  <script>${UI_SHELL_CLIENT}</script>
</body>
</html>`;
}
