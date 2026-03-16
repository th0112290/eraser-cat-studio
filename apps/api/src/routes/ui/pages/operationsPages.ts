import { renderTableEmptyRow, UI_TEXT } from "./uiText";

type JobsPageBodyInput = {
  flash: string;
  rows: string;
};

type PublishPageBodyInput = {
  flash: string;
  episodeId: string;
};

type JobDetailPageBodyInput = {
  flash: string;
  jobId: string;
  episodeId: string;
  type: string;
  statusBadge: string;
  progress: string;
  attempts: string;
  errorStack: string;
  retryAction: string;
  logRows: string;
};

type HitlPageBodyInput = {
  flash: string;
  episodeIdValue: string;
  failedShotIdsValue: string;
  rows: string;
};

type ArtifactsPageBodyInput = {
  flash: string;
  episodeId: string;
  episodeLinks: string;
  rows: string;
};

type RolloutsPageBodyInput = {
  flash: string;
  summaryCards: string;
  sourceRows: string;
  rows: string;
};

type BenchmarksPageBodyInput = {
  flash: string;
  summaryCards: string;
  sourceRows: string;
  backendRows: string;
  regressionRows: string;
};

const OPERATOR_PATTERN_STYLE = `<style>
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c5c58}
.ops-shell{display:grid;gap:10px}
.ops-titlebar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-titleblock{display:grid;gap:4px;max-width:720px}
.ops-titleblock h1,.ops-titleblock h2{margin-bottom:0}
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid,.ops-rail-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.ops-kpi,.ops-lane,.ops-resource-card,.ops-inline-card{display:grid;gap:6px;padding:10px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fff,#f7fbfc);border-radius:12px}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:800}
.ops-callout{display:grid;gap:6px;padding:10px;border-radius:12px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fbfefd,#f2f8f9)}
.ops-callout h3,.ops-lane h3,.ops-resource-card h3{margin:0;font-size:14px}
.ops-callout p,.ops-lane p,.ops-resource-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-callout.warn{border-color:#edd2ac;background:linear-gradient(180deg,#fffaf1,#fff3df)}
.ops-callout.bad{border-color:#efc5c8;background:linear-gradient(180deg,#fff7f7,#fff1f2)}
.ops-callout.ok{border-color:#bcdccf;background:linear-gradient(180deg,#f5fcf7,#edf8f0)}
.ops-rail-card{display:grid;gap:8px;padding:12px;border:1px solid #d6e4ea;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f8fbfc)}
.ops-rail-card h3{margin:0;font-size:15px}
.ops-rail-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-rail-card.tone-ok{border-color:#cbe6d7;background:linear-gradient(180deg,#effcf7,#ffffff)}
.ops-rail-card.tone-warn{border-color:#ecd9ad;background:linear-gradient(180deg,#fff8ea,#fffdf7)}
.ops-rail-card.tone-bad{border-color:#efc4c4;background:linear-gradient(180deg,#fff4f4,#fffdfd)}
.ops-rail-card.tone-muted{border-color:#dbe5ef;background:linear-gradient(180deg,#f7fafc,#ffffff)}
.ops-rail-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.ops-rail-item{display:grid;gap:4px;padding-top:8px;border-top:1px solid #e1eaef}
.ops-rail-item:first-child{border-top:none;padding-top:0}
.ops-rail-item strong{font-size:14px;color:#1f3340}
.ops-rail-card .quick-links{margin-top:2px}
.ops-table-shell{display:grid;gap:10px}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.search-cluster{display:grid;gap:6px;padding:10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}
.search-cluster input{width:100%}
.search-cluster .muted-text{line-height:1.4}
.ops-resource-list ul{margin:0;padding-left:18px;display:grid;gap:8px}
.ops-resource-list li{line-height:1.5}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{text-decoration:none}
.ops-detail-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.ops-form-shell{display:grid;gap:10px}
.ops-object-shell{display:grid;gap:12px}
.ops-object-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-object-title{display:grid;gap:6px;max-width:760px}
.ops-object-title h1,.ops-object-title h2{margin:0}
.ops-summary-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.ops-summary-card{display:grid;gap:4px;padding:10px 12px;border:1px solid #d6e4ea;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f7fbfc)}
.ops-summary-card.tone-ok{border-color:#cbe6d7;background:linear-gradient(180deg,#effcf7,#ffffff)}
.ops-summary-card.tone-warn{border-color:#ecd9ad;background:linear-gradient(180deg,#fff8ea,#fffdf7)}
.ops-summary-card.tone-bad{border-color:#efc4c4;background:linear-gradient(180deg,#fff4f4,#fffdfd)}
.ops-summary-card.tone-muted{border-color:#dbe5ef;background:linear-gradient(180deg,#f7fafc,#ffffff)}
.ops-summary-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#486173}
.ops-summary-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:15px;font-weight:800}
.ops-summary-hint{color:#4f6470;line-height:1.45}
.ops-lifecycle-shell{display:grid;gap:8px;padding:12px;border:1px solid #dbe5ef;border-radius:14px;background:linear-gradient(180deg,#f8fbfd,#ffffff)}
.ops-lifecycle-shell h2{margin:0;font-size:15px}
.ops-lifecycle-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.ops-lifecycle-step{display:grid;gap:4px;padding:10px;border-radius:12px;border:1px dashed #cbd7e1;background:#ffffff}
.ops-lifecycle-step.tone-ok{border-color:#b8dcc7;background:#f3fcf6}
.ops-lifecycle-step.tone-warn{border-color:#ead3a2;background:#fffaf0}
.ops-lifecycle-step.tone-bad{border-color:#e8b9bd;background:#fff6f6}
.ops-lifecycle-step.tone-muted{border-color:#d4dfe8;background:#f8fbfd}
.ops-lifecycle-label{font-size:12px;font-weight:800;color:#173040;text-transform:uppercase;letter-spacing:.06em}
.ops-lifecycle-detail{color:#4f6470;line-height:1.45}
.ops-cell-stack{display:grid;gap:6px}
.ops-cell-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ops-cell-title strong{font-size:14px}
.ops-cell-meta{color:#4f6470;line-height:1.45}
.ops-link-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ops-link-row form{margin:0;display:inline-flex;align-items:center}
.ops-link-row a,.ops-link-row button{white-space:nowrap}
.ops-log-table pre{margin:0;max-height:220px;overflow:auto}
@media (max-width:720px){.ops-titleblock{max-width:none}}
</style>`;

function renderOpsStyle(): string {
  return OPERATOR_PATTERN_STYLE;
}

function renderMetricCard(label: string, value: string, hint: string): string {
  return `<div class="ops-kpi"><span class="ops-kpi-label">${label}</span><div class="ops-kpi-value">${value}</div><div class="caption">${hint}</div></div>`;
}

function renderSearchCluster(input: {
  id: string;
  targetId: string;
  label: string;
  placeholder: string;
  hint: string;
}): string {
  return `<div class="search-cluster"><label for="${input.id}">${input.label}</label><input id="${input.id}" name="q" type="search" data-table-filter="${input.targetId}" placeholder="${input.placeholder}" autocomplete="off"/><span class="muted-text">${input.hint}</span></div>`;
}

type OpsRailTone = "ok" | "warn" | "bad" | "muted";

type OpsRailItem = {
  label: string;
  detail: string;
  html?: string;
};

