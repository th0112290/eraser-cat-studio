export const UI_SHELL_STYLES = `
:root{--bg:#eef4f3;--bg2:#e2ecea;--ink:#102126;--muted:#405663;--line:#c4d7dc;--card:#ffffffec;--card-strong:#ffffff;--primary:#0e7a74;--primary-ink:#f1fffc;--good:#166534;--warn:#975a16;--bad:#b42318;--ring:#7cc9c3;--shadow:#11354622}
*{box-sizing:border-box}
body{margin:0;font-family:"SUIT Variable","Sora","Pretendard Variable","Noto Sans KR",sans-serif;color:var(--ink);background:radial-gradient(1200px 380px at 12% -12%,#2a7d7438 0,#2a7d7400 72%),radial-gradient(1100px 340px at 88% -16%,#f59e0b26 0,#f59e0b00 70%),linear-gradient(180deg,#071319 0,#0d2027 220px,var(--bg) 220px,var(--bg2) 100%);min-height:100vh;line-height:1.45}
body[data-dialog-open="1"]{overflow:hidden}
.skip-link{position:absolute;left:16px;top:-44px;padding:8px 12px;border-radius:10px;background:#0f172a;color:#f8fbff;font-weight:700;z-index:30;transition:top .15s ease}.skip-link:focus{top:12px}
.shell-header{position:sticky;top:0;z-index:20;backdrop-filter:blur(14px);background:linear-gradient(180deg,#081319f2,#0d2027eb);border-bottom:1px solid #21424c;box-shadow:0 10px 30px #00000028}
.shell-inner{max-width:1320px;margin:0 auto;padding:10px 18px 12px;display:grid;gap:10px}
.shell-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.shell-brand{display:grid;gap:6px;max-width:720px}
.shell-brand-mark{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8fe7db}
.shell-brand-mark strong{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:38px;padding:0 12px;border-radius:12px;background:linear-gradient(180deg,#17a094,#0b5a56);color:#f2fffd;box-shadow:0 10px 20px #00000024}
.shell-brand h1{margin:0;font-size:27px;letter-spacing:-.04em;color:#f1fbff}
.shell-brand p{margin:0;color:#a5bbc1;font-size:13px;line-height:1.45;max-width:62ch}
.shell-meta{display:grid;gap:6px;justify-items:end}
.shell-chip-row,.shell-status-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.shell-chip,.shell-status{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;border:1px solid #294652;background:#11303b;color:#e7f8fc;font-size:12px;font-weight:700}
.shell-chip strong,.shell-status strong{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8fe7db}
.shell-shortcuts{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.shell-nav-toggle{display:none}
.shell-nav-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.shell-nav-group{display:grid;gap:8px;padding:10px 11px;border:1px solid #28464f;border-radius:16px;background:linear-gradient(180deg,#10252d,#132f39)}
.shell-nav-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
.shell-nav-head span{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8fe7db}
.shell-nav-head small{font-size:11px;color:#9fb5bc}
.shell-nav-links{display:grid;gap:8px}
.shell-nav-links a{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 10px;border-radius:12px;border:1px solid transparent;background:#173540;color:#e8fbff;text-decoration:none;transition:.18s ease}
.shell-nav-links a:hover{background:#1d404b;border-color:#3d6570;text-decoration:none}
.shell-nav-links a.active,.shell-nav-links a[aria-current="page"]{background:linear-gradient(180deg,#1c6d66,#0d4e49);border-color:#7fd8cb;color:#f4fffd;box-shadow:0 0 0 1px #0a2d2b inset}
.shell-nav-links strong{font-size:13px}
.shell-nav-links small{font-size:11px;color:#a4bcc4;line-height:1.35;max-width:150px;text-align:right}
main{max-width:1320px;margin:14px auto;padding:0 18px 24px;display:grid;gap:12px}
.card{background:linear-gradient(180deg,var(--card),var(--card-strong));border:1px solid var(--line);border-radius:18px;padding:14px;box-shadow:0 14px 32px var(--shadow)}
.card h1,.card h2,.card h3{margin-top:0}.card h1{font-size:28px;letter-spacing:-.02em}.card h2{font-size:20px;letter-spacing:-.01em}
.notice,.success-state{padding:10px 11px;border-left:4px solid #0f766e;background:#e8f8f5;border-radius:10px}.warning-state{padding:10px 11px;border-left:4px solid var(--warn);background:#fff7e8;border-radius:10px}.error,.error-state{padding:10px 11px;border-left:4px solid var(--bad);background:#fff1f2;border-radius:10px}.empty-state{padding:12px 13px;border:1px dashed #c6d8e0;background:#f8fbff;color:#516571;border-radius:12px}
.dashboard-shell,.detail-shell,.compare-shell,.table-shell,.grid,.stack,.status-panel{display:grid;gap:10px}.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.page-intro,.detail-hero,.compare-hero{position:relative;overflow:hidden;display:grid;gap:10px;padding:14px;border-radius:16px;border:1px solid #244650;background:linear-gradient(150deg,#11242c 0%,#173340 60%,#12312d 100%);box-shadow:0 16px 36px #00000022;color:#eefbfd}
.page-intro::before,.detail-hero::before,.compare-hero::before{content:"";position:absolute;inset:0 auto auto 0;height:4px;width:100%;background:linear-gradient(90deg,#1ec3af,#f59e0b)}
.page-intro h2,.detail-hero h2,.compare-hero h2{margin:0;font-size:24px;letter-spacing:-.04em;color:#f5fdff}
.page-intro-head,.section-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,.85fr);gap:12px;align-items:start}.hero-panel,.status-panel{padding:12px;border-radius:14px;border:1px solid #28464f;background:#15303a}
.status-list{display:grid;gap:8px;margin:6px 0 0}.status-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 9px;border:1px solid #325562;background:#10242d;border-radius:10px;color:#e9f7fb}.status-row strong{color:#f4fdff}
.status-row .label,.muted-text{color:#a8bcc2;font-size:12px}.shell-page-kicker,.shell-page-copy{color:#d3e5ea}.sticky-action-bar,.quick-links,.inline-actions,.actions,.table-tools,.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sticky-action-bar{position:sticky;top:124px;padding:10px 12px;border-radius:14px;border:1px solid #c9dfe3;background:#fffffff0;box-shadow:0 10px 24px #11354614}
.quick-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));align-items:start}
.form-card{display:grid;gap:10px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}.form-card h3{margin:0;font-size:15px}.field{display:grid;gap:5px}.field label{font-size:12px;font-weight:700;color:#334155}.field small,.section-intro{color:#4b5f69;line-height:1.5}.field input{width:100%}
.page-intro .section-intro,.page-intro .muted-text,.page-intro .shell-chip,.page-intro .shell-chip strong{color:#eaf8fb}
.page-intro .shell-chip{border-color:#43616d;background:#112d38}
.link-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.link-grid a{display:block;padding:10px 12px;border:1px solid #d0dfef;border-radius:10px;background:#f8fbff;color:#114a45;font-weight:700}
.summary-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(148px,1fr))}.summary-card{display:grid;gap:6px;padding:10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:14px}.summary-card .metric{font-size:24px;font-weight:800;letter-spacing:-.03em}.summary-card .caption{font-size:12px;color:#5b687a;line-height:1.4}
.mono{font-family:"Cascadia Code","JetBrains Mono","Fira Code",monospace;font-size:12px;word-break:break-all}
.table-wrap{overflow:auto;border:1px solid #d3e2eb;border-radius:14px;background:#fff}.table-wrap table{border:none;border-radius:0;min-width:720px}.table-wrap th{position:sticky;top:0;z-index:1}tbody tr:nth-child(even){background:#fbfdff}tbody tr:hover{background:#f1f8ff}
.table-tools input[type="search"]{min-width:220px;max-width:360px}.search-cluster{display:grid;gap:6px;padding:12px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.kbd{display:inline-block;border:1px solid #d0dceb;border-bottom-width:2px;border-radius:7px;padding:1px 6px;background:#f8fbff;color:#0f3f5f;font-size:12px;font-weight:700}
.quick-links a{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #c7d9eb;background:#f8fbff;color:#0f4e6a;font-size:12px;font-weight:700}
a{color:#0f766e;text-decoration:none}a:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #dbe6f1;border-radius:12px;overflow:hidden}th,td{border-bottom:1px solid #e8eef5;padding:8px 9px;text-align:left;vertical-align:top}th{background:#f2f9fc;color:#2f4552;font-weight:700}
.badge{display:inline-block;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700}.badge.ok{background:#e9f8ee;color:var(--good)}.badge.warn{background:#fff7e8;color:var(--warn)}.badge.bad{background:#fff1f2;color:var(--bad)}.badge.muted{background:#eef2f7;color:#475569}
input,select,textarea,button{font:inherit;border:1px solid #c7d5e4;border-radius:10px;padding:8px 10px;background:#fff}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--ring);border-color:#0f766e}
textarea{width:100%;min-height:220px;resize:vertical}
button{background:linear-gradient(180deg,#119189,#0e7a74);color:var(--primary-ink);border:none;font-weight:800;letter-spacing:.01em;cursor:pointer;transition:.18s ease;box-shadow:0 7px 16px #0f766e35}.button-link,.secondary{background:linear-gradient(180deg,#fbfdff,#f2f8fc);color:#164d68;border:1px solid #bdd2e3;box-shadow:none}
pre{margin:0;background:#0f172a;color:#d6e4ff;padding:11px;border-radius:10px;overflow:auto;font-size:12px}
.toast-wrap{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:9999}.toast{background:#0f172a;color:#f8fbff;border-radius:11px;padding:10px 12px;box-shadow:0 10px 24px #0000002b;min-width:240px;max-width:460px}.toast.ok{background:#14532d}.toast.warn{background:#9a5a00}.toast.bad{background:#7f1d1d}.toast .title{font-weight:800;margin-bottom:4px}
.submit-loading{opacity:.72;pointer-events:none}.submit-loading::after{content:"...";margin-left:4px}.field-error{color:#b42318;font-size:12px;padding-top:2px}.hint{display:inline-block;border-bottom:1px dotted #8ca1bf;color:#305f99;cursor:help;font-size:12px}
.shortcut-help{position:fixed;inset:0;background:#0f172a73;display:none;align-items:center;justify-content:center;z-index:9998;padding:20px}.shortcut-help.open{display:flex}.shortcut-card{width:min(680px,92vw);background:#ffffff;border-radius:14px;border:1px solid var(--line);padding:16px;box-shadow:0 20px 44px #00000026}.shortcut-card h2{margin:0 0 8px}.shortcut-card table{font-size:14px}
.sr-live{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
@media (max-width:1140px){.shell-nav-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){.shell-header{position:static}.shell-brand h1{font-size:23px}.shell-brand p,.shell-status-row,.shell-shortcut-copy{display:none}.shell-chip-row{justify-content:flex-start}.shell-chip-row .shell-chip:first-child{display:none}.shell-meta{justify-items:stretch;width:100%}.shell-shortcuts{justify-content:flex-start}.shell-nav-toggle{display:inline-flex}.shell-nav-head small,.shell-nav-links small{display:none}.hero-grid{grid-template-columns:1fr}.page-intro{padding:12px}.page-intro .shell-page-copy{display:none}.status-panel{grid-template-columns:repeat(3,minmax(0,1fr));padding:10px}.status-row{display:grid;gap:2px;align-items:start}.sticky-action-bar{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}.sticky-action-bar>.muted-text{display:none}.sticky-action-bar>.quick-links{grid-column:1/-1}.sticky-action-bar button,.sticky-action-bar a{width:100%;justify-content:center}}
@media (max-width:720px){.shell-inner{padding:9px 12px 10px}.shell-nav-grid{grid-template-columns:1fr}.shell-nav-group{padding:9px 10px}.shell-nav-links{gap:6px}.shell-nav-links a{padding:8px 9px}.shell-brand-mark{gap:8px;font-size:11px}.shell-brand-mark strong{min-width:32px;height:32px;border-radius:10px;padding:0 10px}.page-intro h2,.detail-hero h2,.compare-hero h2{font-size:21px}.page-intro-head{align-items:flex-start}.page-intro .quick-links{width:100%}.status-panel{grid-template-columns:1fr}.sticky-action-bar{grid-template-columns:1fr 1fr;padding:8px 10px}.sticky-action-bar .quick-links{gap:6px}.sticky-action-bar .shell-chip{font-size:11px;padding:6px 8px}.main,main{padding:0 12px 22px}.card{border-radius:13px;padding:12px}th,td{padding:7px;font-size:12px}.quick-grid{grid-template-columns:1fr}.table-wrap table{min-width:620px}.actions{gap:6px}.field small{font-size:11px}}
`;
