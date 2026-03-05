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
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title><style>
:root{--bg:#f3f6f9;--bg2:#e8eef4;--ink:#15202b;--muted:#4a5a6a;--line:#cfdae6;--card:#ffffffdd;--primary:#0f766e;--primary-ink:#effcf9;--accent:#ea580c;--good:#166534;--warn:#92400e;--bad:#b91c1c;--soft:#f7fafc}
*{box-sizing:border-box}
body{margin:0;font-family:"SUIT Variable","Pretendard Variable","Avenir Next","Noto Sans KR",sans-serif;color:var(--ink);background:radial-gradient(1200px 420px at 20% -10%,#d9f0ea 0,#d9f0ea00 70%),radial-gradient(1200px 520px at 85% -25%,#ffe3cf 0,#ffe3cf00 65%),linear-gradient(180deg,var(--bg),var(--bg2));min-height:100vh}
header{position:sticky;top:0;z-index:20;backdrop-filter:blur(8px);background:#ffffffb8;border-bottom:1px solid var(--line)}
nav{max-width:1240px;margin:0 auto;padding:12px 18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
nav strong{margin-right:auto;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#0b3d39}
nav a{color:#174e4a;text-decoration:none;padding:7px 10px;border-radius:999px;border:1px solid transparent;transition:.2s ease}
nav a:hover{background:#e7f3f1;border-color:#bfd9d5}
nav a.active{background:#dff2ee;border-color:#9dcfc8;color:#0a3f3a}
main{max-width:1240px;margin:20px auto;padding:0 18px 28px;display:grid;gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:15px;box-shadow:0 10px 28px #18354a14}
.card h1,.card h2,.card h3{margin-top:0}
.notice{padding:10px 11px;border-left:4px solid #0f766e;background:#e8f8f5;border-radius:10px}
.error{padding:10px 11px;border-left:4px solid var(--bad);background:#fff1f2;border-radius:10px}
.grid{display:grid;gap:10px}.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.dashboard-shell{display:grid;gap:12px}
.status-list{display:grid;gap:8px;margin:6px 0 0}
.status-row{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:10px}
.status-row .label{font-size:13px;color:#334155}
.quick-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));align-items:start}
.form-card{display:grid;gap:10px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.form-card h3{margin:0;font-size:15px}
.field{display:grid;gap:5px}
.field label{font-size:12px;font-weight:700;color:#334155}
.field small{font-size:12px;color:#59667a;line-height:1.4}
.field input{width:100%}
.link-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.link-grid a{display:block;padding:10px 12px;border:1px solid #d0dfef;border-radius:10px;background:#f8fbff;color:#114a45;font-weight:700}
.link-grid a:hover{text-decoration:none;background:#edf7f4;border-color:#bdded8}
.guide-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.section-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.muted-text{color:#55657a;font-size:12px}
.table-wrap{overflow:auto;border:1px solid #dbe6f1;border-radius:12px;background:#fff}
.table-wrap table{border:none;border-radius:0;min-width:760px}
.table-wrap th{position:sticky;top:0;z-index:1}
tbody tr:nth-child(even){background:#fbfdff}
tbody tr:hover{background:#f1f8ff}
.table-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0 10px}
.table-tools input[type="search"]{min-width:220px;max-width:360px}
.kbd{display:inline-block;border:1px solid #d0dceb;border-bottom-width:2px;border-radius:7px;padding:1px 6px;background:#f8fbff;color:#0f3f5f;font-size:12px;font-weight:700}
.quick-links{display:flex;flex-wrap:wrap;gap:8px}
.quick-links a{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #c7d9eb;background:#f8fbff;color:#0f4e6a;font-size:12px;font-weight:700}
.quick-links a:hover{text-decoration:none;background:#eef7ff}
a{color:#0f766e;text-decoration:none}a:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #dbe6f1;border-radius:12px;overflow:hidden}
th,td{border-bottom:1px solid #e8eef5;padding:8px 9px;text-align:left;vertical-align:top}
th{background:#f6fbff;color:#334155;font-weight:700}
.badge{display:inline-block;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700}
.badge.ok{background:#e9f8ee;color:var(--good)}.badge.warn{background:#fff7e8;color:var(--warn)}.badge.bad{background:#fff1f2;color:var(--bad)}.badge.muted{background:#eef2f7;color:#475569}
input,select,textarea,button{font:inherit;border:1px solid #c7d5e4;border-radius:10px;padding:8px 10px;background:#fff}
input:focus,select:focus,textarea:focus{outline:2px solid #0f766e33;border-color:#0f766e}
textarea{width:100%;min-height:220px;resize:vertical}
button{background:linear-gradient(180deg,#0f857b,#0f766e);color:var(--primary-ink);border:none;font-weight:800;letter-spacing:.01em;cursor:pointer;transition:.18s ease;box-shadow:0 6px 14px #0f766e3a}
button:hover{transform:translateY(-1px);box-shadow:0 9px 16px #0f766e45}
.secondary{background:#f3f8fd;color:#0b3d62;border:1px solid #c5d7eb;box-shadow:none}
pre{margin:0;background:#0f172a;color:#d6e4ff;padding:11px;border-radius:10px;overflow:auto;font-size:12px}
.actions{display:flex;flex-wrap:wrap;gap:8px}.inline{display:inline-flex;gap:8px;align-items:center}
.toast-wrap{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:9999}
.toast{background:#0f172a;color:#f8fbff;border-radius:11px;padding:10px 12px;box-shadow:0 10px 24px #0000002b;min-width:240px;max-width:460px}
.toast.ok{background:#14532d}.toast.warn{background:#9a5a00}.toast.bad{background:#7f1d1d}.toast .title{font-weight:800;margin-bottom:4px}
.submit-loading{opacity:.72;pointer-events:none}.submit-loading::after{content:"...";margin-left:4px}
.field-error{color:#b42318;font-size:12px;padding-top:2px}
.hint{display:inline-block;border-bottom:1px dotted #8ca1bf;color:#305f99;cursor:help;font-size:12px}
.shortcut-help{position:fixed;inset:0;background:#0f172a73;display:none;align-items:center;justify-content:center;z-index:9998}
.shortcut-help.open{display:flex}
.shortcut-card{width:min(620px,90vw);background:#ffffff;border-radius:14px;border:1px solid var(--line);padding:14px;box-shadow:0 20px 44px #00000026}
.shortcut-card h2{margin:0 0 8px}.shortcut-card table{font-size:14px}
.sr-live{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
@media (max-width:720px){nav{gap:8px;padding:10px 12px}main{padding:0 12px 22px}.card{border-radius:13px;padding:12px}th,td{padding:7px}.status-row{padding:7px 9px}.quick-grid{grid-template-columns:1fr}}
</style></head><body><header><nav><strong>Eraser Cat Console</strong><a href="/ui">대시보드</a><a href="/ui/studio">통합 스튜디오</a><a href="/ui/jobs">작업</a><a href="/ui/assets">에셋</a><a href="/ui/characters">캐릭터</a><a href="/ui/character-generator">캐릭터 생성기</a><a href="/ui/hitl">검수(HITL)</a><a href="/ui/episodes">에피소드</a><a href="/ui/publish">퍼블리시</a><a href="/ui/health">헬스</a><a href="/ui/artifacts">아티팩트</a><button id="shortcut-open" type="button" class="secondary" title="단축키 도움말(?)">?</button></nav></header><main>${body}</main><div id="global-live" class="sr-live" aria-live="polite"></div><div id="toast-wrap" class="toast-wrap" aria-live="polite" aria-atomic="true"></div><div id="shortcut-help" class="shortcut-help"><div class="shortcut-card"><h2>단축키</h2><table><thead><tr><th>키</th><th>동작</th></tr></thead><tbody><tr><td>?</td><td>도움말 열기/닫기</td></tr><tr><td>g → e</td><td>에피소드 이동</td></tr><tr><td>g → j</td><td>작업 이동</td></tr><tr><td>g → h</td><td>헬스 이동</td></tr><tr><td>r</td><td>현재 페이지 주요 액션 실행</td></tr></tbody></table><div class="actions" style="margin-top:10px"><button id="shortcut-close" type="button">닫기</button></div></div></div><script>
(() => {
  const toastWrap = document.getElementById('toast-wrap');
  const live = document.getElementById('global-live');
  const shortcut = document.getElementById('shortcut-help');
  const openShortcut = document.getElementById('shortcut-open');
  const closeShortcut = document.getElementById('shortcut-close');
  if (openShortcut && shortcut) openShortcut.addEventListener('click', () => shortcut.classList.add('open'));
  if (closeShortcut && shortcut) closeShortcut.addEventListener('click', () => shortcut.classList.remove('open'));

  const speak = (text) => { if (live) live.textContent = text; };
  const classifyError = (msg) => {
    const text = (msg || '').toLowerCase();
    if (text.includes('503') || text.includes('unavailable') || text.includes('redis')) return { label: '서비스 일시 중단', tone: 'bad' };
    if (text.includes('404') || text.includes('not found')) return { label: '대상 없음', tone: 'warn' };
    if (text.includes('400') || text.includes('required') || text.includes('validation')) return { label: '입력 오류', tone: 'warn' };
    return { label: '알 수 없는 오류', tone: 'bad' };
  };
  const toast = (title, message, tone = 'ok', timeoutMs = 5000) => {
    if (!toastWrap) return;
    const node = document.createElement('div');
    node.className = 'toast ' + tone;
    node.innerHTML = '<div class="title">' + title + '</div><div>' + message + '</div>';
    toastWrap.appendChild(node);
    speak(title + ': ' + message);
    setTimeout(() => node.remove(), timeoutMs);
  };

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
    toast('성공', message, 'ok');
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
        toast('복사됨', text, 'ok', 2000);
      } catch (e) {
        toast('복사 실패', String(e), 'bad', 5000);
      }
    });
  });

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
    node.addEventListener('input', applyFilter);
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
            msg.textContent = '형식: shot_1,shot_2';
            failedShotIds.insertAdjacentElement('afterend', msg);
          }
          toast('Validation', 'failedShotIds 형식이 올바르지 않습니다.', 'warn');
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
    if (node instanceof HTMLElement && !node.title) {
      node.title = String(node.dataset.tooltip || '');
    }
  });

  const runLive = document.getElementById('run-profile-live');
  if (runLive instanceof HTMLElement) {
    const episodeId = String(runLive.dataset.episodeId || '').trim();
    const hintForError = (msg) => {
      const text = String(msg || '').toLowerCase();
      if (text.includes('shots.json')) return '힌트: COMPILE_SHOTS를 먼저 실행하세요.';
      if (text.includes('redis') || text.includes('queue') || text.includes('503') || text.includes('unavailable')) return '힌트: /ui/health에서 queue/redis 상태를 확인하세요.';
      return '힌트: /ui/jobs에서 lastError를 확인하세요.';
    };
    const renderLive = (item) => {
      if (!item) {
        runLive.innerHTML = '최근 실행 이력이 없습니다.';
        return;
      }
      const status = String(item.status || 'UNKNOWN');
      const type = String(item.type || '-');
      const progress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0;
      const jobId = String(item.id || '');
      const base = '최근 작업: ' + type + ' / ' + status + ' / ' + progress + '%';
      if (status === 'FAILED') {
        const err = String(item.lastError || '(none)');
        runLive.textContent = base + ' | ' + err + ' | ' + hintForError(err);
        runLive.classList.remove('notice');
        runLive.classList.add('error');
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
        runLive.textContent = '상태 갱신 실패: ' + String(e);
      }
    };
    let timer = null;
    const startPolling = () => {
      if (timer !== null) return;
      timer = setInterval(() => { void poll(); }, 5000);
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
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
    if (editing) return;
    if (e.key === '?') {
      e.preventDefault();
      if (shortcut) shortcut.classList.toggle('open');
      return;
    }
    if (pendingGo) {
      pendingGo = false;
      if (e.key === 'e') window.location.href = '/ui/episodes';
      if (e.key === 'j') window.location.href = '/ui/jobs';
      if (e.key === 'h') window.location.href = '/ui/health';
      return;
    }
    if (e.key === 'g') {
      pendingGo = true;
      setTimeout(() => { pendingGo = false; }, 1500);
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
