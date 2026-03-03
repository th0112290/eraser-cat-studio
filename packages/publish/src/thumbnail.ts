import fs from "node:fs";
import path from "node:path";
import type { ThumbnailArtifact, ThumbnailCropTemplate } from "./types";

const CROP_TEMPLATES: Record<string, ThumbnailCropTemplate> = {
  center_16_9: {
    name: "center_16_9",
    x: 0.0,
    y: 0.0,
    width: 1.0,
    height: 1.0
  },
  left_focus: {
    name: "left_focus",
    x: 0.0,
    y: 0.0,
    width: 0.82,
    height: 1.0
  },
  right_focus: {
    name: "right_focus",
    x: 0.18,
    y: 0.0,
    width: 0.82,
    height: 1.0
  }
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function pickTemplate(name?: string): ThumbnailCropTemplate {
  if (!name) {
    return CROP_TEMPLATES.center_16_9;
  }
  return CROP_TEMPLATES[name] ?? CROP_TEMPLATES.center_16_9;
}

function buildSvg(input: {
  topic: string;
  episodeId: string;
  template: ThumbnailCropTemplate;
  sourceFramePath: string | null;
}): string {
  const title = input.topic.length > 46 ? `${input.topic.slice(0, 46)}...` : input.topic;
  const source = input.sourceFramePath ?? "N/A";
  const templateText = `${input.template.name} (${input.template.x},${input.template.y},${input.template.width},${input.template.height})`;

  return [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1280\" height=\"720\" viewBox=\"0 0 1280 720\">",
    "  <defs>",
    "    <linearGradient id=\"bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">",
    "      <stop offset=\"0%\" stop-color=\"#1f3045\" />",
    "      <stop offset=\"100%\" stop-color=\"#0f1622\" />",
    "    </linearGradient>",
    "  </defs>",
    "  <rect width=\"1280\" height=\"720\" fill=\"url(#bg)\" />",
    "  <rect x=\"70\" y=\"100\" width=\"1140\" height=\"520\" rx=\"24\" fill=\"rgba(255,255,255,0.08)\" stroke=\"rgba(255,255,255,0.28)\" />",
    `  <text x=\"90\" y=\"170\" fill=\"#eaf2ff\" font-size=\"44\" font-family=\"Segoe UI, sans-serif\" font-weight=\"700\">${escapeXml(
      title
    )}</text>`,
    `  <text x=\"90\" y=\"230\" fill=\"#c7d8ef\" font-size=\"26\" font-family=\"Segoe UI, sans-serif\">Episode: ${escapeXml(
      input.episodeId
    )}</text>`,
    `  <text x=\"90\" y=\"275\" fill=\"#c7d8ef\" font-size=\"20\" font-family=\"Segoe UI, sans-serif\">Crop Template: ${escapeXml(
      templateText
    )}</text>`,
    `  <text x=\"90\" y=\"315\" fill=\"#c7d8ef\" font-size=\"18\" font-family=\"Segoe UI, sans-serif\">Source Frame: ${escapeXml(
      source
    )}</text>`,
    "  <text x=\"90\" y=\"580\" fill=\"#ffffff\" font-size=\"30\" font-family=\"Segoe UI, sans-serif\" font-weight=\"600\">THUMBNAIL MOCK</text>",
    "</svg>"
  ].join("\n");
}

export function generateThumbnailFromFrame(input: {
  episodeId: string;
  topic: string;
  outputDir: string;
  sourceFramePath?: string;
  templateName?: string;
}): ThumbnailArtifact {
  ensureDir(input.outputDir);

  const sourceFramePath =
    input.sourceFramePath && fs.existsSync(input.sourceFramePath)
      ? path.resolve(input.sourceFramePath)
      : null;

  const template = pickTemplate(input.templateName);
  const outputPath = path.join(input.outputDir, "thumbnail.svg");

  const svg = buildSvg({
    topic: input.topic,
    episodeId: input.episodeId,
    template,
    sourceFramePath
  });

  fs.writeFileSync(outputPath, `${svg}\n`, "utf8");

  return {
    sourceFramePath,
    outputPath,
    template
  };
}

export const THUMBNAIL_CROP_TEMPLATES = CROP_TEMPLATES;
