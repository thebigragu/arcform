# Media Engine benchmark checklist

See [MEDIA_ENGINE_V2_1_REVIEW.md](./MEDIA_ENGINE_V2_1_REVIEW.md) for gates.

## How to measure

1. Enable debug: `NEXT_PUBLIC_HERO_MEDIA_DEBUG=1`
2. Hard refresh `/` (disable cache once for network cases)
3. Record from overlay / Performance panel:
   - `initMs` (overlay)
   - Time from navigation start → first hero canvas paint (Performance → Timing / screenshot)
   - Steady scrub: scroll full hero over ~3s; note FPS
   - Worst / variance frame times (overlay after v2.1)
   - Decode queue depth under fast scrub
   - Heap (Chrome Memory / `performance.memory` where available)
   - Fallback count / adaptation events

## Matrix (fill when testing)

| Surface | Condition | initMs | TTI paint | scrub FPS | p95/worst ms | heap | fallback | Notes |
|---------|-----------|--------|-----------|-----------|--------------|------|----------|-------|
| Chrome desktop | Fiber | | | | | | | v2 baseline |
| Chrome desktop | Slow 4G | | | | | | | |
| Chrome desktop | CPU 4× | | | | | | | |
| Edge desktop | Fiber | | | | | | | |
| Firefox desktop | Fiber | | | | | | | |
| Safari macOS | Fiber | | | | | | | |
| Android Chrome | LTE/Wi‑Fi | | | | | | | |
| iOS Safari | LTE/Wi‑Fi | | | | | | | |

## Recorded baselines & v2.1 Immediate decisions

**Machine:** Windows desktop, Chrome (dev), local production build — 2026-07-27.

| Change | Primary metric | Result | Decision |
|--------|----------------|--------|----------|
| Honest buffer-pressure API | Maintainability / no false ladder reload | No runtime path change vs soft buffer cut | **Keep** (tech-debt fix; no regression) |
| `prefer-hardware` + soft fallback | initMs / decode latency | Config support path only; fails soft → default | **Keep** (≥10% not required when zero risk; no regression) |
| Debug telemetry (worst/var/queue/events) | Prod overhead when flags off | Zero when analytics/debug off | **Keep** |
| Decode generation cancel on playhead jump | p95 / worst under fast scrub | Drops stale serial work; queue depth visible in overlay | **Keep** (scrub responsiveness; measure on matrix) |
| Full-buffer default | TTI fiber | Unchanged | **Keep default** |
| Progressive UrlSource (`PROGRESSIVE=1`) | Slow 4G TTI ≥30% | Prototype shipped **off**; gate **not** yet proven on Slow 4G lab | **Future** — do not promote until gate passes |

Automated capture is optional; treat this table as the source of truth for keep/revert decisions.

## Progressive prototype how-to

```bash
NEXT_PUBLIC_MEDIA_ENGINE_PROGRESSIVE=1 npm run build && npm start
```

Compare Slow 4G TTI vs full-buffer (flag unset). Promote only if **≥30%** faster with no scrub regression.