type OpsRailCardInput = {
  title: string;
  intro: string;
  tone?: OpsRailTone;
  items?: OpsRailItem[];
  bodyHtml?: string;
  linksHtml?: string;
};

function inferTone(markup: string): OpsRailTone {
  if (markup.includes("badge bad")) return "bad";
  if (markup.includes("badge warn")) return "warn";
  if (markup.includes("badge ok")) return "ok";
  return "muted";
}

function renderRailItems(items: OpsRailItem[]): string {
  return `<ul class="ops-rail-list">${items
    .map(
      (item) =>
        `<li class="ops-rail-item"><strong>${item.label}</strong><span class="muted-text">${item.detail}</span>${item.html ?? ""}</li>`
    )
    .join("")}</ul>`;
}

function renderRailCard(input: OpsRailCardInput): string {
  const tone = input.tone ?? "muted";
  const bodyHtml =
    input.bodyHtml ?? ((input.items?.length ?? 0) > 0 ? renderRailItems(input.items ?? []) : '<div class="notice">표시할 항목이 없습니다.</div>');
  return `<div class="ops-rail-card tone-${tone}"><div class="stack"><h3>${input.title}</h3><p>${input.intro}</p></div>${bodyHtml}${
    input.linksHtml ? `<div class="quick-links">${input.linksHtml}</div>` : ""
  }</div>`;
}

function renderRailSection(input: {
  title: string;
  intro: string;
  linksHtml?: string;
  cards: OpsRailCardInput[];
}): string {
  return `<section class="card"><div class="section-head"><div><h2>${input.title}</h2><p class="section-intro">${input.intro}</p></div>${
    input.linksHtml ? `<div class="quick-links">${input.linksHtml}</div>` : ""
  }</div><div class="ops-rail-grid">${input.cards.map(renderRailCard).join("")}</div></section>`;
}

type OpsSummaryCardInput = {
  label: string;
  valueHtml: string;
  hint: string;
  tone?: OpsRailTone;
};

type OpsLifecycleStepInput = {
  label: string;
  detail: string;
  tone?: OpsRailTone;
};

type OpsObjectSummaryHeaderInput = {
  eyebrow: string;
  title: string;
  intro: string;
  titleTag?: "h1" | "h2";
  flash?: string;
  quickLinksHtml?: string;
  summaryCards: OpsSummaryCardInput[];
  lifecycleTitle?: string;
  lifecycleIntro?: string;
  lifecycleSteps?: OpsLifecycleStepInput[];
  panels?: OpsRailCardInput[];
};

type ParsedTableRow = {
  cells: string[];
};

type ParsedLogEntry = {
  createdAt: string;
  level: string;
  message: string;
  detailsHtml: string;
};

type TableCellLink = {
  href: string;
  label: string;
};

type JobLifecycleSummary = {
  tone: OpsRailTone;
  stageLabel: string;
  latestResult: string;
  retryLabel: string;
  retryDetail: string;
  safeActionLabel: string;
  safeActionDetail: string;
  shouldRecover: boolean;
  shouldPublish: boolean;
  shouldInspectHealth: boolean;
};

function toneToBadgeClass(tone: OpsRailTone): string {
  switch (tone) {
    case "ok":
      return "ok";
    case "warn":
      return "warn";
    case "bad":
      return "bad";
    default:
      return "muted";
  }
}

