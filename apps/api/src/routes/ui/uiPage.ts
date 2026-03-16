import { UI_SHELL_CLIENT } from "./uiShellClient";
import {
  UI_SHELL_FLAT_NAV,
  UI_SHELL_HELPER_CONTRACT,
  UI_SHELL_JUMP_TARGETS,
  UI_SHELL_NAV_GROUPS,
  UI_SHELL_PALETTE_ACTIONS,
  UI_SHELL_PALETTE_SHORTCUTS,
  UI_SHELL_SHORTCUTS,
  UI_SHELL_STORAGE_KEYS
} from "./uiShellConfig";
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
<body
  data-page-title="${esc(title)}"
  data-shell-grammar="phase-3"
  data-shell-nav='${esc(JSON.stringify(UI_SHELL_FLAT_NAV))}'
  data-shell-palette-actions='${esc(JSON.stringify(UI_SHELL_PALETTE_ACTIONS))}'
  data-shell-jump-targets='${esc(JSON.stringify(UI_SHELL_JUMP_TARGETS))}'
  data-shell-storage-keys='${esc(JSON.stringify(UI_SHELL_STORAGE_KEYS))}'
  data-shell-helper-contract='${esc(JSON.stringify(UI_SHELL_HELPER_CONTRACT))}'
  data-shell-palette-shortcuts='${esc(JSON.stringify(UI_SHELL_PALETTE_SHORTCUTS))}'
