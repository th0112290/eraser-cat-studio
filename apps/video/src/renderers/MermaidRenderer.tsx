import { interpolate, spring } from "remotion";
import type {
  RendererFinishProfile,
  RendererVisualObject,
  RendererVisualObjectKind
} from "./types";

type MermaidRendererProps = {
  width: number;
  height: number;
  kind?: RendererVisualObjectKind;
  title: string;
  subtitle?: string;
  body: string;
  items: string[];
  badges: string[];
  supportingObjects: RendererVisualObject[];
  localFrame: number;
  fps: number;
  emphasisAtFrame: number;
  finishProfile: RendererFinishProfile;
};

type DiagramNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  emphasis?: boolean;
};

type DiagramEdge = {
  from: string;
  to: string;
  emphasis?: boolean;
};

type DiagramSpec = {
  syntax: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clipText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function startCaseLabel(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .split("_")
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function resolveNodes(kind: RendererVisualObjectKind | undefined, items: string[], supportingObjects: RendererVisualObject[]): DiagramSpec {
  const labels = items.length > 0 ? items : supportingObjects.map((object) => object.title ?? object.body ?? object.objectId);
  const cleanLabels = labels.map((label) => clipText(label, 30)).slice(0, 6);

  if (kind === "comparison_board") {
    const left = cleanLabels.slice(0, 2);
    const right = cleanLabels.slice(2, 4);
    return {
      syntax: "flowchart LR",
      nodes: [
        { id: "lhs-1", label: left[0] ?? "Pressure", x: 0.12, y: 0.3, width: 0.28, height: 0.16 },
        { id: "lhs-2", label: left[1] ?? "Constraint", x: 0.12, y: 0.56, width: 0.28, height: 0.16 },
        { id: "rhs-1", label: right[0] ?? "Relief", x: 0.6, y: 0.3, width: 0.28, height: 0.16, emphasis: true },
        { id: "rhs-2", label: right[1] ?? "Tradeoff", x: 0.6, y: 0.56, width: 0.28, height: 0.16 }
      ],
      edges: [
        { from: "lhs-1", to: "rhs-1", emphasis: true },
        { from: "lhs-2", to: "rhs-2" }
      ]
    };
  }

  if (kind === "process_flow") {
    const nodes = cleanLabels.slice(0, 4).map((label, index, list) => ({
      id: `step-${index + 1}`,
      label: `${index + 1}. ${label}`,
      x: 0.08 + index * (0.8 / Math.max(1, list.length - 1)),
      y: 0.46,
      width: 0.18,
      height: 0.16,
      emphasis: index === list.length - 1
    }));
    return {
      syntax: "flowchart LR",
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        from: nodes[index].id,
        to: node.id,
        emphasis: index === nodes.length - 2
      }))
    };
  }

  if (kind === "timeline") {
    const nodes = cleanLabels.slice(0, 5).map((label, index, list) => ({
      id: `milestone-${index + 1}`,
      label,
      x: 0.06 + index * (0.84 / Math.max(1, list.length - 1)),
      y: index % 2 === 0 ? 0.32 : 0.58,
      width: 0.16,
      height: 0.14,
      emphasis: index === list.length - 1
    }));
    return {
      syntax: "timeline",
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        from: nodes[index].id,
        to: node.id,
        emphasis: index === nodes.length - 2
      }))
    };
  }

  if (kind === "labeled_diagram") {
    const orbit = cleanLabels.slice(0, 4);
    return {
      syntax: "graph TD",
      nodes: [
        { id: "core", label: "Core System", x: 0.38, y: 0.42, width: 0.24, height: 0.18, emphasis: true },
        { id: "orbit-1", label: orbit[0] ?? "Diagnosis", x: 0.14, y: 0.18, width: 0.2, height: 0.14 },
        { id: "orbit-2", label: orbit[1] ?? "Procedure", x: 0.68, y: 0.18, width: 0.2, height: 0.14 },
        { id: "orbit-3", label: orbit[2] ?? "Recovery", x: 0.14, y: 0.68, width: 0.2, height: 0.14 },
        { id: "orbit-4", label: orbit[3] ?? "Aftercare", x: 0.68, y: 0.68, width: 0.2, height: 0.14 }
      ],
      edges: [
        { from: "orbit-1", to: "core" },
        { from: "orbit-2", to: "core" },
        { from: "core", to: "orbit-3", emphasis: true },
        { from: "core", to: "orbit-4" }
      ]
    };
  }

  const nodes = cleanLabels.slice(0, 6).map((label, index) => ({
    id: `card-${index + 1}`,
    label,
    x: index % 2 === 0 ? 0.1 : 0.54,
    y: 0.24 + Math.floor(index / 2) * 0.2,
    width: 0.3,
    height: 0.14,
    emphasis: index === 0
  }));
  return {
    syntax: "mindmap",
    nodes,
    edges: nodes.slice(1).map((node) => ({
      from: nodes[0].id,
      to: node.id,
      emphasis: node.id === nodes[1]?.id
    }))
  };
}

function nodeCenter(node: DiagramNode, width: number, height: number) {
  return {
    x: (node.x + node.width * 0.5) * width,
    y: (node.y + node.height * 0.5) * height
  };
}

