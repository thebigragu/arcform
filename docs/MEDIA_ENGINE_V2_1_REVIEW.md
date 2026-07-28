# MEDIA_ENGINE_V2_1_REVIEW.md

Engineering optimization review for **Media Engine v2 → v2.1**.  
**Status:** Accepted for Immediate implementation (2026-07-27).  
**Rule:** Prefer keep-current unless a change beats a written metric gate. No speculative architecture merges.

Companion: [MEDIA_ENGINE_REVIEW.md](./MEDIA_ENGINE_REVIEW.md) (v2 architecture), [media-engine.md](./media-engine.md) (ops).

---

## 1. Architecture review (bottlenecks)

| Area | Current | Evidence | Risk |
|------|---------|----------|------|
| Startup | Full tier MP4 → `ArrayBuffer` before demux (`MediaEngine.fetchWithProgress`) | Loader blocks on 14–31 MB | Dominant TTI on Slow 4G |
| Memory | File bytes + all encoded samples in RAM; decoded cache budget-bound | Demux indexes every packet | OK for 6s heroes; scales poorly to minutes/8K |
| Responsiveness | Serial per-sample `VideoDecoder` create/flush (`WebCodecsRenderer`) | Fast scrub queues stale work | Main-thread hitch risk |
| Adaptability | Present FPS + buffer + html-video fallback | `tryDownshift` does **not** reload ladder | Misleading API / tech debt |
| Ladder | `selectTier` once at boot | No hot-swap | Fine until long-form / network variance |
| HW accel | `isConfigSupported` only | Support ≠ GPU path | Missed prefer-hardware |
| Telemetry | Basic `EngineStats` | No worst/variance/queue/events | Hard to prove gains |
| Workers | Unused | Demux+decode on main thread | Mid Android Long Tasks |

---

## 2. Streaming analysis

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| Keep full buffer | Simple, reliable scrub for ≤~40 MB | High TTI on slow nets | **Default** until gate passes |
| Mediabunny `UrlSource` + HTTP Range | Progressive moov; on-demand packets; fits DemuxerPort | Complexity; Safari range quirks; scrub needs sample index strategy | **Future** — prototype behind flag |
| Custom ReadableStream demux | Control | High maintenance | **Reject** vs UrlSource |
| MSE | Native buffering | Playback model, weak random scrub | **Reject** for scrub |
| Segmented fMP4 | CDN-friendly long-form | Encode/ops cost | Future only if multi-minute |

**Gate for promote:** ≥30% faster time-to-first-paint on Slow 4G / Fast 3G with no scrub regression vs full-buffer baseline.

**Memory savings** for current 6s ladder (~14–31 MB): modest (still need random access). **TTI** is the credible win. For 8K / long clips, streaming becomes mandatory for scalability.

---

## 3. Runtime ladder / adaptive quality

**Problem:** Tier fixed at init; “downshift” only shrinks buffer.

**Seamless hot-swap** needs dual demux/decode, canvas crossfade, hysteresis, index remap — high flicker/desync risk.

| Decision | Class |
|----------|-------|
| Seamless ladder hot-swap in production | **Reject Immediate** |
| Dual-pipeline QualitySwitcher harness | **Experimental** |
| Honest non-reload adaptation (buffer/FPS/renderer) | **Immediate** |
| Signals for future switcher (FPS, decode ms, memory, save-data, connection, velocity) | Document now; wire when switcher exists |

---

## 4. Progressive first frame

Same vehicle as UrlSource progressive demux. **Do not** invent half-measures that complicate boot without UrlSource. Success metric = first paint before 100% download.

---

## 5. Decode optimization decisions

| Idea | Class | Rationale |
|------|-------|-----------|
| Prioritize playhead; drop stale queue | **Immediate** | Cheap; helps fast scrub |
| Eviction | Keep | Already adaptive |
| Worker + OffscreenCanvas | **Future** | After Long Task profiling |
| Parallel VideoDecoders | **Reject** | Contention; g=1 already O(1) |
| Predictive prefetch | Keep / tune | Already present |

---

## 6. Renderer additions

| Renderer | Class |
|----------|-------|
| AV1 tier | Future (when size win proven) |
| WebGPU present | Research / Experimental |
| Image sequence | Reject (MP4-master strategy) |
| Plugin ports | Keep; no new plugins without need |

---

## 7. Telemetry

**Immediate (debug-only):** worst frame ms, frame-time variance, decode queue depth, adaptation events. Env: `NEXT_PUBLIC_HERO_MEDIA_DEBUG` / `NEXT_PUBLIC_MEDIA_ENGINE_ANALYTICS`. Never default-on in production.

---

## 8. Prefer-hardware

**Immediate:** configure WC with `hardwareAcceleration: "prefer-hardware"` when `isConfigSupported` accepts it; soft-fallback to default config. Does not *prove* GPU use; improves odds without breaking soft decode.

---

## 9. Benchmark matrix

Metrics: `initMs`, time-to-first-paint, steady scrub FPS, p95 / worst frame ms, peak JS heap (where available), fallback count.

Surfaces: Chrome/Edge/Firefox/Safari desktop; Android Chrome; iOS Safari; CPU 4×; Slow 4G.

**Immediate gate:** keep change if ≥10% gain on a primary metric (init, TTI, p95 frame, peak heap) with no regression elsewhere.  
**Streaming gate:** ≥30% TTI on Slow 4G.

Baseline / post results: [media-engine-benchmark.md](./media-engine-benchmark.md).

---

## 10. Decision log (Problem → Recommendation)

### A. Misleading tier downshift
- **Current:** `tryDownshift` cuts buffer only.  
- **Alt:** Rename to pressure relief; stop claiming ladder swap.  
- **Complexity:** Low. **Gain:** Maintainability.  
- **Rec:** **Immediate**.

### B. Full-file buffer
- **Alt:** UrlSource progressive.  
- **Complexity:** Medium–High. **Est. TTI:** large on Slow 4G; small on fiber.  
- **Rec:** **Future** (flagged prototype); default full-buffer.

### C. Seamless ladder switch
- **Rec:** **Experimental** harness only; not production v2.1.

### D. prefer-hardware
- **Rec:** **Immediate**.

### E. Decode prioritization
- **Rec:** **Immediate**.

### F. Expanded debug telemetry
- **Rec:** **Immediate**.

### G. MSE / parallel decode / image sequence / WebGPU present
- **Rec:** **Reject** or Research-only as above.

---

## 11. Versioning

| Class | Items |
|-------|-------|
| Immediate | Honest adaptation API; prefer-hardware; telemetry; decode prioritization; benchmark docs |
| Future | UrlSource progressive demux; workers/Offscreen after profiling; dual-pipeline quality after flicker-free harness |
| Experimental | Runtime ladder hot-swap harness |
| Research / Reject | MSE scrub; parallel decoders; WebGPU present; image sequences; raw 8K delivery |

---

## 12. Implementation roadmap

1. Ship this review.  
2. Record v2 baseline checklist.  
3. Land Immediate code.  
4. Re-benchmark; revert any item failing ≥10% gate.  
5. Optional: progressive UrlSource behind `progressive: true` / env — promote only if Slow 4G TTI ≥30%.

---

## 13. Risk assessment

| Risk | Mitigation |
|------|------------|
| Prefer-hardware unsupported | Fall back to default config |
| Progressive Safari range bugs | Flag off by default; full-buffer fallback |
| Telemetry cost | Debug-only paths |
| Queue cancel races | Single serial chain; generation token |
| API churn for clients | `HeroMedia` props unchanged |