function renderToneBadge(label: string, tone: OpsRailTone): string {
  return `<span class="badge ${toneToBadgeClass(tone)}">${label}</span>`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function summarizeText(value: string, max = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseTableRows(rowsHtml: string): ParsedTableRow[] {
  return Array.from(rowsHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((match) => ({
      cells: Array.from(match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((cell) => cell[1].trim())
    }))
    .filter((row) => row.cells.length > 0);
}

function extractLinks(html: string): TableCellLink[] {
  return Array.from(html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)).map((match) => ({
    href: match[1],
    label: stripHtml(match[2])
  }));
}

function firstLink(html: string): TableCellLink | null {
  return extractLinks(html)[0] ?? null;
}

function extractRouteValue(href: string | undefined, segment: string): string {
  if (!href) return "";
  const match = href.match(new RegExp(`/${segment}/([^/?#]+)`));
  return match ? safeDecode(match[1]) : "";
}

function dedupeLinks(links: Array<TableCellLink | null | undefined>): TableCellLink[] {
  const seen = new Set<string>();
  return links.flatMap((link) => {
    if (!link || !link.href || !link.label) return [];
    const key = `${link.href}|${link.label}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [link];
  });
}

function renderActionLinks(links: Array<TableCellLink | null | undefined>, empty = "추가 링크 없음"): string {
  const deduped = dedupeLinks(links);
  if (deduped.length === 0) return `<span class="muted-text">${empty}</span>`;
  return `<div class="ops-link-row">${deduped.map((link) => `<a href="${link.href}">${link.label}</a>`).join("")}</div>`;
}

function renderSummaryCard(input: OpsSummaryCardInput): string {
  const tone = input.tone ?? "muted";
  return `<div class="ops-summary-card tone-${tone}"><span class="ops-summary-label">${input.label}</span><div class="ops-summary-value">${input.valueHtml}</div><div class="ops-summary-hint">${input.hint}</div></div>`;
}

function renderLifecycleStrip(input: {
  title: string;
  intro: string;
  steps: OpsLifecycleStepInput[];
}): string {
  return `<div class="ops-lifecycle-shell"><div class="stack"><h2>${input.title}</h2><p class="section-intro">${input.intro}</p></div><div class="ops-lifecycle-grid">${input.steps
    .map(
      (step) =>
        `<div class="ops-lifecycle-step tone-${step.tone ?? "muted"}"><span class="ops-lifecycle-label">${step.label}</span><span class="ops-lifecycle-detail">${step.detail}</span></div>`
    )
    .join("")}</div></div>`;
}

function renderObjectSummaryHeader(input: OpsObjectSummaryHeaderInput): string {
  const titleTag = input.titleTag ?? "h1";
  const titleHtml = titleTag === "h2" ? `<h2>${input.title}</h2>` : `<h1>${input.title}</h1>`;
  return `<section class="card ops-object-shell"><div class="ops-object-head"><div class="ops-object-title"><span class="eyebrow">${input.eyebrow}</span><div class="stack">${titleHtml}<p class="section-intro">${input.intro}</p></div></div>${
    input.quickLinksHtml ? `<div class="quick-links">${input.quickLinksHtml}</div>` : ""
  }</div>${input.flash ?? ""}<div class="ops-summary-grid">${input.summaryCards.map(renderSummaryCard).join("")}</div>${
    input.lifecycleSteps?.length
      ? renderLifecycleStrip({
          title: input.lifecycleTitle ?? "object lifecycle",
          intro: input.lifecycleIntro ?? "상태와 안전 액션을 위에서 고정합니다.",
          steps: input.lifecycleSteps
        })
      : ""
  }${input.panels?.length ? `<div class="ops-rail-grid">${input.panels.map(renderRailCard).join("")}</div>` : ""}</section>`;
}

function extractLastErrorText(errorStackHtml: string): string {
  const preMatch = errorStackHtml.match(/<pre>([\s\S]*?)<\/pre>/i);
  const raw = stripHtml(preMatch?.[1] ?? errorStackHtml)
    .replace(/^lastError 스택 열기\/닫기\s*/i, "")
    .replace(/^lastError:\s*/i, "");
  return summarizeText(raw || "기록된 lastError 없음", 160);
}

function parseLogEntries(logRowsHtml: string): ParsedLogEntry[] {
  return parseTableRows(logRowsHtml)
    .filter((row) => row.cells.length >= 4)
    .map((row) => ({
      createdAt: stripHtml(row.cells[0]) || "-",
      level: stripHtml(row.cells[1]) || "-",
      message: stripHtml(row.cells[2]) || "(메시지 없음)",
      detailsHtml: row.cells[3] ?? ""
    }));
}

function toneFromLogLevel(level: string): OpsRailTone {
  const normalized = level.trim().toUpperCase();
  if (/(ERROR|FAIL|실패)/.test(normalized)) return "bad";
  if (/(WARN|경고)/.test(normalized)) return "warn";
  if (/(INFO|완료|성공)/.test(normalized)) return "ok";
  return "muted";
}

function describeJobLifecycle(statusText: string, progressText: string, latestMessage = ""): JobLifecycleSummary {
  const normalized = statusText.trim().toUpperCase();
  const progressLabel = progressText.trim().length > 0 ? progressText : "0%";
  if (/(FAILED|실패)/.test(normalized)) {
    return {
      tone: "bad",
      stageLabel: "recover",
      latestResult: latestMessage || "최근 실행이 실패 경로에서 멈췄습니다.",
      retryLabel: "retry 가능",
      retryDetail: "FAILED 상태라면 detail에서 바로 retry 여부를 확인할 수 있습니다.",
      safeActionLabel: "detail -> retry / recover",
      safeActionDetail: "lastError와 retryability를 먼저 본 뒤 HITL 또는 health로 넘깁니다.",
      shouldRecover: true,
      shouldPublish: false,
      shouldInspectHealth: true
    };
  }
  if (/(SUCCEEDED|COMPLETED|SUCCESS|성공)/.test(normalized)) {
    return {
      tone: "ok",
      stageLabel: "handoff",
      latestResult: latestMessage || `최근 실행이 handoff 후보입니다. 진행률 ${progressLabel}에서 종료되었습니다.`,
      retryLabel: "retry 불필요",
      retryDetail: "성공 경로에서는 retry보다 artifacts와 publish handoff 검증이 우선입니다.",
      safeActionLabel: "episode -> artifacts -> publish",
      safeActionDetail: "소유 episode와 linked outputs 정합을 확인한 뒤에만 승격으로 넘깁니다.",
      shouldRecover: false,
      shouldPublish: true,
      shouldInspectHealth: false
    };
  }
  if (/(RUNNING|실행 중)/.test(normalized)) {
    return {
      tone: "warn",
      stageLabel: "in flight",
      latestResult: latestMessage || `작업이 아직 실행 중입니다. 현재 진행률은 ${progressLabel}입니다.`,
      retryLabel: "retry 잠김",
      retryDetail: "종료 전까지는 retry를 열지 말고 stuck 여부를 먼저 확인합니다.",
      safeActionLabel: "detail -> health",
      safeActionDetail: "중복 실행을 피하려면 latest result와 상태 화면을 함께 확인합니다.",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: true
    };
  }
  if (/(QUEUED|PENDING|대기)/.test(normalized)) {
    return {
      tone: "muted",
      stageLabel: "queued",
      latestResult: latestMessage || "아직 worker에 배정되지 않았거나 queue에서 대기 중입니다.",
      retryLabel: "retry 잠김",
      retryDetail: "실행이 시작되기 전에는 retry보다 queue 상태 확인이 우선입니다.",
      safeActionLabel: "detail -> health",
      safeActionDetail: "queue, worker, duplicate job 여부를 먼저 확인합니다.",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: true
    };
  }
  if (/(CANCELLED|취소)/.test(normalized)) {
    return {
      tone: "warn",
      stageLabel: "inspect",
      latestResult: latestMessage || "작업이 취소되어 종료되었습니다.",
      retryLabel: "inspect first",
      retryDetail: "왜 취소되었는지 확인한 뒤에만 retry 또는 대체 경로를 고릅니다.",
      safeActionLabel: "detail -> episode",
      safeActionDetail: "취소 원인과 owning episode 문맥을 먼저 확인합니다.",
      shouldRecover: false,
      shouldPublish: false,
      shouldInspectHealth: false
    };
  }
  return {
    tone: "muted",
    stageLabel: "inspect",
    latestResult: latestMessage || `상태 ${statusText || "-"} 에서 추가 판단이 필요합니다.`,
    retryLabel: "inspect first",
    retryDetail: "retryability와 blockers를 detail에서 먼저 확인합니다.",
    safeActionLabel: "detail",
    safeActionDetail: "원시 evidence보다 먼저 object summary와 linked objects를 읽습니다.",
    shouldRecover: false,
    shouldPublish: false,
    shouldInspectHealth: false
  };
}

function renderJobsTableRows(rowsHtml: string): string {
  const rows = parseTableRows(rowsHtml).filter((row) => row.cells.length >= 6);
  if (rows.length === 0) return rowsHtml;

  return rows
    .map((row) => {
      const jobLink = firstLink(row.cells[0]);
      const episodeLink = firstLink(row.cells[1]);
      const episodeId = extractRouteValue(episodeLink?.href, "episodes");
      const typeText = stripHtml(row.cells[2]) || "-";
      const statusMarkup = row.cells[3] || '<span class="badge muted">unknown</span>';
      const statusText = stripHtml(statusMarkup) || "unknown";
      const progressText = stripHtml(row.cells[4]) || "-";
      const createdText = stripHtml(row.cells[5]) || "-";
      const lifecycle = describeJobLifecycle(statusText, progressText);
      const linkedObjectLinks = renderActionLinks(
        [
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null,
          episodeId && lifecycle.shouldPublish ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "linked object 없음"
      );
      const nextActionLinks = renderActionLinks(
        [
          jobLink ? { href: jobLink.href, label: "detail" } : null,
          lifecycle.shouldRecover ? { href: episodeId ? `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}` : "/ui/hitl", label: "recover" } : null,
          lifecycle.shouldInspectHealth ? { href: "/ui/health", label: "health" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId && lifecycle.shouldPublish ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "detail에서 다음 액션을 확인하세요."
      );

      return `<tr><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        jobLink ? `<a href="${jobLink.href}">${jobLink.label}</a>` : stripHtml(row.cells[0]) || "-"
      }</strong>${renderToneBadge(lifecycle.stageLabel, lifecycle.tone)}</div><span class="ops-cell-meta">list -> detail -> recover 흐름의 anchor job object입니다.</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "연결된 owner episode 정보가 없습니다."
      }</span>${linkedObjectLinks}</div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${typeText}</strong></div><span class="ops-cell-meta">${lifecycle.latestResult}</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title">${statusMarkup}${renderToneBadge(
        lifecycle.retryLabel,
        lifecycle.shouldRecover ? "bad" : lifecycle.tone
      )}</div><span class="ops-cell-meta">${lifecycle.retryDetail}</span></div></td><td><div class="ops-cell-stack"><strong>${progressText}</strong><span class="ops-cell-meta">${createdText}</span></div></td><td><div class="ops-cell-stack"><strong>${lifecycle.safeActionLabel}</strong><span class="ops-cell-meta">${lifecycle.safeActionDetail}</span>${nextActionLinks}</div></td></tr>`;
    })
    .join("");
}

function renderHitlTableRows(rowsHtml: string): string {
  const rows = parseTableRows(rowsHtml).filter((row) => row.cells.length >= 6);
  if (rows.length === 0) return rowsHtml;

  return rows
    .map((row) => {
      const jobLink = firstLink(row.cells[0]);
      const episodeLink = firstLink(row.cells[1]);
      const episodeId = extractRouteValue(episodeLink?.href, "episodes");
      const topicText = stripHtml(row.cells[2]) || "-";
      const typeText = stripHtml(row.cells[3]) || "-";
      const createdText = stripHtml(row.cells[4]) || "-";
      const blockerText = summarizeText(stripHtml(row.cells[5]) || "기록된 lastError 없음", 140);
      const preflightLinks = renderActionLinks(
        [
          jobLink ? { href: jobLink.href, label: "detail" } : null,
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/hitl?episodeId=${encodeURIComponent(episodeId)}`, label: "recover" } : null
        ],
        "detail에서 blocker를 먼저 확인하세요."
      );
      const handoffLinks = renderActionLinks(
        [
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null,
          episodeId ? { href: `/ui/publish?episodeId=${encodeURIComponent(episodeId)}`, label: "publish" } : null
        ],
        "recover 뒤 linked outputs를 확인하세요."
      );

      return `<tr><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        jobLink ? `<a href="${jobLink.href}">${jobLink.label}</a>` : stripHtml(row.cells[0]) || "-"
      }</strong>${renderToneBadge("recover", "bad")}</div><span class="ops-cell-meta">실패 job object에서 recover 흐름을 시작합니다.</span></div></td><td><div class="ops-cell-stack"><div class="ops-cell-title"><strong>${
        episodeLink ? `<a href="${episodeLink.href}">${episodeLink.label}</a>` : "-"
      }</strong></div><span class="ops-cell-meta">${
        episodeId ? `owner episode ${episodeId}` : "연결 episode 정보가 없습니다."
      }</span>${renderActionLinks(
        [
          episodeLink ? { href: episodeLink.href, label: "episode" } : null,
          episodeId ? { href: `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}`, label: "artifacts" } : null
        ],
        "linked object 없음"
      )}</div></td><td><div class="ops-cell-stack"><strong>${topicText}</strong><span class="ops-cell-meta">${typeText}</span></div></td><td><div class="ops-cell-stack"><strong>preflight blocker</strong><span class="ops-cell-meta">${blockerText}</span></div></td><td><div class="ops-cell-stack"><strong>detail -> dryRun recover</strong><span class="ops-cell-meta">root cause를 detail에서 확인한 뒤 episodeId와 failedShotIds로 dryRun부터 검증합니다.</span>${preflightLinks}</div></td><td><div class="ops-cell-stack"><strong>artifacts -> publish handoff</strong><span class="ops-cell-meta">${createdText}</span>${handoffLinks}</div></td></tr>`;
    })
    .join("");
}

