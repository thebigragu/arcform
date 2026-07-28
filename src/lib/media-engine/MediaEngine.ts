import {
  applyBatteryEnrichment,
  clearWebCodecsFailure,
  enrichBatterySignals,
  markWebCodecsFailure,
  scoreCapabilities,
} from "./adapt/CapabilityScorer";
import { preflightAsset } from "./adapt/AssetPreflight";
import { runRuntimeBenchmark } from "./adapt/RuntimeBenchmark";
import {
  presentationRateFromFps,
  RuntimeIntelligence,
} from "./adapt/RuntimeIntelligence";
import {
  loadManifest,
  selectTier,
} from "./adapt/SourceSelector";
import { playbackAssetForDevice } from "./adapt/manifestLoader";
import { resizeBackingStore } from "./canvas/resizeBackingStore";
import { PerformanceMonitor } from "./monitor/PerformanceMonitor";
import type { MediaRenderer } from "./ports/MediaRenderer";
import { HtmlVideoRenderer } from "./renderers/HtmlVideoRenderer";
import { PlaybackVideoRenderer } from "./renderers/PlaybackVideoRenderer";
import { PosterRenderer } from "./renderers/PosterRenderer";
import { WebCodecsRenderer } from "./renderers/WebCodecsRenderer";
import { AdaptiveBufferGovernor } from "./schedule/AdaptiveBufferGovernor";
import { PredictiveFrameScheduler } from "./schedule/PredictiveFrameScheduler";
import { PresentClock } from "./schedule/PresentClock";
import type {
  BenchmarkResult,
  CapabilityScore,
  EngineStats,
  ExperienceMode,
  LadderTier,
  MediaEngineOptions,
  RendererId,
  UnifiedMediaManifest,
} from "./types";

function selectBootExperienceMode(
  capability: CapabilityScore,
  benchmark: BenchmarkResult | null,
  reducedMotion: boolean,
): ExperienceMode {
  if (reducedMotion || capability.prefersReducedMotion) return "poster";
  if (!benchmark) return "full-scrub";
  if (!benchmark.sustainable && benchmark.score < 40) return "playback";
  if (!benchmark.sustainable || benchmark.score < 55) return "lite-scrub";
  return "full-scrub";
}

function applyLiteScrubProfile(capability: CapabilityScore): CapabilityScore {
  return {
    ...capability,
    maxDpr: Math.min(1.25, capability.maxDpr),
    initialBufferBudgetFrames: Math.max(
      6,
      Math.round(capability.initialBufferBudgetFrames * 0.65),
    ),
    initialPresentFps: Math.min(30, capability.initialPresentFps),
  };
}

async function fetchWithProgress(
  url: string,
  onProgress?: (p: number) => void,
): Promise<{ buffer: ArrayBuffer; blobUrl: string }> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body?.getReader();
  if (!reader) {
    const buffer = await res.arrayBuffer();
    onProgress?.(0.9);
    return {
      buffer,
      blobUrl: URL.createObjectURL(new Blob([buffer], { type: "video/mp4" })),
    };
  }
  const chunks: BlobPart[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.length;
    if (total > 0) onProgress?.(Math.min(0.85, (loaded / total) * 0.85));
  }
  const blob = new Blob(chunks, { type: "video/mp4" });
  const buffer = await blob.arrayBuffer();
  return { buffer, blobUrl: URL.createObjectURL(blob) };
}

function wantsProgressive(options: MediaEngineOptions): boolean {
  if (typeof options.progressive === "boolean") return options.progressive;
  return process.env.NEXT_PUBLIC_MEDIA_ENGINE_PROGRESSIVE === "1";
}

/**
 * Agency Media Engine facade (V2.1 core + V2.3 runtime intelligence).
 */
