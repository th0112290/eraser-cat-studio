export type UiShellNavItem = {
  href: string;
  label: string;
  description: string;
  hotkey?: string;
};

export type UiShellNavGroup = {
  key: string;
  label: string;
  description: string;
  items: UiShellNavItem[];
};

export type UiShellShortcut = {
  key: string;
  action: string;
};

export type UiShellPaletteAction = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  action: string;
  hotkey?: string;
};

export type UiShellJumpTarget = {
  key: string;
  label: string;
  description: string;
  prefixes: string[];
  queryKey: string;
  hrefBase: string;
  example: string;
  mode: "path" | "query" | "segment";
};

export const UI_SHELL_NAV_GROUPS: UiShellNavGroup[] = [
  {
    key: "observe",
    label: "관찰",
    description: "큐 상태, 런타임 신호, 복구 경로를 먼저 확인합니다.",
    items: [
      {
        href: "/ui",
        label: "대시보드",
        description: "전체 스냅샷, 진입점, 운영 시작 지점을 한 번에 확인합니다.",
        hotkey: "g d"
      },
      {
        href: "/ui/jobs",
        label: "작업",
        description: "작업 큐 텔레메트리, 실패, 진행 상황을 추적합니다.",
        hotkey: "g j"
      },
      {
        href: "/ui/episodes",
        label: "에피소드",
        description: "에피소드 큐 상태와 오브젝트 단위 후속 조치를 관리합니다.",
        hotkey: "g e"
      },
      {
        href: "/ui/health",
        label: "상태",
        description: "의존성 상태, 중복 방지, 복구 명령을 확인합니다.",
        hotkey: "g h"
      }
    ]
  },
  {
    key: "create",
    label: "생성",
    description: "작업 생성 동선을 분명하게 나눠 둔 구간입니다.",
    items: [
      {
        href: "/ui/studio",
        label: "스튜디오",
        description: "에셋, 팩, 에피소드 흐름을 오브젝트 단위로 연결합니다.",
        hotkey: "g s"
      },
      {
        href: "/ui/character-generator",
        label: "생성기",
        description: "후보 생성, 참조 라우팅, HITL 선택 흐름을 관리합니다.",
        hotkey: "g n"
      },
      {
        href: "/ui/assets",
        label: "에셋",
        description: "에셋 입력, QC 점검, 프리뷰 확인을 진행합니다.",
        hotkey: "g a"
      }
    ]
  },
  {
    key: "review",
    label: "검토",
    description: "점검, 승인, 재렌더, 인계 화면을 모은 구간입니다.",
    items: [
      {
        href: "/ui/characters",
        label: "캐릭터",
        description: "캐릭터 팩 검토, 비교, 활성화, 롤백 맥락을 봅니다.",
        hotkey: "g c"
      },
      {
        href: "/ui/publish",
        label: "퍼블리시",
        description: "최종 확인 후 다운스트림 배포로 넘기는 단계입니다.",
        hotkey: "g p"
      },
      {
        href: "/ui/hitl",
        label: "HITL",
        description: "사람 개입 재렌더 큐와 복구 루프를 다룹니다.",
        hotkey: "g t"
      },
      {
        href: "/ui/artifacts",
        label: "산출물",
        description: "출력 목록, 산출물 경로, 후속 링크를 확인합니다."
      }
    ]
  },
  {
    key: "system",
    label: "시스템",
    description: "규칙, 근거, 롤아웃 신호, 벤치마크 맥락을 제공합니다.",
    items: [
      {
        href: "/ui/profiles",
        label: "프로필",
        description: "채널과 마스코트 프로필 근거를 공용 산출물 루트에서 확인합니다."
      },
      {
        href: "/ui/channel-bible",
        label: "채널 바이블",
        description: "채널 규칙과 스키마 기반 제어 상태를 편집합니다.",
        hotkey: "g u"
      },
      {
        href: "/ui/rollouts",
        label: "롤아웃",
        description: "롤아웃 신호, 판정, 원시 산출물 근거를 확인합니다.",
        hotkey: "g r"
      },
      {
        href: "/ui/benchmarks",
        label: "벤치마크",
        description: "벤치마크 매트릭스, 회귀, 후보 근거를 검토합니다.",
        hotkey: "g b"
      }
    ]
  }
];

export const UI_SHELL_SHORTCUTS: UiShellShortcut[] = [
  { key: "Ctrl/Cmd + K", action: "전역 command palette를 엽니다." },
  { key: "?", action: "단축키 도움말을 열거나 닫습니다." },
  { key: "Esc", action: "열린 대화상자를 닫거나 이동 대기 상태를 해제합니다." },
  { key: "/", action: "첫 번째 검색 또는 필터 입력으로 이동합니다." },
  { key: "r", action: "현재 페이지의 기본 액션을 실행합니다." },
  { key: "g d", action: "대시보드로 이동" },
  { key: "g s", action: "스튜디오로 이동" },
  { key: "g e", action: "에피소드로 이동" },
  { key: "g j", action: "작업으로 이동" },
  { key: "g h", action: "상태로 이동" },
  { key: "g a", action: "에셋으로 이동" },
  { key: "g n", action: "캐릭터 생성기로 이동" },
  { key: "g c", action: "캐릭터로 이동" },
  { key: "g p", action: "퍼블리시로 이동" },
  { key: "g t", action: "HITL로 이동" },
  { key: "g u", action: "채널 바이블로 이동" },
  { key: "g r", action: "롤아웃으로 이동" },
  { key: "g b", action: "벤치마크로 이동" }
];

