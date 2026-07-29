import { drawCover } from "./coverDraw";
import { coldStartTelemetry } from "./ColdStartTelemetry";
import { runtimeDecodedCacheMax } from "./MediaTierLimits";
import {
  ReadinessGateWarmer,
  type ReadinessProgressCb,
  type ReadinessReleaseCb,
} from "./ReadinessGateWarmer";
import { resizeBackingStore } from "./resizeBackingStore";
import { SequenceFrameCache } from "./SequenceFrameCache";
import { SequenceLoader } from "./SequenceLoader";
import { SequenceScheduler } from "./SequenceScheduler";
import type { SequenceTier } from "./types";

export class SequenceScrubRenderer {
  readonly id = "sequence-scrub" as const;
  private canvas: HTMLCanvasElement | null = null;
  private tier: SequenceTier | null = null;
  private loader = new SequenceLoader();
  private cache = new SequenceFrameCache();
  private scheduler: SequenceScheduler;
  /** Last frame index successfully drawn via drawImage. */
  private drawnFrame: number | null = null;
  private selectedCacheFrame: number | null = null;
  private actualBitmapFrame: number | null = null;
  private displayedBitmapId: string | null = null;
  private displayedSourceHashPrefix: string | null = null;
  private forceRedraw = true;
  private drawCalls = 0;
  private distinctFramesDrawn = 0;
  private drawFailures = 0;
  private lastTargetAt = 0;
  private targetToDisplayMs: number | null = null;
  private maxDpr = 2;
  private width = 1;
  private height = 1;
  private raf = 0;
  private disposed = false;
  private decodedCacheMax = 6;
  private debugWatermark = false;
  private firstSuccessfulDrawFrame: number | null = null;
  private hasPresentedFirstFrame = false;
  private lastDrawnSourceKey: string | null = null;
  private readinessGate = new ReadinessGateWarmer();
  private readinessArmed = false;
  private postReleaseLatencySamples: number[] = [];
  private targetLatencySamples: number[] = [];
  private saveData = false;

  constructor() {
    this.scheduler = new SequenceScheduler(this.loader, this.cache, {
      onNeedPresent: () => {
        this.schedulePump();
      },
    });
  }

  async init(opts: {
    canvas: HTMLCanvasElement;
    tier: SequenceTier;
    maxDpr: number;
    debug?: boolean;
    readinessGate?: boolean;
    saveData?: boolean;
    onReadinessProgress?: ReadinessProgressCb;
    onReadinessRelease?: ReadinessReleaseCb;
  }) {
    this.canvas = opts.canvas;
    this.tier = opts.tier;
    this.maxDpr = opts.maxDpr;
    this.width = opts.tier.width;
    this.height = opts.tier.height;
    this.debugWatermark = Boolean(opts.debug);
    this.saveData = Boolean(opts.saveData);

    const gateOn = Boolean(opts.readinessGate);
    this.readinessGate.configure({
      enabled: gateOn,
      tierId: opts.tier.id,
      frameCount: opts.tier.frameCount,
      estimatedTierBytes: opts.tier.totalBytes,
    });
    this.readinessGate.setCallbacks({
      onProgress: opts.onReadinessProgress,
      onRelease: opts.onReadinessRelease,
    });
    if (gateOn) this.readinessGate.markLoaderVisible();

    const runtimeCacheMax = runtimeDecodedCacheMax(opts.tier.id);
    this.decodedCacheMax = runtimeCacheMax;

    const isMobile = opts.tier.device === "mobile";
    this.scheduler.configureLimits({
      decodedCacheMax: runtimeCacheMax,
      prefetchAhead: opts.tier.prefetchAhead,
      prefetchBehind: opts.tier.prefetchBehind,
      maxActiveFetches: opts.tier.maxActiveFetches,
      maxActiveDecodes: isMobile ? 1 : 2,
      maxIdleAnchors: isMobile ? 1 : 2,
      frameCount: opts.tier.frameCount,
      urlPattern: opts.tier.urlPattern,
      debugHashes: Boolean(opts.debug),
    });
    this.scheduler.bumpLifecycleGeneration();
    this.resize(
      opts.canvas.clientWidth || opts.canvas.width,
      opts.canvas.clientHeight || opts.canvas.height,
      opts.maxDpr,
    );
    await this.scheduler.bootstrapInitial();
    this.forceRedraw = true;
    this.present();
  }

  setProgress(progress: number) {
    const now = performance.now();
    this.lastTargetAt = now;

    if (progress > 0.001 && !this.scheduler.hasInteracted) {
      coldStartTelemetry.noteFirstInteraction();
    }

    this.scheduler.setProgress(progress);

    if (
      this.readinessGate.enabled &&
      this.readinessGate.loaderReleaseAt != null
    ) {
      this.readinessGate.notePostReleasePriorityFetch();
    }
  }