export class MediaEngine {
  private options: MediaEngineOptions;
  private renderer: MediaRenderer | null = null;
  private rendererId: RendererId = "poster";
  private disposed = false;
  private blobUrl: string | null = null;
  private blobRefs = 0;
  private raf = 0;
  private progress = 0;
  private frameIndex = 0;
  private frameCount = 1;
  private width = 0;
  private height = 0;
  private ready = false;
  private droppedPresents = 0;
  private tier: LadderTier | null = null;
  private manifest: UnifiedMediaManifest | null = null;
  private experienceMode: ExperienceMode = "full-scrub";
  private capability = scoreCapabilities("desktop");
  private benchmark: BenchmarkResult | null = null;
  private presentClock: PresentClock;
  private buffer: AdaptiveBufferGovernor;
  private predictor = new PredictiveFrameScheduler();
  private intelligence: RuntimeIntelligence | null = null;
  private monitor: PerformanceMonitor;
  private velocityAbs = 0;
  private progressive = false;
  private fallbackFetch: Promise<string | null> | null = null;
  private lastPresentedFrame = 0;
  private lastPresentAt = 0;
  private ttfvfMs: number | null = null;
  private ttfpMs: number | null = null;

  constructor(options: MediaEngineOptions) {
    this.options = options;
    if (typeof options.navigationStart === "number") {
      this.ttfpMs = Math.max(0, performance.now() - options.navigationStart);
    }
    this.capability = scoreCapabilities(options.deviceClass);
    this.presentClock = new PresentClock(this.capability.initialPresentFps);
    this.buffer = new AdaptiveBufferGovernor(
      this.capability.initialBufferBudgetFrames,
    );
    this.monitor = new PerformanceMonitor(Boolean(options.analytics));
    this.progressive = wantsProgressive(options);
  }

