# Gate 1 — Production Sequence Scrub (Website)

Live path: `ScrollHero` → `MediaView` → `@/media-engine` (Sequence Scrub only).

## Production defaults

- **Readiness gate:** on for ordinary visits (disable with `?mediaReadinessGate=0`)
- **Readiness target:** 90% unique compressed frames (`threshold-ready-90`)
- **Safety timeouts:** desktop-standard 8s · desktop-lite 7s · mobile 6s → `timeout-partial`
- **Cold runway:** removed from active path (rollback under `.media-engine/rollback/cold-runway/`)

## Tiers (frozen)

| Tier | Size | FPS | Frames | Decoded cache | Ready % | Timeout |
|------|------|-----|--------|--------------|---------|---------|
| desktop-standard | 1920×1066 | 30 | 180 | 8 | 90 | 8s |
| desktop-lite | 1280×710 | 30 | 180 | 6 | 90 | 7s |
| mobile | 532×960 | 30 | 180 | 6 | 90 | 6s |

## Automatic desktop-lite policy

Named constants in `MediaPolicy.ts`:

- `DESKTOP_LITE_MAX_MEMORY_GB = 16`
- `DESKTOP_LITE_MAX_LOGICAL_CORES = 12`
- `DESKTOP_LITE_FALLBACK_MAX_CORES_WHEN_MEM_UNKNOWN = 8`

Rules (one-shot, no mid-session switch):

1. Mobile form factor → mobile
2. CSS width &lt; 1100 → desktop-lite
3. deviceMemory ≤ 4 GB → desktop-lite
4. deviceMemory ≤ 16 **and** hardwareConcurrency ≤ 12 → desktop-lite
5. deviceMemory unavailable **and** cores ≤ 8 (clearly low) → desktop-lite
6. Else desktop → desktop-standard

Verified: 32 GB / 24-core → standard; 16 GB / 12-core → lite.

## Debug (`?mediaDebug=1`)

- Overlay + watermark
- `?mediaTier=desktop-standard|desktop-lite|mobile|poster` (requires mediaDebug)
- `?mediaReadinessTarget=90|95|100` (requires mediaDebug)

## Certify

`npm run media:v1:certify`
