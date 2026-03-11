export { generateBeats, toBeatsDocument } from "./generateBeats";
export type {
  Beat,
  BeatReference,
  BeatsDocument,
  EpisodeInput,
  SchemaBeat,
  StoryInput
} from "./generateBeats";

export { compileShots, toShotsDocument } from "./compileShots";
export {
  CANONICAL_VISUAL_OBJECT_KINDS,
  isChartLikeShotVisualObjectKind,
  normalizeShotVisualObjectKind
} from "./compileShots";
export type {
  CompileShotsOptions,
  Shot,
  ShotCanonicalVisualObjectKind,
  ShotChannelDomain,
  ShotEducationalIntent,
  ShotEducationalMode,
  ShotGrammar,
  ShotInsertNeed,
  ShotRouteReason,
  ShotVisualObject,
  ShotVisualObjectKind,
  ShotVisualPlan,
  ShotsDocument
} from "./compileShots";