  async start(): Promise<void> {
    const t0 = performance.now();
    const opts = this.options;
    const timeoutMs = opts.initTimeoutMs ?? 12000;

    this.capability = applyBatteryEnrichment(
      this.capability,
      await enrichBatterySignals(this.capability.battery),
      opts.deviceClass,
    );
    this.presentClock.setTargetFps(this.capability.initialPresentFps);
    this.buffer.setBudget(this.capability.initialBufferBudgetFrames);

    const work = this.boot();
    const timed = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("MediaEngine init timeout")),
        timeoutMs,
      );
      work
        .then(() => {
          window.clearTimeout(timer);
          resolve();
        })
        .catch((e) => {
          window.clearTimeout(timer);
          reject(e);
        });
    });

    try {
      await timed;
      this.monitor.markInit(performance.now() - t0);
      this.loop();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      markWebCodecsFailure();
      try {
        await this.bootFallback(err);
        this.monitor.markInit(performance.now() - t0);
        this.monitor.markFallback();
        this.loop();
      } catch (fatal) {
        opts.onFatal?.(fatal instanceof Error ? fatal : err);
        await this.bootPoster();
        this.ready = true;
        opts.onReady?.();
        this.loop();
      }
    }
  }

  setProgress(progress: number) {
    this.progress = Math.min(1, Math.max(0, progress));
    if (!this.renderer || !this.ready) return;
    const { index, hint } = this.predictor.update(this.progress);
    this.frameIndex = index;
    this.velocityAbs = Math.abs(hint.velocity);
    this.renderer.setTargetFrame(index, hint);
  }

  isReady() {
    return this.ready;
  }

  getStats(): EngineStats {
    const rs = this.renderer?.getStats() ?? {
      cacheSize: 0,
      cacheHits: 0,
      cacheMisses: 0,
      decodeLatencyMs: 0,
      lastDrawMs: 0,
      estimatedMemoryMb: 0,
      decodeQueueDepth: 0,
    };
    const frameDrift = this.intelligence?.getFrameDrift() ?? this.frameIndex - this.lastPresentedFrame;
    const frameAge =
      this.intelligence?.getFrameAge() ??
      (this.lastPresentAt > 0 ? performance.now() - this.lastPresentAt : 0);
    const intel = this.intelligence;
    const decodeBudgetPct = intel
      ? intel.getDecodeBudgetPct(rs.decodeLatencyMs)
      : 0;
    const memoryBudgetPct = intel
      ? intel.getMemoryBudgetPct(rs.estimatedMemoryMb)
      : 0;
    const cpuEstimate = intel
      ? intel.getCpuEstimate(rs.lastDrawMs, rs.decodeLatencyMs)
      : 0;

    return {
      renderer: this.rendererId,
      experienceMode: this.experienceMode,
      tierId: this.tier?.id ?? null,
      deviceBand: this.capability.band,
      targetPresentHz: presentationRateFromFps(
        this.presentClock.getTargetFps(),
      ),
      benchmarkScore: this.benchmark?.score ?? intel?.getBenchmarkScore() ?? 0,
      decodeBudgetPct,
      memoryBudgetPct,
      frameDrift,
      frameAge,
      cpuEstimate,
      networkEstimate: this.capability.network.effectiveType,
      frameIndex: this.frameIndex,
      frameCount: this.frameCount,
      progress: this.progress,
      presentFps: this.presentClock.getMeasuredFps(),
      droppedPresents: this.droppedPresents,
      bufferBudgetFrames: this.buffer.getBudget(),
      width: this.width,
      height: this.height,
      initMs: this.monitor.getInitMs(),
      ttfpMs: this.ttfpMs,
      ttfvfMs: this.ttfvfMs,
      fallbackCount: this.monitor.getFallbackCount(),
      worstFrameMs: this.monitor.getWorstFrameMs(),
      frameTimeVariance: this.monitor.getFrameTimeVariance(),
      adaptationEvents: this.monitor.getAdaptationEvents(),
      ...rs,
    };
  }

  resize() {
    const canvas = this.options.canvas;
    const rect = canvas.getBoundingClientRect();
    resizeBackingStore(
      canvas,
      rect.width || canvas.clientWidth,
      rect.height || canvas.clientHeight,
      this.capability.maxDpr,
    );
    this.renderer?.resize?.(
      rect.width || canvas.clientWidth,
      rect.height || canvas.clientHeight,
      this.capability.maxDpr,
    );
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
    this.renderer = null;
    this.releaseBlob();
  }

  private async boot() {
    if (this.options.reducedMotion ?? this.capability.prefersReducedMotion) {
      await this.bootPoster();
      this.ready = true;
      this.markTtfvf();
      this.options.onReady?.();
      return;
    }

    let src = this.options.src;
    let poster = this.options.poster ?? "";

    if (!src) {
      this.manifest = await loadManifest({
        mediaId: this.options.mediaId,
        ladderUrl: this.options.ladderUrl,
      });
      this.tier = selectTier(
        this.manifest,
        this.capability,
        this.options.deviceClass,
      );

      const preflight = await preflightAsset(
        {
          id: `scrub-${this.tier.id}`,
          intent: "scrub",
          src: this.tier.src,
          width: this.tier.width,
          height: this.tier.height,
          fps: this.tier.fps,
          bytes: this.tier.bytes,
        },
        this.capability,
      );
      if (
        preflight.score < 40 &&
        this.manifest.defaults?.safeDefaultTier
      ) {
        const conservative = this.manifest.defaults.safeDefaultTier[
          this.options.deviceClass
        ];
        const alt = this.manifest.tiers.find(
          (t) =>
            t.id === conservative && t.device === this.options.deviceClass,
        );
        if (alt) this.tier = alt;
      }

      src = this.tier.src;
      poster = this.tier.poster;
      this.frameCount = this.tier.frameCount;
      this.width = this.tier.width;
      this.height = this.tier.height;
    }

    this.options.onProgress?.(0.05);

    const preferAuto = !this.options.renderer || this.options.renderer === "auto";
    const forceVideo = this.options.renderer === "html-video";
    const forceWc = this.options.renderer === "webcodecs";
    const forcePoster = this.options.renderer === "poster";

    if (forcePoster) {
      await this.bootPoster();
      this.ready = true;
      this.markTtfvf();
      this.options.onReady?.();
      return;
    }

    if (this.progressive && (preferAuto || forceWc) && !forceVideo) {
      this.prefetchBlobForFallback(src);
      try {
        await this.bootWebCodecs(src, null, undefined, true);
        clearWebCodecsFailure();
        this.options.onProgress?.(1);
        this.ready = true;
        this.markTtfvf();
        this.options.onReady?.();
        return;
      } catch (e) {
        markWebCodecsFailure();
        this.monitor.markFallback();
        this.renderer?.dispose();
        if (forceWc) throw e;
      }
      const blobUrl = await this.ensureBlobUrl(src);
      await this.bootVideo(src, blobUrl);
      this.options.onProgress?.(1);
      this.ready = true;
      this.markTtfvf();
      this.options.onReady?.();
      return;
    }

    let { buffer, blobUrl } = await fetchWithProgress(src, (p) =>
      this.options.onProgress?.(p * 0.85),
    );
    this.retainBlob(blobUrl);

    this.benchmark = await this.runStartupBenchmark(
      src,
      blobUrl,
      buffer,
      forceVideo,
    );

    if (this.benchmark && this.manifest && this.tier) {
      const hinted = this.benchmark.recommendedTierHint;
      if (hinted && hinted !== this.tier.id) {
        const next = selectTier(
          this.manifest,
          this.capability,
          this.options.deviceClass,
          this.benchmark,
        );
        if (next.id !== this.tier.id) {
          this.releaseBlob();
          this.tier = next;
          src = next.src;
          poster = next.poster;
          this.frameCount = next.frameCount;
          this.width = next.width;
          this.height = next.height;
          const fetched = await fetchWithProgress(src, (p) =>
            this.options.onProgress?.(0.85 + p * 0.1),
          );
          buffer = fetched.buffer;
          blobUrl = fetched.blobUrl;
          this.retainBlob(blobUrl);
          this.monitor.recordAdaptEvent({
            type: "tier-boot",
            detail: next.id,
            at: performance.now(),
          });
        }
      }

      this.presentClock.setTargetFps(this.benchmark.initialPresentHz);
    }

    this.experienceMode =
      this.options.forceExperienceMode ??
      selectBootExperienceMode(
        this.capability,
        this.benchmark,
        Boolean(this.options.reducedMotion),
      );
    this.options.onExperienceModeChange?.(this.experienceMode);

    if (this.experienceMode === "poster") {
      await this.bootPoster();
      this.options.onProgress?.(1);
      this.ready = true;
      this.markTtfvf();
      this.options.onReady?.();
      return;
    }

    if (this.experienceMode === "lite-scrub") {
      this.capability = applyLiteScrubProfile(this.capability);
      this.presentClock.setTargetFps(this.capability.initialPresentFps);
      this.buffer.setBudget(this.capability.initialBufferBudgetFrames);
      if (this.manifest && this.tier) {
        const smaller = selectTier(
          this.manifest,
          {
            ...this.capability,
            band: "low",
            recommendedTier:
              this.options.deviceClass === "mobile"
                ? ["m540", "m720"]
                : ["d720", "d1080"],
          },
          this.options.deviceClass,
          this.benchmark,
        );
        if (smaller.id !== this.tier.id) {
          this.releaseBlob();
          this.tier = smaller;
          src = smaller.src;
          poster = smaller.poster;
          this.frameCount = smaller.frameCount;
          this.width = smaller.width;
          this.height = smaller.height;
          const fetched = await fetchWithProgress(src, (p) =>
            this.options.onProgress?.(0.85 + p * 0.1),
          );
          buffer = fetched.buffer;
          blobUrl = fetched.blobUrl;
          this.retainBlob(blobUrl);
        }
      }
    }

    if (this.experienceMode === "playback") {
      const playback = this.manifest
        ? playbackAssetForDevice(this.manifest, this.options.deviceClass)
        : null;
      const pbSrc = playback?.src ?? src;
      const { blobUrl: pbBlob } = await fetchWithProgress(pbSrc, (p) =>
        this.options.onProgress?.(0.85 + p * 0.15),
      );
      this.retainBlob(pbBlob);
      await this.bootPlayback(pbSrc, pbBlob);
      this.options.onProgress?.(1);
      this.ready = true;
      this.markTtfvf();
      this.options.onReady?.();
      return;
    }

    const chosenRenderer: RendererId = forceVideo
      ? "html-video"
      : forceWc
        ? "webcodecs"
        : (this.benchmark?.recommendedRenderer ?? "webcodecs");

    this.monitor.recordAdaptEvent({
      type: "renderer-pick",
      detail: chosenRenderer,
      at: performance.now(),
    });

    if (chosenRenderer === "html-video") {
      await this.bootVideo(src, blobUrl);
      this.options.onProgress?.(1);
      this.ready = true;
      this.markTtfvf();
      this.options.onReady?.();
      return;
    }

    try {
      await this.bootWebCodecs(src, blobUrl, buffer, false);
      clearWebCodecsFailure();
      this.options.onProgress?.(1);
      this.ready = true;
      this.markTtfvf();
      this.options.onReady?.();
      return;
    } catch (e) {
      markWebCodecsFailure();
      this.monitor.markFallback();
      this.renderer?.dispose();
      if (forceWc) throw e;
    }

    await this.bootVideo(src, blobUrl);
    this.options.onProgress?.(1);
    this.ready = true;
    this.markTtfvf();
    this.options.onReady?.();
  }

  private async runStartupBenchmark(
    src: string,
    blobUrl: string,
    buffer: ArrayBuffer,
    skipWc: boolean,
  ): Promise<BenchmarkResult | null> {
    if (skipWc || !this.capability.hasVideoDecoder) return null;

    const probe = new WebCodecsRenderer();
    try {
      await probe.init({
        canvas: this.options.canvas,
        src,
        blobUrl,
        arrayBuffer: buffer,
        progressive: false,
        frameCount: this.frameCount || 180,
        fps: this.tier?.fps || 30,
        width: this.width || 1920,
        height: this.height || 1080,
        bufferBudgetFrames: this.buffer.getBudget(),
        presentFps: this.presentClock.getTargetFps(),
        maxDpr: this.capability.maxDpr,
      });
      const demux = probe.getDemux();
      if (!demux) return null;
      const result = await runRuntimeBenchmark(
        demux,
        this.options.canvas,
        this.capability,
        blobUrl,
      );
      this.benchmark = result;
      return result;
    } catch {
      return null;
    } finally {
      probe.dispose();
    }
  }

  private markTtfvf() {
    if (this.ttfvfMs === null) {
      this.ttfvfMs = performance.now();
    }
  }

  private prefetchBlobForFallback(src: string) {
    if (this.fallbackFetch) return;
    this.fallbackFetch = fetchWithProgress(src, (p) =>
      this.options.onProgress?.(Math.min(0.4, p * 0.4)),
    )
      .then(({ blobUrl }) => {
        if (this.disposed) {
          URL.revokeObjectURL(blobUrl);
          return null;
        }
        this.retainBlob(blobUrl);
        return blobUrl;
      })
      .catch(() => null);
  }

  private async ensureBlobUrl(src: string): Promise<string> {
    if (this.blobUrl) return this.blobUrl;
    if (this.fallbackFetch) {
      const url = await this.fallbackFetch;
      if (url) return url;
    }
    const { blobUrl } = await fetchWithProgress(src);
    this.retainBlob(blobUrl);
    return blobUrl;
  }

  private async bootWebCodecs(
    src: string,
    blobUrl: string | null,
    buffer: ArrayBuffer | undefined,
    progressive: boolean,
  ) {
    const wc = new WebCodecsRenderer();
    await wc.init({
      canvas: this.options.canvas,
      src,
      blobUrl: blobUrl || undefined,
      arrayBuffer: buffer,
      progressive,
      frameCount: this.frameCount || 180,
      fps: this.tier?.fps || 30,
      width: this.width || 1920,
      height: this.height || 1080,
      bufferBudgetFrames: this.buffer.getBudget(),
      presentFps: this.presentClock.getTargetFps(),
      maxDpr: this.capability.maxDpr,
      onDecodeError: () => {
        void this.switchToVideo();
      },
    });

    const demux = wc.getDemux();
    if (demux) {
      this.frameCount = demux.meta.frameCount;
      this.width = demux.meta.width;
      this.height = demux.meta.height;
      this.predictor.reset(this.frameCount);

      if (!this.benchmark) {
        this.benchmark = await runRuntimeBenchmark(
          demux,
          this.options.canvas,
          this.capability,
          blobUrl,
        );
        this.presentClock.setTargetFps(this.benchmark.initialPresentHz);
      }

      if (
        !this.benchmark.sustainable &&
        this.options.renderer !== "webcodecs"
      ) {
        wc.dispose();
        throw new Error("Benchmark unsustainable for WebCodecs");
      }
    }

    this.setRenderer(wc, "webcodecs");
    this.wireIntelligence();
    wc.setTargetFrame(0, {
      velocity: 0,
      acceleration: 0,
      direction: 0,
      predictedIndices: [0, 1, 2],
    });
    await this.presentFirstFrame(wc);
  }

  private async bootPlayback(src: string, blobUrl: string) {
    const playback = new PlaybackVideoRenderer();
    const frameCount = this.frameCount || 180;
    this.predictor.reset(frameCount);
    await playback.init({
      canvas: this.options.canvas,
      src,
      blobUrl,
      frameCount,
      fps: this.tier?.fps || 30,
      width: this.width || 1920,
      height: this.height || 1080,
      bufferBudgetFrames: this.buffer.getBudget(),
      presentFps: this.presentClock.getTargetFps(),
      maxDpr: this.capability.maxDpr,
      playbackMount: this.options.playbackMount ?? this.options.canvas.parentElement,
    });
    this.setRenderer(playback, "playback");
    this.experienceMode = "playback";
    this.wireIntelligence();
    playback.setTargetFrame(0, {
      velocity: 0,
      acceleration: 0,
      direction: 0,
      predictedIndices: [],
    });
    await this.presentFirstFrame(playback);
  }

  private async bootVideo(src: string, blobUrl: string) {
    const video = new HtmlVideoRenderer();
    const frameCount = this.frameCount || 180;
    this.predictor.reset(frameCount);
    await video.init({
      canvas: this.options.canvas,
      src,
      blobUrl,
      frameCount,
      fps: this.tier?.fps || 30,
      width: this.width || 1920,
      height: this.height || 1080,
      bufferBudgetFrames: this.buffer.getBudget(),
      presentFps: this.presentClock.getTargetFps(),
      maxDpr: this.capability.maxDpr,
    });
    this.setRenderer(video, "html-video");
    this.wireIntelligence();
    video.setTargetFrame(0, {
      velocity: 0,
      acceleration: 0,
      direction: 0,
      predictedIndices: [],
    });
    await this.presentFirstFrame(video);
  }

  private async presentFirstFrame(renderer: MediaRenderer) {
    await new Promise<void>((r) => {
      requestAnimationFrame(() => {
        renderer.present(this.options.canvas);
        this.lastPresentedFrame = this.frameIndex;
        this.lastPresentAt = performance.now();
        requestAnimationFrame(() => r());
      });
    });
  }

  private async switchToPlayback() {
    if (this.disposed || this.rendererId === "playback") return;
    this.monitor.markFallback();
    this.renderer?.dispose();
    const playback = this.manifest
      ? playbackAssetForDevice(this.manifest, this.options.deviceClass)
      : null;
    const src = playback?.src || this.tier?.src || this.options.src || "";
    const blobUrl = await this.ensureBlobUrl(src);
    await this.bootPlayback(src, blobUrl);
    this.experienceMode = "playback";
    this.options.onExperienceModeChange?.("playback");
  }

  private async switchToPoster() {
    if (this.disposed || this.rendererId === "poster") return;
    this.monitor.markFallback();
    this.renderer?.dispose();
    await this.bootPoster();
    this.experienceMode = "poster";
    this.options.onExperienceModeChange?.("poster");
  }

  private async bootPoster() {
    const poster = this.options.poster || this.tier?.poster || "";
    if (!poster) {
      throw new Error(
        "Poster fallback required: provide options.poster or a tier with poster",
      );
    }
    const r = new PosterRenderer(poster);
    await r.init({
      canvas: this.options.canvas,
      src: poster,
      frameCount: 1,
      fps: 1,
      width: 1,
      height: 1,
      bufferBudgetFrames: 1,
      presentFps: 1,
      maxDpr: this.capability.maxDpr,
    });
    this.setRenderer(r, "poster");
  }

  private async bootFallback(_err: Error) {
    const src = this.tier?.src || this.options.src || "";
    if (!src && !this.blobUrl) throw new Error("No source for fallback");
    const blobUrl = src
      ? await this.ensureBlobUrl(src)
      : this.blobUrl!;
    await this.bootVideo(src || this.options.src || "", blobUrl);
    this.ready = true;
    this.markTtfvf();
    this.options.onReady?.();
  }

  private async switchToVideo() {
    if (this.disposed || this.rendererId === "html-video") return;
    this.monitor.markFallback();
    this.renderer?.dispose();
    const src = this.tier?.src || this.options.src || "";
    const blobUrl = await this.ensureBlobUrl(src);
    await this.bootVideo(src, blobUrl);
  }

  private wireIntelligence() {
    if (this.benchmark) {
      this.intelligence?.setBenchmarkScore(this.benchmark.score);
    }
    this.intelligence = new RuntimeIntelligence({
      presentClock: this.presentClock,
      buffer: this.buffer,
      capability: this.capability,
      getExperienceMode: () => this.experienceMode,
      onExperienceModeChange: (mode) => {
        if (mode === "playback") void this.switchToPlayback();
        else if (mode === "poster") void this.switchToPoster();
        else if (mode === "lite-scrub") {
          this.experienceMode = "lite-scrub";
          this.capability = applyLiteScrubProfile(this.capability);
          this.presentClock.setTargetFps(this.capability.initialPresentFps);
          this.buffer.setBudget(this.capability.initialBufferBudgetFrames);
          this.options.onExperienceModeChange?.("lite-scrub");
        }
      },
      onForceVideo: () => {
        void this.switchToPlayback();
      },
      onBufferPressure: () => {
        this.relieveBufferPressure();
      },
      onAdaptEvent: (event) => {
        this.monitor.recordAdaptEvent(event);
      },
    });
    if (this.benchmark) {
      this.intelligence.setBenchmarkScore(this.benchmark.score);
    }
  }

  private relieveBufferPressure() {
    this.buffer.setBudget(Math.max(6, this.buffer.getBudget() - 4));
    if (this.renderer instanceof WebCodecsRenderer) {
      this.renderer.setBufferBudget(this.buffer.getBudget());
    }
  }

  private setRenderer(renderer: MediaRenderer, id: RendererId) {
    this.renderer = renderer;
    this.rendererId = id;
    this.options.onRendererChange?.(id);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.ready || !this.renderer) return;

    const rs = this.renderer.getStats();
    const now = performance.now();
    const frameDrift = this.frameIndex - this.lastPresentedFrame;
    const frameAge = this.lastPresentAt > 0 ? now - this.lastPresentAt : 0;

    if (this.intelligence?.shouldEvaluate(now)) {
      this.intelligence.tick(
        {
          measuredFps: this.presentClock.getMeasuredFps(),
          targetFps: this.presentClock.getTargetFps(),
          decodeLatencyMs: rs.decodeLatencyMs,
          velocityAbs: this.velocityAbs,
          decodeQueueDepth: rs.decodeQueueDepth,
          estimatedMemoryMb: rs.estimatedMemoryMb,
          frameDrift,
          frameAge,
          lastDrawMs: rs.lastDrawMs,
        },
        now,
      );
    }

    if (this.renderer instanceof WebCodecsRenderer) {
      this.renderer.setBufferBudget(this.buffer.getBudget());
    }

    if (!this.presentClock.shouldPresent()) {
      this.droppedPresents += 1;
      return;
    }

    const drew = this.renderer.present(this.options.canvas);
    if (!drew && this.frameIndex === this.lastPresentedFrame) {
      return;
    }

    this.lastPresentedFrame = this.frameIndex;
    this.lastPresentAt = performance.now();
    this.monitor.recordPresentFrame(rs.lastDrawMs + rs.decodeLatencyMs * 0.15);
    this.monitor.emit(this.getStats(), this.options.onStats);
  };

  private retainBlob(url: string) {
    this.blobUrl = url;
    this.blobRefs += 1;
  }

  private releaseBlob() {
    this.blobRefs = Math.max(0, this.blobRefs - 1);
    if (this.blobRefs === 0 && this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
}