  enablePrefetchExpansion() {
    this.scheduler.enablePrefetchExpansion();
  }

  /** True once any frame has been successfully drawImage'd onto the canvas. */
  get hasContent() {
    return this.hasPresentedFirstFrame;
  }

  getDrawnFrame() {
    return this.drawnFrame;
  }

  present(): boolean {
    const canvas = this.canvas;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return false;

    const target = this.scheduler.target;
    const entry = this.cache.nearest(target);
    this.selectedCacheFrame = entry?.index ?? null;

    if (!entry) {
      // Keep prior canvas pixels — never clear to blank
      return false;
    }

    const source = entry.bitmap ?? entry.img;
    if (!source) {
      this.drawFailures += 1;
      return false;
    }

    // Truth: selected/actual bitmap frame is the cache entry's index — never target
    this.actualBitmapFrame = entry.index;
    const sourceKey = entry.bitmapId;

    // Skip redraw when same bitmap already on screen (unless forced / watermark)
    if (
      this.drawnFrame === entry.index &&
      this.lastDrawnSourceKey === sourceKey &&
      !this.forceRedraw
    ) {
      if (entry.index === target && this.lastTargetAt > 0) {
        this.targetToDisplayMs = performance.now() - this.lastTargetAt;
      }
      return this.hasPresentedFirstFrame;
    }

    const srcW = entry.width || entry.bitmap?.width || entry.img?.naturalWidth || this.width;
    const srcH =
      entry.height || entry.bitmap?.height || entry.img?.naturalHeight || this.height;
    drawCover(ctx, source, srcW, srcH, canvas.width, canvas.height);

    if (this.debugWatermark) {
      this.drawFrameWatermark(ctx, canvas.width, canvas.height, entry.index);
    }

    // Only after successful drawImage
    this.drawCalls += 1;
    if (this.drawnFrame !== entry.index) this.distinctFramesDrawn += 1;
    this.drawnFrame = entry.index;
    this.displayedBitmapId = entry.bitmapId;
    this.displayedSourceHashPrefix = entry.blobHashPrefix;
    this.lastDrawnSourceKey = sourceKey;
    this.forceRedraw = false;

    if (!this.hasPresentedFirstFrame) {
      this.hasPresentedFirstFrame = true;
      this.firstSuccessfulDrawFrame = entry.index;
      this.scheduler.markFirstFramePresented();
      this.readinessGate.markFirstCanvasDraw();
      this.maybeStartReadinessGate();
    }

    if (entry.index === target && this.lastTargetAt > 0) {
      const lat = performance.now() - this.lastTargetAt;
      this.targetToDisplayMs = lat;
      if (this.targetLatencySamples.length < 10) {
        this.targetLatencySamples.push(Math.round(lat));
      }
      // Post-release samples for readiness A/B
      if (
        this.readinessGate.enabled &&
        this.readinessGate.loaderReleaseAt != null &&
        this.postReleaseLatencySamples.length < 10
      ) {
        this.postReleaseLatencySamples.push(Math.round(lat));
      }
    }
    return true;
  }

  private drawFrameWatermark(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    frameIndex: number,
  ) {
    const label = `FRAME ${frameIndex}`;
    const fontSize = Math.max(14, Math.round(canvasH * 0.035));
    ctx.save();
    ctx.font = `bold ${fontSize}px ui-monospace, monospace`;
    ctx.textBaseline = "top";
    const pad = Math.round(fontSize * 0.4);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(pad - 4, pad - 4, tw + 8, fontSize + 8);
    ctx.fillStyle = "#c4a574";
    ctx.fillText(label, pad, pad);
    ctx.restore();
  }

  private maybeStartReadinessGate() {
    if (!this.readinessGate.enabled || this.readinessArmed || !this.tier) return;
    this.readinessArmed = true;
    void this.readinessGate.runAfterFirstDraw(this.loader, this.saveData);
  }

