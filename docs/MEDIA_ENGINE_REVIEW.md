# MEDIA_ENGINE_REVIEW.md

Engineering review for the agency **Production Media Engine v2**.  
Gate document: engine feature work begins only after this review is accepted.

**Status:** Accepted for implementation (R0 complete).  
**Date:** 2026-07-27  
**Scope:** Reusable browser media scrub engine (Next.js / React / TypeScript consumers).

---

## 1. Architectural review (v1 → v2)

| v1 decision | Weakness | v2 replacement |
|-------------|----------|----------------|
| Fixed ±12 / ±6 frame buffers | Ignores memory, velocity, decode latency | **AdaptiveBufferGovernor** — budget from score + observed metrics |
| Separate 30fps delivery encodes | Duplicate masters / ops burden | **One 60fps master timeline**; present-FPS is engine-side |
| Static capability score at init | Misses thermal / battery / memory pressure | Score + **RuntimeBenchmark** + **AdaptationController** |
| Monolithic WC / video paths | Hard to extend (AV1, WebGPU) | **`MediaRenderer` plugin interface** |
| Hard-require `mp4box` | Larger, older API | **`DemuxerPort` + Mediabunny (MP4-only)** |
| Site-coupled preload first | Wrong layering for reuse | Engine-first package; site is a consumer |
| “No dropped frames” absolute | Impossible under fast scrub | Smooth **presents**; decode miss → nearest frame |

Partial stubs in `src/lib/media-engine/` (fixed buffer types) are **superseded** and rewritten for v2.

---

## 2. Identified weaknesses (current site)

1. **Desktop WebP decode-all** (~360 × 1440p bitmaps) — high RAM, slow first visit, not reusable.
2. **Mobile `<video>` seek scrub** — works, but visible video layer / paint races; not canvas-unified.
3. **No predictive decode** — seeks react after scroll, not ahead of velocity.
4. **No continuous adaptation** — one path for all devices after init.
5. **No plugin surface** — cannot add AV1 / WebGPU without rewriting call sites.

---

## 3. Alternatives considered

| Option | Verdict |
|--------|---------|
| Native browser MP4 demux | **Impossible** — WebCodecs has no container demux |
| Hand-rolled ISO-BMFF parser | Reject — long tail of boxes, high maintenance |
| `mp4box` | Legacy viable; larger / less tree-shakeable; prior ad-hoc WC path failed here |
| **Mediabunny `Mp4InputFormat`** | **Chosen** — ~16KB gz MP4-only, TS-native, WebCodecs-oriented |
| Video-only → canvas (no WC) | Required **fallback**, not primary on capable desktop |
| WebGPU present path | Defer — interface reserved; Canvas2D present for v2.0 |
| Image sequences | Reject — contradicts master-MP4 strategy |

---

## 4. Tradeoffs

| Choice | Upside | Downside |
|--------|--------|----------|
| Quality ladder (spatial) | Bandwidth / decode fit per device | More files in CDN / encode time |
| Single 60fps encode rate | One temporal master; engine subsamples | g=1 @ 60fps larger than 30fps g=1 |
| g=1 (all-intra) | O(1) random access for WC scrub | ~2–4× size vs long-GOP |
| Mediabunny dependency | Correct demux + future formats behind port | Still a dependency (justified: no native demux) |
| Plugin renderers | Future-proof | Slightly more indirection |

**Locked asset strategy:** one creative master (4K/60) → build-time spatial ladder still at **60fps + g=1**. Runtime picks tier and present FPS. No separate 30fps masters.

---

## 5. Performance estimates

| Tier | Approx size | Frames @ 6s / 60fps |
|------|-------------|---------------------|
| d2560 | ~20–35 MB | ~360 |
| d1920 | ~13–25 MB | ~360 |
| m1440 | ~15–25 MB | ~360 |
| m1080 | ~12–20 MB | ~360 |
| m900 | ~9–18 MB | ~360 |

- Present target: 60 / 30 / 20 FPS adaptive.  
- Decode miss under fast scrub: draw nearest cached frame (no stall).  
- Init: fetch tier + demux index + prewarm small window + first paint gate.

---

## 6. Memory estimates

| Path | Peak decoded media (order of magnitude) |
|------|----------------------------------------|
| Current desktop WebP decode-all | Hundreds of MB |
| WC adaptive cache (8–48 frames) | Tens of MB |
| Html-video fallback | One decoder + canvas backing store |

Rules: never decode full timeline into `VideoFrame`s; always `close()`; budget ceiling enforced.

---

## 7. Risk assessment

| Risk | Mitigation |
|------|------------|
| Safari first-frame black | Poster + ready only after paint; no `opacity-0` under loader |
| Mobile WC jank | Capability score + benchmark → html-video; smaller buffer |
| Ladder ops / storage | Scripted encode; manifest-driven |
| Strict Mode blob revoke | Refcounted blob URLs |
| Mediabunny API churn | Thin `DemuxerPort` boundary |
| Tier reload hitch | Hysteresis; rare downshift |

---

## 8. Future expansion

- AV1 / HEVC tiers when `isConfigSupported`  
- WebGPU present plugin  
- HTTP range progressive demux for longer clips  
- Multi-section scrub (not hero-only)  
- Extract `src/lib/media-engine` to private package  

---

## 9. Implementation order

1. **R0** — This review (gate)  
2. **M0** — Encode 60fps g=1 ladder + `media-ladder.json`  
3. **M1** — Ports + HtmlVideoRenderer + MediaEngine facade  
4. **M2** — Mediabunny + WebCodecs + predictive / adaptive buffer  
5. **M3** — Scorer, benchmark, AdaptationController, SourceSelector  
6. **M4** — HeroMedia in ScrollHero; retire WebP critical path  
7. **M5** — Offscreen when scored, docs, analytics, GSAP stub, torture pass  

---

## 10. Recommendation

Proceed with **Media Engine v2** as specified: plugin renderers, Mediabunny demux port, adaptive buffer + predictive schedule, one master → spatial ladder, continuous adaptation. Prioritize desktop WC memory win over WebP decode-all; keep html-video→canvas as mandatory fallback.
