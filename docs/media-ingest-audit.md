# Media Ingest Audit (Phase 1 — pre-V2.4)

Snapshot before one-command ingest and certification. Behavioral source of truth remains production code.

## Ingest

| Item | State |
|------|-------|
| Script | `scripts/encode-media-ladder.cjs` — fixed tiers, CRF 21, minimal ffprobe |
| CLI args | None |
| Normalization | Manual masters only |
| Playback encodes | None (g=1 scrub used for all paths) |
| Certification report | None |

## Manifest

| Item | State |
|------|-------|
| Version | 3 — flat `tiers[]` at `public/videos/media-ladder/media-ladder.json` |
| mediaId / intent / hash | Not present |
| Conservative defaults | Not in manifest |

## Runtime (V2.3)

| Item | State |
|------|-------|
| Bands + RuntimeIntelligence | Shipped |
| WebCodecs decoder | **New VideoDecoder per frame** — not persistent |
| html-video | Always video→canvas; no skip unchanged frame |
| Present loop | Draws when `shouldPresent()` even if frame unchanged |
| Experience modes | None — renderer plugins only |
| Asset preflight | Generic device signals; no MediaCapabilities per asset |
| Boot tier order | Desktop high→d1440 first; mobile→m900 only |

## Hero

| Item | State |
|------|-------|
| Poster paths | Hardcoded in `HeroPosterPreload`, `HeroResourceHints` |
| Ladder URL | Default `/videos/media-ladder/media-ladder.json` |

## Gaps addressed by V2.4

1. `npm run media:ingest` — inspect, normalize, ladder, playback, posters, manifest v4, report
2. `npm run media:certify` — static + build gates
3. Manifest v4 with intent, hashes, defaults
4. Persistent decoder + draw-on-change
5. Experience modes including direct `<video>` playback
6. Conservative-first boot tiers
7. Skill intake handbook (post-validation)