export const UI_SHELL_PALETTE_ACTIONS: UiShellPaletteAction[] = [
  {
    id: "focus-filter",
    label: "필터 포커스",
    description: "현재 페이지의 첫 번째 검색 또는 필터 입력으로 이동합니다.",
    keywords: ["filter", "search", "focus", "/"],
    action: "focus-filter",
    hotkey: "/"
  },
  {
    id: "run-primary",
    label: "기본 액션 실행",
    description: "현재 페이지에서 지정된 기본 액션을 바로 실행합니다.",
    keywords: ["run", "primary", "action", "execute", "r"],
    action: "run-primary",
    hotkey: "r"
  },
  {
    id: "open-current-object",
    label: "현재 오브젝트 열기",
    description: "현재 페이지가 가리키는 오브젝트의 대표 상세 경로로 이동합니다.",
    keywords: ["current", "object", "detail", "open"],
    action: "open-current-object"
  },
  {
    id: "copy-deep-link",
    label: "딥링크 복사",
    description: "현재 페이지 URL을 딥링크로 복사합니다.",
    keywords: ["copy", "deep link", "url", "share"],
    action: "copy-deep-link"
  },
  {
    id: "open-return-link",
    label: "복귀 링크 열기",
    description: "URL에 포함된 returnTo 경로로 되돌아갑니다.",
    keywords: ["return", "back", "returnTo"],
    action: "open-return-link"
  },
  {
    id: "toggle-pin-current",
    label: "현재 오브젝트 pin",
    description: "현재 오브젝트를 pins 목록에 추가하거나 제거합니다.",
    keywords: ["pin", "favorite", "save", "current"],
    action: "toggle-pin-current"
  },
  {
    id: "open-shortcuts",
    label: "단축키 도움말",
    description: "현재 셸의 키보드 단축키 목록을 엽니다.",
    keywords: ["shortcut", "keyboard", "help", "?"],
    action: "open-shortcuts",
    hotkey: "?"
  }
];

export const UI_SHELL_JUMP_TARGETS: UiShellJumpTarget[] = [
  {
    key: "episode",
    label: "Episode",
    description: "에피소드 상세로 이동합니다.",
    prefixes: ["episode", "ep"],
    queryKey: "id",
    hrefBase: "/ui/episodes",
    example: "episode:ep_video_i2v_smoke",
    mode: "segment"
  },
  {
    key: "job",
    label: "Job",
    description: "작업 상세로 이동합니다.",
    prefixes: ["job"],
    queryKey: "id",
    hrefBase: "/ui/jobs",
    example: "job:clx_job_123",
    mode: "segment"
  },
  {
    key: "character-pack",
    label: "Character Pack",
    description: "캐릭터 팩 상세 쿼리로 이동합니다.",
    prefixes: ["pack", "character-pack", "cp"],
    queryKey: "characterPackId",
    hrefBase: "/ui/characters",
    example: "pack:clx_pack_123",
    mode: "query"
  },
  {
    key: "asset",
    label: "Asset",
    description: "에셋 상세 쿼리로 이동합니다.",
    prefixes: ["asset"],
    queryKey: "assetId",
    hrefBase: "/ui/assets",
    example: "asset:asset_123",
    mode: "query"
  },
  {
    key: "artifact-episode",
    label: "Artifact Index",
    description: "에피소드 산출물 인덱스로 이동합니다.",
    prefixes: ["artifact", "artifacts", "out"],
    queryKey: "episodeId",
    hrefBase: "/ui/artifacts",
    example: "artifact:ep_video_i2v_smoke",
    mode: "query"
  },
  {
    key: "artifact-path",
    label: "Artifact Path",
    description: "롤아웃 artifact detail 경로로 이동합니다.",
    prefixes: ["path", "json", "log", "file"],
    queryKey: "path",
    hrefBase: "/ui/rollouts/detail",
    example: "path:rollouts/2025-03-01/result.json",
    mode: "query"
  }
];

export const UI_SHELL_STORAGE_KEYS = {
  recentObjects: "ecs.ui.shell.recentObjects.v1",
  pinnedObjects: "ecs.ui.shell.pinnedObjects.v1",
  paletteState: "ecs.ui.shell.paletteState.v1"
} as const;

export const UI_SHELL_PALETTE_SHORTCUTS = {
  open: "Mod+K"
} as const;

export const UI_SHELL_HELPER_CONTRACT = {
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
} as const;

export const UI_SHELL_FLAT_NAV = UI_SHELL_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    groupKey: group.key,
    groupLabel: group.label
  }))
);
