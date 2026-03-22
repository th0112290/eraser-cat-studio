Enable this bank with `MASCOT_REFERENCE_BANK_CANDIDATES=wolf`.

Expected replacement files:
- `style_front_primary.png`
- `family_front_primary.png`
- `family_threeQuarter_primary.png`
- `family_profile_primary.png`
- `hero_front_primary.png`

After dropping files here, update `bank.json` paths and run:
- `pnpm -C packages/image-gen run bank:smoke`
- `pnpm -C packages/image-gen exec tsx src/reportMascotReferenceReadiness.ts`
