# ComfyUI Prompt Engineering Pack: 3-View Character Consistency

This pack targets the project's view set: `front`, `threeQuarter`, `profile`.

## 1) Positive Prompt Template

```text
{STYLE_CORE}, {CHARACTER_IDENTITY}, {MATERIAL_AND_LINEWORK}, {CONSISTENCY_ANCHORS}, {VIEW_MODIFIER},
character turnaround sheet, single subject, centered composition, full body, neutral standing pose,
clean silhouette readability, consistent outfit, consistent palette, transparent or plain background,
high quality illustration, production-ready character sprite source
```

Recommended slot values:

```text
STYLE_CORE:
2d mascot character, clean vector-like look, thick outline, simple cel shading

CHARACTER_IDENTITY:
{name_or_token}, same head shape, same eye shape, same ear shape, same tail length, same body proportions

MATERIAL_AND_LINEWORK:
flat color blocking, crisp edge control, minimal texture noise

CONSISTENCY_ANCHORS:
same costume details, same emblem placement, same color hex intent, no redesign, no age shift
```

## 2) Negative Prompt Template

```text
photorealistic, realistic skin, 3d render, detailed realistic fur, cinematic film grain,
text, logo, watermark, signature, frame border,
busy background, clutter, scene props,
extra limbs, missing limbs, extra fingers, deformed hands,
asymmetric eyes, different eye color between views, drifting proportions,
costume redesign, color drift, hairstyle drift, accessory mismatch,
extreme foreshortening, fisheye lens, dutch angle,
motion blur, lowres, jpeg artifacts, oversharpen, noisy texture
```

## 3) View-Specific Modifiers

Use one of these as `{VIEW_MODIFIER}` and keep all other tokens fixed.

```text
front:
front view, camera facing subject directly, symmetric facial alignment, shoulders square, neutral A-pose

threeQuarter:
3/4 view, head and torso rotated ~45 degrees, readable far-side features, preserve silhouette landmarks

profile:
true side profile, 90-degree rotation, one eye visible, clear nose/muzzle contour, ear overlap physically plausible
```

Optional strict add-on (for all views):

```text
model sheet consistency, same character across all angles, no reinterpretation
```

## 4) Seed Strategy (Deterministic + Controlled Variation)

Use a fixed `baseSeed` per character concept, then derive per-view/per-candidate seeds.

Current provider-compatible derivation pattern:

```text
seed(view, candidate) = hash32("{baseSeed}:{view}:{candidate}")
```

Operational guidance:

1. Lock `baseSeed` per character version (e.g., `eraser-cat-v3`).
2. Keep candidate index small (`0..3`) for manageable branching.
3. First pass: generate `front/threeQuarter/profile` with candidate `0`.
4. Second pass only for failed views: keep view constant, change candidate index.
5. Promote one winning triplet and persist `{baseSeed, selectedCandidatePerView}` in metadata.

Suggested metadata payload:

```json
{
  "characterVersion": "eraser-cat-v3",
  "baseSeed": 842771,
  "views": {
    "front": { "candidate": 0, "seed": 123456789 },
    "threeQuarter": { "candidate": 0, "seed": 234567890 },
    "profile": { "candidate": 1, "seed": 345678901 }
  }
}
```

## 5) Quality Guardrails

### Prompt-time guardrails

```text
- Always include consistency anchors (shape, palette, costume placement).
- Keep environment/background minimal or transparent.
- Do not mix incompatible style tokens (e.g., "vector" + "photoreal").
- Keep camera language simple and view-locked.
```

### Generation-time guardrails (ComfyUI)

```text
- Fixed checkpoint + fixed VAE for a run batch.
- Fixed resolution for all 3 views (e.g., 1024x1024).
- Fixed sampler/scheduler/steps/CFG for all 3 views.
- Only vary: view modifier and seed.
```

### QC reject rules

Reject candidate if any condition is true:

```text
- Missing/extra major body part.
- Palette drift beyond tolerance (manual or histogram check).
- Costume emblem/placement mismatch.
- Face landmark drift (eye shape/spacing, muzzle length, ear shape).
- Non-plain background or any text/logo artifact.
```

## 6) ComfyUI Wiring Pattern

Minimal node-level pattern:

1. `Load Checkpoint`
2. `CLIP Text Encode (Positive)` with master template + view modifier
3. `CLIP Text Encode (Negative)` with negative template
4. `Empty Latent Image` (fixed width/height)
5. `KSampler` with derived seed
6. `VAE Decode`
7. `Save Image`

For batched generation:

- Run 3 jobs per candidate set (`front`, `threeQuarter`, `profile`).
- Keep all params identical except `{VIEW_MODIFIER, seed}`.

## 7) Ready-to-Use Prompt Set

Positive base:

```text
2d mascot character, clean vector-like look, thick outline, simple cel shading,
eraser cat mascot, same head shape, same eye shape, same ear shape, same tail length, same body proportions,
flat color blocking, crisp edge control, minimal texture noise,
same costume details, same emblem placement, same color intent, no redesign, no age shift,
{VIEW_MODIFIER}, character turnaround sheet, single subject, centered composition, full body,
neutral standing pose, clean silhouette readability, consistent outfit, transparent background,
high quality illustration, production-ready character sprite source
```

Negative base:

```text
photorealistic, realistic skin, 3d render, detailed realistic fur, cinematic film grain,
text, logo, watermark, signature, frame border,
busy background, clutter, scene props,
extra limbs, missing limbs, extra fingers, deformed hands,
asymmetric eyes, different eye color between views, drifting proportions,
costume redesign, color drift, hairstyle drift, accessory mismatch,
extreme foreshortening, fisheye lens, dutch angle,
motion blur, lowres, jpeg artifacts, oversharpen, noisy texture
```

Front modifier:

```text
front view, camera facing subject directly, symmetric facial alignment, shoulders square, neutral A-pose
```

Three-quarter modifier:

```text
3/4 view, head and torso rotated ~45 degrees, readable far-side features, preserve silhouette landmarks
```

Profile modifier:

```text
true side profile, 90-degree rotation, one eye visible, clear nose/muzzle contour, ear overlap physically plausible
```
