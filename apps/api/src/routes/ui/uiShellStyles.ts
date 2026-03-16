export const UI_SHELL_STYLES = `
:root{
  --bg:#eef2f4;
  --bg2:#e6ecef;
  --bg3:#dce4e8;
  --ink:#132129;
  --ink-2:#21323a;
  --muted:#586874;
  --muted-2:#7b8993;
  --line:#cfd7dd;
  --line-strong:#a9b6bf;
  --card:#ffffff;
  --card-muted:#f6f9fb;
  --card-strong:#ffffff;
  --hero:#0e1b21;
  --hero-2:#152833;
  --hero-3:#13252d;
  --accent:#0f6e67;
  --accent-strong:#0a5752;
  --accent-soft:#deece9;
  --info:#155e8d;
  --info-strong:#124b70;
  --good:#166534;
  --good-strong:#12532c;
  --warn:#975a16;
  --warn-strong:#7c480f;
  --bad:#b42318;
  --bad-strong:#8f1c13;
  --ok-bg:#eaf7ef;
  --ok-border:#bfd9c8;
  --warn-bg:#fbf3e4;
  --warn-border:#e4cda0;
  --bad-bg:#fdf0f1;
  --bad-border:#efc5cb;
  --info-bg:#ebf4fb;
  --info-border:#bfd5e7;
  --muted-bg:#eff4f6;
  --muted-border:#d7e0e5;
  --muted-tone:#5d6a75;
  --shadow:0 14px 32px rgba(17,41,53,.10);
  --shadow-soft:0 10px 24px rgba(17,41,53,.07);
  --ring:#7eb8b2;
  --content-width:1480px;
  --sticky-top:146px;
  --space-1:6px;
  --space-2:10px;
  --space-3:14px;
  --space-4:18px;
  --space-5:24px;
  --space-6:32px;
  --control-height:40px;
  --control-height-lg:52px;
  --surface-pad-y:15px;
  --surface-pad-x:16px;
  --table-cell-y:10px;
  --table-cell-x:12px;
  --table-font-size:12px;
  --focus-shadow:0 0 0 3px rgba(126,184,178,.26),0 0 0 6px rgba(126,184,178,.12)
}
*{box-sizing:border-box}
html{scroll-padding-top:calc(var(--sticky-top) + 16px)}
body{
  margin:0;
  min-height:100vh;
  font-family:"SUIT Variable","Sora","Pretendard Variable","Noto Sans KR",sans-serif;
  color:var(--ink);
  line-height:1.5;
  background:
    radial-gradient(1100px 320px at 10% -8%,rgba(15,110,103,.10) 0,rgba(15,110,103,0) 72%),
    radial-gradient(980px 280px at 92% -10%,rgba(21,94,141,.08) 0,rgba(21,94,141,0) 70%),
    linear-gradient(180deg,#0a151c 0,#10202a 232px,var(--bg) 232px,var(--bg2) 100%)
}
body[data-dialog-open="1"]{overflow:hidden}
body[data-shell-grammar]{color-scheme:light}
body[data-density-mode="compact"]{
  --sticky-top:132px;
  --space-1:4px;
  --space-2:8px;
  --space-3:11px;
  --space-4:14px;
  --space-5:18px;
  --space-6:24px;
  --control-height:36px;
  --control-height-lg:46px;
  --surface-pad-y:12px;
  --surface-pad-x:13px;
  --table-cell-y:8px;
  --table-cell-x:10px;
  --table-font-size:11px
}
.skip-link{position:absolute;left:18px;top:-44px;padding:9px 13px;border-radius:12px;background:#08131b;color:#f8fbff;font-weight:800;z-index:30;transition:top .15s ease,box-shadow .15s ease}
.skip-link:focus,.skip-link:focus-visible{top:12px;box-shadow:var(--focus-shadow)}
.shell-header{
  position:sticky;
  top:0;
  z-index:20;
  backdrop-filter:blur(18px);
  background:linear-gradient(180deg,rgba(8,19,25,.96),rgba(15,29,37,.90));
  border-bottom:1px solid rgba(104,133,145,.34);
  box-shadow:0 18px 38px rgba(0,0,0,.22)
}
.shell-inner{max-width:var(--content-width);margin:0 auto;padding:14px 24px 16px;display:grid;gap:14px}
.shell-top{display:grid;grid-template-columns:minmax(0,1.48fr) minmax(360px,.94fr);gap:18px;align-items:start}
.shell-brand,.shell-brand-block,.shell-brand-copy{display:grid}
.shell-brand-block{gap:12px}
.shell-brand-copy{gap:8px}
.shell-brand-mark{
  display:inline-flex;
  align-items:center;
  gap:10px;
  font-size:12px;
  font-weight:800;
  letter-spacing:.14em;
  text-transform:uppercase;
  color:#9fd7ce
}
.shell-brand-mark strong{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:42px;
  height:42px;
  padding:0 12px;
  border-radius:13px;
  background:linear-gradient(180deg,#15877f,#0b5752);
  color:#f4fffd;
  box-shadow:0 10px 20px rgba(0,0,0,.22)
}
.shell-brand h1{margin:0;font-size:30px;line-height:1.04;letter-spacing:-.05em;color:#f4fafc}
.shell-brand p{margin:0;max-width:72ch;font-size:13px;color:#aac0c9;line-height:1.6}
.shell-meta{
  display:grid;
  gap:12px;
  justify-items:stretch;
  padding:calc(var(--surface-pad-y) - 1px) var(--surface-pad-x);
  border:1px solid rgba(82,115,129,.52);
  border-radius:20px;
  background:linear-gradient(180deg,rgba(18,38,48,.94),rgba(20,45,57,.88));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04)
}
.shell-chip-row,.shell-status-row,.shell-shortcuts,.quick-links,.inline-actions,.actions,.table-tools,.toolbar,.ops-toolbar,.shell-action-buttons{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.shell-context-row,.shell-status-row,.shell-shortcuts{justify-content:flex-start}
.shell-chip,
.badge,
.status-badge,
[class*="asset-mini-badge"]{
  --badge-bg:var(--muted-bg);
  --badge-border:var(--muted-border);
  --badge-ink:var(--ink-2);
  --badge-label:var(--muted-2);
  display:inline-flex;
  align-items:center;
  gap:7px;
  min-height:calc(var(--control-height) - 10px);
  padding:6px 11px;
  border-radius:999px;
  border:1px solid var(--badge-border);
  background:var(--badge-bg);
  color:var(--badge-ink);
  font-size:11px;
  font-weight:800;
  line-height:1.2;
  letter-spacing:.02em;
  box-shadow:none;
  font-variant-numeric:tabular-nums
}
.shell-chip strong,.status-badge strong{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--badge-label)}
.badge{padding:5px 10px}
.shell-status{
  --badge-bg:rgba(14,40,51,.80);
  --badge-border:rgba(91,123,137,.42);
  --badge-ink:#eaf5f8;
  --badge-label:#9fd7ce;
  display:grid;
  gap:5px;
  min-width:148px;
  padding:calc(var(--surface-pad-y) - 4px) 12px;
  border-radius:15px;
  border:1px solid var(--badge-border);
  background:var(--badge-bg);
  color:var(--badge-ink);
  font-size:12px;
  font-weight:700;
  line-height:1.35
}
.shell-status strong{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--badge-label)}
.shell-chip.severity-ok,.shell-chip[data-severity="ok"],.shell-status.severity-ok,.shell-status[data-severity="ok"],.badge.ok,.badge[data-severity="ok"],.status-badge.ok,.status-badge[data-severity="ok"],[class*="asset-mini-badge"][data-severity="ok"]{--badge-bg:var(--ok-bg);--badge-border:var(--ok-border);--badge-ink:var(--good-strong);--badge-label:var(--good)}
.shell-chip.severity-warn,.shell-chip[data-severity="warn"],.shell-status.severity-warn,.shell-status[data-severity="warn"],.badge.warn,.badge[data-severity="warn"],.status-badge.warn,.status-badge[data-severity="warn"],[class*="asset-mini-badge"][data-severity="warn"]{--badge-bg:var(--warn-bg);--badge-border:var(--warn-border);--badge-ink:var(--warn-strong);--badge-label:var(--warn)}
.shell-chip.severity-bad,.shell-chip[data-severity="bad"],.shell-status.severity-bad,.shell-status[data-severity="bad"],.badge.bad,.badge[data-severity="bad"],.status-badge.bad,.status-badge[data-severity="bad"],[class*="asset-mini-badge"][data-severity="bad"]{--badge-bg:var(--bad-bg);--badge-border:var(--bad-border);--badge-ink:var(--bad-strong);--badge-label:var(--bad)}
.shell-chip.severity-info,.shell-chip[data-severity="info"],.shell-status.severity-info,.shell-status[data-severity="info"],.badge.info,.badge.notice,.badge[data-severity="info"],.status-badge.info,.status-badge[data-severity="info"],[class*="asset-mini-badge"][data-severity="info"]{--badge-bg:var(--info-bg);--badge-border:var(--info-border);--badge-ink:var(--info-strong);--badge-label:var(--info)}
.shell-chip.severity-muted,.shell-chip[data-severity="muted"],.shell-status.severity-muted,.shell-status[data-severity="muted"],.badge.muted,.badge[data-severity="muted"],.status-badge.muted,.status-badge[data-severity="muted"],[class*="asset-mini-badge"][data-severity="muted"]{--badge-bg:var(--muted-bg);--badge-border:var(--muted-border);--badge-ink:var(--muted-tone);--badge-label:var(--muted-2)}
.severity-ok{color:var(--good-strong)}
.severity-warn{color:var(--warn-strong)}
.severity-bad{color:var(--bad-strong)}
.severity-info{color:var(--info-strong)}
.severity-muted{color:var(--muted-tone)}
.shell-chip-static{background:rgba(17,43,53,.92);border-color:rgba(86,119,132,.62);color:#ebf7fa}
.shell-chip-object{max-width:100%}
.shell-chip-state{font-weight:900}
.shell-shortcuts{padding-top:2px}
.shell-nav-toggle{display:none}
.shell-nav-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.shell-nav-group{
  display:grid;
  gap:8px;
  padding:calc(var(--surface-pad-y) - 3px) calc(var(--surface-pad-x) - 3px);
  border:1px solid rgba(86,119,132,.42);
  border-radius:17px;
  background:linear-gradient(180deg,rgba(18,40,50,.90),rgba(19,46,58,.84))
}
.shell-nav-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}
.shell-nav-head span{font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#9fd7ce}
.shell-nav-head small{font-size:11px;color:#aac0c9;line-height:1.45}
.shell-nav-links{display:grid;gap:8px}
.shell-nav-links a{
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:flex-start;
  min-height:var(--control-height);
  padding:10px 11px;
  border-radius:14px;
  border:1px solid transparent;
  background:rgba(27,57,70,.90);
  color:#ebf7fa;
  text-decoration:none;
  transition:.18s ease
}
.shell-nav-links a:hover{background:rgba(32,67,81,.96);border-color:rgba(101,136,150,.46);text-decoration:none}
.shell-nav-links a.active,.shell-nav-links a[aria-current="page"]{background:linear-gradient(180deg,#145d57,#0d4642);border-color:rgba(157,215,206,.70);color:#f3fffd;box-shadow:0 0 0 1px rgba(12,42,41,.52) inset}
.shell-nav-links strong{font-size:13px}
.shell-nav-links small{font-size:11px;color:#b2c8cf;line-height:1.35;max-width:156px;text-align:right}
main{max-width:var(--content-width);margin:20px auto;padding:0 24px 40px;display:grid;gap:18px}
.card{
  position:relative;
  background:linear-gradient(180deg,var(--card),var(--card-strong));
  border:1px solid var(--line);
  border-radius:20px;
  padding:18px;
  box-shadow:var(--shadow-soft)
}
.card h1,.card h2,.card h3{margin-top:0}
.card h1{font-size:30px;line-height:1.06;letter-spacing:-.04em}
.card h2{font-size:21px;line-height:1.12;letter-spacing:-.03em}
.card h3{font-size:15px;line-height:1.2;letter-spacing:-.01em}
.notice,.success-state,.warning-state,.error,.error-state,.empty-state,.panel,.notice-panel,.recovery-panel{
  --panel-border:var(--line);
  --panel-bg:linear-gradient(180deg,#fbfdfd,#f4f8fa);
  --panel-ink:var(--ink);
  --panel-accent:var(--line-strong);
  display:grid;
  gap:7px;
  padding:14px 16px;
  border-radius:16px;
  border:1px solid var(--panel-border);
  background:var(--panel-bg);
  color:var(--panel-ink);
  box-shadow:inset 3px 0 0 var(--panel-accent)
}
.notice,.success-state,.panel.ok,.notice-panel,.recovery-panel.ok{--panel-border:var(--ok-border);--panel-bg:linear-gradient(180deg,#f7fcf8,#edf7f0);--panel-ink:#1e3c2b;--panel-accent:var(--good)}
.warning-state,.panel.warn,.recovery-panel.warn{--panel-border:var(--warn-border);--panel-bg:linear-gradient(180deg,#fdf9f1,#fbf1df);--panel-ink:#5e3a0d;--panel-accent:var(--warn)}
.error,.error-state,.panel.bad,.recovery-panel.bad{--panel-border:var(--bad-border);--panel-bg:linear-gradient(180deg,#fef8f8,#fbf0f1);--panel-ink:#5d1b15;--panel-accent:var(--bad)}
.empty-state,.panel.muted{--panel-border:var(--muted-border);--panel-bg:linear-gradient(180deg,#fbfdff,#f3f7fa);--panel-ink:var(--muted-tone);--panel-accent:#a6b4bc;border-style:dashed}
.dashboard-shell,.table-shell,.grid,.stack,.status-panel,.ops-shell,.ops-table-shell{display:grid;gap:12px}
.detail-shell{display:grid;gap:18px;grid-template-columns:minmax(0,1.66fr) minmax(320px,.92fr);align-items:start}
.compare-shell{display:grid;gap:18px;grid-template-columns:minmax(0,1.3fr) minmax(340px,.94fr);align-items:start}
.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.page-intro,.detail-hero,.compare-hero{
  position:relative;
  overflow:hidden;
  display:grid;
  gap:18px;
  padding:24px 26px;
  border-radius:24px;
  border:1px solid rgba(66,97,111,.52);
  background:linear-gradient(150deg,var(--hero) 0%,var(--hero-2) 58%,var(--hero-3) 100%);
  box-shadow:0 20px 40px rgba(0,0,0,.18);
  color:#eef7f9
}
.page-intro::before,.detail-hero::before,.compare-hero::before{
  content:"";
  position:absolute;
  inset:0 auto auto 0;
  width:100%;
  height:4px;
  background:linear-gradient(90deg,#1ba79b,#6e8ea6 55%,#c69951)
}
.page-intro h2,.detail-hero h2,.compare-hero h2{margin:0;font-size:29px;line-height:1.02;letter-spacing:-.05em;color:#f4fbfd}
.page-intro-head,.section-head,.ops-titlebar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.hero-grid,.page-header-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(360px,.9fr);gap:18px;align-items:start}
.page-title-stack{gap:12px}
.shell-page-kicker,.eyebrow,.surface-kicker{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size:11px;
  font-weight:900;
  letter-spacing:.14em;
  text-transform:uppercase
}
.shell-page-kicker,.eyebrow{color:#a8d6d0}
.object-header{display:grid;gap:16px}
.object-header-main{display:grid;gap:10px;max-width:72ch}
.object-header-copy{max-width:72ch}
.object-header-meta{align-items:flex-start}
.object-header-meta-grid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
.hero-panel,
.status-panel,
.metadata-block,
.help-panel,
.inline-help-summary,
.how-to-panel,
.decision-rail,
.recovery-rail,
.surface-panel,
.preflight-box,
.ops-lane,
.ops-resource-card,
.ops-kpi,
.ops-inline-card,
main .ops-review-panel,
main .ops-review-card,
main .ops-rail-card,
main .summary-card{
  --surface-accent:var(--line-strong);
  display:grid;
  gap:10px;
  padding:var(--surface-pad-y) var(--surface-pad-x);
  border-radius:18px;
  border:1px solid var(--line);
  background:linear-gradient(180deg,#ffffff,#f7fafb);
  box-shadow:var(--shadow-soft)
}
.page-intro .metadata-block,.page-intro .status-panel,.page-intro .preflight-box,.detail-hero .metadata-block,.detail-hero .status-panel,.compare-hero .metadata-block,.compare-hero .status-panel,.page-intro .hero-panel,.detail-hero .hero-panel,.compare-hero .hero-panel{
  border-color:rgba(92,123,137,.48);
  background:linear-gradient(180deg,rgba(15,35,43,.58),rgba(16,34,43,.76));
  box-shadow:none
}
body[data-shell-grammar] [data-surface-kicker]:not(.object-header-shell)::before{
  content:attr(data-surface-kicker);
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size:11px;
  font-weight:900;
  letter-spacing:.14em;
  text-transform:uppercase;
  color:var(--muted-2)
}
body[data-shell-grammar] [data-surface-role="decision"]{--surface-accent:var(--accent);border-color:#c7ddd9;background:linear-gradient(180deg,#fdfefe,#f4f9f8)}
body[data-shell-grammar] [data-surface-role="recovery"]{--surface-accent:var(--warn);border-color:#e5d4b3;background:linear-gradient(180deg,#fffdf9,#fbf5ea)}
body[data-shell-grammar] [data-surface-role="metadata"]{--surface-accent:#7891a0}
body[data-shell-grammar] [data-surface-role="preflight"]{--surface-accent:#6a8594;border-color:#d3dee5;background:linear-gradient(180deg,#fbfdfe,#f5f9fb)}
body[data-shell-grammar] [data-surface-role="evidence"]{--surface-accent:#9ba8b2;border-style:dashed;background:linear-gradient(180deg,#f8fafb,#f1f5f7)}
body[data-shell-grammar] [data-surface-priority="secondary"]{background:linear-gradient(180deg,#f8fafb,#f3f6f8)}
body[data-shell-grammar] [data-surface-role="evidence"] h2,body[data-shell-grammar] [data-surface-role="evidence"] h3{font-size:17px;color:var(--ink-2)}
body[data-shell-grammar] [data-surface-role="evidence"] .section-intro{color:var(--muted)}
.status-list,.metadata-grid,.rail-list,.ops-actions-list,.ops-mini-list{display:grid;gap:8px}
.metadata-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.status-row,.metadata-row,.metadata-item,.ops-summary-line{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
  padding:10px 11px;
  border:1px solid #dbe4e9;
  background:rgba(255,255,255,.82);
  border-radius:13px
}
.status-row .label,.metadata-label,.metadata-item dt,.muted-text,.caption{color:var(--muted-2);font-size:12px}
.status-row .label,.metadata-label,.metadata-item dt{font-weight:900;letter-spacing:.10em;text-transform:uppercase}
.status-row strong,.metadata-value,.metadata-item dd{margin:0;font-size:14px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
.status-row strong.severity-ok,.metadata-row strong.severity-ok{color:var(--good-strong)}
.status-row strong.severity-warn,.metadata-row strong.severity-warn{color:var(--warn-strong)}
.status-row strong.severity-bad,.metadata-row strong.severity-bad{color:var(--bad-strong)}
.status-row strong.severity-info,.metadata-row strong.severity-info{color:var(--info-strong)}
.status-row strong.severity-muted,.metadata-row strong.severity-muted{color:var(--muted-tone)}
.page-intro .status-row,.detail-hero .status-row,.compare-hero .status-row,.page-intro .metadata-row,.detail-hero .metadata-row,.compare-hero .metadata-row{border-color:rgba(80,112,126,.62);background:rgba(17,37,47,.82);color:#ebf7f9}
.page-intro .status-row strong,.detail-hero .status-row strong,.compare-hero .status-row strong{color:#f4fbfd}
.page-intro .status-row strong.severity-ok,.detail-hero .status-row strong.severity-ok,.compare-hero .status-row strong.severity-ok{color:#c5efd2}
.page-intro .status-row strong.severity-warn,.detail-hero .status-row strong.severity-warn,.compare-hero .status-row strong.severity-warn{color:#f2d296}
.page-intro .status-row strong.severity-bad,.detail-hero .status-row strong.severity-bad,.compare-hero .status-row strong.severity-bad{color:#f7b5bc}
.page-intro .status-row strong.severity-info,.detail-hero .status-row strong.severity-info,.compare-hero .status-row strong.severity-info{color:#bfe0f5}
.page-intro .status-row strong.severity-muted,.detail-hero .status-row strong.severity-muted,.compare-hero .status-row strong.severity-muted{color:#d5e5ea}
.page-intro .section-intro,.page-intro .muted-text,.page-intro .shell-chip,.page-intro .shell-chip strong,.detail-hero .section-intro,.detail-hero .muted-text,.compare-hero .section-intro,.compare-hero .muted-text{color:#eaf6f8}
.page-intro .shell-chip,.detail-hero .shell-chip,.compare-hero .shell-chip{--badge-bg:rgba(17,45,57,.92);--badge-border:rgba(98,127,140,.56);--badge-ink:#edf6f8;--badge-label:#b8d5dc}
.decision-rail,.recovery-rail{align-self:start}
.decision-rail.is-sticky,.recovery-rail.is-sticky,.metadata-block.is-sticky{position:sticky;top:calc(var(--sticky-top) + 8px)}
.inline-help-summary{
  grid-template-columns:minmax(0,1.28fr) minmax(260px,.9fr);
  align-items:start;
  gap:16px
}
.inline-help-summary-copy{display:grid;gap:7px;max-width:78ch}
.inline-help-context{display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start;justify-content:flex-start}
.inline-help-context .shell-chip{background:#fff}
.rail-list,.ops-actions-list,.ops-mini-list{margin:0;padding:0;list-style:none}
.rail-list li,.ops-actions-list li,.ops-mini-list li{
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:flex-start;
  padding:9px 0;
  border-top:1px solid #e0e8ec
}
.rail-list li:first-child,.ops-actions-list li:first-child,.ops-mini-list li:first-child{border-top:none;padding-top:0}
.rail-list li span:first-child,.ops-actions-list li span:first-child,.ops-mini-list li span:first-child{font-weight:800;color:var(--ink-2)}
.sticky-action-bar{
  position:sticky;
  top:var(--sticky-top);
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:14px;
  align-items:center;
  padding:var(--surface-pad-y) var(--surface-pad-x);
  border-radius:18px;
  border:1px solid #c7d4db;
  background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(247,251,252,.92));
  box-shadow:0 18px 36px rgba(17,41,53,.12);
  backdrop-filter:blur(12px)
}
.shell-action-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.shell-action-summary{gap:8px}
.shell-action-copy{max-width:34ch}
.shell-action-state{justify-content:flex-start}
.shell-density-group{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:4px;
  border-radius:999px;
  border:1px solid #c9d5dc;
  background:linear-gradient(180deg,#fbfdfe,#eef4f6)
}
.shell-density-button{
  min-height:calc(var(--control-height) - 8px);
  padding:6px 12px;
  border-radius:999px;
  font-size:12px;
  font-weight:900
}
.shell-density-button[data-active="1"]{
  background:linear-gradient(180deg,#155f58,#0e4b46);
  border-color:#124a46;
  color:#f5fffd;
  box-shadow:0 8px 16px rgba(15,110,103,.16)
}
.shell-density-button[disabled]{opacity:1;cursor:default}
.quick-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));align-items:start}
.form-card,.search-cluster,.table-affordance,.filter-affordance,.table-tools,.toolbar,.asset-table-tools,.studio-table-tools{
  display:grid;
  gap:8px;
  padding:14px 15px;
  border:1px solid var(--line);
  background:linear-gradient(180deg,#fbfdfe,#f4f8fa);
  border-radius:16px
}
.form-card h3{margin:0;font-size:15px}
.field{display:grid;gap:6px}
.field label,.search-cluster label{font-size:12px;font-weight:800;color:#334155}
.field small,.section-intro{color:#4b5f69;line-height:1.6}
.field input{width:100%}
.link-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.link-grid a{
  display:block;
  padding:11px 12px;
  border:1px solid var(--line);
  border-radius:14px;
  background:linear-gradient(180deg,#fbfdfe,#f5f9fb);
  color:#114a45;
  font-weight:800
}
.summary-grid,.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid,.ops-detail-grid,.ops-key-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
main .summary-card,main .ops-kpi{padding:14px 15px}
.summary-card .metric{font-size:24px;font-weight:900;letter-spacing:-.04em}
.summary-card .caption{line-height:1.5}
.mono{font-family:"Cascadia Code","JetBrains Mono","Fira Code",monospace;font-size:12px;word-break:break-all}
.table-wrap{
  overflow:auto;
  border:1px solid var(--line);
  border-radius:20px;
  background:linear-gradient(180deg,#ffffff,#f7fafb);
  box-shadow:var(--shadow-soft)
}
.table-wrap table{border:none;border-radius:0;min-width:720px}
.table-wrap th{position:sticky;top:0;z-index:1;box-shadow:0 1px 0 #dbe5ea,0 9px 16px rgba(17,41,53,.05)}
tbody tr:nth-child(even){background:#fafcfd}
tbody tr:hover{background:#eef4f7}
.table-tools[data-search-active="1"],.toolbar[data-search-active="1"],.search-cluster[data-search-active="1"],.asset-table-tools[data-search-active="1"],.studio-table-tools[data-search-active="1"]{border-color:#b8d4d0;background:linear-gradient(180deg,#f8fdfc,#eef6f5);box-shadow:0 0 0 1px #d5ebe7 inset}
.table-tools input[type="search"],.toolbar input[type="search"],.search-cluster input[type="search"],.asset-table-tools input[type="search"],.studio-table-tools input[type="search"],input[data-table-filter]{
  min-height:40px;
  padding:9px 12px 9px 36px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%236f808a' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='8.5' cy='8.5' r='5.4'/%3E%3Cpath d='M13 13l4 4'/%3E%3C/svg%3E");
  background-repeat:no-repeat;
  background-position:11px 50%;
  background-size:15px 15px
}
input[type="search"][data-filter-active="1"],input[data-table-filter][data-filter-active="1"]{border-color:#8fbab4;background-color:#fbffff}
.table-tools input[type="search"]{min-width:240px;max-width:360px}
.kbd{
  display:inline-block;
  border:1px solid #d0d9df;
  border-bottom-width:2px;
  border-radius:7px;
  padding:1px 6px;
  background:#f8fbfc;
  color:#184459;
  font-size:12px;
  font-weight:800
}
.quick-links a,.button-link{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:7px 11px;
  border-radius:999px;
  border:1px solid #c8d6de;
  background:linear-gradient(180deg,#fbfdfe,#f4f8fa);
  color:#154d67;
  font-size:12px;
  font-weight:800;
  text-decoration:none
}
a{color:#0f6e67;text-decoration:none}
a:hover{text-decoration:underline}
table{
  width:100%;
  border-collapse:collapse;
  font-size:var(--table-font-size);
  background:#fff;
  border:1px solid #dde5ea;
  border-radius:12px;
  overflow:hidden
}
th,td{border-bottom:1px solid #e8eef2;padding:var(--table-cell-y) var(--table-cell-x);text-align:left;vertical-align:top}
th{
  background:linear-gradient(180deg,#f6fafc,#eef4f7);
  color:#334954;
  font-size:11px;
  font-weight:900;
  letter-spacing:.10em;
  text-transform:uppercase
}
.ops-titleblock{display:grid;gap:5px;max-width:760px}
.ops-titleblock h1,.ops-titleblock h2{margin-bottom:0}
.ops-kpi-label{font-size:11px;font-weight:900;color:#51626d;text-transform:uppercase;letter-spacing:.12em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:900}
.ops-callout{
  display:grid;
  gap:7px;
  padding:13px 15px;
  border-radius:16px;
  border:1px solid var(--line);
  background:linear-gradient(180deg,#fbfdfe,#f3f8fa)
}
.ops-callout h3,.ops-lane h3,.ops-resource-card h3,.ops-review-panel-head h2,.ops-review-panel-head h3{margin:0}
.ops-callout p,.ops-lane p,.ops-resource-card p,.ops-inline-card p,.ops-review-card p{margin:0;color:#516470;line-height:1.6}
.ops-callout.warn{border-color:var(--warn-border);background:linear-gradient(180deg,#fefaf2,#fbf1df)}
.ops-callout.bad{border-color:var(--bad-border);background:linear-gradient(180deg,#fef8f8,#fbf0f1)}
.ops-callout.ok{border-color:var(--ok-border);background:linear-gradient(180deg,#f7fcf8,#edf7f0)}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{border-color:#b9cfd0;background:linear-gradient(180deg,#ffffff,#f0f6f5);text-decoration:none}
.ops-inline-card strong{font-size:15px;letter-spacing:-.01em}
.ops-table-meta{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.ops-resource-list ul{margin:0;padding-left:18px;display:grid;gap:8px}
.ops-resource-list li{line-height:1.6}
main .ops-review-shell{display:grid;gap:12px}
main .ops-review-strip{display:grid;gap:16px;grid-template-columns:minmax(280px,1.16fr) minmax(320px,.94fr);align-items:start}
main .ops-review-rail{display:grid;gap:12px}
main .ops-review-note,main .ops-review-empty{
  padding:14px 15px;
  border-radius:16px;
  border:1px dashed var(--muted-border);
  background:linear-gradient(180deg,#f8fbfc,#f2f6f8);
  color:var(--muted-tone)
}
main .ops-review-note strong{display:block;margin-bottom:4px;color:var(--ink-2)}
main .ops-review-panel-head{display:grid;gap:5px}
main .ops-review-card-list{display:grid;gap:10px}
main .ops-review-card-head{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
main .ops-review-card-title{font-size:14px;font-weight:900;color:var(--ink-2)}
main .ops-review-card-actions{display:flex;flex-wrap:wrap;gap:8px}
main .ops-review-fact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
main .ops-review-fact{
  display:grid;
  gap:4px;
  padding:11px 12px;
  border:1px solid var(--line);
  border-radius:14px;
  background:linear-gradient(180deg,#fafcfd,#f3f7f9)
}
main .ops-review-fact-label{font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#617582}
main .ops-chip-grid{display:flex;flex-wrap:wrap;gap:8px}
main .ops-chip-grid a{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;border:1px solid var(--line);background:#fff;color:#0f4e6a;font-size:12px;font-weight:800}
main .ops-chip-grid a:hover{text-decoration:none;background:#eef6f9}
main .ops-filter-card{display:grid;gap:10px;padding:14px 15px;border:1px solid var(--line);background:linear-gradient(180deg,#fbfdfe,#f4f8fa);border-radius:16px}
body[data-shell-grammar] main .ops-review-panel[data-surface-role="decision"],
body[data-shell-grammar] main .ops-review-card[data-surface-role="decision"],
body[data-shell-grammar] main .ops-rail-card[data-surface-role="decision"]{border-color:#c7ddd9;background:linear-gradient(180deg,#fdfefe,#f4f9f8)}
body[data-shell-grammar] main .ops-review-panel[data-surface-role="recovery"],
body[data-shell-grammar] main .ops-review-card[data-surface-role="recovery"],
body[data-shell-grammar] main .ops-rail-card[data-surface-role="recovery"]{border-color:#e5d4b3;background:linear-gradient(180deg,#fffdf9,#fbf5ea)}
body[data-shell-grammar] main [data-surface-role="evidence"] .table-wrap{border-style:dashed;background:linear-gradient(180deg,#f7fafb,#f1f5f7)}
body[data-shell-grammar] main [data-surface-role="evidence"] table{font-size:12px}
body[data-shell-grammar] main [data-surface-role="evidence"] th{background:#f1f5f7}
body[data-shell-grammar] main [data-surface-role="evidence"] pre{
  background:#111922;
  color:#d7e1e8;
  padding:13px;
  border-radius:14px;
  border:1px solid rgba(116,136,149,.28);
  max-height:440px
}
body[data-shell-grammar] main [data-surface-role="evidence"] .quick-links a{background:#fff;border-color:#d7e0e5;color:#526471}
input,select,textarea,button{font:inherit;border:1px solid #c7d3da;border-radius:11px;padding:8px 10px;background:#fff}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{
  outline:2px solid transparent;
  border-color:var(--accent);
  box-shadow:var(--focus-shadow)
}
textarea{width:100%;min-height:220px;resize:vertical}
button{
  min-height:var(--control-height);
  background:linear-gradient(180deg,#11857d,#0f6e67);
  color:#f4fffd;
  border:none;
  font-weight:900;
  letter-spacing:.01em;
  cursor:pointer;
  transition:.18s ease;
  box-shadow:0 7px 16px rgba(15,110,103,.18)
}
button:hover{transform:translateY(-1px)}
button[data-available="0"]{opacity:.55}
.button-link,.secondary{background:linear-gradient(180deg,#fbfdfe,#f1f6f8);color:#164d68;border:1px solid #c2d1d8;box-shadow:none}
.button-link:hover,.secondary:hover{text-decoration:none;border-color:#a9bbc6;background:linear-gradient(180deg,#ffffff,#edf4f6)}
pre{margin:0;background:#111922;color:#d7e1e8;padding:12px 13px;border-radius:14px;overflow:auto;font-size:12px;line-height:1.6}
.toast-wrap{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:9999}
.toast{
  min-width:240px;
  max-width:460px;
  display:grid;
  gap:5px;
  padding:12px 14px;
  border-radius:15px;
  background:#132431;
  color:#f8fbff;
  border:1px solid rgba(255,255,255,.08);
  border-left:4px solid rgba(255,255,255,.28);
  box-shadow:0 14px 28px rgba(0,0,0,.24)
}
.toast.ok{background:linear-gradient(180deg,#14532d,#114427);border-left-color:#8fd3a8}
.toast.warn{background:linear-gradient(180deg,#8c5a10,#6f450d);border-left-color:#f3c977}
.toast.bad{background:linear-gradient(180deg,#7f1d1d,#631616);border-left-color:#f0a6ad}
.toast.info{background:linear-gradient(180deg,#114a6a,#0f3d57);border-left-color:#8fc8e3}
.toast.muted{background:linear-gradient(180deg,#334155,#273242);border-left-color:#c3d0db}
.toast .title{font-weight:900;margin-bottom:4px}
.submit-loading{opacity:.72;pointer-events:none}
.submit-loading::after{content:"...";margin-left:4px}
.field-error{color:var(--bad);font-size:12px;padding-top:2px}
.hint{display:inline-block;border-bottom:1px dotted #8ca1bf;color:#305f99;cursor:help;font-size:12px}
.shortcut-help{position:fixed;inset:0;background:rgba(15,23,42,.46);display:none;align-items:center;justify-content:center;z-index:9998;padding:20px}
.shortcut-help.open{display:flex}
.shortcut-card{
  width:min(680px,92vw);
  background:#ffffff;
  border-radius:18px;
  border:1px solid var(--line);
  padding:18px;
  box-shadow:0 22px 44px rgba(0,0,0,.20)
}
.shortcut-card h2{margin:0 0 8px}
.shortcut-card table{font-size:14px}
.shell-object-tools{justify-content:flex-end}
.shell-palette{position:fixed;inset:0;background:rgba(10,18,28,.54);display:none;align-items:center;justify-content:center;z-index:9997;padding:22px}
.shell-palette.open{display:flex}
.shell-palette-card{
  width:min(1280px,96vw);
  max-height:88vh;
  overflow:hidden;
  display:grid;
  gap:14px;
  padding:20px;
  border-radius:22px;
  border:1px solid #c7d5dc;
  background:linear-gradient(180deg,#ffffff,#f5fafb);
  box-shadow:0 32px 64px rgba(0,0,0,.24)
}
.shell-palette-head,.shell-palette-panel-head,.shell-palette-head-actions{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.shell-palette-search{display:grid;gap:6px}
.shell-palette-search-label{font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#5c707d}
.shell-palette-search input{min-height:var(--control-height-lg);padding:12px 14px;border-radius:16px;font-size:18px;font-weight:700}
.shell-palette-hint{font-size:12px}
.shell-palette-layout{display:grid;grid-template-columns:minmax(0,1.44fr) minmax(320px,.82fr);gap:14px;align-items:start}
.shell-palette-results-panel,.shell-palette-rail-card{
  display:grid;
  gap:10px;
  padding:var(--surface-pad-y) var(--surface-pad-x);
  border:1px solid #d2dde3;
  border-radius:18px;
  background:linear-gradient(180deg,#ffffff,#f7fafb);
  box-shadow:var(--shadow-soft)
}
.shell-palette-list,.shell-palette-rail,.shell-palette-side-list{display:grid;gap:10px}
.shell-palette-list,.shell-palette-side-list{max-height:min(58vh,720px);overflow:auto;padding-right:2px}
.shell-palette-item,.shell-palette-side-item{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
  padding:13px 14px;
  border-radius:16px;
  border:1px solid #d5e0e5;
  background:linear-gradient(180deg,#ffffff,#fbfdfe);
  text-align:left;
  box-shadow:0 6px 14px rgba(17,41,53,.04)
}
.shell-palette-item-main{display:grid;gap:4px}
.shell-palette-item-main strong,.shell-palette-side-item strong{font-size:14px;color:var(--ink-2)}
.shell-palette-item-main span,.shell-palette-side-item span{color:var(--muted);line-height:1.5}
.shell-palette-item-meta{display:grid;gap:6px;min-width:120px;justify-items:end;color:var(--muted-2);font-size:12px;text-align:right}
.shell-palette-item.active,.shell-palette-item:hover,.shell-palette-side-item:hover{border-color:#8fbab4;background:linear-gradient(180deg,#fbffff,#eef6f5);text-decoration:none;transform:none;box-shadow:0 10px 20px rgba(15,110,103,.08)}
.shell-palette-empty{
  padding:14px 15px;
  border-radius:16px;
  border:1px dashed var(--muted-border);
  background:linear-gradient(180deg,#f8fbfc,#f2f6f8);
  color:var(--muted-tone)
}
.shell-help-drawer{position:fixed;inset:0;background:rgba(8,18,26,.58);display:none;align-items:center;justify-content:center;z-index:9996;padding:22px}
.shell-help-drawer.open{display:flex}
.shell-help-drawer-card{
  width:min(1180px,96vw);
  max-height:88vh;
  overflow:auto;
  display:grid;
  gap:16px;
  padding:20px;
  border-radius:24px;
  border:1px solid #c7d5dc;
  background:
    radial-gradient(600px 220px at 100% 0,rgba(15,110,103,.10),rgba(15,110,103,0) 70%),
    linear-gradient(180deg,#ffffff,#f5fafb);
  box-shadow:0 34px 68px rgba(0,0,0,.26)
}
.shell-help-drawer-head,.shell-help-panel-head,.shell-help-drawer-actions{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.shell-help-drawer-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.85fr);gap:14px;align-items:start}
.shell-help-drawer-layout > :last-child{grid-column:1/-1}
.shell-help-drawer-actions{justify-content:flex-end}
.help-step-list,.help-contract-steps{display:grid;gap:10px;margin:0;padding-left:18px}
.help-step-list li,.help-contract-steps li{line-height:1.6;color:var(--ink-2)}
.help-context-list,.help-panel-list{display:grid;gap:10px}
.help-context-item,.help-contract-card{
  display:grid;
  gap:5px;
  padding:12px 13px;
  border:1px solid #d8e2e8;
  border-radius:16px;
  background:linear-gradient(180deg,#ffffff,#f8fbfc);
  color:inherit;
  text-decoration:none
}
.help-context-item:hover{text-decoration:none;border-color:#b6c7d1}
.help-context-item[data-severity="info"]{border-color:var(--info-border);background:linear-gradient(180deg,#fafdff,#eef5fb)}
.help-context-item[data-severity="warn"]{border-color:var(--warn-border);background:linear-gradient(180deg,#fffcf6,#fbf3e4)}
.help-context-item[data-severity="bad"]{border-color:var(--bad-border);background:linear-gradient(180deg,#fff8f8,#fdf0f1)}
.help-context-item[data-severity="muted"]{border-style:dashed}
.help-context-label{font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-2)}
.help-context-value{font-size:14px;color:var(--ink-2)}
.help-contract-card strong{font-size:14px;color:var(--ink-2)}
.help-contract-card p{margin:0;color:var(--muted);line-height:1.6}
.sr-live{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
body[data-density-mode="compact"] .shell-inner{padding:10px 22px 12px;gap:10px}
body[data-density-mode="compact"] .shell-top{gap:14px}
body[data-density-mode="compact"] .shell-brand h1{font-size:27px}
body[data-density-mode="compact"] .shell-brand p{font-size:12px}
body[data-density-mode="compact"] .shell-chip,
body[data-density-mode="compact"] .badge,
body[data-density-mode="compact"] .status-badge,
body[data-density-mode="compact"] [class*="asset-mini-badge"]{font-size:10px;padding:4px 9px}
body[data-density-mode="compact"] .page-intro,
body[data-density-mode="compact"] .detail-hero,
body[data-density-mode="compact"] .compare-hero,
body[data-density-mode="compact"] .card{padding:20px 22px;gap:14px}
body[data-density-mode="compact"] .page-intro h2,
body[data-density-mode="compact"] .detail-hero h2,
body[data-density-mode="compact"] .compare-hero h2{font-size:25px}
body[data-density-mode="compact"] .sticky-action-bar,
body[data-density-mode="compact"] .shell-palette-card,
body[data-density-mode="compact"] .shell-help-drawer-card{padding:16px}
body[data-density-mode="compact"] .shell-palette-item,
body[data-density-mode="compact"] .shell-palette-side-item,
body[data-density-mode="compact"] .help-context-item,
body[data-density-mode="compact"] .help-contract-card{padding:10px 11px}
body[data-density-mode="compact"] .table-wrap table{min-width:680px}
@media (max-width:1220px){
  .shell-nav-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .shell-top,.detail-shell,.compare-shell,.hero-grid,.page-header-grid,main .ops-review-strip,.shell-palette-layout,.inline-help-summary,.shell-help-drawer-layout{grid-template-columns:1fr}
}
@media (max-width:900px){
  :root{--sticky-top:16px}
  .shell-header{position:static}
  .shell-inner{padding:12px 16px 14px}
  .shell-brand h1{font-size:26px}
  .shell-brand p,.shell-shortcut-copy,.shell-action-copy{display:none}
  .shell-meta{width:100%}
  .shell-nav-toggle{display:inline-flex}
  .shell-nav-head small,.shell-nav-links small{display:none}
  .sticky-action-bar{position:static;grid-template-columns:1fr;align-items:stretch}
  .shell-action-head,.shell-action-buttons{justify-content:flex-start}
  .shell-action-buttons button,.shell-action-buttons a{width:100%;justify-content:center}
  .shell-density-group{width:100%;justify-content:stretch}
  .shell-density-button{flex:1 1 0}
  .shell-palette{padding:12px}
  .shell-palette-card{width:min(100vw - 24px,1000px);max-height:92vh;padding:14px}
  .shell-help-drawer{padding:12px}
  .shell-help-drawer-card{width:min(100vw - 24px,1040px);max-height:92vh;padding:14px}
}
@media (max-width:720px){
  .shell-inner{padding:10px 12px 12px}
  .shell-nav-grid{grid-template-columns:1fr}
  .shell-nav-group{padding:10px}
  .shell-nav-links a{padding:9px 10px}
  .shell-brand-mark{gap:8px;font-size:11px}
  .shell-brand-mark strong{min-width:34px;height:34px;border-radius:10px;padding:0 10px}
  .page-intro,.detail-hero,.compare-hero,.card{padding:14px 15px;border-radius:18px}
  .page-intro h2,.detail-hero h2,.compare-hero h2{font-size:23px}
  .page-intro .shell-page-copy{display:none}
  .object-header-meta-grid{grid-template-columns:1fr}
  .status-row,.metadata-row,.metadata-item,.ops-summary-line,.ops-actions-list li,.ops-mini-list li,.rail-list li{display:grid;justify-content:stretch}
  main{padding:0 12px 28px}
  .quick-grid,.summary-grid,.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid,.ops-detail-grid,.ops-key-grid,.metadata-grid,main .ops-review-fact-grid{grid-template-columns:1fr}
  .shell-palette-item,.shell-palette-side-item{display:grid}
  .shell-palette-item-meta{justify-items:start;min-width:0;text-align:left}
  .inline-help-summary{gap:10px}
  .inline-help-context{display:grid}
  .shell-help-drawer-head,.shell-help-drawer-actions,.shell-help-panel-head{align-items:stretch}
  .help-step-list,.help-contract-steps{padding-left:16px}
  .table-wrap table{min-width:620px}
  th,td{padding:8px 9px;font-size:12px}
  .table-tools input[type="search"]{min-width:100%;max-width:none}
}
`;
