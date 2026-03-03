import fs from "node:fs";

export type PronunciationDictionary = Record<string, string>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWordToken(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

export function loadPronunciationDictionary(filePath: string): PronunciationDictionary {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const dictionary: PronunciationDictionary = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof key !== "string" || typeof value !== "string") {
      continue;
    }
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    dictionary[normalizedKey] = normalizedValue;
  }

  return dictionary;
}

export function applyPronunciationDictionary(text: string, dictionary: PronunciationDictionary): string {
  let out = text;

  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of entries) {
    const pattern = isWordToken(from) ? `\\b${escapeRegExp(from)}\\b` : escapeRegExp(from);
    out = out.replace(new RegExp(pattern, "gi"), to);
  }

  return out;
}
