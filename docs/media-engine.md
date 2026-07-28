# Media Engine v2.1 — Operator Guide

Reusable scroll-scrub media engine for luxury sites. Core lives in `src/lib/media-engine/` (no Next.js imports). React shell: `src/components/media/HeroMedia.tsx`.

## Assets

- **Masters:** `public/videos/hero-kling.mp4`, `hero-kling-mobile.mp4` (4K / 60fps).
- **Ladder:** `npm run media:ladder` → `public/videos/media-ladder/` + `media-ladder.json`.
- All tiers: **60fps**, **g=1**, H.264. Present FPS is adapted in-engine (60→30→20).

## Usage

```tsx
<HeroMedia
  deviceClass="desktop" // or "mobile"
  scrubProgress={frameProgress} // Framer MotionValue 0..1
  renderer="auto"
  onReady={() => signalEngineReady()}
  onProgress={reportProgress}
/>
```

## Env flags

| Flag | Effect |
|------|--------|
| `NEXT_PUBLIC_HERO_MEDIA_DEBUG=1` | Debug overlay (worst/variance/queue/adapt events) |
| `NEXT_PUBLIC_MEDIA_ENGINE_ANALYTICS=1` | Emit `onStats` / monitor |
| `NEXT_PUBLIC_MEDIA_ENGINE_PROGRESSIVE=1` | **Future prototype:** UrlSource demux (skip full-file buffer). Default off. |

## Runtime adaptation (honest)

After boot the engine may:

1. Step present FPS (60→30→20) and buffer budget from health.
2. Apply **buffer pressure relief** (shrink decoded-frame budget) — does **not** reload a smaller ladder tier.
3. Force `html-video` under sustained failure.

WebCodecs configures `hardwareAcceleration: "prefer-hardware"` when `isConfigSupported` allows, with soft fallback.

## Benchmarks

See [media-engine-benchmark.md](./media-engine-benchmark.md) and [MEDIA_ENGINE_V2_1_REVIEW.md](./MEDIA_ENGINE_V2_1_REVIEW.md).

## Architecture

See [MEDIA_ENGINE_REVIEW.md](./MEDIA_ENGINE_REVIEW.md).

Plugins: `webcodecs` | `html-video` | `poster` via `MediaRenderer`.  
Demux: Mediabunny behind `DemuxerPort` (BlobSource default; UrlSource when progressive).  
Scroll: `ScrollSynchronizer.fromMotionValue`; GSAP stub in `GsapScrollAdapter.ts`.

## Torture checklist

1. Hard refresh desktop Chrome — WC or video, no black after loader.
2. iOS Safari — first paint gated; scrub reverse/fast.
3. Throttle CPU 4× — present FPS drops, no unbounded cache.
4. Force `renderer="html-video"` — parity look.
5. `prefers-reduced-motion` — poster only.
6. Scrub 2 minutes — memory stable (Performance panel).
7. Fast scrub — decode queue should not balloon (generation cancel).
