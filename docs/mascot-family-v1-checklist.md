# Mascot Family V1 Checklist

Updated: 2026-03-06

## Goal

Ship a usable V1 for a single mascot family style:

- monochrome doodle mascot style
- shared chibi proportions
- species: cat, dog, wolf
- deterministic video pipeline first
- generative video shots later

## Done In This Step

- species-aware mascot generation schema added
- cat/dog/wolf registry added
- species field wired through generation payloads
- species field preserved across regenerate/recreate paths
- species-specific quality scoring and warnings added
- species-aware side-view consistency weighting added
- selection now prefers fewer warnings before raw score ties
- paw / hand failure heuristics added to mascot scoring
- shot type schema added
- render mode schema added
- deterministic render pipeline now carries shot type and render mode metadata
- UI forms can choose species
- shot planner now classifies talk / reaction / broll with cue-based heuristics
- broll and transition shots now receive planned render modes for future sidecar routing
- render pipeline now emits sidecar plan manifests for non-deterministic shots
- mascot family smoke script added
- mascot production preset now prefers checkpoint workflow over flux2
- mascot low-quality mock fallback disabled for real ComfyUI runs
- mascot QC false-positive rejects relaxed for line-art outputs
- mascot base prompt made species-neutral instead of cat-locked
- mascot front-master pool added for higher-effort front selection before side views
- mascot front-master threshold split from side-view threshold
- real ComfyUI smoke verified for cat / dog / wolf
- side starters added for cat / dog / wolf
- side starters now disable human OpenPose when a per-view starter exists
- cat side-view QC now uses reference-driven species-floor recovery for simple mascot outputs
- dog / wolf side starters generated and wired into the same production path
- latest real smoke re-verified for cat / dog / wolf with pose disabled on starter-driven views
- sidecar renderer now emits b-roll request packs with prompt/json artifacts
- sidecar render requests now receive fps / width / height / attempt metadata

## V1 Character System

### Must Ship

- cat, dog, wolf species options
- species-specific prompt hints
- species-specific negative rules
- species preserved in generation manifests
- species preserved in view regenerate and recreate flows

### Next Character Tasks

1. add species-specific sample/reference folders
2. add family-wide accessory slots
3. split per-species front-view tuning because wolf front remains weaker than its side views
4. add per-species accepted-score thresholds from latest empirical runs
5. add species-aware QC report summaries
6. tune paw thresholds from real generation failures

## V1 Video System

### Must Ship

- shot_type in shots schema
- render_mode in shots schema
- deterministic renderer carries metadata through sequence props
- shot debug overlays show type and render mode

### Next Video Tasks

1. add cache keys for future generated shots
2. add fallback rule: generative shot failure -> deterministic substitute
3. let composition consume shot_type for visual treatment differences
4. promote request-pack sidecar into a real shot renderer
5. attach a real video-model executor behind generative_broll

## V1 Success Criteria

- species can be switched from UI without code edits
- regenerate/recreate does not lose species identity
- shot documents validate with shot_type and render_mode
- preview render still works after schema changes
- architecture is ready for future generative shot insertion without rewrite

## V2 Direction

- species-specific QC and rerank
- mascot family accessory system
- deterministic shot planner refinement
- generative b-roll integration
- result cache and fallback routing