export function buildJobsPageBody(input: JobsPageBodyInput): string {
  const t = UI_TEXT.jobs;
  const rowsHtml = input.rows ? renderJobsTableRows(input.rows) : "";

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "job lifecycle",
  title: t.title,
  intro: "list -> detail -> recover -> handoff 흐름을 Job object 기준으로 읽습니다. row action grammar도 같은 단어(detail, recover, episode, artifacts, publish)로 맞춥니다.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui">대시보드</a><a href="/ui/hitl">HITL</a><a href="/ui/publish">퍼블리시</a>',
  summaryCards: [
    { label: "범위", valueHtml: "<strong>최근 100개 job object</strong>", hint: "최신 실패와 멈춘 실행을 위쪽에서 먼저 잡습니다.", tone: "muted" },
    { label: "latest result", valueHtml: "<strong>failed / stuck running 우선</strong>", hint: "성공 경로보다 recover 후보를 먼저 여는 리스트입니다.", tone: "warn" },
    { label: "row grammar", valueHtml: "<strong>detail -> recover -> handoff</strong>", hint: "각 행은 detail, retryability, linked objects를 같은 순서로 보여줍니다.", tone: "ok" },
    { label: "linked objects", valueHtml: "<strong>episode -> artifacts -> publish</strong>", hint: "job에서 끝내지 않고 owner episode와 handoff 경로까지 같이 봅니다.", tone: "ok" }
  ],
  lifecycleTitle: "list -> detail -> recover -> handoff",
  lifecycleIntro: "리스트는 Job object lifecycle의 입구입니다. 실패와 정체를 먼저 잡고, 승격은 마지막 단계에서만 엽니다.",
  lifecycleSteps: [
    { label: "list", detail: "status와 latest result로 failed / stuck job을 먼저 고릅니다.", tone: "muted" },
    { label: "detail", detail: "status, retryability, blockers, linked objects를 상단에서 읽습니다.", tone: "warn" },
    { label: "recover", detail: "retry, HITL, health 중 다음 안전 액션을 고릅니다.", tone: "bad" },
    { label: "handoff", detail: "owner episode와 artifacts가 정합할 때만 publish를 엽니다.", tone: "ok" }
  ]
})}

