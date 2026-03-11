# Mascot Reference Banks

Each mascot profile owns a `bank.json` file.

- `style`: house style anchors shared across stages
- `starterByView`: optional starter refs for direct regen or view bootstrap
- `familyByView`: view-specific composition anchors used by side-view stages
- `heroByView`: optional high-fidelity hero refs for identity-lock or repair
- `requiredAssets`: machine-readable intake checklist for species banks that are still `scaffold_only`
- `extends`: optional shared scaffold bank to inherit and override

The shared scaffold should stay species-neutral.
Do not place cat/dog/wolf-specific style canon or hero refs in `shared/bank.json`.
Species banks should own their own `style` and `heroByView` entries.

Current migration rule:
- `shared`: composition/starter scaffold only
- `cat`: owns the current house style canon and hero ref
- `dog`/`wolf`: scaffold-only until dedicated species refs are added

Use `bankStatus` to mark readiness:
- `species_ready`: species bank has its own style canon and can optionally carry hero refs
- `scaffold_only`: bank only supplies composition/starter scaffolding and should be treated as lower-confidence for auto-accept

Use `requiredAssets` to declare what must be supplied before flipping a bank from `scaffold_only` to `species_ready`.
Recommended minimum for a new species:
- one `style.front.primary`
- one `family.front.primary`
- one `family.threeQuarter.primary`
- one `family.profile.primary`
- one `hero.front.primary`

Useful local check:
- `pnpm -C packages/image-gen run bank:report`
  Writes `out/mascot_reference_readiness/report.json` with declared/effective readiness, unsatisfied asset slots, and review-only notes.

Paths are resolved relative to the directory containing `bank.json`.

During migration, a mascot bank may temporarily reuse existing shared assets behind the manifest.
Stage/sample payloads should reference the bank manifest role (`bank.json#...`) rather than direct legacy paths.
