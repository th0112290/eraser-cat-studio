import type { SeoChapter, SeoMetadata } from "./types";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toTagCandidates(topic: string): string[] {
  return normalizeWhitespace(topic)
    .split(/[\s,.;:!?/\\|()[\]{}]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 2);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function buildChapters(topic: string): SeoChapter[] {
  const shortTopic = topic.length > 48 ? `${topic.slice(0, 48)}...` : topic;
  return [
    { startSec: 0, title: `Hook: ${shortTopic}` },
    { startSec: 75, title: "Context and baseline" },
    { startSec: 215, title: "Core insights" },
    { startSec: 420, title: "Summary and action items" }
  ];
}

export function generateSeoMetadata(input: {
  episodeId: string;
  topic: string;
  plannedPublishAt: Date;
}): SeoMetadata {
  const topic = normalizeWhitespace(input.topic);
  const publishDate = input.plannedPublishAt.toISOString().slice(0, 10);
  const tags = unique([
    ...toTagCandidates(topic).slice(0, 8),
    "eraser-cat-studio",
    "analysis",
    "education"
  ]);

  return {
    title: `${topic} | Eraser Cat Studio`,
    description: [
      `${topic} explained in around 10 minutes.`,
      `Episode: ${input.episodeId}`,
      `Publish: ${publishDate}`
    ].join("\n"),
    tags,
    chapters: buildChapters(topic),
    pinnedComment: [
      "Thanks for watching.",
      "Share your key takeaway in the comments.",
      `Scheduled publish date: ${publishDate}`
    ].join("\n")
  };
}