${renderRailSection({
  title: "다음 안전 액션",
  intro: "필터, retryability, linked objects를 먼저 고정한 뒤에만 row detail로 내려갑니다.",
  linksHtml: '<a href="/ui/health">상태</a><a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a>',
  cards: [
    {
      title: "필터 + row 오픈",
      intro: "job id, owner episode, status로 좁힌 다음 detail에서 lifecycle을 엽니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "jobs-filter",
        targetId: "jobs-table",
        label: "작업 필터",
        placeholder: t.filterPlaceholder,
        hint: "이 리스트에 로컬로 적용됩니다. / 로 전역 검색으로 바로 이동할 수 있습니다."
      })
    },
    {
      title: "복구 우선순위",
      intro: "FAILED와 멈춘 RUNNING을 먼저 정리하고, publish는 latest result가 정합할 때만 마지막에 엽니다.",
      tone: "warn",
      items: [
        { label: "FAILED는 detail -> retry / recover", detail: "job detail에서 lastError, retryability, blocker를 확인한 뒤 HITL 여부를 판단합니다." },
        { label: "RUNNING 정체는 detail -> health", detail: "재시도 전에 health, queue, 최근 jobs를 함께 확인해 중복 실행을 피합니다." },
        { label: "publish hold", detail: "latest result와 linked artifacts가 맞아야만 승격으로 넘깁니다." }
      ],
      linksHtml: '<a href="/ui/hitl">HITL</a><a href="/ui/health">상태</a>'
    },
    {
      title: "공통 row 문법",
      intro: "모든 row는 detail, owner episode, linked objects, next safe action을 같은 문법으로 보여줍니다.",
      tone: "ok",
      items: [
        { label: "detail", detail: "status, latest result, retryability를 먼저 읽습니다." },
        { label: "episode / artifacts", detail: "owner object와 linked outputs를 같은 row에서 바로 엽니다." },
        { label: "recover / publish", detail: "실패는 recover로, 성공은 publish handoff로 이어집니다." }
      ],
      linksHtml: '<a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>작업 오브젝트</h2>
      <p class="section-intro">각 행은 job object -> owner episode -> latest result -> retryability -> next safe action 순서로 읽습니다. raw evidence는 detail 화면으로 내립니다.</p>
    </div>
    <span class="badge muted">${t.latestBadge}</span>
  </div>
  <div class="table-wrap"><table id="jobs-table"><thead><tr><th>job object / lifecycle</th><th>owner episode / linked objects</th><th>type / latest result</th><th>status / retryability</th><th>progress / created</th><th>next safe action</th></tr></thead><tbody>${
    rowsHtml || renderTableEmptyRow(6, t.noJobs)
  }</tbody></table></div>
</section>`;
}

export function buildPublishPageBody(input: PublishPageBodyInput): string {
  const t = UI_TEXT.publish;
  const episodeId = input.episodeId.trim();
  const hasEpisodeId = episodeId.length > 0;
  const episodeHref = hasEpisodeId ? `/ui/episodes/${encodeURIComponent(episodeId)}` : "/ui/episodes";
  const artifactsHref = hasEpisodeId ? `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}` : "/ui/artifacts";
  const folderHref = hasEpisodeId ? `/artifacts/${encodeURIComponent(episodeId)}/` : "/artifacts/";
  const episodeLabel = hasEpisodeId ? `<strong class="mono">${episodeId}</strong>` : "<strong>episode id를 입력하세요.</strong>";

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "publish preflight",
  title: t.title,
  intro: "publish는 page action이 아니라 episode object handoff입니다. episode -> latest job -> artifacts -> publish 순서로 잠금이 풀릴 때만 안전합니다.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a>',
  summaryCards: [
    { label: "target object", valueHtml: episodeLabel, hint: "같은 episode id로 jobs, artifacts, publish를 끝까지 이어갑니다.", tone: hasEpisodeId ? "ok" : "warn" },
    { label: "latest job gate", valueHtml: "<strong>COMPLETED / PREVIEW_READY</strong>", hint: "FAILED, stuck RUNNING, retry pending이면 publish보다 recover가 먼저입니다.", tone: "warn" },
    { label: "linked artifacts", valueHtml: "<strong>preview / final / manifest</strong>", hint: "raw folder보다 QC와 output presence 정합을 먼저 확인합니다.", tone: hasEpisodeId ? "ok" : "muted" },
    {
      label: "next safe action",
      valueHtml: `<strong>${hasEpisodeId ? "jobs -> artifacts -> publish" : "episode 선택"}</strong>`,
      hint: hasEpisodeId ? "latest result와 linked outputs를 확인한 뒤에만 publish request를 보냅니다." : "에피소드 상세나 job detail에서 같은 id를 복사해 오세요.",
      tone: hasEpisodeId ? "ok" : "warn"
    }
  ],
  lifecycleTitle: "episode -> latest job -> artifacts -> publish",
  lifecycleIntro: "publish는 마지막 단계입니다. preflight가 깨지면 다시 jobs 또는 recover 경로로 되돌아갑니다.",
  lifecycleSteps: [
    { label: "episode", detail: hasEpisodeId ? `target object ${episodeId}를 고정합니다.` : "먼저 target episode를 고릅니다.", tone: hasEpisodeId ? "ok" : "warn" },
    { label: "latest job", detail: "최근 job이 성공 경로인지, retry / recover가 먼저인지 확인합니다.", tone: "warn" },
    { label: "artifacts", detail: "preview, final, QC, upload manifest 정합을 맞춥니다.", tone: hasEpisodeId ? "ok" : "muted" },
    { label: "publish", detail: "preflight가 모두 통과할 때만 handoff를 실행합니다.", tone: hasEpisodeId ? "ok" : "muted" }
  ]
})}

${renderRailSection({
  title: "preflight + next safe action",
  intro: "퍼블리시 버튼보다 먼저 target episode, latest result gate, linked outputs, blocked path를 상단에서 고정합니다.",
  cards: [
    {
      title: "episode object + latest result",
      intro: hasEpisodeId
        ? `승격 대상 episode id는 ${episodeId} 입니다. 먼저 episode detail에서 상태와 latest job result를 확인합니다.`
        : "승격할 오브젝트가 아직 정해지지 않았습니다. episode id를 먼저 정하세요.",
      tone: hasEpisodeId ? "ok" : "warn",
      items: [
        { label: "episode detail", detail: "이 오브젝트의 현재 상태와 owner context를 먼저 확인합니다." },
        { label: "latest job", detail: "publish는 최신 작업이 성공 경로에 있는 경우에만 안전합니다." },
        { label: "retryability", detail: "FAILED 또는 stuck RUNNING이면 publish 대신 recover 판단을 먼저 내립니다." }
      ],
      linksHtml: `<a href="${episodeHref}">${hasEpisodeId ? "에피소드 상세" : "에피소드 목록"}</a>`
    },
    {
      title: "artifacts gate",
      intro: "preview, final, QC, upload manifest가 모두 같은 episode object를 가리키는지 먼저 맞춥니다.",
      tone: hasEpisodeId ? "ok" : "muted",
      items: [
        { label: "preview / final", detail: "승격 전 출력 파일이 실제로 존재하는지 확인합니다." },
        { label: "QC / manifest", detail: "원시 evidence보다 먼저 QC와 upload manifest를 확인합니다." },
        { label: "publish handoff", detail: "linked outputs가 정합한 경우에만 publish request를 엽니다." }
      ],
      linksHtml: `<a href="${artifactsHref}">산출물</a><a href="${folderHref}">원시 폴더</a>`
    },
    {
      title: "blocked path",
      intro: "publish가 막히면 raw folder 탐색보다 jobs, health, artifacts 중 어느 오브젝트에서 되돌아갈지 먼저 고릅니다.",
      tone: "warn",
      items: [
        { label: "jobs로 복귀", detail: "latest job failure와 retryability를 먼저 확인합니다." },
        { label: "health 확인", detail: "queue나 storage 저하가 있으면 승격을 멈추고 의존성을 먼저 복구합니다." },
        { label: "artifacts 재검증", detail: "누락 output이면 publish가 아니라 render / compile 단계로 되돌아갑니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/health">상태</a><a href="/ui/artifacts">산출물</a>'
    }
  ]
})}

${renderRailSection({
  title: "퍼블리시 실행",
  intro: "요청 입력은 간단하게 두되, next safe action과 rollback anchor는 같은 레일 안에 유지합니다.",
  cards: [
    {
      title: "퍼블리시 요청",
      intro: "episode id 하나로 handoff를 실행합니다.",
      tone: hasEpisodeId ? "ok" : "muted",
      bodyHtml: `<form method="post" action="/ui/publish" class="ops-form-shell"><div class="field"><label for="publish-episode-id">episodeId <span class="hint" data-tooltip="${t.episodeHelp}">?</span></label><input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/><small>에피소드 상세, 작업 상세, 산출물 링크에서 같은 id를 복사해 사용합니다.</small></div><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="퍼블리시 실행">${t.runAction}</button></div></form>`
    },
    {
      title: "submit preflight",
      intro: "입력값보다 latest result와 linked outputs 정합이 더 중요합니다.",
      tone: "ok",
      items: [
        { label: "episode 상태", detail: "COMPLETED 또는 PREVIEW_READY인지 확인합니다." },
        { label: "latest job", detail: "방금 실패한 작업이 있으면 승격보다 recover를 먼저 진행합니다." },
        { label: "output manifest", detail: "upload manifest와 output presence가 맞는지 확인합니다." }
      ]
    },
    {
      title: "차단 시 복귀",
      intro: "publish가 막히면 raw folder보다 owner episode와 linked job 쪽으로 되돌아가야 합니다.",
      tone: "warn",
      items: [
        { label: "jobs", detail: "실패한 최신 작업과 retryability를 확인합니다." },
        { label: "artifacts", detail: "출력이 비면 render / compile 단계부터 다시 봅니다." },
        { label: "health", detail: "서비스 저하가 있으면 승격을 멈추고 복구 명령을 먼저 고릅니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/artifacts">산출물</a><a href="/ui/health">상태</a>'
    }
  ]
})}`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  const statusTone = inferTone(input.statusBadge);
  const statusText = stripHtml(input.statusBadge) || "unknown";
  const logs = parseLogEntries(input.logRows);
  const latestLog = logs.at(-1) ?? null;
  const latestResultText = latestLog ? summarizeText(latestLog.message, 140) : "기록된 최신 로그가 없습니다.";
  const blockerText = extractLastErrorText(input.errorStack);
  const hasBlocker = !/(기록된 lastError 없음|\(없음\))/.test(blockerText);
  const canRetry = input.retryAction.includes("<form") && !input.retryAction.includes("disabled");
  const lifecycle = describeJobLifecycle(statusText, `${input.progress}%`, latestResultText);
  const retryTone: OpsRailTone = canRetry ? "bad" : lifecycle.shouldPublish ? "ok" : statusTone;
  const nextSafeActionLabel = canRetry ? "retry -> artifacts recheck" : lifecycle.safeActionLabel;
  const nextSafeActionDetail = canRetry
    ? "이 job object에서 retry한 뒤 owner episode와 linked outputs를 다시 확인합니다."
    : lifecycle.safeActionDetail;
  const actionGrammarHtml = `<div class="stack"><span class="muted-text">detail -> retry / recover -> episode -> artifacts -> publish 문법을 같은 순서로 유지합니다.</span><div class="ops-link-row">${input.retryAction}<a href="/ui/hitl">recover</a>${
    lifecycle.shouldInspectHealth ? '<a href="/ui/health">health</a>' : ""
  }<a href="/ui/episodes/${input.episodeId}">episode</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(
    input.episodeId
  )}">artifacts</a><a href="/ui/publish?episodeId=${encodeURIComponent(input.episodeId)}">publish</a></div></div>`;

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "job object summary",
  title: "Job object summary",
  titleTag: "h2",
  intro: "status, owner episode, latest result, retryability, blockers, next safe action, linked objects를 raw logs 위에 고정합니다.",
  flash: input.flash,
  quickLinksHtml: `<a href="/ui/jobs">작업 목록</a><a href="/ui/episodes/${input.episodeId}">에피소드</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(
    input.episodeId
  )}">산출물</a>`,
  summaryCards: [
    { label: "status", valueHtml: input.statusBadge, hint: "status badge가 retry / recover / publish hold 판단을 결정합니다.", tone: statusTone },
    {
      label: "owner episode",
      valueHtml: `<a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a>`,
      hint: "목록으로 돌아가지 않고 owner object로 바로 handoff 합니다.",
      tone: "muted"
    },
    {
      label: "latest result",
      valueHtml: `<strong>${latestLog ? `${latestLog.level} @ ${latestLog.createdAt}` : lifecycle.stageLabel}</strong>`,
      hint: latestLog ? latestResultText : lifecycle.latestResult,
      tone: latestLog ? toneFromLogLevel(latestLog.level) : lifecycle.tone
    },
    {
      label: "retryability",
      valueHtml: `<strong>${canRetry ? "retry 가능" : lifecycle.retryLabel}</strong>`,
      hint: canRetry ? "이 detail에서 실패 작업을 직접 재실행할 수 있습니다." : lifecycle.retryDetail,
      tone: retryTone
    },
    {
      label: "blockers",
      valueHtml: `<strong>${hasBlocker ? "있음" : "없음"}</strong>`,
      hint: hasBlocker ? blockerText : "현재 lastError blocker는 보이지 않습니다.",
      tone: hasBlocker ? "bad" : "ok"
    },
    {
      label: "next safe action",
      valueHtml: `<strong>${nextSafeActionLabel}</strong>`,
      hint: nextSafeActionDetail,
      tone: retryTone
    }
  ],
  lifecycleTitle: "list -> detail -> recover -> handoff",
  lifecycleIntro: "이 detail은 page가 아니라 Job object 제어면입니다. latest result와 blockers를 읽은 뒤 다음 단계로만 이동합니다.",
  lifecycleSteps: [
    { label: "list", detail: "job list에서 실패 또는 정체 job을 고릅니다.", tone: "muted" },
    { label: "detail", detail: "status, owner, latest result, retryability를 위에서 읽습니다.", tone: statusTone },
    {
      label: lifecycle.shouldRecover || canRetry ? "recover" : lifecycle.shouldInspectHealth ? "health" : "inspect",
      detail: canRetry ? "retry 또는 recover 경로를 고릅니다." : lifecycle.safeActionDetail,
      tone: retryTone
    },
    {
      label: lifecycle.shouldPublish ? "handoff" : "linked objects",
      detail: lifecycle.shouldPublish ? "owner episode와 artifacts 정합 후 publish로 넘깁니다." : "owner episode와 artifacts를 먼저 맞춥니다.",
      tone: lifecycle.shouldPublish ? "ok" : "muted"
    }
  ],
  panels: [
    {
      title: "공통 액션 문법",
      intro: "retry / recover / episode / artifacts / publish handoff를 같은 문법으로 유지합니다.",
      tone: retryTone,
      bodyHtml: actionGrammarHtml
    },
    {
      title: "linked objects",
      intro: "detail에서 바로 owner episode, artifacts, publish 경로로 handoff 합니다.",
      tone: "ok",
      items: [
        { label: "owner episode", detail: "소유 object 상태와 후속 렌더 경로를 확인합니다." },
        { label: "artifacts", detail: "output presence 확인이 필요할 때만 raw folder로 내려갑니다." },
        { label: "publish handoff", detail: "성공 결과를 승격할 때 같은 episode id로 넘깁니다." }
      ],
      linksHtml: `<a href="/ui/episodes/${input.episodeId}">episode</a><a href="/artifacts/${input.episodeId}/">artifacts folder</a><a href="/ui/publish?episodeId=${encodeURIComponent(
        input.episodeId
      )}">publish</a>`
    },
    {
      title: "raw evidence discipline",
      intro: "원시 evidence는 위 판단면 뒤에만 둡니다. latest result와 blockers를 먼저 요약해서 읽습니다.",
      tone: hasBlocker ? "warn" : "muted",
      items: [
        { label: "latest result", detail: latestLog ? `${latestLog.createdAt} · ${latestResultText}` : lifecycle.latestResult },
        { label: "blocker snapshot", detail: blockerText },
        { label: "raw logs", detail: "retry와 recover 경로를 정한 뒤에만 2차 evidence로 내려갑니다." }
      ]
    }
  ]
})}

