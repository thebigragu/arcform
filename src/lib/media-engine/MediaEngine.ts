import { AdaptationController } from "./adapt/AdaptationController";
import {
  clearWebCodecsFailure,
  markWebCodecsFailure,
  scoreCapabilities,
} from "./adapt/CapabilityScorer";
import { runRuntimeBenchmark } from "./adapt/RuntimeBenchmark";
import { loadLadder, selectTier } from "./adapt/SourceSelector";
import { resizeBackingStore } from "./canvas/resizeBackingStore";
import { PerformanceMonitor } from "./monitor/PerformanceMonitor";
import type { MediaRenderer } from "./ports/MediaRenderer";
import { HtmlVideoRenderer } from "./renderers/HtmlVideoRenderer";
import { PosterRenderer } from "./renderers/PosterRenderer";
import { WebCodecsRenderer } from "./renderers/WebCodecsRenderer";
import { AdaptiveBufferGovernor } from "./schedule/AdaptiveBufferGovernor";
import { PredictiveFrameScheduler } from "./schedule/PredictiveFrameScheduler";
import { PresentClock } from "./schedule/PresentClock";
import type {
  EngineStats,
  LadderTier,
  MediaEngineOptions,
  MediaLadderManifest,
  RendererId,
} from "./types";

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
 * Agency Media Engine v2.1 facade.
 * Plugin renderers, adaptive buffer, predictive schedule, continuous adaptation.
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
  private manifest: MediaLadderManifest | null = null;
  private capability = scoreCapabilities("desktop");
  private presentClock: PresentClock;
  private buffer: AdaptiveBufferGovernor;
  private predictor = new PredictiveFrameScheduler();
  private adapt: AdaptationController | null = null;
  private monitor: PerformanceMonitor;
  private velocityAbs = 0;
  private progressive = false;
  private fallbackFetch: Promise<string | null> | null = null;

  constructor(options: MediaEngineOptions) {
    this.options = options;
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
    return {
      renderer: this.rendererId,
      tierId: this.tier?.id ?? null,
      frameIndex: this.frameIndex,
      frameCount: this.frameCount,
      progress: this.progress,
      presentFps: this.presentClock.getMeasuredFps(),
      droppedPresents: this.droppedPresents,
      bufferBudgetFrames: this.buffer.getBudget(),
      width: this.width,
      height: this.height,
      initMs: this.monitor.getInitMs(),
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
      this.options.onReady?.();
      return;
    }

    let src = this.options.src;
    let poster = this.options.poster ?? "";

    if (!src) {
      this.manifest = await loadLadder(
        this.options.ladderUrl ?? "/videos/media-ladder/media-ladder.json",
      );
      this.tier = selectTier(
        this.manifest,
        this.capability,
        this.options.deviceClass,
      );
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
      this.options.onReady?.();
      return;
    }

    const preferWc =
      preferAuto && this.capability.preferWebCodecs && !forceVideo;

    // Progressive: skip full-file buffer for WC; prefetch blob for video fallback.
    if (this.progressive && (preferWc || forceWc) && !forceVideo) {
      this.prefetchBlobForFallback(src);
      try {
        await this.bootWebCodecs(src, null, undefined, true);
        clearWebCodecsFailure();
        this.options.onProgress?.(1);
        this.ready = true;
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
      this.options.onReady?.();
      return;
    }

    const { buffer, blobUrl } = await fetchWithProgress(src, (p) =>
      this.options.onProgress?.(p),
    );
    this.retainBlob(blobUrl);

    if ((preferWc || forceWc) && !forceVideo) {
      try {
        await this.bootWebCodecs(src, blobUrl, buffer, false);
        clearWebCodecsFailure();
        this.options.onProgress?.(1);
        this.ready = true;
        this.options.onReady?.();
        return;
      } catch (e) {
        markWebCodecsFailure();
        this.monitor.markFallback();
        this.renderer?.dispose();
        if (forceWc) throw e;
      }
    }

    await this.bootVideo(src, blobUrl);
    this.options.onProgress?.(1);
    this.ready = true;
    this.options.onReady?.();
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
      frameCount: this.frameCount || 360,
      fps: this.tier?.fps || 60,
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

      const bench = await runRuntimeBenchmark(demux, this.options.canvas, 3);
      if (!bench.sustainable && this.options.renderer !== "webcodecs") {
        wc.dispose();
        throw new Error("Benchmark unsustainable for WebCodecs");
      }
    }

    this.setRenderer(wc, "webcodecs");
    this.wireAdaptation();
    wc.setTargetFrame(0, {
      velocity: 0,
      acceleration: 0,
      direction: 0,
      predictedIndices: [0, 1, 2],
    });
    await new Promise<void>((r) => {
      requestAnimationFrame(() => {
        wc.present(this.options.canvas);
        requestAnimationFrame(() => r());
      });
    });
  }

  private async bootVideo(src: string, blobUrl: string) {
    const video = new HtmlVideoRenderer();
    const frameCount = this.frameCount || 360;
    this.predictor.reset(frameCount);
    await video.init({
      canvas: this.options.canvas,
      src,
      blobUrl,
      frameCount,
      fps: this.tier?.fps || 60,
      width: this.width || 1920,
      height: this.height || 1080,
      bufferBudgetFrames: this.buffer.getBudget(),
      presentFps: this.presentClock.getTargetFps(),
      maxDpr: this.capability.maxDpr,
    });
    this.setRenderer(video, "html-video");
    this.wireAdaptation();
    video.setTargetFrame(0, {
      velocity: 0,
      acceleration: 0,
      direction: 0,
      predictedIndices: [],
    });
    await new Promise<void>((r) => {
      requestAnimationFrame(() => {
        video.present(this.options.canvas);
        requestAnimationFrame(() => r());
      });
    });
  }

  private async bootPoster() {
    const poster =
      this.options.poster ||
      this.tier?.poster ||
      "/videos/media-ladder/d1440-poster.webp";
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

  private wireAdaptation() {
    this.adapt = new AdaptationController({
      presentClock: this.presentClock,
      buffer: this.buffer,
      onForceVideo: () => {
        void this.switchToVideo();
      },
      onBufferPressure: () => {
        this.relieveBufferPressure();
      },
      onAdaptEvent: (event) => {
        this.monitor.recordAdaptEvent(event);
      },
    });
  }

  /** Explicit non-reload adaptation: shrink decoded-frame budget under pressure. */
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

    this.adapt?.tick({
      measuredFps: this.presentClock.getMeasuredFps(),
      targetFps: this.presentClock.getTargetFps(),
      decodeLatencyMs: this.renderer.getStats().decodeLatencyMs,
      velocityAbs: this.velocityAbs,
    });

    if (this.renderer instanceof WebCodecsRenderer) {
      this.renderer.setBufferBudget(this.buffer.getBudget());
    }

    if (!this.presentClock.shouldPresent()) {
      this.droppedPresents += 1;
      return;
    }

    this.renderer.present(this.options.canvas);
    const rs = this.renderer.getStats();
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
