export type RetentionPoint = {
  timeSec: number;
  retentionPct: number;
};

export type RetentionCurve = {
  episodeId: string;
  source: string;
  uploadedAt: string;
  durationSec: number;
  averageRetentionPct: number;
  points: RetentionPoint[];
};

export type ShotTiming = {
  shotId: string;
  startSec: number;
  endSec: number;
  beatIds: string[];
};

export type DropoffSegment = {
  id: string;
  segmentKey: string;
  startSec: number;
  endSec: number;
  dropPct: number;
  slopePerSec: number;
  reason: string;
  primaryShotId: string | null;
  overlappingShotIds: string[];
};

export type DropoffThreshold = {
  minDropPct: number;
  mergeGapSec: number;
};

export type DropoffAnalysis = {
  episodeId: string;
  generatedAt: string;
  durationSec: number;
  threshold: DropoffThreshold;
  shotTimings: ShotTiming[];
  segments: DropoffSegment[];
};

export type ShortsCandidate = {
  id: string;
  segmentKey: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  score: number;
  reason: string;
  title: string;
  shotIds: string[];
};

export type CommunityPostDraft = {
  title: string;
  body: string;
  hashtags: string[];
};

export type TranslationTaskStub = {
  id: string;
  targetLanguage: string;
  status: "PENDING";
  sourceStartSec: number;
  sourceEndSec: number;
  notes: string;
};

export type RepurposePlan = {
  episodeId: string;
  generatedAt: string;
  shorts: ShortsCandidate[];
  communityPost: CommunityPostDraft;
  translationTasks: TranslationTaskStub[];
};