<section class="card">
  <div class="section-head">
    <div>
      <h2>Blocker snapshot</h2>
      <p class="section-intro">가장 중요한 failure context만 남깁니다. raw logs보다 위에 두는 마지막 판단용 evidence입니다.</p>
    </div>
  </div>
  <div class="ops-resource-card">${input.errorStack}</div>
</section>

<section class="card ops-table-shell ops-log-table">
  <div class="ops-table-meta">
    <div>
      <h2>원시 로그 / 2차 evidence</h2>
      <p class="section-intro">retry와 recovery 경로가 위에서 정리된 뒤에만 raw log evidence를 확인합니다.</p>
    </div>
    <input type="search" data-table-filter="job-log-table" placeholder="로그 검색"/>
  </div>
  <div class="table-wrap"><table id="job-log-table"><thead><tr><th>생성 시각</th><th>레벨</th><th>메시지</th><th>상세</th></tr></thead><tbody>${
    input.logRows || renderTableEmptyRow(4, "로그가 없습니다.")
  }</tbody></table></div>
</section>`;
}

export function buildHitlPageBody(input: HitlPageBodyInput): string {
  const t = UI_TEXT.hitl;
  const rowsHtml = input.rows ? renderHitlTableRows(input.rows) : "";

  return `
${renderOpsStyle()}
${renderObjectSummaryHeader({
  eyebrow: "recover preflight",
  title: t.title,
  intro: "실패 job object에서 recover로 넘어가는 제어면입니다. failed detail, dryRun preflight, artifacts handoff, publish hold를 같은 흐름으로 유지합니다.",
  flash: input.flash,
  quickLinksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/publish">퍼블리시</a><a href="/ui/artifacts">산출물</a>',
  summaryCards: [
    { label: "failure anchor", valueHtml: "<strong>failed job detail</strong>", hint: "원인 확인은 항상 failed job object에서 시작합니다.", tone: "bad" },
    { label: "recover input", valueHtml: "<strong>episodeId + failedShotIds</strong>", hint: "복구 대상 object를 명시적으로 좁혀서 rerender 합니다.", tone: "warn" },
    { label: "preflight", valueHtml: "<strong>dryRun first</strong>", hint: "실행 전 경로 검증을 먼저 통과시키는 것이 안전합니다.", tone: "warn" },
    { label: "handoff", valueHtml: "<strong>artifacts -> publish</strong>", hint: "복구 성공 후 바로 승격하지 말고 linked outputs 정합을 먼저 맞춥니다.", tone: "ok" }
  ],
  lifecycleTitle: "failed job -> preflight -> rerender -> handoff",
  lifecycleIntro: "HITL은 raw rerender 버튼이 아니라 recover preflight입니다. failed detail과 linked outputs를 끊지 않고 이어야 합니다.",
  lifecycleSteps: [
    { label: "failed job", detail: "실패 job detail에서 blocker와 root cause를 읽습니다.", tone: "bad" },
    { label: "preflight", detail: "episodeId, failedShotIds, dryRun으로 recover 경로를 검증합니다.", tone: "warn" },
    { label: "rerender", detail: "새 job object를 생성하되 recover 문맥을 유지합니다.", tone: "warn" },
    { label: "handoff", detail: "artifacts 정합 뒤에만 publish handoff로 넘깁니다.", tone: "ok" }
  ]
})}