function edgePath(from: DiagramNode, to: DiagramNode, width: number, height: number): string {
  const start = nodeCenter(from, width, height);
  const end = nodeCenter(to, width, height);
  const curve = Math.max(40, Math.abs(end.x - start.x) * 0.22);
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${(start.x + curve).toFixed(1)} ${start.y.toFixed(1)}, ${(end.x - curve).toFixed(1)} ${end.y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function resolveAccent(kind: RendererVisualObjectKind | undefined, tone: RendererFinishProfile["tone"]) {
  if (kind === "labeled_diagram" || tone === "medical_soft") {
    return "#7ee7c8";
  }
  if (kind === "comparison_board" || tone === "economy_crisp") {
    return "#ffd166";
  }
  return "#8ad6ff";
}

export const MermaidRenderer = ({
  width,
  height,
  kind,
  title,
  subtitle,
  body,
  items,
  badges,
  supportingObjects,
  localFrame,
  fps,
  emphasisAtFrame,
  finishProfile
}: MermaidRendererProps) => {
  const diagram = resolveNodes(kind, items, supportingObjects);
  const accent = resolveAccent(kind, finishProfile.tone);
  const pulseEnvelope = clamp(1 - Math.abs(localFrame - emphasisAtFrame) / 24, 0, 1);
  const leadBadge = kind === "timeline" ? "timeline" : kind === "comparison_board" ? "compare" : "diagram";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 22,
        border: "1px solid rgba(255, 255, 255, 0.16)",
        background: "linear-gradient(180deg, rgba(7, 12, 22, 0.96) 0%, rgba(5, 9, 18, 0.94) 100%)",
        overflow: "hidden",
        boxShadow: "0 18px 40px rgba(0, 0, 0, 0.32)"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: finishProfile.tintGradient,
          opacity: Math.min(0.15, finishProfile.tintOpacity * 1.4)
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          top: 18,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 14,
          alignItems: "start"
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "#d6e7ff",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase"
            }}
          >
            <span style={{ color: accent }}>Mermaid</span>
            <span>{leadBadge}</span>
            <span style={{ opacity: 0.66 }}>{diagram.syntax}</span>
          </div>

          <div
            style={{
              marginTop: 12,
              color: "#eff7ff",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 0.2
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: 8,
              maxWidth: width * 0.58,
              color: "rgba(232, 241, 255, 0.76)",
              fontSize: 19,
              lineHeight: 1.35
            }}
          >
            {subtitle ? `${subtitle} | ${clipText(body, 120)}` : clipText(body, 120)}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, maxWidth: width * 0.32 }}>
          {badges.map((badge) => (
            <div
              key={badge}
              style={{
                padding: "7px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255, 255, 255, 0.14)",
                background: "rgba(255, 255, 255, 0.05)",
                color: "#deebff",
                fontSize: 13,
                fontWeight: 600
              }}
            >
              {badge}
            </div>
          ))}
        </div>
      </div>

      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          overflow: "visible"
        }}
      >
        {diagram.edges.map((edge, index) => {
          const from = diagram.nodes.find((node) => node.id === edge.from);
          const to = diagram.nodes.find((node) => node.id === edge.to);
          if (!from || !to) {
            return null;
          }
          const reveal = clamp(
            interpolate(localFrame - index * 2, [0, Math.max(14, Math.floor(fps * 0.5))], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp"
            }),
            0,
            1
          );
          return (
            <path
              key={`${edge.from}:${edge.to}`}
              d={edgePath(from, to, width, height)}
              fill="none"
              stroke={edge.emphasis ? accent : "rgba(195, 214, 245, 0.42)"}
              strokeWidth={edge.emphasis ? 4 : 2.5}
              strokeDasharray="10 12"
              strokeDashoffset={28 * (1 - reveal)}
              style={{
                filter: edge.emphasis ? `drop-shadow(0 0 ${10 + pulseEnvelope * 10}px ${accent}66)` : undefined,
                opacity: 0.65 + reveal * 0.35
              }}
            />
          );
        })}
      </svg>

      {diagram.nodes.map((node, index) => {
        const reveal = clamp(
          spring({
            fps,
            frame: localFrame - 3 - index * 2,
            config: {
              damping: 14,
              stiffness: 124,
              mass: 0.7
            }
          }),
          0,
          1
        );
        const nodeAccent = node.emphasis ? accent : "rgba(255, 255, 255, 0.18)";
        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: node.x * width,
              top: node.y * height,
              width: node.width * width,
              height: node.height * height,
              borderRadius: 18,
              border: `1px solid ${nodeAccent}`,
              background: node.emphasis
                ? `linear-gradient(180deg, ${accent}22 0%, rgba(10, 16, 28, 0.92) 100%)`
                : "linear-gradient(180deg, rgba(14, 21, 36, 0.92) 0%, rgba(9, 14, 24, 0.9) 100%)",
              color: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "0 14px",
              fontSize: 17,
              fontWeight: node.emphasis ? 700 : 600,
              lineHeight: 1.25,
              boxShadow: node.emphasis ? `0 0 ${18 + pulseEnvelope * 12}px ${accent}33` : "0 12px 24px rgba(0, 0, 0, 0.22)",
              opacity: reveal,
              transform: `translateY(${interpolate(reveal, [0, 1], [16, 0])}px) scale(${0.96 + reveal * 0.04})`
            }}
          >
            {node.label}
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          bottom: 18,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 12,
          alignItems: "center",
          padding: "12px 14px",
          borderRadius: 16,
          border: "1px solid rgba(255, 255, 255, 0.12)",
          background: "rgba(6, 12, 22, 0.68)"
        }}
      >
        <div
          style={{
            color: accent,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase"
          }}
        >
          {diagram.syntax}
        </div>
        <div
          style={{
            color: "#e6f1ff",
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 1.3
          }}
        >
          {clipText(
            supportingObjects
              .map((object) => object.title ?? object.selectionReason ?? startCaseLabel(object.kind))
              .filter((value) => value && value.trim().length > 0)
              .slice(0, 3)
              .join(" | ") || body,
            140
          )}
        </div>
      </div>
    </div>
  );
};
