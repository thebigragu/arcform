# Media Engine — Operator Guide (Standard 2.2)

Reusable scroll-scrub media engine for luxury sites. Core: `src/lib/media-engine/`. React shell: `src/components/media/HeroMedia.tsx`.

Agency handbook: Media Engine Skill V2.2 (stable).

## Assets

- **Masters (archival, never delivered):** `public/videos/hero-master-desktop.mp4`, `hero-master-mobile.mp4` — near-4K, **30fps**.
- **Ladder:** `npm run media:ladder` → `public/videos/media-ladder/` + `media-ladder.json`.
- **Default tiers:** `d1440`, `d1080` (desktop), `m900` (mobile) — **30fps**, **g=1**, H.264.
- Desktop presentation targets smooth **60Hz** via engine PresentClock; mobile stays **30fps**.

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

## Loading (V2.2 poster-first)

1. Poster preloads via `<link rel="preload">` + `HeroPosterPreload`.
2. Site loader dismisses on **poster + variant** — not full MP4 fetch.
3. Media Engine initializes in background; poster swaps on first canvas present.

## Env flags

| Flag | Effect |
|------|--------|
| `NEXT_PUBLIC_HERO_MEDIA_DEBUG=1` | Debug overlay |
| `NEXT_PUBLIC_MEDIA_ENGINE_ANALYTICS=1` | Emit `onStats` |
| `NEXT_PUBLIC_MEDIA_ENGINE_PROGRESSIVE=1` | Future: UrlSource demux (off by default) |

## Runtime adaptation

1. Present FPS steps (60→30→20) per [Agency Optimization Ladder](https://github.com).
2. Buffer-pressure relief — does not reload ladder tier.
3. Force `html-video` under sustained failure.

## Torture checklist

1. Hard refresh — poster immediate; video swap after engine ready.
2. iOS Safari — poster-first; no `opacity-0` loader traps.
3. CPU 4× — present FPS drops, bounded cache.
4. Force `renderer="html-video"` — visual parity.
5. `prefers-reduced-motion` — poster only.
6. Scrub 2 minutes — memory stable.
7. Fast scrub — queue does not balloon.
