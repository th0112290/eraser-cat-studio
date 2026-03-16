export const UI_SHELL_STYLES = `
:root{
  --bg:#edf4f3;--bg2:#e1ecea;--ink:#102126;--muted:#46606b;--muted-2:#6b808a;--line:#c5d7dc;--line-strong:#97afb7;
  --card:#ffffffed;--card-strong:#ffffff;--primary:#0e7a74;--primary-ink:#f1fffc;--info:#0f6489;--info-strong:#0b4e6d;
  --good:#166534;--good-strong:#12532c;--warn:#975a16;--warn-strong:#7c480f;--bad:#b42318;--bad-strong:#8f1c13;
  --ok-bg:#e8f8ee;--ok-border:#bfddc8;--warn-bg:#fff7e8;--warn-border:#ecd3a8;--bad-bg:#fff1f2;--bad-border:#efc7cb;
  --info-bg:#eaf5fb;--info-border:#bfd9eb;--muted-bg:#eef3f6;--muted-border:#d7e1e6;--muted-tone:#51606f;--ring:#7cc9c3;
  --shadow:rgba(17,53,70,.14);--content-width:1360px;--sticky-top:136px
}
*{box-sizing:border-box}
html{scroll-padding-top:calc(var(--sticky-top) + 16px)}
body{margin:0;font-family:"SUIT Variable","Sora","Pretendard Variable","Noto Sans KR",sans-serif;color:var(--ink);background:radial-gradient(1200px 380px at 12% -12%,#2a7d7430 0,#2a7d7400 72%),radial-gradient(1100px 340px at 88% -16%,#f59e0b22 0,#f59e0b00 70%),linear-gradient(180deg,#071319 0,#0d2027 228px,var(--bg) 228px,var(--bg2) 100%);min-height:100vh;line-height:1.45}
body[data-dialog-open="1"]{overflow:hidden}
.skip-link{position:absolute;left:16px;top:-44px;padding:8px 12px;border-radius:10px;background:#0f172a;color:#f8fbff;font-weight:700;z-index:30;transition:top .15s ease}.skip-link:focus{top:12px}
.shell-header{position:sticky;top:0;z-index:20;backdrop-filter:blur(16px);background:linear-gradient(180deg,#081319f5,#0d2027ee);border-bottom:1px solid #21424c;box-shadow:0 14px 34px rgba(0,0,0,.25)}
.shell-inner{max-width:var(--content-width);margin:0 auto;padding:12px 20px 14px;display:grid;gap:12px}
.shell-top{display:grid;grid-template-columns:minmax(0,1.42fr) minmax(340px,.95fr);gap:16px;align-items:start}
.shell-brand,.shell-brand-block,.shell-brand-copy{display:grid}
.shell-brand-block{gap:10px}
.shell-brand-copy{gap:6px}
.shell-brand-mark{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8fe7db}
.shell-brand-mark strong{display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:40px;padding:0 12px;border-radius:12px;background:linear-gradient(180deg,#17a094,#0b5a56);color:#f2fffd;box-shadow:0 10px 20px rgba(0,0,0,.24)}
.shell-brand h1{margin:0;font-size:28px;letter-spacing:-.04em;color:#f1fbff}
.shell-brand p{margin:0;color:#a5bbc1;font-size:13px;line-height:1.5;max-width:64ch}
.shell-meta{display:grid;gap:10px;justify-items:stretch;padding:12px 14px;border:1px solid #234752;border-radius:18px;background:linear-gradient(180deg,#10252f,#14333d);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.shell-chip-row,.shell-status-row,.shell-shortcuts,.quick-links,.inline-actions,.actions,.table-tools,.toolbar,.ops-toolbar,.shell-action-buttons{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.shell-context-row,.shell-status-row,.shell-shortcuts{justify-content:flex-start}
.shell-chip,.badge,.status-badge{--badge-bg:var(--muted-bg);--badge-border:var(--muted-border);--badge-ink:#18313c;--badge-label:var(--muted-2);display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:6px 10px;border-radius:999px;border:1px solid var(--badge-border);background:var(--badge-bg);color:var(--badge-ink);font-size:12px;font-weight:700;line-height:1.2}
.shell-chip strong,.status-badge strong{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--badge-label)}
.badge{padding:4px 10px}
.shell-status{--badge-bg:#11303b;--badge-border:#294652;--badge-ink:#e7f8fc;--badge-label:#8fe7db;display:grid;gap:4px;min-width:144px;padding:10px 12px;border-radius:14px;border:1px solid var(--badge-border);background:var(--badge-bg);color:var(--badge-ink);font-size:12px;font-weight:600;line-height:1.35}
.shell-status strong{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--badge-label)}
.shell-chip.severity-ok,.shell-status.severity-ok,.badge.ok,.status-badge.ok{--badge-bg:var(--ok-bg);--badge-border:var(--ok-border);--badge-ink:var(--good-strong);--badge-label:var(--good)}
.shell-chip.severity-warn,.shell-status.severity-warn,.badge.warn,.status-badge.warn{--badge-bg:var(--warn-bg);--badge-border:var(--warn-border);--badge-ink:var(--warn-strong);--badge-label:var(--warn)}
.shell-chip.severity-bad,.shell-status.severity-bad,.badge.bad,.status-badge.bad{--badge-bg:var(--bad-bg);--badge-border:var(--bad-border);--badge-ink:var(--bad-strong);--badge-label:var(--bad)}
.shell-chip.severity-info,.shell-status.severity-info,.badge.info,.badge.notice,.status-badge.info{--badge-bg:var(--info-bg);--badge-border:var(--info-border);--badge-ink:var(--info-strong);--badge-label:var(--info)}
.shell-chip.severity-muted,.shell-status.severity-muted,.badge.muted,.status-badge.muted{--badge-bg:var(--muted-bg);--badge-border:var(--muted-border);--badge-ink:var(--muted-tone);--badge-label:var(--muted-2)}
.severity-ok{color:var(--good-strong)}.severity-warn{color:var(--warn-strong)}.severity-bad{color:var(--bad-strong)}.severity-info{color:var(--info-strong)}.severity-muted{color:var(--muted-tone)}
.shell-chip-static{background:#102b35;border-color:#355561;color:#e8f8fc}.shell-chip-object{max-width:100%}.shell-chip-state{font-weight:800}.shell-shortcuts{padding-top:2px}.shell-nav-toggle{display:none}
.shell-nav-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.shell-nav-group{display:grid;gap:8px;padding:11px 12px;border:1px solid #28464f;border-radius:16px;background:linear-gradient(180deg,#10252d,#132f39)}
.shell-nav-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}
.shell-nav-head span{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8fe7db}
.shell-nav-head small{font-size:11px;color:#9fb5bc;line-height:1.4}
.shell-nav-links{display:grid;gap:8px}
.shell-nav-links a{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:10px 11px;border-radius:13px;border:1px solid transparent;background:#173540;color:#e8fbff;text-decoration:none;transition:.18s ease}
.shell-nav-links a:hover{background:#1d404b;border-color:#3d6570;text-decoration:none}
.shell-nav-links a.active,.shell-nav-links a[aria-current="page"]{background:linear-gradient(180deg,#1c6d66,#0d4e49);border-color:#7fd8cb;color:#f4fffd;box-shadow:0 0 0 1px #0a2d2b inset}
.shell-nav-links strong{font-size:13px}
.shell-nav-links small{font-size:11px;color:#a4bcc4;line-height:1.35;max-width:156px;text-align:right}
main{max-width:var(--content-width);margin:16px auto;padding:0 20px 32px;display:grid;gap:16px}
.card{background:linear-gradient(180deg,var(--card),var(--card-strong));border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 14px 32px var(--shadow)}
.card h1,.card h2,.card h3{margin-top:0}.card h1{font-size:28px;letter-spacing:-.02em}.card h2{font-size:20px;letter-spacing:-.01em}
.notice,.success-state,.warning-state,.error,.error-state,.empty-state,.panel,.notice-panel,.recovery-panel{display:grid;gap:6px;padding:12px 14px;border-radius:14px;border:1px solid var(--panel-border,var(--line));background:var(--panel-bg,linear-gradient(180deg,#fbfefd,#f4f9fa));color:var(--panel-ink,var(--ink));box-shadow:inset 4px 0 0 var(--panel-accent,#b8c9d1)}
.notice,.success-state,.panel.ok,.notice-panel,.recovery-panel.ok{--panel-border:var(--ok-border);--panel-bg:linear-gradient(180deg,#f5fcf7,#edf8f0);--panel-ink:#1e3c2b;--panel-accent:var(--good)}
.warning-state,.panel.warn,.recovery-panel.warn{--panel-border:var(--warn-border);--panel-bg:linear-gradient(180deg,#fffaf1,#fff3df);--panel-ink:#5e3a0d;--panel-accent:var(--warn)}
.error,.error-state,.panel.bad{--panel-border:var(--bad-border);--panel-bg:linear-gradient(180deg,#fff7f7,#fff1f2);--panel-ink:#5d1b15;--panel-accent:var(--bad)}
.empty-state,.panel.muted{--panel-border:var(--muted-border);--panel-bg:linear-gradient(180deg,#fbfdff,#f4f7fa);--panel-ink:var(--muted-tone);--panel-accent:#9fb2bc;border-style:dashed}
.dashboard-shell,.table-shell,.grid,.stack,.status-panel,.ops-shell,.ops-table-shell{display:grid;gap:12px}
.detail-shell{display:grid;gap:16px;grid-template-columns:minmax(0,1.62fr) minmax(300px,.95fr);align-items:start}
.compare-shell{display:grid;gap:16px;grid-template-columns:minmax(0,1.34fr) minmax(320px,.92fr);align-items:start}
.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.page-intro,.detail-hero,.compare-hero{position:relative;overflow:hidden;display:grid;gap:12px;padding:18px;border-radius:20px;border:1px solid #244650;background:linear-gradient(150deg,#11242c 0%,#173340 60%,#12312d 100%);box-shadow:0 18px 36px rgba(0,0,0,.2);color:#eefbfd}
.page-intro::before,.detail-hero::before,.compare-hero::before{content:"";position:absolute;inset:0 auto auto 0;height:4px;width:100%;background:linear-gradient(90deg,#1ec3af,#f59e0b)}
.page-intro h2,.detail-hero h2,.compare-hero h2{margin:0;font-size:25px;letter-spacing:-.04em;color:#f5fdff}
.page-intro-head,.section-head,.ops-titlebar{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.hero-grid,.page-header-grid{display:grid;grid-template-columns:minmax(0,1.44fr) minmax(320px,.9fr);gap:14px;align-items:start}
.page-title-stack{gap:10px}
.shell-page-kicker,.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9fd7d2}
.object-header{display:grid;gap:12px}.object-header-main{display:grid;gap:8px;max-width:68ch}.object-header-meta{align-items:flex-start}
.hero-panel,.status-panel,.metadata-block,.decision-rail,.recovery-rail,.surface-panel,.ops-lane,.ops-resource-card,.ops-kpi,.ops-inline-card{display:grid;gap:10px;padding:14px;border-radius:16px;border:1px solid var(--line);background:linear-gradient(180deg,#ffffff,#f7fbfc);box-shadow:0 8px 20px rgba(17,53,70,.08)}
.page-intro .metadata-block,.page-intro .status-panel,.detail-hero .metadata-block,.detail-hero .status-panel,.compare-hero .metadata-block,.compare-hero .status-panel,.page-intro .hero-panel,.detail-hero .hero-panel,.compare-hero .hero-panel{border-color:#28464f;background:rgba(14,34,43,.58);box-shadow:none}
.status-list,.metadata-grid,.rail-list,.ops-actions-list,.ops-mini-list{display:grid;gap:8px}.metadata-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.status-row,.metadata-row,.metadata-item,.ops-summary-line{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:9px 10px;border:1px solid #d8e4ea;background:rgba(255,255,255,.74);border-radius:12px}
.status-row .label,.metadata-label,.metadata-item dt,.muted-text,.caption{color:var(--muted-2);font-size:12px}
.status-row .label,.metadata-label,.metadata-item dt{font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.status-row strong,.metadata-value,.metadata-item dd{margin:0;font-size:14px;font-weight:700;color:var(--ink)}
.status-row strong.severity-ok,.metadata-row strong.severity-ok{color:var(--good-strong)}
.status-row strong.severity-warn,.metadata-row strong.severity-warn{color:var(--warn-strong)}
.status-row strong.severity-bad,.metadata-row strong.severity-bad{color:var(--bad-strong)}
.status-row strong.severity-info,.metadata-row strong.severity-info{color:var(--info-strong)}
.status-row strong.severity-muted,.metadata-row strong.severity-muted{color:var(--muted-tone)}
.page-intro .status-row,.detail-hero .status-row,.compare-hero .status-row,.page-intro .metadata-row,.detail-hero .metadata-row,.compare-hero .metadata-row{border-color:#345764;background:rgba(16,36,45,.8);color:#e9f7fb}
.page-intro .status-row strong,.detail-hero .status-row strong,.compare-hero .status-row strong{color:#f4fdff}
.page-intro .status-row strong.severity-ok,.detail-hero .status-row strong.severity-ok,.compare-hero .status-row strong.severity-ok{color:#c4f0d1}
.page-intro .status-row strong.severity-warn,.detail-hero .status-row strong.severity-warn,.compare-hero .status-row strong.severity-warn{color:#ffd68b}
.page-intro .status-row strong.severity-bad,.detail-hero .status-row strong.severity-bad,.compare-hero .status-row strong.severity-bad{color:#ffb3ba}
.page-intro .status-row strong.severity-info,.detail-hero .status-row strong.severity-info,.compare-hero .status-row strong.severity-info{color:#bde7ff}
.page-intro .status-row strong.severity-muted,.detail-hero .status-row strong.severity-muted,.compare-hero .status-row strong.severity-muted{color:#d3e5ea}
.page-intro .section-intro,.page-intro .muted-text,.page-intro .shell-chip,.page-intro .shell-chip strong,.detail-hero .section-intro,.detail-hero .muted-text,.compare-hero .section-intro,.compare-hero .muted-text{color:#e8f8fb}
.page-intro .shell-chip,.detail-hero .shell-chip,.compare-hero .shell-chip{--badge-bg:#112d38;--badge-border:#43616d;--badge-ink:#ecf8fb;--badge-label:#b5dbe2}
.decision-rail,.recovery-rail{align-self:start}
.decision-rail.is-sticky,.recovery-rail.is-sticky,.metadata-block.is-sticky{position:sticky;top:calc(var(--sticky-top) + 8px)}
.rail-list,.ops-actions-list,.ops-mini-list{margin:0;padding:0;list-style:none}
.rail-list li,.ops-actions-list li,.ops-mini-list li{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:8px 0;border-top:1px solid #dee7eb}
.rail-list li:first-child,.ops-actions-list li:first-child,.ops-mini-list li:first-child{border-top:none;padding-top:0}
.rail-list li span:first-child,.ops-actions-list li span:first-child,.ops-mini-list li span:first-child{font-weight:700;color:#1f3340}
.sticky-action-bar{position:sticky;top:var(--sticky-top);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;border-radius:16px;border:1px solid #c9dfe3;background:rgba(255,255,255,.94);box-shadow:0 12px 28px rgba(17,53,70,.12);backdrop-filter:blur(10px)}
.shell-action-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.shell-action-state{justify-content:flex-start}
.quick-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));align-items:start}
.form-card{display:grid;gap:10px;padding:14px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:14px}.form-card h3{margin:0;font-size:15px}.field{display:grid;gap:5px}.field label{font-size:12px;font-weight:700;color:#334155}.field small,.section-intro{color:#4b5f69;line-height:1.55}.field input{width:100%}
.link-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.link-grid a{display:block;padding:11px 12px;border:1px solid #d0dfef;border-radius:12px;background:#f8fbff;color:#114a45;font-weight:700}
.summary-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(148px,1fr))}.summary-card{display:grid;gap:6px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:14px}.summary-card .metric{font-size:24px;font-weight:800;letter-spacing:-.03em}.summary-card .caption{line-height:1.45}
.mono{font-family:"Cascadia Code","JetBrains Mono","Fira Code",monospace;font-size:12px;word-break:break-all}
.table-wrap{overflow:auto;border:1px solid #d3e2eb;border-radius:16px;background:#fff}.table-wrap table{border:none;border-radius:0;min-width:720px}.table-wrap th{position:sticky;top:0;z-index:1}tbody tr:nth-child(even){background:#fbfdff}tbody tr:hover{background:#f0f7fb}
.table-tools,.toolbar,.asset-table-tools,.studio-table-tools{padding:10px 12px;border:1px solid #dbe7f3;border-radius:14px;background:linear-gradient(180deg,#fbfdff,#f5f9fb)}
.search-cluster,.table-affordance,.filter-affordance{display:grid;gap:6px;padding:12px;border:1px solid #dbe7f3;background:linear-gradient(180deg,#fbfdff,#f5f9fb);border-radius:14px}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}.search-cluster .muted-text{line-height:1.4}
.table-tools[data-search-active="1"],.toolbar[data-search-active="1"],.search-cluster[data-search-active="1"],.asset-table-tools[data-search-active="1"],.studio-table-tools[data-search-active="1"]{border-color:#9fcfc9;background:linear-gradient(180deg,#f7fdfc,#eef8f6);box-shadow:0 0 0 1px #c6ebe5 inset}
.table-tools input[type="search"],.toolbar input[type="search"],.search-cluster input[type="search"],.asset-table-tools input[type="search"],.studio-table-tools input[type="search"],input[data-table-filter]{min-height:40px;padding:9px 12px 9px 36px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%236b808a' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='8.5' cy='8.5' r='5.5'/%3E%3Cpath d='M13 13l4 4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:11px 50%;background-size:15px 15px}
input[type="search"][data-filter-active="1"],input[data-table-filter][data-filter-active="1"]{border-color:#7ebfba;background-color:#fbffff}
.table-tools input[type="search"]{min-width:240px;max-width:360px}
.kbd{display:inline-block;border:1px solid #d0dceb;border-bottom-width:2px;border-radius:7px;padding:1px 6px;background:#f8fbff;color:#0f3f5f;font-size:12px;font-weight:700}
.quick-links a,.button-link{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;border:1px solid #c7d9eb;background:#f8fbff;color:#0f4e6a;font-size:12px;font-weight:700;text-decoration:none}
a{color:#0f766e;text-decoration:none}a:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #dbe6f1;border-radius:12px;overflow:hidden}th,td{border-bottom:1px solid #e8eef5;padding:9px 10px;text-align:left;vertical-align:top}th{background:#f2f9fc;color:#2f4552;font-weight:700}
.ops-titleblock{display:grid;gap:4px;max-width:720px}.ops-titleblock h1,.ops-titleblock h2{margin-bottom:0}
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid,.ops-detail-grid,.ops-key-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:800}
.ops-callout{display:grid;gap:6px;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:linear-gradient(180deg,#fbfefd,#f2f8f9)}
.ops-callout h3,.ops-lane h3,.ops-resource-card h3{margin:0;font-size:14px}.ops-callout p,.ops-lane p,.ops-resource-card p,.ops-inline-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-callout.warn{border-color:var(--warn-border);background:linear-gradient(180deg,#fffaf1,#fff3df)}.ops-callout.bad{border-color:var(--bad-border);background:linear-gradient(180deg,#fff7f7,#fff1f2)}.ops-callout.ok{border-color:var(--ok-border);background:linear-gradient(180deg,#f5fcf7,#edf8f0)}
.ops-inline-card{color:inherit;text-decoration:none}.ops-inline-card:hover{border-color:#9ec6c3;background:linear-gradient(180deg,#ffffff,#eef8f6);text-decoration:none}.ops-inline-card strong{font-size:15px;letter-spacing:-.01em}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.ops-resource-list ul{margin:0;padding-left:18px;display:grid;gap:8px}.ops-resource-list li{line-height:1.5}
input,select,textarea,button{font:inherit;border:1px solid #c7d5e4;border-radius:10px;padding:8px 10px;background:#fff}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--ring);border-color:#0f766e}
textarea{width:100%;min-height:220px;resize:vertical}
button{min-height:40px;background:linear-gradient(180deg,#119189,#0e7a74);color:var(--primary-ink);border:none;font-weight:800;letter-spacing:.01em;cursor:pointer;transition:.18s ease;box-shadow:0 7px 16px rgba(15,118,110,.22)}button:hover{transform:translateY(-1px)}button[data-available="0"]{opacity:.55}.button-link,.secondary{background:linear-gradient(180deg,#fbfdff,#f2f8fc);color:#164d68;border:1px solid #bdd2e3;box-shadow:none}
pre{margin:0;background:#0f172a;color:#d6e4ff;padding:11px;border-radius:12px;overflow:auto;font-size:12px}
.toast-wrap{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:9999}.toast{min-width:240px;max-width:460px;padding:10px 12px;border-radius:12px;background:#102434;color:#f8fbff;border:1px solid rgba(255,255,255,.08);box-shadow:0 10px 24px rgba(0,0,0,.22)}.toast.ok{background:#14532d}.toast.warn{background:#9a5a00}.toast.bad{background:#7f1d1d}.toast.info{background:#114a6a}.toast.muted{background:#334155}.toast .title{font-weight:800;margin-bottom:4px}
.submit-loading{opacity:.72;pointer-events:none}.submit-loading::after{content:"...";margin-left:4px}.field-error{color:#b42318;font-size:12px;padding-top:2px}.hint{display:inline-block;border-bottom:1px dotted #8ca1bf;color:#305f99;cursor:help;font-size:12px}
.shortcut-help{position:fixed;inset:0;background:#0f172a73;display:none;align-items:center;justify-content:center;z-index:9998;padding:20px}.shortcut-help.open{display:flex}.shortcut-card{width:min(680px,92vw);background:#ffffff;border-radius:16px;border:1px solid var(--line);padding:16px;box-shadow:0 20px 44px rgba(0,0,0,.2)}.shortcut-card h2{margin:0 0 8px}.shortcut-card table{font-size:14px}
.sr-live{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
@media (max-width:1140px){.shell-nav-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.shell-top,.detail-shell,.compare-shell,.hero-grid,.page-header-grid{grid-template-columns:1fr}}
@media (max-width:900px){:root{--sticky-top:16px}.shell-header{position:static}.shell-brand h1{font-size:24px}.shell-brand p,.shell-shortcut-copy{display:none}.shell-meta{width:100%}.shell-nav-toggle{display:inline-flex}.shell-nav-head small,.shell-nav-links small{display:none}.sticky-action-bar{position:static;grid-template-columns:1fr;align-items:stretch}.shell-action-head,.shell-action-buttons{justify-content:flex-start}.shell-action-buttons button,.shell-action-buttons a{width:100%;justify-content:center}}
@media (max-width:720px){.shell-inner{padding:10px 12px 12px}.shell-nav-grid{grid-template-columns:1fr}.shell-nav-group{padding:10px}.shell-nav-links a{padding:9px 10px}.shell-brand-mark{gap:8px;font-size:11px}.shell-brand-mark strong{min-width:34px;height:34px;border-radius:10px;padding:0 10px}.page-intro,.detail-hero,.compare-hero,.card{padding:13px;border-radius:14px}.page-intro h2,.detail-hero h2,.compare-hero h2{font-size:21px}.page-intro .shell-page-copy{display:none}.status-row,.metadata-row,.metadata-item,.ops-summary-line,.ops-actions-list li,.ops-mini-list li,.rail-list li{display:grid;justify-content:stretch}main{padding:0 12px 24px}.quick-grid,.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid,.ops-detail-grid,.ops-key-grid,.metadata-grid{grid-template-columns:1fr}.table-wrap table{min-width:620px}th,td{padding:8px;font-size:12px}.table-tools,.toolbar,.asset-table-tools,.studio-table-tools{padding:10px}.table-tools input[type="search"]{min-width:100%;max-width:none}}
`;
