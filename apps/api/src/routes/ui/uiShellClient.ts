export const UI_SHELL_CLIENT = `
(() => {
  const parseJsonDataset = (key, fallback) => {
    try {
      const raw = document.body.dataset[key];
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn("[ecs-shell] dataset parse failed", key, error);
      return fallback;
    }
  };
  const flatNav = parseJsonDataset("shellNav", []);
  const paletteActions = parseJsonDataset("shellPaletteActions", []);
  const jumpTargets = parseJsonDataset("shellJumpTargets", []);
  const storageKeys = parseJsonDataset("shellStorageKeys", {
    recentObjects: "ecs.ui.shell.recentObjects.v1",
    pinnedObjects: "ecs.ui.shell.pinnedObjects.v1",
    paletteState: "ecs.ui.shell.paletteState.v1"
  });
  const helperContract = parseJsonDataset("shellHelperContract", {
    currentObject: "data-shell-current-object",
    objectKind: "data-shell-object-kind",
    objectId: "data-shell-object-id",
    objectLabel: "data-shell-object-label",
    objectHref: "data-shell-object-href",
    command: "data-shell-command",
    commandLabel: "data-shell-command-label",
    commandKeywords: "data-shell-command-keywords",
    commandHref: "data-shell-command-href",
    commandAction: "data-shell-command-action",
    returnTo: "data-shell-return-to",
    returnLabel: "data-shell-return-label",
    deepLinkLabel: "data-shell-deep-link-label",
    recentIgnore: "data-shell-recent-ignore"
  });
  const toastWrap = document.getElementById("toast-wrap");
  const live = document.getElementById("global-live");
  const shortcut = document.getElementById("shortcut-help");
  const shortcutCard = shortcut instanceof HTMLElement ? shortcut.querySelector(".shortcut-card") : null;
  const palette = document.getElementById("shell-palette");
  const paletteCard = palette instanceof HTMLElement ? palette.querySelector(".shell-palette-card") : null;
  const shellNav = document.getElementById("shell-primary-nav");
  const shellNavToggle = document.getElementById("shell-nav-toggle");
  const openShortcut = document.getElementById("shortcut-open");
  const closeShortcut = document.getElementById("shortcut-close");
  const openPaletteButton = document.getElementById("shell-palette-open");
  const closePaletteButton = document.getElementById("shell-palette-close");
  const shellCurrentObject = document.getElementById("shell-current-object");
  const shellCurrentState = document.getElementById("shell-current-state");
  const shellLiveClock = document.getElementById("shell-live-clock");
  const shellPageGroup = document.getElementById("shell-page-group");
  const shellPagePath = document.getElementById("shell-page-path");
  const shellPageObject = document.getElementById("shell-page-object");
  const shellPageSummary = document.getElementById("shell-page-summary");
  const shellFilterState = document.getElementById("shell-filter-state");
  const shellAlertState = document.getElementById("shell-alert-state");
  const shellRecoveryState = document.getElementById("shell-recovery-state");
  const shellPrimaryAction = document.getElementById("shell-primary-action");
  const shellPrimaryLabel = document.getElementById("shell-primary-label");
  const shellFilterAction = document.getElementById("shell-filter-action");
  const shellOpenCurrent = document.getElementById("shell-open-current");
  const shellPinCurrent = document.getElementById("shell-pin-current");
  const shellReturnLink = document.getElementById("shell-return-link");
  const shellReturnLabel = document.getElementById("shell-return-label");
  const shellCopyLink = document.getElementById("shell-copy-link");
  const shellFilterChip = document.getElementById("shell-filter-chip");
  const shellAlertChip = document.getElementById("shell-alert-chip");
  const paletteQueryInput = document.getElementById("shell-palette-query");
  const paletteResults = document.getElementById("shell-palette-results");
  const paletteCurrent = document.getElementById("shell-palette-current");
  const palettePins = document.getElementById("shell-palette-pins");
  const paletteRecents = document.getElementById("shell-palette-recents");
  const filterBindings = [];
  const focusableSelector = "a[href],button:not([disabled]),textarea:not([disabled]),input:not([type='hidden']):not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";
  let lastShortcutFocus = null;
  let lastPaletteFocus = null;
  let liveTimer = null;
  let pendingGo = "";
  let pendingGoTimer = null;
  let currentObjectRecord = null;
  let currentReturnTarget = null;
  let lastRecordedObjectKey = "";
  let paletteItems = [];
  let paletteActiveIndex = 0;
  const paletteCommandNodes = new Map();
  const jumpTargetMap = new Map(jumpTargets.map((target) => [String(target.key || ""), target]));
  const compactNavQuery = window.matchMedia("(max-width: 900px)");
  const cleanText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const shorten = (value, max = 40) => {
    const text = cleanText(value);
    return text.length > max ? text.slice(0, Math.max(0, max - 3)).trimEnd() + "..." : text;
  };
  const attrValue = (node, attr) => (node instanceof HTMLElement ? cleanText(node.getAttribute(attr)) : "");
  const toRelativeHref = (value) => {
    const raw = cleanText(value);
    if (!raw) return "";
    try {
      const url = new URL(raw, window.location.origin);
      return url.origin === window.location.origin ? url.pathname + url.search + url.hash : url.toString();
    } catch (error) {
      return raw;
    }
  };
  const isUiHref = (value) => {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      return url.origin === window.location.origin && url.pathname.startsWith("/ui");
    } catch (error) {
      return false;
    }
  };
  const buildObjectHref = (kind, id) => {
    const target = jumpTargetMap.get(cleanText(kind));
    const value = cleanText(id);
    if (!target || !value) return "";
    if (target.mode === "segment") return target.hrefBase.replace(/\\/$/, "") + "/" + encodeURIComponent(value);
    if (target.mode === "path") {
      return target.hrefBase.replace(/\\/$/, "") + "/" + value.split("/").filter(Boolean).map((segment) => encodeURIComponent(segment)).join("/");
    }
    const url = new URL(target.hrefBase, window.location.origin);
    url.searchParams.set(target.queryKey, value);
    return url.pathname + "?" + url.searchParams.toString();
  };
  const normalizeObjectRecord = (record, source = "shell") => {
    if (!record || typeof record !== "object") return null;
    const kind = cleanText(record.kind || record.key);
    const id = cleanText(record.id);
    const href = toRelativeHref(record.href || buildObjectHref(kind, id));
    if (!kind || !id || !href) return null;
    return {
      kind,
      id,
      href,
      label: cleanText(record.label) || kind + " " + shorten(id, 56),
      description: cleanText(record.description),
      source,
      updatedAt: Number(record.updatedAt) || Date.now()
    };
  };
  const objectRecordKey = (record) => {
    const normalized = normalizeObjectRecord(record);
    return normalized ? [normalized.kind, normalized.id, normalized.href].join("::") : "";
  };
  const dedupeObjectRecords = (records, source = "shell") => {
    const seen = new Set();
    return records
      .map((record) => normalizeObjectRecord(record, source))
      .filter((record) => {
        if (!record) return false;
        const key = objectRecordKey(record);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  const storageGet = (key, fallback) => {
    try {
      if (!key || !window.localStorage) return fallback;
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  };
  const storageSet = (key, value) => {
    try {
      if (!key || !window.localStorage) return;
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("[ecs-shell] storage write failed", key, error);
    }
  };
  const readRecentObjects = () => dedupeObjectRecords(storageGet(storageKeys.recentObjects, []), "recent").slice(0, 10);
  const writeRecentObjects = (records) => storageSet(storageKeys.recentObjects, dedupeObjectRecords(records, "recent").slice(0, 10));
  const readPinnedObjects = () => dedupeObjectRecords(storageGet(storageKeys.pinnedObjects, []), "pin").slice(0, 12);
  const writePinnedObjects = (records) => storageSet(storageKeys.pinnedObjects, dedupeObjectRecords(records, "pin").slice(0, 12));
  const readPaletteState = () => {
    const state = storageGet(storageKeys.paletteState, {});
    return state && typeof state === "object" ? state : {};
  };
  const writePaletteState = (patch) => storageSet(storageKeys.paletteState, { ...readPaletteState(), ...patch });
  const isRecentTrackingDisabled = () => {
    if (document.body.getAttribute(helperContract.recentIgnore) === "1") return true;
    return !!document.querySelector("[" + helperContract.recentIgnore + "='1']");
  };
  const globalKoreanReplacements = [
    ["Object-centered browser for ChannelBible state and runtime profile evidence captured by benchmark and smoke runs.", "벤치마크와 스모크 실행에서 수집된 ChannelBible 상태 및 런타임 프로필 근거를 오브젝트 중심으로 탐색합니다."],
    ["Treat the run as an object: status, recovery, recent activity, and linked episode stay visible above raw logs.", "실행을 하나의 오브젝트로 다루세요. 상태, 복구, 최근 활동, 연결된 에피소드를 원시 로그 위에 계속 보이게 둡니다."],
    ["Prompt winner, actual winner, and next approval or rollback decision stay visible before the full candidate matrix.", "전체 후보 매트릭스 전에 프롬프트 승자, 실제 승자, 다음 승인 또는 롤백 결정을 계속 보이게 둡니다."],
    ["The compare target, verdict, and next decision stay visible before raw preview playback.", "원시 프리뷰 재생 전에 비교 대상, 판정, 다음 결정을 계속 보이게 둡니다."],
    ["Operate one episode as an object with explicit state, compare, review, and recovery paths.", "명시적인 상태, 비교, 검토, 복구 경로를 가진 하나의 오브젝트로 에피소드를 운영합니다."],
    ["Inspect one rollout artifact as a decision surface instead of a raw JSON dump.", "원시 JSON 덤프가 아니라 하나의 판단면으로 롤아웃 산출물을 점검합니다."],
    ["Reset the dedup state only when the queue has stalled and you have already inspected the recent jobs list.", "큐가 멈췄고 최근 작업 목록을 이미 확인한 경우에만 중복 상태를 초기화하세요."],
    ["Copy the right command before retrying pipeline work.", "파이프라인 작업을 재시도하기 전에 올바른 명령을 복사하세요."],
    ["Core services are healthy. Use the tables below only when you need deeper evidence.", "핵심 서비스는 정상입니다. 더 깊은 근거가 필요할 때만 아래 표를 확인하세요."],
    ["One or more services are degraded. Pick a recovery command first, then inspect service details before rerunning work.", "하나 이상의 서비스가 저하되었습니다. 먼저 복구 명령을 고르고, 작업을 다시 실행하기 전에 서비스 상세를 확인하세요."],
    ["Blocked and warning profile objects stay above the fold so recovery work starts here.", "차단되었거나 경고가 있는 프로필 오브젝트를 상단에 유지해 복구 작업이 여기서 시작되게 합니다."],
    ["Keep the recommended run path, compare entry, and rollback anchor above the heavy evidence sections.", "권장 실행 경로, 비교 진입점, 롤백 앵커를 무거운 근거 섹션 위에 유지합니다."],
    ["Keep approval, retry, and rollback logic visible before the full candidate matrix.", "전체 후보 매트릭스보다 먼저 승인, 재시도, 롤백 로직을 보이게 유지합니다."],
    ["Keep promotion, rerun, and rollback context visible before target rows and raw JSON.", "타깃 행과 원시 JSON보다 먼저 승격, 재실행, 롤백 맥락을 보이게 유지합니다."],
    ["Keep the retry action, owning episode, and recovery route visible before raw run evidence.", "원시 실행 근거보다 먼저 재시도 액션, 소유 에피소드, 복구 경로를 보이게 유지합니다."],
    ["Identity, current state, and control-plane context for this object.", "이 오브젝트의 식별자, 현재 상태, 제어면 맥락입니다."],
    ["Keep the blocking reason above the fold so the next operator decision is immediate.", "차단 사유를 상단에 유지해 다음 운영자 결정을 바로 내릴 수 있게 합니다."],
    ["Compile the shot graph first or preview/full renders will fail with weak rollback points.", "먼저 샷 그래프를 컴파일하지 않으면 프리뷰/전체 렌더가 약한 롤백 지점만 남긴 채 실패할 수 있습니다."],
    ["No preview.mp4 is available, so compare/recovery decisions are blocked until a preview render lands.", "preview.mp4가 없어 프리뷰 렌더가 도착하기 전까지 비교/복구 판단이 차단됩니다."],
    ["Latest movement on this object without dropping into raw logs.", "원시 로그로 내려가지 않아도 이 오브젝트의 최신 움직임을 확인합니다."],
    ["Profile notes: preview = fast preview, full = final render + package, render_only = preview render from current shots.", "프로필 메모: preview = 빠른 프리뷰, full = 최종 렌더 + 패키지, render_only = 현재 샷 기준 프리뷰 렌더입니다."],
    ["preview.mp4 is not generated yet. Start Preview render using the buttons above.", "preview.mp4가 아직 생성되지 않았습니다. 위 버튼으로 프리뷰 렌더를 시작하세요."],
    ["qc_report.json exists and has no failing issues.", "qc_report.json이 존재하며 실패 이슈가 없습니다."],
    ["qc_report.json is not available yet.", "qc_report.json이 아직 없습니다."],
    ["Job status updates in the table below. Use Retry on failures.", "아래 표에서 작업 상태가 갱신됩니다. 실패 시 재시도를 사용하세요."],
    ["shots.json not found. Run COMPILE_SHOTS first.", "shots.json을 찾을 수 없습니다. 먼저 COMPILE_SHOTS를 실행하세요."],
    ["No shots found. Run COMPILE_SHOTS first.", "샷을 찾을 수 없습니다. 먼저 COMPILE_SHOTS를 실행하세요."],
    ["No job history. Start from Run Profile above.", "작업 히스토리가 없습니다. 위의 실행 프로필에서 시작하세요."],
    ["No job history. Start with enqueue actions above.", "작업 히스토리가 없습니다. 위의 큐 등록 액션으로 시작하세요."],
    ["No recent dedup entries.", "최근 중복 항목이 없습니다."],
    ["No recovery commands configured.", "설정된 복구 명령이 없습니다."],
    ["No rollout actions are available.", "사용 가능한 롤아웃 액션이 없습니다."],
    ["No run actions are available.", "사용 가능한 실행 액션이 없습니다."],
    ["No compare actions are available.", "사용 가능한 비교 액션이 없습니다."],
    ["No candidate actions are available.", "사용 가능한 후보 액션이 없습니다."],
    ["No candidate recovery snapshot available.", "후보 복구 스냅샷이 없습니다."],
    ["No rollout recovery snapshot available.", "롤아웃 복구 스냅샷이 없습니다."],
    ["Recovery data is not available yet.", "복구 데이터가 아직 없습니다."],
    ["Loading latest run status...", "최신 실행 상태를 불러오는 중..."],
    ["Health Report", "상태 리포트"],
    ["Run Profile Dedup Guard", "실행 프로필 중복 방지 가드"],
    ["Service Status", "서비스 상태"],
    ["Recovery Commands (PowerShell)", "복구 명령 (PowerShell)"],
    ["Recovery Rail", "복구 레일"],
    ["Profile Browser", "프로필 브라우저"],
    ["Artifact Sources", "산출물 소스"],
    ["Episode Detail", "에피소드 상세"],
    ["Job / Run Detail", "작업 / 실행 상세"],
    ["Run Control Plane", "실행 제어면"],
    ["Episode Control Plane", "에피소드 제어면"],
    ["Variant Review", "변형 검토"],
    ["Candidate Review", "후보 검토"],
    ["A/B Preview Compare", "A/B 프리뷰 비교"],
    ["Sidecar Candidate Compare", "사이드카 후보 비교"],
    ["Rollout Review", "롤아웃 검토"],
    ["Rollout Detail", "롤아웃 상세"],
    ["Global snapshot, launch pads, and operator entry paths.", "전체 스냅샷, 진입점, 운영 시작 지점을 한 번에 확인합니다."],
    ["Cross-object creation surface for asset, pack, and episode flow.", "에셋, 팩, 에피소드 흐름을 오브젝트 단위로 연결합니다."],
    ["Candidate generation, reference routing, and HITL pick flow.", "후보 생성, 참조 라우팅, HITL 선택 흐름을 관리합니다."],
    ["Queue and worker coordination depend on this staying healthy.", "큐와 워커 조정은 이 상태가 건강하게 유지되는 데 달려 있습니다."],
    ["Dashboard", "대시보드"],
    ["Studio", "스튜디오"],
    ["Character Generator", "캐릭터 생성기"],
    ["Episode ", "에피소드 "],
    ["Job ", "작업 "],
    ["Decision Rail", "판단 레일"],
    ["Compare actions", "비교 액션"],
    ["Run actions", "실행 액션"],
    ["Rollout actions", "롤아웃 액션"],
    ["Next operator moves", "다음 운영자 액션"],
    ["Current verdict", "현재 판정"],
    ["Current decision", "현재 결정"],
    ["Current rollout verdict", "현재 롤아웃 판정"],
    ["Compare before promotion", "승격 전 비교"],
    ["Recovery anchor", "복구 앵커"],
    ["Rollback anchor", "롤백 앵커"],
    ["Recovery path", "복구 경로"],
    ["Retry / alternate path", "재시도 / 대체 경로"],
    ["Retry / rollback path", "재시도 / 롤백 경로"],
    ["Retry actual judge", "실제 판정 재시도"],
    ["Regenerate compare set", "비교 세트 재생성"],
    ["Compare and review", "비교 및 검토"],
    ["Alternate review path", "대체 검토 경로"],
    ["Inspect linked runs", "연결된 실행 점검"],
    ["Inspect related objects", "관련 오브젝트 점검"],
    ["Inspect the shot graph", "샷 그래프 점검"],
    ["Inspect artifacts", "산출물 점검"],
    ["Carry the verdict back to the episode", "판정을 에피소드로 되돌리기"],
    ["Object Evidence", "오브젝트 근거"],
    ["Review Artifacts", "검토 산출물"],
    ["QC Report", "QC 리포트"],
    ["Job Rail", "작업 레일"],
    ["Primary Actions", "기본 액션"],
    ["Primary Action", "기본 액션"],
    ["Recent Activity", "최근 활동"],
    ["Important Metadata", "핵심 메타데이터"],
    ["Warnings / Blockers", "경고 / 차단 요인"],
    ["Key Fields", "핵심 필드"],
    ["Issues & Notes", "이슈 및 메모"],
    ["Target Results", "타깃 결과"],
    ["Bundle Results", "번들 결과"],
    ["Raw JSON Preview", "원시 JSON 미리보기"],
    ["Variant Playback", "변형 재생"],
    ["Candidate Evidence", "후보 근거"],
    ["Run Control", "실행 제어"],
    ["Compare / Review", "비교 / 검토"],
    ["Manual Step Rail", "수동 단계 레일"],
    ["Per-shot Ops Signals", "샷별 운영 신호"],
    ["Documents", "문서"],
    ["Render Outputs", "렌더 출력"],
    ["Profile & Route Inspector", "프로필 및 경로 점검기"],
    ["Acceptance / QC Reasons", "승인 / QC 사유"],
    ["Episode Artifact Inspector", "에피소드 산출물 점검기"],
    ["Open /health JSON", "/health JSON 열기"],
    ["Open HITL", "HITL 열기"],
    ["Open Artifacts", "산출물 열기"],
    ["Open Jobs", "작업 열기"],
    ["Open Rollouts", "롤아웃 열기"],
    ["Open Benchmarks", "벤치마크 열기"],
    ["Open Episode Detail", "에피소드 상세 열기"],
    ["Open Episode", "에피소드 열기"],
    ["Open Failed Job", "실패 작업 열기"],
    ["Open Successful Job", "성공 작업 열기"],
    ["Open Character Pack Detail", "캐릭터 팩 상세 열기"],
    ["Open Raw JSON", "원시 JSON 열기"],
    ["Open Job Monitor", "작업 모니터 열기"],
    ["Open Shot Editor", "샷 에디터 열기"],
    ["Open Shot Editor Inspector", "샷 에디터 인스펙터 열기"],
    ["Back to Jobs", "작업으로 돌아가기"],
    ["Back to Episodes", "에피소드로 돌아가기"],
    ["Back to Rollouts", "롤아웃으로 돌아가기"],
    ["Back to Benchmarks", "벤치마크로 돌아가기"],
    ["Rollout Queue", "롤아웃 큐"],
    ["Benchmark Queue", "벤치마크 큐"],
    ["Recovery Queue", "복구 큐"],
    ["HITL Queue", "HITL 큐"],
    ["Run Profile (Recommended)", "실행 프로필 (권장)"],
    ["Run recommended episode profile", "권장 에피소드 프로필 실행"],
    ["Run Style Preview (~10s)", "스타일 프리뷰 실행 (~10초)"],
    ["Generate A/B Preview Compare", "A/B 프리뷰 비교 생성"],
    ["A/B Compare Page", "A/B 비교 페이지"],
    ["A/B Compare", "A/B 비교"],
    ["Start One-click Preview Render", "원클릭 프리뷰 렌더 시작"],
    ["Run Final + Package", "최종 + 패키지 실행"],
    ["Run Preview Render", "프리뷰 렌더 실행"],
    ["Run Selected Step", "선택한 단계 실행"],
    ["Full pipeline (final + package)", "전체 파이프라인 (최종 + 패키지)"],
    ["Render preview only", "프리뷰만 렌더"],
    ["Preview pipeline", "프리뷰 파이프라인"],
    ["The main actions operators should take from this detail surface.", "운영자가 이 상세 화면에서 우선 수행해야 할 주요 액션입니다."],
    ["Retry unavailable", "재시도 불가"],
    ["Only FAILED jobs can be retried from here.", "여기서는 FAILED 상태의 작업만 재시도할 수 있습니다."],
    ["Retry is available only when status is FAILED", "상태가 FAILED일 때만 재시도할 수 있습니다."],
    ["Current page filter", "현재 페이지 필터"],
    ["Raw JSON", "원시 JSON"],
    ["Overall", "전체"],
    ["Queue", "큐"],
    ["Progress", "진행률"],
    ["Attempts", "시도 횟수"],
    ["Logs", "로그"],
    ["Episode Status", "에피소드 상태"],
    ["Pipeline State", "파이프라인 상태"],
    ["Outputs", "출력"],
    ["Fallback Chain", "폴백 체인"],
    ["Recommended: run COMPILE_SHOTS first", "권장: 먼저 COMPILE_SHOTS 실행"],
    ["No active blockers detected.", "활성 차단 요인이 없습니다."],
    ["shots.json missing", "shots.json 누락"],
    ["Preview artifact missing", "프리뷰 산출물 누락"],
    ["Job Monitor", "작업 모니터"],
    ["Episode ID", "에피소드 ID"],
    ["EPISODE ID", "에피소드 ID"],
    ["Job ID", "작업 ID"],
    ["JOB ID", "작업 ID"],
    ["Episode", "에피소드"],
    ["EPISODE", "에피소드"],
    ["Channel", "채널"],
    ["CHANNEL", "채널"],
    ["Style Preset", "스타일 프리셋"],
    ["STYLE PRESET", "스타일 프리셋"],
    ["Out Dir", "산출물 경로"],
    ["OUT DIR", "산출물 경로"],
    ["Profiles", "프로필"],
    ["PROFILES", "프로필"],
    ["Character Pack", "캐릭터 팩"],
    ["CHARACTER PACK", "캐릭터 팩"],
    ["Type", "타입"],
    ["TYPE", "타입"],
    ["Retry Backoff", "재시도 백오프"],
    ["RETRY BACKOFF", "재시도 백오프"],
    ["object key", "오브젝트 키"],
    ["publishing target", "퍼블리시 대상"],
    ["artifact root", "산출물 루트"],
    ["resolved runtime profiles", "해결된 런타임 프로필"],
    ["linked character object", "연결된 캐릭터 오브젝트"],
    ["linked object", "연결된 오브젝트"],
    ["compile first", "먼저 컴파일"],
    ["preview required", "프리뷰 필요"],
    ["Open Job", "작업 열기"],
    ["current progress rail", "현재 진행 상태"],
    ["run object key", "실행 오브젝트 키"],
    ["worker step", "워커 단계"],
    ["preview / final / manifest", "프리뷰 / 최종 / 매니페스트"],
    ["no fallback used", "사용된 폴백 없음"],
    ["Name", "이름"],
    ["Command", "명령"],
    ["Copy", "복사"],
    ["Exists", "있음"],
    ["Missing", "없음"],
    ["Move up", "위로 이동"],
    ["Move down", "아래로 이동"],
    ["Apply tweak", "조정 적용"],
    ["topic: ", "주제: "],
    ["status: ", "상태: "],
    ["stylePreset: ", "스타일 프리셋: "],
    ["channel profile: ", "채널 프로필: "],
    ["mascot profile: ", "마스코트 프로필: "],
    ["studio profile: ", "스튜디오 프로필: "],
    ["route reasons: ", "경로 사유: "],
    ["visual objects: ", "비주얼 오브젝트: "],
    ["render modes: ", "렌더 모드: "],
    ["selected backend: ", "선택된 백엔드: "],
    ["acceptance status: ", "승인 상태: "],
    ["repair signals: ", "수리 신호: "],
    ["qc reasons: ", "QC 사유: "],
    ["fallback chain: ", "폴백 체인: "],
    ["preview_A missing", "preview_A 없음"],
    ["preview_B missing", "preview_B 없음"]
  ].sort((a, b) => b[0].length - a[0].length);
  const translatableAttrs = ["placeholder", "aria-label", "title", "data-primary-label"];
  const translateValue = (value) => {
    let next = String(value || "");
    for (const [from, to] of globalKoreanReplacements) {
      if (next.includes(from)) next = next.split(from).join(to);
    }
    return next;
  };
  const shouldSkipTranslate = (node) => {
    const element = node instanceof HTMLElement ? node : node.parentElement;
    return !!element?.closest("script,style,code,pre");
  };
  const translateElementAttrs = (node) => {
    if (!(node instanceof HTMLElement) || shouldSkipTranslate(node)) return;
    translatableAttrs.forEach((attr) => {
      const current = node.getAttribute(attr);
      if (!current) return;
      const next = translateValue(current);
      if (next !== current) node.setAttribute(attr, next);
    });
  };
  const translateTextNode = (node) => {
    if (!(node instanceof Text) || shouldSkipTranslate(node)) return;
    const current = node.nodeValue || "";
    const next = translateValue(current);
    if (next !== current) node.nodeValue = next;
  };
  const translateSubtree = (root) => {
    if (root instanceof Text) {
      translateTextNode(root);
      return;
    }
    if (!(root instanceof HTMLElement)) return;
    translateElementAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current = walker.currentNode;
    while (current) {
      if (current instanceof Text) translateTextNode(current);
      else if (current instanceof HTMLElement) translateElementAttrs(current);
      current = walker.nextNode();
    }
  };
  const setText = (node, text) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.textContent === text) return;
    node.textContent = text;
  };
  const severityKeys = ["ok", "warn", "bad", "muted", "info"];
  const setSeverity = (node, tone = "muted") => {
    if (!(node instanceof HTMLElement)) return;
    const nextTone = severityKeys.includes(tone) ? tone : "muted";
    severityKeys.forEach((key) => node.classList.remove("severity-" + key));
    node.classList.add("severity-" + nextTone);
    node.dataset.severity = nextTone;
  };
  const badgeSelector = ".badge,.status-badge,.shell-chip,.shell-status,[class*='asset-mini-badge'],.notice,.success-state,.warning-state,.error,.error-state,.empty-state,.panel,.notice-panel,.recovery-panel";
  const grammarSelector = "section,article,aside,.card,.ops-review-panel,.ops-review-card,.ops-rail-card,.notice,.success-state,.warning-state,.error,.error-state,.empty-state,.panel,.notice-panel,.recovery-panel";
  const surfaceKeywords = {
    evidence: ["raw json", "json preview", "원시 json", "원시 로그", "raw log", "logs", "stack", "trace", "payload", "artifact index", "원시 산출물", "산출물 인덱스", "원시 폴더"],
    recovery: ["recovery", "복구", "retry", "재시도", "rollback", "롤백", "rerender", "repair", "수리", "fallback", "hitl"],
    decision: ["decision", "판단", "의사결정", "compare", "비교", "approval", "승인", "verdict", "candidate", "variant", "review"],
    preflight: ["preflight", "사전점검", "validation", "검증", "입력", "run profile"],
    metadata: ["metadata", "snapshot", "요약", "summary", "important metadata", "key fields", "control snapshot", "현재 상태", "route snapshot", "acceptance snapshot", "lineage snapshot"]
  };
  const matchAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword));
  const collectMatches = (root, selector) => {
    if (!(root instanceof HTMLElement)) return [];
    const matches = [];
    if (root.matches(selector)) matches.push(root);
    root.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement) matches.push(node);
    });
    return matches;
  };
  const inferToneFromText = (value) => {
    const text = cleanText(value).toLowerCase();
    if (!text) return "muted";
    if (/(failed|failure|error|fatal|critical|cancelled|취소|실패|오류|치명|차단|blocked)/.test(text)) return "bad";
    if (/(warn|warning|degraded|hold|retry|rollback|missing|보류|주의|경고|누락|검토)/.test(text)) return "warn";
    if (/(running|queued|progress|processing|info|pending|실행 중|대기|진행|스캔)/.test(text)) return "info";
    if (/(ok|success|healthy|ready|complete|active|normal|정상|성공|준비|완료|사용 가능)/.test(text)) return "ok";
    return "muted";
  };
  const resolveNodeTone = (node) => {
    if (!(node instanceof HTMLElement)) return "muted";
    const className = String(node.className || "").toLowerCase();
    if (className.includes("severity-bad") || className.includes(" bad") || className.startsWith("bad ") || className.includes("error")) return "bad";
    if (className.includes("severity-warn") || className.includes(" warn") || className.startsWith("warn ") || className.includes("warning")) return "warn";
    if (className.includes("severity-ok") || className.includes(" ok") || className.startsWith("ok ") || className.includes("success")) return "ok";
    if (className.includes("severity-info") || className.includes(" info") || className.startsWith("info ")) return "info";
    if (className.includes("severity-muted") || className.includes(" muted") || className.startsWith("muted ")) return "muted";
    const direct = String(node.dataset.severity || "").toLowerCase();
    if (severityKeys.includes(direct)) return direct;
    return inferToneFromText(
      [node.getAttribute("aria-label"), node.getAttribute("title"), node.getAttribute("data-primary-label"), node.textContent].join(" ")
    );
  };
  const normalizeSeverityNodes = (root) => {
    const scope = root instanceof HTMLElement ? root : document.body;
    collectMatches(scope, badgeSelector).forEach((node) => {
      const tone = resolveNodeTone(node);
      if (node.matches(".badge,.status-badge,.shell-chip,.shell-status,[class*='asset-mini-badge']")) setSeverity(node, tone);
      else node.dataset.surfaceTone = tone;
    });
  };
  const setSurfaceRole = (node, role, kicker, priority = "primary") => {
    if (!(node instanceof HTMLElement)) return;
    node.classList.add("surface-panel");
    node.dataset.surfaceRole = role;
    node.dataset.surfaceKicker = kicker;
    node.dataset.surfacePriority = priority;
    if (role === "table") node.classList.add("table-shell");
    if (role === "metadata") node.classList.add("metadata-block");
    if (role === "preflight") node.classList.add("preflight-box");
    if (role === "decision") node.classList.add("decision-rail");
    if (role === "recovery") node.classList.add("recovery-rail");
    if (role === "evidence") node.classList.add("evidence-secondary");
  };
  const classifySurface = (node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.id === "shortcut-help" || node.classList.contains("shortcut-card")) return;
    const heading = cleanText(node.querySelector("h1,h2,h3,h4,h5,h6")?.textContent || "");
    const tableIds = Array.from(node.querySelectorAll("table[id]"))
      .map((table) => (table instanceof HTMLElement ? table.id : ""))
      .join(" ");
    const descriptor = cleanText([node.id, node.className, heading, tableIds].join(" ")).toLowerCase();
    const text = cleanText(node.textContent || "").slice(0, 1800).toLowerCase();
    const summary = (descriptor + " " + text).trim();
    const hasTable = !!node.querySelector("table");
    const hasCode = !!node.querySelector("pre,code,.mono");
    const hasForm = !!node.querySelector("form");
    const hasSummaryGrid = !!node.querySelector(".summary-grid,.ops-kpi-grid,.metadata-grid,dl");
    const railCard = node.classList.contains("ops-review-panel") || node.classList.contains("ops-review-card") || node.classList.contains("ops-rail-card");
    if (matchAny(summary, surfaceKeywords.evidence) || ((hasCode || /(^|\\s)(log|json|artifact|payload|trace)(\\s|$)/.test(descriptor)) && !hasForm)) {
      setSurfaceRole(node, "evidence", "2차 근거", "secondary");
      return;
    }
    if (railCard && matchAny(summary, surfaceKeywords.recovery)) {
      setSurfaceRole(node, "recovery", "복구 레일");
      return;
    }
    if (railCard && matchAny(summary, surfaceKeywords.decision)) {
      setSurfaceRole(node, "decision", "판단 레일");
      return;
    }
    if (hasForm && matchAny(summary, surfaceKeywords.preflight)) {
      setSurfaceRole(node, "preflight", "사전점검");
      return;
    }
    if (hasTable) {
      setSurfaceRole(node, "table", "테이블 셸");
      return;
    }
    if (hasSummaryGrid || matchAny(summary, surfaceKeywords.metadata)) {
      setSurfaceRole(node, "metadata", "메타데이터");
    }
  };
  const normalizeShellLayouts = (root) => {
    const scope = root instanceof HTMLElement ? root : document.body;
    collectMatches(scope, ".ops-review-strip").forEach((node) => node.classList.add("detail-shell"));
    collectMatches(scope, ".ops-rail-grid").forEach((node) => node.classList.add("compare-shell"));
    collectMatches(scope, ".summary-grid,.ops-kpi-grid").forEach((node) => node.classList.add("metadata-grid"));
  };
  const applyShellGrammar = (root) => {
    const scope = root instanceof HTMLElement ? root : document.body;
    normalizeShellLayouts(scope);
    collectMatches(scope, grammarSelector).forEach(classifySurface);
    normalizeSeverityNodes(scope);
    document.body.dataset.shellGrammarReady = "1";
  };
  const markSearchActivity = (node, active) => {
    if (!(node instanceof HTMLElement)) return;
    const flag = active ? "1" : "0";
    node.dataset.filterActive = flag;
    [".search-cluster", ".table-tools", ".toolbar", ".asset-table-tools", ".studio-table-tools"].forEach((selector) => {
      const container = node.closest(selector);
      if (container instanceof HTMLElement) container.dataset.searchActive = flag;
    });
  };
  const speak = (text) => {
    if (!(live instanceof HTMLElement)) return;
    if (liveTimer !== null) window.clearTimeout(liveTimer);
    live.textContent = "";
    liveTimer = window.setTimeout(() => {
      live.textContent = text;
    }, 20);
  };
  const toast = (title, message, tone = "ok", timeoutMs = 5000) => {
    if (!(toastWrap instanceof HTMLElement)) return;
    const node = document.createElement("div");
    const titleNode = document.createElement("div");
    const messageNode = document.createElement("div");
    node.className = "toast " + tone;
    node.dataset.severity = tone;
    titleNode.className = "title";
    titleNode.textContent = title;
    messageNode.textContent = message;
    node.append(titleNode, messageNode);
    toastWrap.appendChild(node);
    while (toastWrap.children.length > 4) toastWrap.firstElementChild?.remove();
    speak(title + ". " + message);
    window.setTimeout(() => node.remove(), timeoutMs);
  };
  window.__ecsToast = toast;
  window.__ecsSpeak = speak;
  const classifyError = (msg) => {
    const text = String(msg || "").toLowerCase();
    if (text.includes("503") || text.includes("unavailable") || text.includes("redis") || text.includes("queue")) {
      return { label: "서비스를 사용할 수 없음", tone: "bad", recovery: "상태 화면, 큐 상태, 최근 작업을 확인한 뒤 다시 실행하세요." };
    }
    if (text.includes("404") || text.includes("not found") || text.includes("missing")) {
      return { label: "오브젝트를 찾을 수 없음", tone: "warn", recovery: "현재 오브젝트 ID와 연결된 산출물을 확인한 뒤 다시 실행하세요." };
    }
    if (text.includes("400") || text.includes("required") || text.includes("validation") || text.includes("invalid")) {
      return { label: "입력값이 올바르지 않음", tone: "warn", recovery: "필수 입력값을 수정한 뒤 다시 실행하세요." };
    }
    return { label: "액션 실행 실패", tone: "bad", recovery: "작업과 상태 화면에서 실패한 의존성 또는 payload를 추적하세요." };
  };
  const getFocusable = (scope) => Array.from(scope.querySelectorAll(focusableSelector)).filter((node) => node instanceof HTMLElement && !node.hidden && window.getComputedStyle(node).display !== "none");
  const isShortcutOpen = () => shortcut instanceof HTMLElement && shortcut.classList.contains("open");
  const isPaletteOpen = () => palette instanceof HTMLElement && palette.classList.contains("open");
  const syncDialogState = () => {
    if (isShortcutOpen() || isPaletteOpen()) document.body.dataset.dialogOpen = "1";
    else delete document.body.dataset.dialogOpen;
  };
  const trapFocus = (event, scope, onEscape) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = getFocusable(scope);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const openDialog = () => {
    if (!(shortcut instanceof HTMLElement)) return;
    if (isPaletteOpen()) closePalette();
    lastShortcutFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    shortcut.classList.add("open");
    shortcut.style.display = "flex";
    shortcut.setAttribute("aria-hidden", "false");
    if (openShortcut instanceof HTMLButtonElement) openShortcut.setAttribute("aria-expanded", "true");
    syncDialogState();
    const focusTarget = shortcutCard instanceof HTMLElement ? getFocusable(shortcutCard)[0] : null;
    if (focusTarget instanceof HTMLElement) focusTarget.focus();
    else if (shortcutCard instanceof HTMLElement) shortcutCard.focus();
  };
  const closeDialog = () => {
    if (!(shortcut instanceof HTMLElement)) return;
    shortcut.classList.remove("open");
    shortcut.style.display = "";
    shortcut.setAttribute("aria-hidden", "true");
    if (openShortcut instanceof HTMLButtonElement) openShortcut.setAttribute("aria-expanded", "false");
    syncDialogState();
    if (lastShortcutFocus instanceof HTMLElement) lastShortcutFocus.focus();
  };
  const openPalette = (initialQuery = "") => {
    if (!(palette instanceof HTMLElement)) return;
    if (isShortcutOpen()) closeDialog();
    lastPaletteFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    palette.classList.add("open");
    palette.style.display = "flex";
    palette.setAttribute("aria-hidden", "false");
    if (openPaletteButton instanceof HTMLButtonElement) openPaletteButton.setAttribute("aria-expanded", "true");
    syncDialogState();
    if (paletteQueryInput instanceof HTMLInputElement) {
      paletteQueryInput.value = cleanText(initialQuery || paletteQueryInput.value || cleanText(readPaletteState().query));
      renderPalette(paletteQueryInput.value);
      window.requestAnimationFrame(() => {
        paletteQueryInput.focus();
        paletteQueryInput.select();
      });
    } else {
      renderPalette(cleanText(readPaletteState().query));
    }
  };
  const closePalette = () => {
    if (!(palette instanceof HTMLElement)) return;
    palette.classList.remove("open");
    palette.style.display = "";
    palette.setAttribute("aria-hidden", "true");
    if (openPaletteButton instanceof HTMLButtonElement) openPaletteButton.setAttribute("aria-expanded", "false");
    if (paletteQueryInput instanceof HTMLInputElement) writePaletteState({ query: paletteQueryInput.value });
    syncDialogState();
    if (lastPaletteFocus instanceof HTMLElement) lastPaletteFocus.focus();
  };
  window.__ecsShell = {
    openPalette,
    closePalette,
    buildObjectHref,
    appendReturnContext,
    copyDeepLink,
    recordRecentObject,
    togglePinnedObject
  };
  if (openShortcut instanceof HTMLButtonElement) {
    openShortcut.addEventListener("click", () => {
      if (shortcut instanceof HTMLElement && shortcut.classList.contains("open")) closeDialog();
      else openDialog();
    });
  }
  if (closeShortcut instanceof HTMLButtonElement) closeShortcut.addEventListener("click", closeDialog);
  if (shortcut instanceof HTMLElement) shortcut.addEventListener("click", (event) => {
    if (event.target === shortcut) closeDialog();
  });
  if (shortcutCard instanceof HTMLElement) {
    shortcutCard.setAttribute("tabindex", "-1");
    shortcutCard.addEventListener("keydown", (event) => trapFocus(event, shortcutCard, closeDialog));
  }
  if (openPaletteButton instanceof HTMLButtonElement) {
    openPaletteButton.addEventListener("click", () => {
      if (isPaletteOpen()) closePalette();
      else openPalette();
    });
  }
  if (closePaletteButton instanceof HTMLButtonElement) closePaletteButton.addEventListener("click", closePalette);
  if (palette instanceof HTMLElement) {
    palette.addEventListener("click", (event) => {
      if (event.target === palette) closePalette();
    });
  }
  if (paletteCard instanceof HTMLElement) {
    paletteCard.setAttribute("tabindex", "-1");
    paletteCard.addEventListener("keydown", (event) => trapFocus(event, paletteCard, closePalette));
  }
  if (paletteQueryInput instanceof HTMLInputElement) {
    paletteQueryInput.addEventListener("input", () => {
      paletteActiveIndex = 0;
      writePaletteState({ query: paletteQueryInput.value });
      renderPalette(paletteQueryInput.value);
    });
  }
  const activeNav = (pathname) => flatNav
    .slice()
    .sort((a, b) => String(b.href || "").length - String(a.href || "").length)
    .find((item) => String(item.href || "") === "/ui" ? pathname === "/ui" : pathname === item.href || pathname.startsWith(String(item.href || "") + "/")) || null;
  const describeObject = (url) => {
    const queryPairs = [["episodeId", "에피소드"], ["assetId", "에셋"], ["jobId", "작업"], ["characterPackId", "팩"], ["path", "산출물"]];
    for (const [key, label] of queryPairs) {
      const value = cleanText(url.searchParams.get(key));
      if (value) return label + " " + shorten(value, 48);
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] !== "ui") return "현재 오브젝트 없음";
    if (segments[1] === "jobs" && segments[2]) return "작업 " + shorten(segments[2], 48);
    if (segments[1] === "episodes" && segments[2]) {
      const suffix = segments[3] === "editor" ? " / 편집기" : segments[3] === "ab-compare" ? " / 비교" : "";
      return "에피소드 " + shorten(segments[2], 48) + suffix;
    }
    if (segments[1] === "characters" && segments[2]) return "캐릭터 범위 " + shorten(segments.slice(2).join("/"), 48);
    if (segments[1] === "rollouts" && segments[2]) return "산출물 근거";
    if (segments[1] === "benchmarks" && segments[2]) return "벤치마크 근거";
    return "현재 오브젝트 없음";
  };
  const resolveCurrentObject = (url = new URL(window.location.href)) => {
    const selector = "[" + helperContract.objectKind + "][" + helperContract.objectId + "]";
    const marked = document.querySelector("[" + helperContract.currentObject + "]" + selector);
    const node = marked || document.querySelector(selector);
    if (node instanceof HTMLElement) {
      return normalizeObjectRecord(
        {
          kind: attrValue(node, helperContract.objectKind),
          id: attrValue(node, helperContract.objectId),
          href: attrValue(node, helperContract.objectHref) || (node instanceof HTMLAnchorElement ? node.getAttribute("href") || "" : ""),
          label: attrValue(node, helperContract.objectLabel) || cleanText(node.getAttribute("aria-label")) || cleanText(node.textContent),
          description: cleanText(node.getAttribute("title") || node.dataset.tooltip || "")
        },
        "declared"
      );
    }
    const queryPairs = [
      ["characterPackId", "character-pack"],
      ["assetId", "asset"],
      ["jobId", "job"],
      ["episodeId", url.pathname.startsWith("/ui/artifacts") ? "artifact-episode" : "episode"],
      ["path", "artifact-path"]
    ];
    for (const [key, kind] of queryPairs) {
      const value = cleanText(url.searchParams.get(key));
      if (value) return normalizeObjectRecord({ kind, id: value, label: kind + " " + shorten(value, 56) }, "url");
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[1] === "episodes" && segments[2]) return normalizeObjectRecord({ kind: "episode", id: segments[2], label: "에피소드 " + shorten(segments[2], 56) }, "url");
    if (segments[1] === "jobs" && segments[2]) return normalizeObjectRecord({ kind: "job", id: segments[2], label: "작업 " + shorten(segments[2], 56) }, "url");
    return null;
  };
  const currentPageHref = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("returnTo");
    url.searchParams.delete("returnLabel");
    url.searchParams.delete("deepLinkLabel");
    const query = url.searchParams.toString();
    return url.pathname + (query ? "?" + query : "") + url.hash;
  };
  const currentPageLabel = () => {
    const override = document.querySelector("[" + helperContract.deepLinkLabel + "]");
    return attrValue(override, helperContract.deepLinkLabel) || cleanText(document.body.dataset.pageTitle) || cleanText(document.title) || "현재 페이지";
  };
  const appendReturnContext = (href) => {
    const raw = cleanText(href);
    if (!raw) return "";
    try {
      const target = new URL(raw, window.location.origin);
      if (target.origin !== window.location.origin || !target.pathname.startsWith("/ui")) return target.toString();
      const label = (currentObjectRecord && currentObjectRecord.label) || currentPageLabel();
      if (!target.searchParams.get("returnTo")) target.searchParams.set("returnTo", currentPageHref());
      if (!target.searchParams.get("returnLabel")) target.searchParams.set("returnLabel", label);
      return target.pathname + target.search + target.hash;
    } catch (error) {
      return raw;
    }
  };
  const resolveReturnTarget = () => {
    const override = document.querySelector("[" + helperContract.returnTo + "]");
    const url = new URL(window.location.href);
    const href = attrValue(override, helperContract.returnTo) || cleanText(url.searchParams.get("returnTo"));
    if (!href || !isUiHref(href)) return null;
    return {
      href: toRelativeHref(href),
      label: attrValue(override, helperContract.returnLabel) || cleanText(url.searchParams.get("returnLabel")) || "돌아가기"
    };
  };
  const focusSearchField = () => {
    const search = searchFieldNode();
    if (!(search instanceof HTMLElement)) return false;
    search.focus();
    if (search instanceof HTMLInputElement) search.select();
    return true;
  };
  const navigateTo = (href, keepReturn = true) => {
    const target = keepReturn ? appendReturnContext(href) : toRelativeHref(href);
    if (target) window.location.href = target;
  };
  const copyDeepLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("딥링크 복사됨", currentPageLabel(), "ok", 2200);
      return true;
    } catch (error) {
      toast("복사 실패", String(error), "bad", 4000);
      return false;
    }
  };
  const isPinnedObject = (record) => {
    const key = objectRecordKey(record);
    return !!key && readPinnedObjects().some((item) => objectRecordKey(item) === key);
  };
  const recordRecentObject = (record) => {
    const normalized = normalizeObjectRecord(record, "recent");
    if (!normalized || isRecentTrackingDisabled()) return;
    const key = objectRecordKey(normalized);
    if (!key || key === lastRecordedObjectKey) return;
    lastRecordedObjectKey = key;
    writeRecentObjects([{ ...normalized, updatedAt: Date.now() }, ...readRecentObjects()]);
  };
  const togglePinnedObject = (record) => {
    const normalized = normalizeObjectRecord(record, "pin");
    if (!normalized) return false;
    const key = objectRecordKey(normalized);
    const next = isPinnedObject(normalized)
      ? readPinnedObjects().filter((item) => objectRecordKey(item) !== key)
      : [{ ...normalized, updatedAt: Date.now() }, ...readPinnedObjects()];
    writePinnedObjects(next);
    return next.some((item) => objectRecordKey(item) === key);
  };
  const hasInlineFlash = (selector, message) => Array.from(document.querySelectorAll(selector)).some((node) => cleanText(node.textContent).includes(message));
  const persistQueryState = (key, value) => {
    const nextUrl = new URL(window.location.href);
    if (value) nextUrl.searchParams.set(key, value);
    else nextUrl.searchParams.delete(key);
    window.history.replaceState({}, "", nextUrl.pathname + (nextUrl.searchParams.toString() ? "?" + nextUrl.searchParams.toString() : "") + nextUrl.hash);
  };
  const syncNavCollapse = () => {
    const compact = compactNavQuery.matches;
    if (compact) {
      if (!document.body.dataset.shellNavCollapsed) document.body.dataset.shellNavCollapsed = "1";
    } else {
      document.body.dataset.shellNavCollapsed = "0";
    }
    const collapsed = document.body.dataset.shellNavCollapsed === "1";
    if (shellNav instanceof HTMLElement) shellNav.hidden = compact && collapsed;
    if (shellNavToggle instanceof HTMLButtonElement) {
      shellNavToggle.hidden = !compact;
      shellNavToggle.setAttribute("aria-expanded", String(!(compact && collapsed)));
      shellNavToggle.textContent = compact && collapsed ? "메뉴" : "메뉴 숨기기";
    }
  };
  const summarizeFilters = () => {
    const active = filterBindings
      .map((binding) => ({ key: binding.key, value: cleanText(binding.node.value) }))
      .filter((binding) => binding.value.length > 0);
    if (!active.length) return { label: "URL 상태 대기", chip: "URL 상태 대기", tone: "muted" };
    return {
      label: active.length + "개 필터 적용 중",
      chip: active.map((binding) => binding.key + "=" + shorten(binding.value, 18)).join(" | "),
      tone: "info"
    };
  };
  const primaryActionNode = () => document.querySelector("[data-primary-action='1']:not([disabled]):not([aria-disabled='true'])");
  const searchFieldNode = () =>
    document.querySelector("input[type='search']:not([disabled]):not([data-shell-palette-input='1']), input[data-table-filter]:not([disabled])");
  const syncCurrentObjectControls = () => {
    const pinned = !!currentObjectRecord && isPinnedObject(currentObjectRecord);
    if (shellOpenCurrent instanceof HTMLButtonElement) {
      shellOpenCurrent.hidden = !currentObjectRecord;
      shellOpenCurrent.disabled = !currentObjectRecord;
      shellOpenCurrent.textContent = currentObjectRecord ? shorten(currentObjectRecord.label, 28) : "현재 오브젝트";
    }
    if (shellPinCurrent instanceof HTMLButtonElement) {
      shellPinCurrent.hidden = !currentObjectRecord;
      shellPinCurrent.disabled = !currentObjectRecord;
      shellPinCurrent.dataset.pinned = pinned ? "1" : "0";
      shellPinCurrent.textContent = pinned ? "Unpin" : "Pin";
    }
    if (shellReturnLink instanceof HTMLButtonElement) {
      shellReturnLink.hidden = !currentReturnTarget;
      shellReturnLink.disabled = !currentReturnTarget;
    }
    setText(shellReturnLabel, currentReturnTarget ? shorten(currentReturnTarget.label, 34) : "돌아가기");
  };
  const runPaletteAction = (action, context = {}) => {
    if (action === "focus-filter") {
      if (focusSearchField()) {
        speak("필터 입력으로 이동했습니다.");
        return true;
      }
      toast("필터 없음", "이 페이지에는 검색 또는 필터 입력이 없습니다.", "muted", 2200);
      return false;
    }
    if (action === "run-primary") {
      const primary = primaryActionNode();
      if (primary instanceof HTMLElement) {
        primary.focus();
        primary.click();
        return true;
      }
      toast("기본 액션 없음", "이 페이지에는 기본 액션이 없습니다.", "muted", 2200);
      return false;
    }
    if (action === "open-current-object") {
      if (!currentObjectRecord) return false;
      navigateTo(currentObjectRecord.href, true);
      return true;
    }
    if (action === "copy-deep-link") {
      void copyDeepLink();
      return true;
    }
    if (action === "open-return-link") {
      if (!currentReturnTarget) return false;
      navigateTo(currentReturnTarget.href, false);
      return true;
    }
    if (action === "toggle-pin-current") {
      if (!currentObjectRecord) return false;
      const pinned = togglePinnedObject(currentObjectRecord);
      syncCurrentObjectControls();
      renderPalette();
      toast(pinned ? "Pin 추가" : "Pin 해제", currentObjectRecord.label, "ok", 2200);
      return true;
    }
    if (action === "open-shortcuts") {
      openDialog();
      return true;
    }
    const node = context.node || paletteCommandNodes.get(context.id);
    if (node instanceof HTMLElement) {
      node.focus();
      node.click();
      return true;
    }
    return false;
  };
  const collectPaletteItems = (query = "") => {
    const navItems = flatNav.map((item) => ({
      id: "nav:" + item.href,
      type: "nav",
      label: item.label,
      description: item.description,
      href: item.href,
      hotkey: item.hotkey,
      meta: item.groupLabel,
      keywords: [item.label, item.description, item.groupLabel, item.hotkey, item.href].join(" ")
    }));
    const actionItems = paletteActions.map((item) => ({
      id: "action:" + item.id,
      type: "action",
      label: item.label,
      description: item.description,
      action: item.action,
      hotkey: item.hotkey,
      meta: "shell action",
      keywords: [item.label, item.description, ...(Array.isArray(item.keywords) ? item.keywords : [])].join(" ")
    }));
    const pinItems = readPinnedObjects().map((record) => ({
      id: "pin:" + objectRecordKey(record),
      type: "pin",
      label: record.label,
      description: record.description || record.id,
      href: record.href,
      meta: "pin",
      keywords: [record.kind, record.id, record.label, "pin"].join(" ")
    }));
    const recentItems = readRecentObjects().map((record) => ({
      id: "recent:" + objectRecordKey(record),
      type: "recent",
      label: record.label,
      description: record.description || record.id,
      href: record.href,
      meta: "recent",
      keywords: [record.kind, record.id, record.label, "recent"].join(" ")
    }));
    paletteCommandNodes.clear();
    const commandNodes = Array.from(new Set(Array.from(document.querySelectorAll("[" + helperContract.command + "],[" + helperContract.commandHref + "],[" + helperContract.commandAction + "]"))));
    const commandItems = commandNodes
      .map((node, index) => {
        if (!(node instanceof HTMLElement) || node.hidden || window.getComputedStyle(node).display === "none") return null;
        const label = attrValue(node, helperContract.commandLabel) || cleanText(node.getAttribute("aria-label")) || cleanText(node.textContent);
        if (!label) return null;
        const id = "command:" + (attrValue(node, helperContract.command) || String(index));
        paletteCommandNodes.set(id, node);
        return {
          id,
          type: "command",
          label,
          description: cleanText(node.getAttribute("title") || node.dataset.tooltip || ""),
          href: toRelativeHref(attrValue(node, helperContract.commandHref) || (node instanceof HTMLAnchorElement ? node.getAttribute("href") || "" : "")),
          action: attrValue(node, helperContract.commandAction),
          meta: "page action",
          keywords: [attrValue(node, helperContract.commandKeywords), label].join(" ")
        };
      })
      .filter(Boolean);
    const objectItems = dedupeObjectRecords(
      Array.from(document.querySelectorAll("[" + helperContract.objectKind + "][" + helperContract.objectId + "]")).map((node) =>
        node instanceof HTMLElement
          ? {
              kind: attrValue(node, helperContract.objectKind),
              id: attrValue(node, helperContract.objectId),
              href: attrValue(node, helperContract.objectHref) || (node instanceof HTMLAnchorElement ? node.getAttribute("href") || "" : ""),
              label: attrValue(node, helperContract.objectLabel) || cleanText(node.getAttribute("aria-label")) || cleanText(node.textContent),
              description: cleanText(node.getAttribute("title") || node.dataset.tooltip || "")
            }
          : null
      ),
      "declared"
    ).map((record) => ({
      id: "object:" + objectRecordKey(record),
      type: "object",
      label: record.label,
      description: record.description || record.id,
      href: record.href,
      meta: record.kind,
      keywords: [record.kind, record.id, record.label, record.description].join(" ")
    }));
    const jumpQuery = cleanText(query);
    let jumpItem = null;
    if (jumpQuery) {
      const colonIndex = jumpQuery.indexOf(":");
      let prefix = "";
      let value = jumpQuery;
      if (colonIndex > 0) {
        prefix = jumpQuery.slice(0, colonIndex).toLowerCase();
        value = cleanText(jumpQuery.slice(colonIndex + 1));
      } else if (/^ep[_-]/i.test(jumpQuery)) prefix = "ep";
      else if (/^job[_-]|^clx_job_/i.test(jumpQuery)) prefix = "job";
      else if (/^pack[_-]|^clx_pack_/i.test(jumpQuery)) prefix = "pack";
      else if (/^asset[_-]/i.test(jumpQuery)) prefix = "asset";
      else if (jumpQuery.includes("/") || /\\.(json|log|txt|mp4)$/i.test(jumpQuery)) prefix = "path";
      const target = jumpTargets.find((item) => cleanText(item.key).toLowerCase() === prefix || (Array.isArray(item.prefixes) && item.prefixes.some((name) => cleanText(name).toLowerCase() === prefix)));
      if (target && value) {
        const href = buildObjectHref(target.key, value);
        if (href) {
          jumpItem = {
            id: "jump:" + target.key + ":" + value,
            type: "jump",
            label: target.label + " " + value,
            description: target.description,
            href,
            meta: "jump",
            keywords: [target.key, ...(target.prefixes || []), value, target.example].join(" ")
          };
        }
      }
    }
    return [...(jumpItem ? [jumpItem] : []), ...actionItems, ...pinItems, ...recentItems, ...objectItems, ...commandItems, ...navItems];
  };
  const renderPaletteSideList = (root, entries, emptyText) => {
    if (!(root instanceof HTMLElement)) return;
    root.textContent = "";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "shell-palette-empty";
      empty.textContent = emptyText;
      root.appendChild(empty);
      return;
    }
    entries.forEach((entry) => {
      const button = document.createElement("button");
      const strong = document.createElement("strong");
      const meta = document.createElement("span");
      button.type = "button";
      button.className = "secondary shell-palette-side-item";
      strong.textContent = entry.label;
      meta.textContent = shorten(entry.description || entry.meta || entry.href || "", 56);
      button.append(strong, meta);
      button.addEventListener("click", () => executePaletteItem(entry));
      root.appendChild(button);
    });
  };
  const executePaletteItem = (item) => {
    if (!item) return;
    if (item.action && runPaletteAction(item.action, { id: item.id, node: paletteCommandNodes.get(item.id) })) {
      closePalette();
      return;
    }
    if (item.href) {
      closePalette();
      navigateTo(item.href, true);
      return;
    }
    const node = paletteCommandNodes.get(item.id);
    if (node instanceof HTMLElement) {
      closePalette();
      node.focus();
      node.click();
    }
  };
  const renderPalette = (query = paletteQueryInput instanceof HTMLInputElement ? paletteQueryInput.value : "") => {
    const q = cleanText(query).toLowerCase();
    const ranked = collectPaletteItems(query)
      .map((item) => {
        if (!q) return { item, score: { jump: 140, action: 110, pin: 104, recent: 100, object: 96, command: 92, nav: 76 }[item.type] || 60 };
        const haystack = cleanText([item.label, item.description, item.meta, item.keywords, item.href].join(" ")).toLowerCase();
        const label = cleanText(item.label).toLowerCase();
        const tokens = q.split(/\\s+/).filter(Boolean);
        if (!tokens.every((token) => haystack.includes(token))) return null;
        return { item, score: tokens.reduce((sum, token) => sum + (label.startsWith(token) ? 40 : label.includes(token) ? 24 : 10), { jump: 140, action: 110, pin: 104, recent: 100, object: 96, command: 92, nav: 76 }[item.type] || 60) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || cleanText(a.item.label).localeCompare(cleanText(b.item.label), "ko"));
    paletteItems = ranked.map((entry) => entry.item).slice(0, q ? 16 : 12);
    paletteActiveIndex = Math.min(Math.max(paletteActiveIndex, 0), Math.max(0, paletteItems.length - 1));
    if (paletteResults instanceof HTMLElement) {
      paletteResults.textContent = "";
      if (!paletteItems.length) {
        const empty = document.createElement("div");
        empty.className = "shell-palette-empty";
        empty.textContent = "검색 결과가 없습니다. prefix jump 예시는 episode:, job:, pack:, asset:, path: 입니다.";
        paletteResults.appendChild(empty);
      } else {
        paletteItems.forEach((item, index) => {
          const button = document.createElement("button");
          const main = document.createElement("span");
          const title = document.createElement("strong");
          const desc = document.createElement("span");
          const meta = document.createElement("span");
          button.type = "button";
          button.className = "shell-palette-item" + (index === paletteActiveIndex ? " active" : "");
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", String(index === paletteActiveIndex));
          main.className = "shell-palette-item-main";
          meta.className = "shell-palette-item-meta";
          title.textContent = item.label;
          desc.textContent = shorten(item.description || item.href || "", 90);
          meta.textContent = cleanText(item.meta || "");
          main.append(title, desc);
          button.append(main, meta);
          button.addEventListener("mouseenter", () => {
            paletteActiveIndex = index;
            renderPalette(query);
          });
          button.addEventListener("click", () => executePaletteItem(item));
          paletteResults.appendChild(button);
        });
      }
    }
    renderPaletteSideList(
      paletteCurrent,
      currentObjectRecord
        ? [
            { label: currentObjectRecord.label, description: currentObjectRecord.id, href: currentObjectRecord.href },
            { label: isPinnedObject(currentObjectRecord) ? "현재 오브젝트 unpin" : "현재 오브젝트 pin", description: currentObjectRecord.label, action: "toggle-pin-current" }
          ]
        : [],
      "현재 오브젝트를 아직 추론하지 못했습니다."
    );
    renderPaletteSideList(
      palettePins,
      readPinnedObjects().map((record) => ({ label: record.label, description: record.id, href: record.href, meta: "pin" })),
      "고정된 오브젝트가 없습니다."
    );
    renderPaletteSideList(
      paletteRecents,
      readRecentObjects().map((record) => ({ label: record.label, description: record.id, href: record.href, meta: "recent" })),
      "최근 오브젝트가 없습니다."
    );
  };
  const syncPrimaryAction = () => {
    const primary = primaryActionNode();
    const searchField = searchFieldNode();
    const hasPrimary = primary instanceof HTMLElement;
    const hasSearch = searchField instanceof HTMLElement;
    if (shellPrimaryAction instanceof HTMLButtonElement) {
      if (shellPrimaryAction.disabled !== !hasPrimary) shellPrimaryAction.disabled = !hasPrimary;
      if (shellPrimaryAction.hidden !== !hasPrimary) shellPrimaryAction.hidden = !hasPrimary;
      shellPrimaryAction.dataset.available = hasPrimary ? "1" : "0";
    }
    if (shellFilterAction instanceof HTMLButtonElement) {
      if (shellFilterAction.disabled !== !hasSearch) shellFilterAction.disabled = !hasSearch;
      if (shellFilterAction.hidden !== !hasSearch) shellFilterAction.hidden = !hasSearch;
      shellFilterAction.dataset.available = hasSearch ? "1" : "0";
    }
    document.body.dataset.shellHasPrimary = hasPrimary ? "1" : "0";
    document.body.dataset.shellHasFilter = hasSearch ? "1" : "0";
    setText(
      shellPrimaryLabel,
      hasPrimary ? shorten(primary.getAttribute("data-primary-label") || primary.getAttribute("aria-label") || primary.textContent || "기본 액션 실행", 34) : "기본 액션 실행"
    );
  };
  const syncShellState = () => {
    const url = new URL(window.location.href);
    const pathname = url.pathname;
    const nav = activeNav(pathname);
    currentObjectRecord = resolveCurrentObject(url);
    currentReturnTarget = resolveReturnTarget();
    document.querySelectorAll("header nav a[href]").forEach((node) => {
      if (!(node instanceof HTMLAnchorElement)) return;
      const href = node.getAttribute("href");
      if (!href) return;
      const isActive = href === "/ui" ? pathname === "/ui" : pathname === href || pathname.startsWith(href + "/");
      node.classList.toggle("active", isActive);
      if (isActive) node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    });
    const filterSummary = summarizeFilters();
    const message = cleanText(url.searchParams.get("message"));
    const error = cleanText(url.searchParams.get("error"));
    const errorState = error ? classifyError(error) : null;
    const alertLabel = errorState ? errorState.label : message ? "성공" : "정상";
    const alertTone = errorState ? errorState.tone : message ? "ok" : "ok";
    const recovery = currentReturnTarget ? currentReturnTarget.label : errorState ? errorState.recovery : nav ? nav.description : "현재 페이지 기준 복귀 링크 준비";
    const recoveryTone = currentReturnTarget ? "info" : errorState ? errorState.tone : nav ? "info" : "muted";
    const objectText = currentObjectRecord ? currentObjectRecord.label : describeObject(url);
    document.body.dataset.shellAlertTone = alertTone;
    document.body.dataset.shellFilterTone = filterSummary.tone;
    setText(shellCurrentObject, objectText);
    setText(shellCurrentState, alertLabel);
    setText(shellPageGroup, nav ? nav.groupLabel : "컨트롤 플레인");
    setText(shellPagePath, pathname);
    setText(shellPageObject, objectText);
    setText(shellPageSummary, nav ? nav.description : "오브젝트 중심 제어면에서 빠른 라우팅, 상세 작업, 비교 검토, 복구 대응을 진행합니다.");
    setText(shellFilterState, filterSummary.label);
    setText(shellAlertState, alertLabel);
    setText(shellRecoveryState, recovery);
    setText(shellFilterChip, filterSummary.chip);
    setText(shellAlertChip, alertLabel);
    setSeverity(shellCurrentState, alertTone);
    setSeverity(shellAlertState, alertTone);
    setSeverity(shellAlertChip, alertTone);
    setSeverity(shellFilterState, filterSummary.tone);
    setSeverity(shellFilterChip, filterSummary.tone);
    setSeverity(shellRecoveryState, recoveryTone);
    syncPrimaryAction();
    syncCurrentObjectControls();
    if (currentObjectRecord) recordRecentObject(currentObjectRecord);
    syncNavCollapse();
    normalizeSeverityNodes(document.body);
    if (isPaletteOpen()) renderPalette();
  };
  if (shellNavToggle instanceof HTMLButtonElement) {
    shellNavToggle.addEventListener("click", () => {
      document.body.dataset.shellNavCollapsed = document.body.dataset.shellNavCollapsed === "1" ? "0" : "1";
      syncNavCollapse();
      speak(document.body.dataset.shellNavCollapsed === "1" ? "탐색 메뉴를 접었습니다." : "탐색 메뉴를 펼쳤습니다.");
    });
  }
  document.querySelectorAll("#shell-primary-nav a[href]").forEach((node) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    node.addEventListener("click", () => {
      if (!compactNavQuery.matches) return;
      document.body.dataset.shellNavCollapsed = "1";
      syncNavCollapse();
    });
  });
  const bindCompactNavListener = () => {
    const onChange = () => syncNavCollapse();
    if (typeof compactNavQuery.addEventListener === "function") compactNavQuery.addEventListener("change", onChange);
    else if (typeof compactNavQuery.addListener === "function") compactNavQuery.addListener(onChange);
  };
  bindCompactNavListener();
  document.querySelectorAll("[data-copy]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.addEventListener("click", async () => {
      const text = cleanText(node.dataset.copy);
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        toast("복사됨", text, "ok", 2000);
      } catch (error) {
        toast("복사 실패", String(error), "bad", 5000);
      }
    });
  });
  document.querySelectorAll("input[data-table-filter]").forEach((node, index, nodes) => {
    if (!(node instanceof HTMLInputElement)) return;
    const targetId = cleanText(node.dataset.tableFilter);
    const table = targetId ? document.getElementById(targetId) : null;
    if (!(table instanceof HTMLTableElement)) return;
    const queryKey = cleanText(node.dataset.urlParam || node.name || node.id || (nodes.length === 1 ? "filter" : "filter-" + (targetId || index + 1))).replace(/[^a-zA-Z0-9_-]+/g, "-");
    const initialUrl = new URL(window.location.href);
    const initialValue = initialUrl.searchParams.get(queryKey);
    if (initialValue && !node.value) node.value = initialValue;
    const rows = () => Array.from(table.querySelectorAll("tbody tr"));
    const applyFilter = () => {
      const rawQuery = node.value.trim();
      const query = rawQuery.toLowerCase();
      rows().forEach((row) => {
        const text = String(row.textContent || "").toLowerCase();
        row.style.display = !query || text.includes(query) ? "" : "none";
      });
      markSearchActivity(node, rawQuery.length > 0);
      table.dataset.filterActive = rawQuery.length > 0 ? "1" : "0";
      persistQueryState(queryKey, rawQuery);
      syncShellState();
    };
    node.addEventListener("input", applyFilter);
    filterBindings.push({ node, key: queryKey });
    applyFilter();
  });
  document.querySelectorAll("input[type='search']").forEach((node) => {
    if (!(node instanceof HTMLInputElement) || node.dataset.tableFilter || node.dataset.shellPaletteInput === "1") return;
    const syncSearchAffordance = () => markSearchActivity(node, node.value.trim().length > 0);
    node.addEventListener("input", syncSearchAffordance);
    syncSearchAffordance();
  });
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      const failedShotIds = form.querySelector("input[name='failedShotIds']");
      if (failedShotIds instanceof HTMLInputElement) {
        const value = failedShotIds.value.trim();
        if (value.length > 0 && !/^shot_[\\w-]+(\\s*,\\s*shot_[\\w-]+)*$/.test(value)) {
          event.preventDefault();
          const next = failedShotIds.nextElementSibling;
          if (!next || !(next instanceof HTMLElement) || !next.classList.contains("field-error")) {
            const message = document.createElement("div");
            message.className = "field-error";
            message.textContent = "형식: shot_1,shot_2";
            failedShotIds.insertAdjacentElement("afterend", message);
          }
          toast("입력 검증", "failedShotIds 형식이 올바르지 않습니다.", "warn", 3200);
          failedShotIds.focus();
          return;
        }
      }
      const submit = form.querySelector("button[type='submit']");
      if (submit instanceof HTMLButtonElement) {
        if (submit.dataset.busy === "1") {
          event.preventDefault();
          return;
        }
        submit.dataset.busy = "1";
        submit.classList.add("submit-loading");
        submit.disabled = true;
        form.setAttribute("aria-busy", "true");
      }
      const runGroup = form.dataset.runGroup;
      if (runGroup) {
        document.querySelectorAll("form[data-run-group='" + runGroup + "'] button[type='submit']").forEach((button) => {
          if (!(button instanceof HTMLButtonElement)) return;
          button.dataset.busy = "1";
          button.classList.add("submit-loading");
          button.disabled = true;
        });
      }
      syncPrimaryAction();
    });
  });
  document.querySelectorAll("[data-tooltip]").forEach((node) => {
    if (!(node instanceof HTMLElement) || node.title) return;
    const text = cleanText(node.dataset.tooltip);
    if (!text) return;
    node.title = text;
    if (!node.hasAttribute("aria-label")) node.setAttribute("aria-label", text);
  });
  document.querySelectorAll("[role='button']").forEach((node) => {
    if (!(node instanceof HTMLElement) || node.dataset.shellKeyboardBound === "1") return;
    node.dataset.shellKeyboardBound = "1";
    node.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      node.click();
    });
  });
  const initialUrl = new URL(window.location.href);
  const message = cleanText(initialUrl.searchParams.get("message"));
  const error = cleanText(initialUrl.searchParams.get("error"));
  if (message && !hasInlineFlash(".notice,.success-state", message)) toast("성공", message, "ok");
  if (error && !hasInlineFlash(".error,.error-state", error)) {
    const classification = classifyError(error);
    toast(classification.label, error, classification.tone, 7000);
  }
  const runLive = document.getElementById("run-profile-live");
  if (runLive instanceof HTMLElement) {
    const episodeId = cleanText(runLive.dataset.episodeId);
    const hintForError = (msg) => {
      const text = String(msg || "").toLowerCase();
      if (text.includes("shots.json")) return "힌트: 먼저 COMPILE_SHOTS를 실행하세요.";
      if (text.includes("redis") || text.includes("queue") || text.includes("503") || text.includes("unavailable")) return "힌트: /ui/health를 확인하세요.";
      return "힌트: /ui/jobs에서 마지막 실패 작업을 확인하세요.";
    };
    const renderLive = (item) => {
      runLive.textContent = "";
      if (!item) {
        runLive.textContent = "최근 실행 이력이 없습니다.";
        return;
      }
      const status = String(item.status || "UNKNOWN");
      const type = String(item.type || "-");
      const progress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0;
      const jobId = cleanText(item.id);
      const base = "최근 작업: " + type + " / " + status + " / " + progress + "%";
      if (status === "FAILED") {
        const lastError = String(item.lastError || "(none)");
        runLive.classList.remove("notice");
        runLive.classList.add("error");
        runLive.textContent = base + " | " + lastError + " | " + hintForError(lastError);
        return;
      }
      runLive.classList.remove("error");
      runLive.classList.add("notice");
      runLive.append(document.createTextNode(base));
      if (jobId) {
        const link = document.createElement("a");
        link.href = "/ui/jobs/" + encodeURIComponent(jobId);
        link.textContent = " (작업)";
        runLive.append(link);
      }
    };
    const poll = async () => {
      if (!episodeId) return;
      try {
        const response = await fetch("/api/jobs?episodeId=" + encodeURIComponent(episodeId) + "&limit=10", { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error("poll failed: " + response.status);
        const json = await response.json();
        const list = Array.isArray(json && json.data) ? json.data : [];
        renderLive(list.length > 0 ? list[0] : null);
      } catch (err) {
        runLive.classList.remove("notice");
        runLive.classList.add("error");
        runLive.textContent = "상태 새로고침 실패: " + String(err);
      }
    };
    let timer = null;
    const startPolling = () => {
      if (timer !== null) return;
      timer = window.setInterval(() => { void poll(); }, 5000);
    };
    const stopPolling = () => {
      if (timer === null) return;
      window.clearInterval(timer);
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
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    });
  }
  if (shellPrimaryAction instanceof HTMLButtonElement) {
    shellPrimaryAction.addEventListener("click", () => {
      const primary = primaryActionNode();
      if (!(primary instanceof HTMLElement)) return;
      primary.focus();
      primary.click();
    });
  }
  if (shellFilterAction instanceof HTMLButtonElement) {
    shellFilterAction.addEventListener("click", () => {
      if (focusSearchField()) speak("필터 입력으로 이동했습니다.");
    });
  }
  if (shellOpenCurrent instanceof HTMLButtonElement) {
    shellOpenCurrent.addEventListener("click", () => {
      if (currentObjectRecord) navigateTo(currentObjectRecord.href, true);
    });
  }
  if (shellPinCurrent instanceof HTMLButtonElement) {
    shellPinCurrent.addEventListener("click", () => {
      if (!currentObjectRecord) return;
      const pinned = togglePinnedObject(currentObjectRecord);
      syncCurrentObjectControls();
      renderPalette();
      toast(pinned ? "Pin 추가" : "Pin 해제", currentObjectRecord.label, "ok", 2200);
    });
  }
  if (shellReturnLink instanceof HTMLButtonElement) {
    shellReturnLink.addEventListener("click", () => {
      if (currentReturnTarget) navigateTo(currentReturnTarget.href, false);
    });
  }
  if (shellCopyLink instanceof HTMLButtonElement) {
    shellCopyLink.addEventListener("click", () => {
      void copyDeepLink();
    });
  }
  const updateClock = () => {
    if (!(shellLiveClock instanceof HTMLElement)) return;
    const formatter = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    shellLiveClock.textContent = formatter.format(new Date());
  };
  updateClock();
  window.setInterval(updateClock, 1000);
  translateSubtree(document.body);
  const translatedTitle = translateValue(document.title);
  if (translatedTitle !== document.title) document.title = translatedTitle;
  applyShellGrammar(document.body);
  syncShellState();
  renderPalette(cleanText(readPaletteState().query));
  const observer = new MutationObserver((mutations) => {
    const dirtyRoots = [];
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        translateSubtree(node);
        if (node instanceof HTMLElement) dirtyRoots.push(node);
        else if (node.parentElement instanceof HTMLElement) dirtyRoots.push(node.parentElement);
      });
      if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) dirtyRoots.push(mutation.target);
    });
    dirtyRoots.forEach((node) => applyShellGrammar(node));
    syncPrimaryAction();
    syncShellState();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "disabled",
      "aria-disabled",
      "data-primary-action",
      "data-shell-current-object",
      "data-shell-object-kind",
      "data-shell-object-id",
      "data-shell-command",
      "data-shell-command-action",
      "data-shell-command-href"
    ]
  });
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
    const lowerKey = event.key.toLowerCase();
    if (lowerKey === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
      event.preventDefault();
      if (isPaletteOpen()) closePalette();
      else openPalette();
      return;
    }
    if (isPaletteOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (paletteItems.length) {
          paletteActiveIndex = (paletteActiveIndex + 1) % paletteItems.length;
          renderPalette();
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (paletteItems.length) {
          paletteActiveIndex = (paletteActiveIndex - 1 + paletteItems.length) % paletteItems.length;
          renderPalette();
        }
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        executePaletteItem(paletteItems[paletteActiveIndex]);
      }
      return;
    }
    if (shortcut instanceof HTMLElement && shortcut.classList.contains("open") && event.key !== "Escape" && event.key !== "Tab" && event.key !== "?") return;
    if (editing) return;
    if (event.key === "?") {
      event.preventDefault();
      if (shortcut instanceof HTMLElement && shortcut.classList.contains("open")) closeDialog();
      else openDialog();
      return;
    }
    if (event.key === "Escape") {
      if (shortcut instanceof HTMLElement && shortcut.classList.contains("open")) {
        event.preventDefault();
        closeDialog();
      }
      pendingGo = "";
      if (pendingGoTimer !== null) window.clearTimeout(pendingGoTimer);
      return;
    }
    if (lowerKey === "g") {
      pendingGo = "g";
      if (pendingGoTimer !== null) window.clearTimeout(pendingGoTimer);
      pendingGoTimer = window.setTimeout(() => {
        pendingGo = "";
      }, 1500);
      speak("이동 모드입니다. d 대시보드, s 스튜디오, e 에피소드, j 작업, h 상태, a 에셋, c 캐릭터, n 생성기, p 퍼블리시를 누르세요.");
      return;
    }
    if (pendingGo === "g") {
      const chord = "g " + lowerKey;
      pendingGo = "";
      const match = flatNav.find((item) => String(item.hotkey || "").toLowerCase() === chord);
      if (match) {
        event.preventDefault();
        window.location.href = match.href;
      }
      return;
    }
    if (lowerKey === "r") {
      const primary = primaryActionNode();
      if (primary instanceof HTMLElement) {
        event.preventDefault();
        primary.click();
      }
      return;
    }
    if (event.key === "/") {
      if (focusSearchField()) event.preventDefault();
    }
  });
  window.addEventListener("beforeunload", () => {
    observer.disconnect();
  });
})();
`;
