export const UI_TEXT = {
  assets: {
    title: "에셋 검토 워크벤치",
    intro: "오케스트레이션은 스튜디오에서 처리하고, 이 화면은 입력, 검토, 점검, 다음 액션 결정에 집중합니다.",
    upload: "입력",
    uploadResultIdle: "대기 중",
    uploadInProgress: "업로드 중...",
    uploadAction: "업로드 후 검토 열기",
    recentAssets: "검토 큐",
    filterPlaceholder: "ID / 타입 / 상태 / QC로 검색",
    selectedAsset: "선택된 에셋 점검",
    nextActions: "다음 액션",
    reviewProtocol: "검토 절차",
    noAssets: "에셋이 없습니다.",
    noSelectedAsset: "점검할 에셋이 선택되지 않았습니다.",
    noPreviewImages: "사용 가능한 프리뷰 이미지가 없습니다.",
    openJson: "JSON 열기",
    openPreview: "프리뷰 열기",
    localPreviewMissing: "로컬 프리뷰 파일이 아직 없습니다.",
    columns: {
      id: "ID",
      type: "타입",
      status: "상태",
      qc: "QC",
      mime: "MIME",
      size: "크기",
      created: "생성 시각"
    }
  },
  episodes: {
    title: "에피소드",
    recent: "최근 에피소드",
    createAndEnqueue: "에피소드 생성 후 큐 등록",
    quickLinksJobs: "작업 열기",
    quickLinksArtifacts: "산출물 열기",
    listHint: "목록은 7초마다 자동 새로고침됩니다. / 키로 검색으로 이동할 수 있습니다.",
    tableFilterPlaceholder: "id / topic / status 검색",
    localFilterHint: "필터는 현재 페이지에만 적용됩니다.",
    noEpisodes: "에피소드가 아직 없습니다."
  },
  jobs: {
    title: "작업",
    latest: "최근 100개 작업",
    latestBadge: "최신순",
    filterPlaceholder: "작업 ID / 에피소드 / 상태로 검색",
    noJobs: "작업이 아직 없습니다. 대시보드나 에피소드에서 먼저 시작하세요."
  },
  hitl: {
    title: "HITL 재렌더",
    runAction: "선택한 재렌더 실행",
    failedJobs: "실패한 작업",
    filterPlaceholder: "작업 / 에피소드 / 오류로 검색",
    failedShotHelp: "형식: shot_1,shot_2",
    failedShotHint: "여러 값은 쉼표로 구분하세요.",
    noFailedJobs: "현재 실패한 작업이 없습니다."
  },
  publish: {
    title: "퍼블리시",
    runAction: "퍼블리시 실행",
    episodeHelp: "에피소드 상세의 id 값을 사용하세요.",
    statusHint: "에피소드 상태가 COMPLETED 또는 PREVIEW_READY일 때 권장됩니다."
  },
  artifacts: {
    title: "산출물",
    openArtifacts: "/artifacts 열기",
    openEpisodes: "에피소드 열기",
    quickLinkAction: "빠른 링크 열기",
    episodeHelp: "이 에피소드의 빠른 링크를 표시합니다.",
    indexTitle: "out/ 인덱스",
    indexFilterPlaceholder: "파일 / 경로로 검색",
    noArtifacts: "산출물이 없습니다."
  },
  rollouts: {
    title: "롤아웃",
    subtitle: "로컬, 사이드카, 메인 레포의 out/ 루트 전반에서 벤치마크와 롤아웃 JSON 산출물을 확인합니다.",
    openHealth: "상태 열기",
    openArtifacts: "산출물 열기",
    sourcesTitle: "산출물 소스",
    sourcesHint: "보드는 우선순위 순서대로 후보 out/ 루트를 스캔하며, 일부 데이터가 없어도 동작합니다.",
    tableTitle: "롤아웃 신호",
    filterPlaceholder: "신호 / 상태 / 판정 / 소스로 검색",
    noSignals: "롤아웃 또는 벤치마크 산출물이 없습니다."
  },
  benchmarks: {
    title: "벤치마크",
    subtitle: "로컬, 사이드카, 메인 레포의 out/ 루트 전반에서 백엔드 벤치마크 매트릭스와 에피소드 회귀 리포트를 확인합니다.",
    openRollouts: "롤아웃 열기",
    openArtifacts: "산출물 열기",
    sourcesTitle: "벤치마크 소스",
    sourcesHint: "뷰어는 공유 out/ 루트를 스캔하며 누락된 JSON 산출물도 허용합니다.",
    backendTitle: "백엔드 벤치마크 매트릭스",
    backendFilterPlaceholder: "benchmark / backend / renderer / status 검색",
    noBackendRows: "백엔드 벤치마크 매트릭스가 없습니다.",
    regressionTitle: "에피소드 회귀 리포트",
    regressionFilterPlaceholder: "bundle / profile / issue / source 검색",
    noRegressionRows: "에피소드 회귀 리포트가 없습니다."
  },
  common: {
    searchPlaceholder: "검색",
    details: "상세",
    open: "열기"
  }
} as const;

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderTableEmptyRow(colspan: number, message: string): string {
  return `<tr><td colspan="${colspan}"><div class="notice" role="status" aria-live="polite">${esc(message)}</div></td></tr>`;
}

export function renderInlineError(message: string): string {
  return `<div class="error" role="alert">${esc(message)}</div>`;
}
