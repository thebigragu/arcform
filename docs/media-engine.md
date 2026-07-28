# Media Engine — Operator Guide (Standard 2.3)

Reusable scroll-scrub media engine for luxury sites. Core: `src/lib/media-engine/`. React shell: `src/components/media/HeroMedia.tsx`.

Agency handbook: Media Engine Skill V2.3 (Adaptive Runtime Intelligence).

## Assets

- **Masters (archival, never delivered):** `public/videos/hero-master-desktop.mp4`, `hero-master-mobile.mp4` — near-4K, **30fps**.
- **Ladder:** `npm run media:ladder` → `public/videos/media-ladder/` + `media-ladder.json`.
- **Default tiers:** `d1440`, `d1080` (desktop), `m900` (mobile) — **30fps**, **g=1**, H.264.
- Desktop presentation targets **60/45/30/20 Hz** via PresentClock + RuntimeIntelligence; mobile stays **30fps** (20Hz under pressure).

## Usage

```tsx
<HeroMedia
  deviceClass="desktop"
  scrubProgress={frameProgress}
  renderer="auto"
  onPosterLoad={signalPosterReady}
  onReady={signalEngineReady}
  onProgress={reportProgress}
/>
```

## Loading (poster-first)

1. Poster preloads via `<link rel="preload">` + `HeroPosterPreload`.
2. Site loader dismisses on **poster + variant** — not full MP4 fetch.
3. Engine runs background benchmark (150–300ms), picks renderer + tier, swaps on first canvas present.

## Env flags

| Flag | Effect |
|------|--------|
| `NEXT_PUBLIC_HERO_MEDIA_DEBUG=1` | Canonical runtime scorecard overlay |
| `NEXT_PUBLIC_MEDIA_ENGINE_ANALYTICS=1` | Emit full `onStats` |
| `NEXT_PUBLIC_MEDIA_ENGINE_PROGRESSIVE=1` | Future: UrlSource demux (off by default) |

## Runtime intelligence (V2.3)

1. **Capability band** — Ultra / High / Medium / Low / Minimal from soft signals + benchmark.
2. **Renderer micro-benchmark** — WebCodecs vs html-video; fastest wins on `auto`.
3. **Presentation** — 60 → 45 → 30 → 20 Hz with stability rules (dwell, cooldown).
4. **Predictive downgrade** — trends (latency, drift, queue, memory) before visible stutter.
5. **Decode/memory budgets** — reduce work before resolution; no live ladder hot-swap.

## Canonical scorecard (debug overlay)

Device band, renderer, tier, target Hz, benchmark score, decode/memory budget %, frame drift/age, CPU/network estimates, adaptation history, init/TTFVF.

## Torture checklist

1. Hard refresh — poster immediate; video swap after engine ready; no interaction block.
2. iOS Safari — poster-first; renderer auto-pick stable.
3. CPU 4× — graceful 60→45→30→20; no oscillation.
4. Force `renderer="html-video"` — visual parity.
5. `prefers-reduced-motion` — poster only.
6. Scrub 2 minutes — memory stable; budget % bounded.
7. Fast scrub — queue does not balloon; predictive downgrade if needed.