${renderRailSection({
  title: "recover preflight + next safe action",
  intro: "failed row를 고르고 rerender를 실행한 뒤, artifacts와 publish hold까지 같은 레일에서 확인합니다.",
  cards: [
    {
      title: "실패 row 좁히기",
      intro: "job, owner episode, topic, error text로 recover 대상을 먼저 줄입니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "hitl-filter",
        targetId: "hitl-failed-table",
        label: "실패 작업 필터",
        placeholder: t.filterPlaceholder,
        hint: "작업, 에피소드, 주제, 타입, 오류 단어로 빠르게 줄입니다."
      })
    },
    {
      title: "recover request",
      intro: "복구 대상 shot id를 명시하고 dryRun으로 경로를 먼저 검증할 수 있습니다.",
      tone: "warn",
      bodyHtml: `<form method="post" action="/ui/hitl/rerender" class="ops-form-shell"><div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div><div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="${t.failedShotHelp}">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>${t.failedShotHint}</small></div><label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun (실행 전 검증)</label><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="HITL rerender 실행">${t.runAction}</button></div></form>`
    },
    {
      title: "recover 뒤 handoff",
      intro: "복구가 끝나도 바로 publish로 가지 말고 linked outputs와 latest result를 먼저 확인합니다.",
      tone: "ok",
      items: [
        { label: "실패 job detail", detail: "원인 확인은 항상 failed job detail에서 먼저 시작합니다." },
        { label: "산출물 재검증", detail: "rerender 뒤 preview / final / QC가 실제로 갱신되었는지 확인합니다." },
        { label: "publish handoff", detail: "복구 결과가 정합한 경우에만 승격 경로로 넘깁니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.failedJobs}</h2>
      <p class="section-intro">row action grammar를 failed job object -> owner episode -> preflight blocker -> recover -> handoff 순서로 통일합니다.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="hitl-failed-table"><thead><tr><th>failed job object / lifecycle</th><th>owner episode / linked objects</th><th>topic / type</th><th>preflight blocker</th><th>next safe action</th><th>recover -> handoff</th></tr></thead><tbody>${
    rowsHtml || renderTableEmptyRow(6, t.noFailedJobs)
  }</tbody></table></div>
</section>`;
}

export function buildArtifactsPageBody(input: ArtifactsPageBodyInput): string {
  const t = UI_TEXT.artifacts;
  const hasEpisodeLinks = input.episodeLinks.trim().length > 0;
  const linkedOutputsHtml = hasEpisodeLinks ? input.episodeLinks : '<div class="notice">아직 에피소드 빠른 링크를 불러오지 않았습니다.</div>';

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">linked outputs</span>
      <h1>${t.title}</h1>
      <p class="section-intro">산출물 화면은 raw directory 브라우저가 아니라 linked object view입니다. episode id를 중심으로 output presence와 recovery anchor를 함께 봅니다.</p>
    </div>
    <div class="quick-links"><a href="/artifacts/">${t.openArtifacts}</a><a href="/ui/episodes">${t.openEpisodes}</a><a href="/ui/jobs">작업</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("조회 키", "<strong>episodeId</strong>", "항상 같은 오브젝트 id로 jobs, episode, publish까지 이어갑니다.")}
    ${renderMetricCard("핵심 outputs", "<strong>beats, shots, media, QC</strong>", "원시 인덱스보다 먼저 linked outputs를 확인합니다.")}
    ${renderMetricCard("복구 앵커", "<strong>jobs / episode detail</strong>", "누락 파일은 대개 상위 파이프라인 단계에서 해결됩니다.")}
  </div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "episode lookup, linked outputs, recovery anchor를 같은 화면 위쪽에 유지합니다.",
  cards: [
    {
      title: "episode lookup",
      intro: "같은 object id로 output set을 빠르게 여는 진입점입니다.",
      tone: "muted",
      bodyHtml: `<form method="get" action="/ui/artifacts" class="ops-form-shell"><div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>${t.episodeHelp}</small></div><div class="actions"><button type="submit" class="secondary" data-primary-action="1" data-primary-label="에피소드 산출물 열기">${t.quickLinkAction}</button></div></form>`
    },
    {
      title: "linked outputs",
      intro: hasEpisodeLinks
        ? "이 오브젝트와 직접 연결된 outputs를 위에서 바로 확인합니다."
        : "episode id를 입력하면 이 오브젝트의 linked outputs를 먼저 띄웁니다.",
      tone: hasEpisodeLinks ? "ok" : "muted",
      bodyHtml: `<div class="ops-resource-card"><div class="ops-resource-list">${linkedOutputsHtml}</div></div>`
    },
    {
      title: "복구 앵커",
      intro: "누락 output은 대부분 상위 파이프라인 단계에서 해결합니다.",
      tone: "warn",
      items: [
        { label: "shots.json 없음", detail: "compile_shots 또는 beats 생성 작업부터 다시 확인합니다." },
        { label: "preview / final 없음", detail: "관련 render job 또는 HITL rerender 경로로 되돌아갑니다." },
        { label: "upload manifest 없음", detail: "publish를 멈추고 linked outputs 정합부터 맞춥니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/episodes">에피소드</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>원시 산출물 인덱스</h2>
      <p class="section-intro">이 표는 2차 evidence입니다. linked outputs와 recovery anchor를 본 뒤에만 raw index를 확인합니다.</p>
    </div>
    <input type="search" data-table-filter="artifact-index-table" aria-label="산출물 인덱스 필터" placeholder="${t.indexFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="artifact-index-table"><thead><tr><th>타입</th><th>이름</th><th>열기</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(3, t.noArtifacts)
  }</tbody></table></div>
</section>`;
}

export function buildRolloutsPageBody(input: RolloutsPageBodyInput): string {
  const t = UI_TEXT.rollouts;

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">판정 surface</span>
      <h1>${t.title}</h1>
      <p class="section-intro">rollout과 compare 신호를 raw JSON이 아니라 decision surface로 읽습니다. 판단, recovery, linked evidence를 같은 위계로 맞춥니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/benchmarks">벤치마크</a><a href="/ui/health">${t.openHealth}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "filter, compare read order, recovery anchor를 표 위에 고정해 판단 피로도를 줄입니다.",
  cards: [
    {
      title: "신호 필터",
      intro: "signal, status, verdict, reason, source를 기준으로 문제 묶음을 먼저 좁힙니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "rollouts-filter",
        targetId: "rollouts-table",
        label: "롤아웃 신호 필터",
        placeholder: t.filterPlaceholder,
        hint: "신호 종류, 상태, 판정, 사유, 소스로 바로 줄입니다."
      })
    },
    {
      title: "비교 읽는 순서",
      intro: "상태보다 판정과 사유를 먼저 읽고, compare action은 그 다음에 엽니다.",
      tone: "warn",
      items: [
        { label: "status", detail: "blocked와 below-min은 즉시 차단 신호로 취급합니다." },
        { label: "verdict / reason", detail: "수치만 보지 말고 왜 막혔는지 reason을 먼저 읽습니다." },
        { label: "compare action", detail: "상세와 원시 JSON은 판단이 서지 않을 때만 엽니다." }
      ]
    },
    {
      title: "복구 / linked evidence",
      intro: "rollout signal은 benchmark, artifacts, health와 같이 묶어서 봐야 합니다.",
      tone: "ok",
      items: [
        { label: "benchmark와 비교", detail: "동일 번들의 upstream benchmark 결과를 함께 확인합니다." },
        { label: "artifacts handoff", detail: "판정 근거가 필요한 경우에만 linked outputs로 이동합니다." },
        { label: "health 확인", detail: "서비스 저하가 보이면 signal 자체보다 인프라 복구를 먼저 합니다." }
      ],
      linksHtml: '<a href="/ui/benchmarks">벤치마크</a><a href="/ui/artifacts">산출물</a><a href="/ui/health">상태</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.tableTitle}</h2>
      <p class="section-intro">각 행은 signal -> verdict -> reason -> next compare action 순서로 읽습니다.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="rollouts-table"><thead><tr><th>오브젝트 / 비교 액션</th><th>상태</th><th>점수</th><th>판정</th><th>사유</th><th>생성 시각</th><th>소스</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noSignals)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>2차 evidence / sources</h2>
      <p class="section-intro">${t.sourcesHint}</p>
    </div>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>`;
}

export function buildBenchmarksPageBody(input: BenchmarksPageBodyInput): string {
  const t = UI_TEXT.benchmarks;

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">compare surface</span>
      <h1>${t.title}</h1>
      <p class="section-intro">benchmark는 scenario compare와 regression recover를 함께 보는 화면입니다. heavy evidence보다 비교 판단과 next action을 먼저 올립니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "backend matrix와 regression queue를 같은 compare grammar로 읽고, sources는 마지막에 내립니다.",
  cards: [
    {
      title: "backend matrix 읽기",
      intro: "상태보다 허용률, 실패율, 메모를 함께 읽어 현재 시나리오가 승격 가능한지 판단합니다.",
      tone: "muted",
      items: [
        { label: "상태", detail: "시나리오 결과가 usable 한지 먼저 확인합니다." },
        { label: "지연 + 허용률", detail: "비용과 품질을 한 줄에서 함께 읽습니다." },
        { label: "linked outputs", detail: "필요할 때만 smoke / plan artifacts로 내려갑니다." }
      ]
    },
    {
      title: "regression queue 읽기",
      intro: "warning과 error를 먼저 보고 drift와 issue를 그 다음에 해석합니다.",
      tone: "warn",
      items: [
        { label: "경고 / 오류", detail: "차단 여부를 가장 먼저 판단합니다." },
        { label: "렌더 드리프트", detail: "비교 기준을 벗어난 폭을 빠르게 읽습니다." },
        { label: "이슈 요약", detail: "세부 evidence를 열기 전에 다음 조치를 정합니다." }
      ]
    },
    {
      title: "linked compare flow",
      intro: "benchmark 결과는 rollout과 artifacts까지 연결될 때만 운영 판단이 됩니다.",
      tone: "ok",
      items: [
        { label: "rollouts로 인계", detail: "동일 번들의 rollout decision surface와 연결합니다." },
        { label: "artifacts로 확인", detail: "근거가 필요할 때만 linked outputs로 이동합니다." },
        { label: "sources는 마지막", detail: "raw source rows는 2차 evidence로 아래에 둡니다." }
      ],
      linksHtml: `<a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a>`
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.backendTitle}</h2>
      <p class="section-intro">backend compare의 1차 표입니다. row별 next action을 먼저 읽고 필요할 때만 source evidence로 내려갑니다.</p>
    </div>
    <input type="search" data-table-filter="benchmark-backend-table" aria-label="백엔드 벤치마크 필터" placeholder="${t.backendFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-backend-table"><thead><tr><th>시나리오 / 다음 액션</th><th>상태</th><th>지연 시간</th><th>허용률</th><th>실패율</th><th>메모</th><th>소스</th></tr></thead><tbody>${
    input.backendRows || renderTableEmptyRow(7, t.noBackendRows)
  }</tbody></table></div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.regressionTitle}</h2>
      <p class="section-intro">regression queue의 1차 표입니다. warning / error를 먼저 읽고 drift와 issue를 뒤에 붙입니다.</p>
    </div>
    <input type="search" data-table-filter="benchmark-regression-table" aria-label="회귀 리포트 필터" placeholder="${t.regressionFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-regression-table"><thead><tr><th>번들 / 다음 액션</th><th>상태</th><th>경고 / 오류</th><th>프로필</th><th>렌더 드리프트</th><th>이슈</th><th>소스</th></tr></thead><tbody>${
    input.regressionRows || renderTableEmptyRow(7, t.noRegressionRows)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>2차 evidence / sources</h2>
      <p class="section-intro">${t.sourcesHint}</p>
    </div>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>`;
}
