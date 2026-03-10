# Rollout Failure Runbook

## Triage Order
1. Open `/ui/rollouts` and identify whether the latest status is `ready`, `blocked`, `below_min_score`, or `divergence`.
2. Open `/ui/benchmarks` to check the backend matrix and regression bundle that produced the verdict.
3. If a sidecar row exposes `Compare`, open the candidate compare page and inspect prompt-vs-actual score gaps.
4. Open `/ui/profiles` with the linked focus filter to confirm the runtime `studio/channel/mascot` bundle.
5. If character assets are implicated, inspect `/ui/characters` for pack lineage, QC flags, and open repair tasks.

## Status Meanings
- `ready`: rollout met the gate. Verify artifact timestamps and compare target before promoting.
- `blocked`: a required artifact is missing or a hard gate failed before scoring completed.
- `below_min_score`: scoring finished, but at least one metric stayed below the configured floor.
- `divergence`: the compared channels or candidates drifted far enough that manual review is required.

## What To Check Next
### `blocked`
- Missing `plan`, `result`, or `judge` files in the rollout detail page
- Broken raw artifact links or empty `out/` directories
- API logs showing the benchmark writer never completed

### `below_min_score`
- Candidate compare view for the worst shot
- QC/repair reasons in episode detail or pack lineage
- Whether fallback chain or backend selection changed between runs

### `divergence`
- Compare the same prompt across channels in candidate compare
- Use `/ui/profiles` to confirm the profile bundle was not silently changed
- Check regression bundle notes and threshold fields from the benchmark detail page

## Evidence To Attach
- Raw artifact JSON from `/ui/rollouts` detail or `/ui/benchmarks`
- HTML snapshots from `out/ui_smoke_snapshots/<label>/`
- `api.log` plus any failing smoke manifest entries
