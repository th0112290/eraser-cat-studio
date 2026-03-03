export type QaSeverity = "info" | "warn" | "error";

export type QaCategory = "tone" | "risk" | "repetition" | "pacing" | "breath";

export type QaIssue = {
  id: string;
  severity: QaSeverity;
  category: QaCategory;
  message: string;
  line?: number;
  excerpt?: string;
  policyFlags?: string[];
};

const TARGET_MINUTES = 10;
const DEFAULT_WPM = 140;
const MIN_WORDS = 1000;
const MAX_WORDS = 1700;
const MAX_BREATH_WORDS = 24;

const BANNED_PHRASES = ["guaranteed win", "no risk", "100% safe", "secret hack", "instant results"];

const FORBIDDEN_WORDS = ["idiot", "stupid", "hate", "scam"];

const RISK_PATTERNS: Array<{ regex: RegExp; flag: string; message: string }> = [
  {
    regex: /\b\d{1,3}%\s*(guaranteed|guarantee)\b/i,
    flag: "deceptive-guarantee",
    message: "Avoid absolute guarantee claims tied to percentages."
  },
  {
    regex: /\bwithout\s+any\s+risk\b/i,
    flag: "no-risk-claim",
    message: "Avoid statements that imply zero risk."
  },
  {
    regex: /\bmedical\s+advice\b/i,
    flag: "regulated-domain",
    message: "Flag potential regulated advice for review."
  }
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  const tokens = text.match(/[A-Za-z0-9'_-]+/g);
  return tokens ? tokens.length : 0;
}

function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeSentenceForRepeat(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export function qaScript(script: string): QaIssue[] {
  const issues: QaIssue[] = [];
  const lines = script.replace(/\r\n/g, "\n").split("\n");
  let issueIndex = 1;

  const pushIssue = (issue: Omit<QaIssue, "id">) => {
    issues.push({
      id: `issue_${String(issueIndex).padStart(3, "0")}`,
      ...issue
    });
    issueIndex += 1;
  };

  const sentenceMap = new Map<string, { count: number; sample: string }>();
  const allSentences: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const lineWords = countWords(trimmed);
    if (lineWords > MAX_BREATH_WORDS) {
      pushIssue({
        severity: lineWords > 35 ? "error" : "warn",
        category: "breath",
        line: lineIndex + 1,
        message: `Line is too long for comfortable breath pacing (${lineWords} words).`,
        excerpt: trimmed
      });
    }

    const lowered = trimmed.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lowered.includes(phrase)) {
        pushIssue({
          severity: "error",
          category: "risk",
          line: lineIndex + 1,
          message: `Banned phrase detected: "${phrase}".`,
          excerpt: trimmed,
          policyFlags: ["banned-phrase", "policy-review"]
        });
      }
    }

    for (const word of FORBIDDEN_WORDS) {
      const regex = new RegExp(`\\b${word}\\b`, "i");
      if (regex.test(trimmed)) {
        pushIssue({
          severity: "error",
          category: "risk",
          line: lineIndex + 1,
          message: `Forbidden word detected: "${word}".`,
          excerpt: trimmed,
          policyFlags: ["forbidden-word", "policy-review"]
        });
      }
    }

    for (const pattern of RISK_PATTERNS) {
      if (pattern.regex.test(trimmed)) {
        pushIssue({
          severity: "warn",
          category: "risk",
          line: lineIndex + 1,
          message: pattern.message,
          excerpt: trimmed,
          policyFlags: [pattern.flag, "policy-review"]
        });
      }
    }

    const lineSentences = splitSentences(trimmed);
    for (const sentence of lineSentences) {
      allSentences.push(sentence);
      const normalized = normalizeSentenceForRepeat(sentence);
      if (countWords(normalized) < 4) {
        continue;
      }
      const current = sentenceMap.get(normalized);
      if (current) {
        current.count += 1;
      } else {
        sentenceMap.set(normalized, { count: 1, sample: sentence });
      }
    }
  }

  for (const value of sentenceMap.values()) {
    if (value.count >= 2) {
      pushIssue({
        severity: "warn",
        category: "repetition",
        message: `Repeated sentence pattern detected (${value.count}x).`,
        excerpt: value.sample
      });
    }
  }

  const totalWords = countWords(script);
  const targetWords = TARGET_MINUTES * DEFAULT_WPM;
  const estimatedMinutes = totalWords / DEFAULT_WPM;

  if (totalWords < MIN_WORDS) {
    pushIssue({
      severity: "warn",
      category: "pacing",
      message: `Script may be too short for ${TARGET_MINUTES} minutes (${totalWords} words, target around ${targetWords}).`
    });
  } else if (totalWords > MAX_WORDS) {
    pushIssue({
      severity: "warn",
      category: "pacing",
      message: `Script may be too long for ${TARGET_MINUTES} minutes (${totalWords} words, target around ${targetWords}).`
    });
  }

  const sentenceWordCounts = allSentences.map((item) => countWords(item)).filter((count) => count > 0);
  if (sentenceWordCounts.length > 0) {
    const averageSentenceWords =
      sentenceWordCounts.reduce((sum, count) => sum + count, 0) / sentenceWordCounts.length;

    if (averageSentenceWords > 22) {
      pushIssue({
        severity: "warn",
        category: "tone",
        message: `Average sentence length is high (${averageSentenceWords.toFixed(1)} words).`
      });
    }

    if (averageSentenceWords < 6) {
      pushIssue({
        severity: "warn",
        category: "tone",
        message: `Average sentence length is very short (${averageSentenceWords.toFixed(1)} words).`
      });
    }
  }

  const exclamationCount = (script.match(/!/g) ?? []).length;
  if (exclamationCount > 4) {
    pushIssue({
      severity: "warn",
      category: "tone",
      message: `High exclamation usage (${exclamationCount}) may reduce tone consistency.`
    });
  }

  const uppercaseTokens = script.match(/\b[A-Z]{4,}\b/g) ?? [];
  if (uppercaseTokens.length > 6) {
    pushIssue({
      severity: "warn",
      category: "tone",
      message: `Excessive all-caps tokens detected (${uppercaseTokens.length}).`
    });
  }

  const hedgeMatches = script.match(/\b(maybe|kind of|sort of|probably)\b/gi) ?? [];
  if (hedgeMatches.length > Math.max(4, Math.floor(allSentences.length * 0.15))) {
    pushIssue({
      severity: "warn",
      category: "tone",
      message: `Frequent hedging language detected (${hedgeMatches.length} occurrences).`
    });
  }

  if (estimatedMinutes < 7.5 || estimatedMinutes > 12.5) {
    pushIssue({
      severity: "info",
      category: "pacing",
      message: `Estimated read time is ${estimatedMinutes.toFixed(1)} minutes at ${DEFAULT_WPM} WPM.`
    });
  }

  return issues;
}