  private schedulePump() {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.present();
    });
  }

  resize(cssW: number, cssH: number, dpr: number) {
    if (!this.canvas) return;
    resizeBackingStore(this.canvas, cssW, cssH, dpr, this.width, this.height);
    this.forceRedraw = true;
    this.present();
  }

  getDebugSnapshot() {
    const nearest = this.cache.nearest(this.scheduler.target);
    const exact = this.cache.get(this.scheduler.target);
    return {
      targetFrame: this.scheduler.target,
      /** @deprecated prefer drawnFrame — kept for overlay compat */
      displayedFrame: this.drawnFrame,
      drawnFrame: this.drawnFrame,
      selectedCacheFrame: this.selectedCacheFrame,
      actualBitmapFrame: this.actualBitmapFrame,
      nearestCachedFrame: nearest?.index ?? null,
      exactTargetCached: Boolean(exact),
      displayedBitmapId: this.displayedBitmapId,
      displayedSourceHashPrefix: this.displayedSourceHashPrefix,
      scrollDirection: this.scheduler.direction,
      scrollVelocity: this.scheduler.velocity,
      jumpActive: this.scheduler.jumpActive,
      settled: this.scheduler.settled,
      decodedCacheCount: this.cache.size,
      decodedCacheMax: this.decodedCacheMax,
      cachedFrameIndexes: this.cache.indexes(),
      prefetchAhead: this.tier?.prefetchAhead ?? 0,
      prefetchBehind: this.tier?.prefetchBehind ?? 0,
      activeFetches: this.loader.activeCount,
      activeDecodes: this.scheduler.activeDecodes,
      pendingTarget: this.scheduler.target,
      framesRequested: this.loader.fetchStarted,
      framesDecoded: this.cache.framesDecoded,
      framesDrawn: this.drawCalls,
      framesEvicted: this.cache.framesEvicted,
      obsoleteTargetsSkipped: this.scheduler.obsoleteSkipped,
      duplicateRequestsPrevented: this.loader.dedupePrevented,
      decodeFailures: this.scheduler.decodeFailures,
      drawFailures: this.drawFailures,
      targetToDisplayMs: this.targetToDisplayMs,
      estimatedDecodedMemoryMb: this.cache.estimatedMemoryMb(),
      targetGeneration: this.scheduler.generation,
      prefetchExpanded: this.scheduler.prefetchExpanded,
      outputFps: this.tier?.outputFps ?? null,
      sourceFps: this.tier?.sourceFps ?? null,
      frameCount: this.tier?.frameCount ?? 0,
      width: this.width,
      height: this.height,
      progressEvents: this.scheduler.progressEvents,
      targetChanges: this.scheduler.targetChanges,
      schedulerGenerations: this.scheduler.schedulerGenerations,
      ensureRequested: this.loader.ensureRequested,
      fetchQueued: this.loader.fetchQueued,
      fetchStarted: this.loader.fetchStarted,
      fetchCompleted: this.loader.fetchCompleted,
      browserCacheHits: this.loader.browserCacheHits,
      fetchAborted: this.loader.fetchAborted,
      fetchFailed: this.loader.fetchFailed,
      decodeStarted: this.scheduler.decodeStarted,
      decodeCompleted: this.scheduler.decodeCompleted,
      decodeDiscardedStale: this.scheduler.decodeDiscardedStale,
      drawCalls: this.drawCalls,
      distinctFramesDrawn: this.distinctFramesDrawn,
      evictions: this.cache.framesEvicted,
      dedupePrevented: this.loader.dedupePrevented,
      requestedFrameIndex: this.loader.lastRequestedIndex,
      requestedFrameUrl: this.loader.lastRequestedUrl,
      responseUrl: this.loader.lastResponseUrl,
      responseBytes: this.loader.lastResponseBytes,
      responseHashPrefix: this.displayedSourceHashPrefix,
      bootstrapPhase: this.scheduler.bootstrapPhase,
      firstFramePresented: this.hasPresentedFirstFrame,
      hasInteracted: this.scheduler.hasInteracted,
      prefetchPhase: this.scheduler.prefetchExpanded ? "expanded" : "startup",
      idleAnchorWarmingActive: this.scheduler.idleAnchorWarmingActive,
      firstSuccessfulDrawFrame: this.firstSuccessfulDrawFrame,
      hasPresentedFirstFrame: this.hasPresentedFirstFrame,
      targetLatencySamples: [...this.targetLatencySamples],
      postReleaseLatencySamples: [...this.postReleaseLatencySamples],
      ...this.readinessGate.snapshot(this.loader),
    };
  }

  collectInvariantWarnings(): string[] {
    const w: string[] = [];
    if (this.cache.size > this.decodedCacheMax) {
      w.push("decoded-cache-above-max");
    }
    if (this.loader.activeCount > (this.tier?.maxActiveFetches ?? 6)) {
      w.push("active-fetches-above-max");
    }
    if (
      this.scheduler.target < 0 ||
      this.scheduler.target >= (this.tier?.frameCount ?? 0)
    ) {
      w.push("target-out-of-bounds");
    }
    if (
      this.drawnFrame != null &&
      this.actualBitmapFrame != null &&
      this.drawnFrame !== this.actualBitmapFrame
    ) {
      w.push("drawn-actual-mismatch");
    }
    if (
      this.drawnFrame != null &&
      this.scheduler.target !== this.drawnFrame &&
      !this.cache.has(this.scheduler.target)
    ) {
      // Fallback nearest is expected — not a warning by itself
    }
    return w;
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.readinessGate.dispose();
    this.scheduler.dispose();
    this.loader.dispose();
    this.cache.dispose();
    this.canvas = null;
  }
}
