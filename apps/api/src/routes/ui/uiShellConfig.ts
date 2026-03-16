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

export const UI_SHELL_FLAT_NAV = UI_SHELL_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    groupKey: group.key,
    groupLabel: group.label
  }))
);