>
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
  <header class="shell-header top-shell">
    <div class="shell-inner">
      <div class="shell-top">
        <div class="shell-brand shell-brand-block">
          <div class="shell-brand-mark"><strong>EC</strong><span>Eraser Cat Control Plane</span></div>
          <div class="shell-brand-copy">
            <h1>오브젝트 중심 운영 콘솔</h1>
            <p>페이지별 장식보다 오브젝트 상태, jump, 복귀, 최근 흐름, 바로 실행 액션이 먼저 보이는 전역 shell을 유지합니다.</p>
          </div>
        </div>
        <div class="shell-meta shell-meta-panel" aria-label="현재 컨트롤 상태">
          <div class="shell-chip-row shell-context-row">
            <span class="shell-chip shell-chip-static">관찰 / 생성 / 검토 / 시스템</span>
            <span class="shell-chip shell-chip-object" id="shell-current-object">현재 오브젝트 없음</span>
            <span class="shell-chip shell-chip-state" id="shell-current-state" data-severity="muted">정상</span>
          </div>
          <div class="shell-status-row shell-status-lane">
            <span class="shell-status"><strong>Palette</strong><span>오브젝트 jump와 즉시 실행을 전역 검색으로 묶습니다.</span></span>
            <span class="shell-status"><strong>Recent</strong><span>최근 오브젝트를 빠르게 다시 엽니다.</span></span>
            <span class="shell-status"><strong>Pins</strong><span>고정 오브젝트를 셸 어디서나 유지합니다.</span></span>
            <span class="shell-status"><strong>시계</strong><span id="shell-live-clock">--:--:--</span></span>
          </div>
          <div class="shell-shortcuts">
            <span class="muted-text shell-shortcut-copy">단축키: <span class="kbd">Ctrl/Cmd + K</span> palette, <span class="kbd">/</span> 필터, <span class="kbd">r</span> 기본 액션</span>
            <button id="shell-nav-toggle" type="button" class="secondary shell-nav-toggle" aria-expanded="false" aria-controls="shell-primary-nav">메뉴</button>
            <button id="shortcut-open" type="button" class="secondary" aria-haspopup="dialog" aria-expanded="false" aria-controls="shortcut-help">단축키</button>
          </div>
        </div>
      </div>
      <nav id="shell-primary-nav" aria-label="주요 탐색"><div class="shell-nav-grid">${renderNav()}</div></nav>
    </div>
  </header>
  <main id="main-content">
    <section class="page-intro page-header object-header-shell shell-surface shell-surface-hero" data-surface-role="object-header" aria-label="페이지 소개">
      <div class="hero-grid page-header-grid">
        <div class="page-intro-head page-header-main">
          <div class="stack page-title-stack">
            <span class="muted-text shell-page-kicker header-kicker" id="shell-page-group">관찰</span>
            <div class="object-header object-header-identity">
              <div class="object-header-main object-header-copy-block">
                <h2 id="shell-page-title" class="page-title">${esc(title)}</h2>
                <p class="section-intro shell-page-copy object-header-copy" id="shell-page-summary">오브젝트 중심 제어면에서 빠른 라우팅, 상세 작업, 비교 검토, 복구 대응을 진행합니다.</p>
              </div>
              <div class="quick-links object-header-meta object-header-meta-grid">
                <span class="shell-chip shell-chip-path"><strong>경로</strong><span id="shell-page-path">/ui</span></span>
                <span class="shell-chip shell-chip-object"><strong>오브젝트</strong><span id="shell-page-object">현재 오브젝트 없음</span></span>
              </div>
            </div>
          </div>
        </div>
        <div class="status-panel metadata-block preflight-box page-status-panel" data-surface-role="metadata" data-surface-kicker="현재 상태" aria-label="페이지 상태">
          <div class="status-row metadata-row"><span class="label">필터 상태</span><strong id="shell-filter-state">URL 상태 대기</strong></div>
          <div class="status-row metadata-row"><span class="label">알림 상태</span><strong id="shell-alert-state">정상</strong></div>
          <div class="status-row metadata-row"><span class="label">복귀 경로</span><strong id="shell-recovery-state">현재 페이지 기준 복귀 링크 준비</strong></div>
        </div>
      </div>
    </section>
    <section class="sticky-action-bar shell-action-bar action-rail-shell" data-surface-role="action" aria-label="고정 액션 바">
      <div class="shell-action-head">
        <div class="stack shell-action-summary">
          <span class="muted-text">전역 액션</span>
          <div class="quick-links shell-action-state">
            <span class="shell-chip shell-chip-filter" id="shell-filter-chip" data-severity="muted">URL 상태 대기</span>
            <span class="shell-chip shell-chip-state" id="shell-alert-chip" data-severity="muted">정상</span>
          </div>
        </div>
        <span class="muted-text shell-action-copy">palette, 현재 오브젝트, 복귀, 딥링크를 같은 위치에서 다룹니다.</span>
      </div>
      <div class="shell-action-buttons shell-object-tools">
        <button id="shell-palette-open" type="button" class="secondary" aria-haspopup="dialog" aria-expanded="false" aria-controls="shell-palette"><span class="kbd">Ctrl/Cmd + K</span><span>Command Palette</span></button>
        <button id="shell-primary-action" type="button"><span class="kbd">R</span><span id="shell-primary-label">기본 액션 실행</span></button>
        <button id="shell-filter-action" type="button" class="secondary"><span class="kbd">/</span><span>필터 포커스</span></button>
        <button id="shell-open-current" type="button" class="secondary" hidden>현재 오브젝트</button>
        <button id="shell-pin-current" type="button" class="secondary" hidden>Pin</button>
        <button id="shell-return-link" type="button" class="secondary shell-return-link" hidden><span id="shell-return-label">돌아가기</span></button>
        <button id="shell-copy-link" type="button" class="secondary">딥링크 복사</button>
      </div>
    </section>
    ${body}
  </main>
  <div id="global-live" class="sr-live" aria-live="polite" aria-atomic="true"></div>
  <div id="toast-wrap" class="toast-wrap" aria-live="polite" aria-atomic="true"></div>
  <div id="shortcut-help" class="shortcut-help" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="shortcut-title">
    <div class="shortcut-card">
      <h2 id="shortcut-title">단축키 도움말</h2>
      <table><thead><tr><th>키</th><th>동작</th></tr></thead><tbody>${renderShortcutRows()}</tbody></table>
      <div class="actions" style="margin-top:10px"><button id="shortcut-close" type="button">닫기</button></div>
    </div>
  </div>
  <div id="shell-palette" class="shell-palette" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="shell-palette-title">
    <div class="shell-palette-card">
      <div class="shell-palette-head">
        <div class="stack">
          <span class="muted-text">Global Shell Navigation</span>
          <h2 id="shell-palette-title">Command Palette</h2>
          <p class="section-intro">검색, jump, 최근 오브젝트, pins, page action을 한 곳에서 실행합니다.</p>
        </div>
        <div class="shell-palette-head-actions">
          <span class="muted-text">예: <span class="kbd">episode:ep_demo_001</span> <span class="kbd">job:clx_job_123</span> <span class="kbd">path:rollouts/demo/result.json</span></span>
          <button id="shell-palette-close" type="button" class="secondary">닫기</button>
        </div>
      </div>
      <label class="shell-palette-search" for="shell-palette-query">
        <span class="shell-palette-search-label">검색 또는 jump</span>
        <input
          id="shell-palette-query"
          type="search"
          autocomplete="off"
          spellcheck="false"
          data-shell-palette-input="1"
          placeholder="명령, 오브젝트, 경로를 입력하세요. 예: pack:clx_pack_123"
          aria-describedby="shell-palette-hint"
        />
      </label>
      <div id="shell-palette-hint" class="muted-text shell-palette-hint">검색 결과는 Enter로 실행하고, 방향키로 빠르게 이동합니다.</div>
      <div class="shell-palette-layout">
        <section class="shell-palette-results-panel" aria-labelledby="shell-palette-results-title">
          <div class="shell-palette-panel-head">
            <strong id="shell-palette-results-title">검색 결과</strong>
            <span class="muted-text">jump + action + nav</span>
          </div>
          <div id="shell-palette-results" class="shell-palette-list" role="listbox" aria-label="palette results"></div>
        </section>
        <aside class="shell-palette-rail" aria-label="palette side rail">
          <section class="shell-palette-rail-card">
            <div class="shell-palette-panel-head">
              <strong>현재 오브젝트</strong>
              <span class="muted-text">current</span>
            </div>
            <div id="shell-palette-current" class="shell-palette-side-list"></div>
          </section>
          <section class="shell-palette-rail-card">
            <div class="shell-palette-panel-head">
              <strong>Pins</strong>
              <span class="muted-text">localStorage</span>
            </div>
            <div id="shell-palette-pins" class="shell-palette-side-list"></div>
          </section>
          <section class="shell-palette-rail-card">
            <div class="shell-palette-panel-head">
              <strong>Recent</strong>
              <span class="muted-text">quick reopen</span>
            </div>
            <div id="shell-palette-recents" class="shell-palette-side-list"></div>
          </section>
        </aside>
      </div>
    </div>
  </div>
  <script>${UI_SHELL_CLIENT}</script>
</body>
</html>`;
}
