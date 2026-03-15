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
    label: "Observe",
    description: "Queue posture, runtime state, and recovery visibility.",
    items: [
      {
        href: "/ui",
        label: "Dashboard",
        description: "Global snapshot, launch pads, and operator entry paths.",
        hotkey: "g d"
      },
      {
        href: "/ui/jobs",
        label: "Jobs",
        description: "Job queue telemetry, failures, and progress follow-through.",
        hotkey: "g j"
      },
      {
        href: "/ui/episodes",
        label: "Episodes",
        description: "Episode queue state, dispatch, and object-level follow-up.",
        hotkey: "g e"
      },
      {
        href: "/ui/health",
        label: "Health",
        description: "Dependency state, dedup guard, and recovery commands.",
        hotkey: "g h"
      }
    ]
  },
  {
    key: "create",
    label: "Create",
    description: "Work creation lanes with obvious action hierarchy.",
    items: [
      {
        href: "/ui/studio",
        label: "Studio",
        description: "Cross-object creation surface for asset, pack, and episode flow.",
        hotkey: "g s"
      },
      {
        href: "/ui/character-generator",
        label: "Generator",
        description: "Candidate generation, reference routing, and HITL pick flow.",
        hotkey: "g n"
      },
      {
        href: "/ui/assets",
        label: "Assets",
        description: "Asset intake, QC inspection, and preview verification.",
        hotkey: "g a"
      }
    ]
  },
  {
    key: "review",
    label: "Review",
    description: "Inspection, approval, rerender, and handoff surfaces.",
    items: [
      {
        href: "/ui/characters",
        label: "Characters",
        description: "Character pack review, compare, activation, and rollback context.",
        hotkey: "g c"
      },
      {
        href: "/ui/publish",
        label: "Publish",
        description: "Publish handoff, final checks, and downstream shipping.",
        hotkey: "g p"
      },
      {
        href: "/ui/hitl",
        label: "HITL",
        description: "Human-in-the-loop rerender queue and recovery loop.",
        hotkey: "g t"
      },
      {
        href: "/ui/artifacts",
        label: "Artifacts",
        description: "Output inventory, artifact paths, and follow-up quick links."
      }
    ]
  },
  {
    key: "system",
    label: "System",
    description: "Rules, evidence, rollout signals, and benchmark context.",
    items: [
      {
        href: "/ui/profiles",
        label: "Profiles",
        description: "Channel and mascot profile evidence across shared artifact roots."
      },
      {
        href: "/ui/channel-bible",
        label: "ChannelBible",
        description: "Channel rule editing and schema-backed control state.",
        hotkey: "g u"
      },
      {
        href: "/ui/rollouts",
        label: "Rollouts",
        description: "Rollout signals, verdicts, and raw artifact drill-down.",
        hotkey: "g r"
      },
      {
        href: "/ui/benchmarks",
        label: "Benchmarks",
        description: "Benchmark matrices, regressions, and candidate evidence.",
        hotkey: "g b"
      }
    ]
  }
];

export const UI_SHELL_SHORTCUTS: UiShellShortcut[] = [
  { key: "?", action: "Open or close shortcut help" },
  { key: "Esc", action: "Close an open dialog or clear a pending go-to sequence" },
  { key: "/", action: "Focus the first search or filter field" },
  { key: "r", action: "Run the page primary action" },
  { key: "g d", action: "Go to Dashboard" },
  { key: "g s", action: "Go to Studio" },
  { key: "g e", action: "Go to Episodes" },
  { key: "g j", action: "Go to Jobs" },
  { key: "g h", action: "Go to Health" },
  { key: "g a", action: "Go to Assets" },
  { key: "g n", action: "Go to Character Generator" },
  { key: "g c", action: "Go to Characters" },
  { key: "g p", action: "Go to Publish" },
  { key: "g t", action: "Go to HITL" },
  { key: "g u", action: "Go to ChannelBible" },
  { key: "g r", action: "Go to Rollouts" },
  { key: "g b", action: "Go to Benchmarks" }
];

export const UI_SHELL_FLAT_NAV = UI_SHELL_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    groupKey: group.key,
    groupLabel: group.label
  }))
);
