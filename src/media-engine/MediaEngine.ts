import {
  HERO_MANIFEST_URL,
  HERO_MEDIA_ID,
  HERO_POSTER_FALLBACK,
  expandFrameUrl,
  loadManifest,
  tierById,
} from "./MediaManifest";
import { coldStartTelemetry } from "./ColdStartTelemetry";
import { warmCommittedFrame0 } from "./coldStartWarm";
import {
  type CommittedTier,
  type PolicyInput,
  nextFallbackTier,
  resolveCommittedTier,
  selectTier,
} from "./MediaPolicy";
import {
  readReadinessGateFlag,
  readReadinessTarget,
} from "./MediaReadinessGate";
import { getScrollLockTelemetry } from "./MediaScrollLock";
import { readTierOverride } from "./MediaTierOverride";
import { PosterRenderer } from "./PosterRenderer";
import { SequenceScrubRenderer } from "./SequenceScrubRenderer";
import type {
  DeviceClass,
  EngineStats,
  MediaEngineOptions,
  MediaManifestV1,
  RendererId,
  TierId,
} from "./types";

function readSaveData() {
  try {
    return Boolean(
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData,
    );
  } catch {
    return false;
  }
}

function readDeviceMemory() {
  try {
    return (
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null
    );
  } catch {
    return null;
  }
}

function readHardwareConcurrency() {
  try {
    return navigator.hardwareConcurrency ?? null;
  } catch {
    return null;
  }
}

/**
 * Gate 1 Media Engine — Sequence Scrub + Poster only.
 */
export class MediaEngine {
  private options: MediaEngineOptions;
  private manifest: MediaManifestV1 | null = null;
  private scrub: SequenceScrubRenderer | null = null;
  private poster: PosterRenderer | null = null;
  private rendererId: RendererId = "poster";
  private tierId: TierId | "poster" | null = null;
  private ready = false;
  private firstFrame = false;
  private disposed = false;
  private progress = 0;
  private fallbackReason: string | null = null;
  private reducedMotion = false;
  private saveData = false;
  private prefetchArmed = false;
  private statsTimer = 0;
  private lastPolicyReason = "";
  private policyInputs: PolicyInput | null = null;
  private committedTier: CommittedTier | null = null;
  /** Shell-layer poster visibility (DOM img), updated by MediaView. */
  posterVisible = true;
  posterOpacity = 1;
  posterZIndex = 2;
  canvasOpacity = 1;
  canvasZIndex = 1;

  constructor(options: MediaEngineOptions) {
    this.options = options;
    this.reducedMotion = Boolean(
      options.reducedMotion ??
        (typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
    );
    this.saveData = readSaveData();
  }

  async start() {
    try {
      await this.boot();
      this.ready = true;
      this.options.onReady?.();
      this.armStats();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.fallbackReason = err.message;
      try {
        await this.bootPosterOnly(
          this.options.poster ||
            HERO_POSTER_FALLBACK[this.options.deviceClass],
        );
        this.ready = true;
        this.signalFirstFrame();
        this.options.onReady?.();
      } catch {
        this.options.onFatal?.(err);
      }
    }
  }

  setProgress(progress: number) {
    if (this.disposed) return;
    this.progress = Math.min(1, Math.max(0, progress));
    if (progress > 0.001) coldStartTelemetry.noteFirstInteraction();
    if (this.rendererId === "poster" || !this.scrub) return;
    this.scrub.setProgress(this.progress);
    if (!this.prefetchArmed && this.firstFrame && this.progress > 0.001) {
      this.prefetchArmed = true;
      this.scrub.enablePrefetchExpansion();
    }
  }

  setPosterShellState(opts: {
    posterVisible: boolean;
    posterOpacity: number;
    posterZIndex: number;
    canvasOpacity: number;
    canvasZIndex: number;
  }) {
    this.posterVisible = opts.posterVisible;
    this.posterOpacity = opts.posterOpacity;
    this.posterZIndex = opts.posterZIndex;
    this.canvasOpacity = opts.canvasOpacity;
    this.canvasZIndex = opts.canvasZIndex;
  }

  resize() {
    const canvas = this.options.canvas;
    const cssW = canvas.clientWidth || canvas.getBoundingClientRect().width;
    const cssH = canvas.clientHeight || canvas.getBoundingClientRect().height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.scrub) this.scrub.resize(cssW, cssH, dpr);
    else if (this.poster) this.poster.resize(cssW, cssH, dpr);
  }

  getStats(): EngineStats {
    return this.buildStats();
  }

  dispose() {
    this.disposed = true;
    if (this.statsTimer) window.clearInterval(this.statsTimer);
    this.scrub?.dispose();
    this.poster?.dispose();
    this.scrub = null;
    this.poster = null;
  }

  private async boot() {
    const canvas = this.options.canvas;
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 600;
    const dprReq = window.devicePixelRatio || 1;
    const dprApplied = Math.min(dprReq, 2);

    this.policyInputs = {
      deviceClass: this.options.deviceClass,
      reducedMotion: this.reducedMotion,
      saveData: this.saveData,
      cssWidth: cssW,
      cssHeight: cssH,
      dprRequested: dprReq,
      dprApplied,
      canvasBackingWidth: Math.round(cssW * dprApplied),
      canvasBackingHeight: Math.round(cssH * dprApplied),
      deviceMemoryGb: readDeviceMemory(),
      hardwareConcurrency: readHardwareConcurrency(),
    };

    const policy = selectTier(this.policyInputs);
    const override = readTierOverride();
    const committed = resolveCommittedTier(
      policy,
      override,
      this.options.deviceClass,
    );
    this.committedTier = committed;
    this.lastPolicyReason = committed.committedReason;
    coldStartTelemetry.tierCommittedAt = performance.now();

    const posterUrl =
      this.options.poster ||
      HERO_POSTER_FALLBACK[this.options.deviceClass];

    if (committed.mode === "poster") {
      this.poster = new PosterRenderer(posterUrl);
      await this.poster.init(canvas, dprApplied);
      this.rendererId = "poster";
      this.tierId = "poster";
      this.signalFirstFrame();
      return;
    }

    coldStartTelemetry.noteManifestStart();
    this.manifest = await loadManifest({
      mediaId: this.options.mediaId || HERO_MEDIA_ID,
      manifestUrl: this.options.manifestUrl || HERO_MANIFEST_URL,
    });
    coldStartTelemetry.noteManifestEnd();

    let tierId: TierId | "poster" = committed.tierId as TierId;
    while (tierId !== "poster") {
      const tier = tierById(this.manifest, tierId);
      if (!tier) {
        tierId = nextFallbackTier(tierId);
        continue;
      }
      try {
        const frame0Url = expandFrameUrl(tier.urlPattern, 0);
        await warmCommittedFrame0(frame0Url);

        const scrub = new SequenceScrubRenderer();
        await scrub.init({
          canvas,
          tier,
          maxDpr: dprApplied,
          debug: Boolean(this.options.debug),
          readinessGate: Boolean(this.options.readinessGate),
          saveData: this.saveData,
          onReadinessProgress: this.options.onReadinessProgress,
          onReadinessRelease: this.options.onReadinessRelease,
        });
        scrub.setProgress(this.progress);
        scrub.present();
        this.scrub = scrub;
        this.rendererId = "sequence-scrub";
        this.tierId = tierId;
        scrub.setProgress(this.progress);

        if (scrub.hasContent) {
          this.signalFirstFrame();
        } else {
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          scrub.present();
          if (scrub.hasContent) this.signalFirstFrame();
        }

        window.setTimeout(() => {
          if (!this.disposed && this.firstFrame && !this.prefetchArmed) {
            this.prefetchArmed = true;
            this.scrub?.enablePrefetchExpansion();
          }
        }, 1200);
        return;
      } catch (e) {
        this.fallbackReason =
          e instanceof Error ? e.message : String(e);
        tierId = nextFallbackTier(tierId);
      }
    }

    this.poster = new PosterRenderer(posterUrl);
    await this.poster.init(canvas, dprApplied);
    this.rendererId = "poster";
    this.tierId = "poster";
    this.poster.present();
    this.signalFirstFrame();
  }

  private async bootPosterOnly(url: string) {
    this.scrub?.dispose();
    this.scrub = null;
    this.poster?.dispose();
    this.poster = new PosterRenderer(url);
    await this.poster.init(
      this.options.canvas,
      Math.min(window.devicePixelRatio || 1, 2),
    );
    this.rendererId = "poster";
    this.tierId = "poster";
  }

  private signalFirstFrame() {
    if (this.firstFrame) return;
    this.firstFrame = true;
    coldStartTelemetry.noteFirstCanvasDraw();
    this.options.onFirstFrame?.();
  }

  private armStats() {
    if (!this.options.onStats) return;
    this.statsTimer = window.setInterval(() => {
      this.options.onStats?.(this.buildStats());
    }, 250);
  }

  private buildStats(): EngineStats {
    const canvas = this.options.canvas;
    const cssW = canvas.clientWidth || 0;
    const cssH = canvas.clientHeight || 0;
    const dprReq = window.devicePixelRatio || 1;
    const snap = this.scrub?.getDebugSnapshot();
    const cold = coldStartTelemetry.snapshot();
    const pi = this.policyInputs;
    const ct = this.committedTier;
    const warnings = [
      ...(this.scrub?.collectInvariantWarnings() ?? []),
    ];
    if (this.rendererId === "sequence-scrub" && !this.firstFrame) {
      warnings.push("poster-hidden-risk-before-frame");
    }
    if (
      this.rendererId === "sequence-scrub" &&
      this.firstFrame &&
      this.posterVisible
    ) {
      warnings.push("poster-still-covering-canvas");
    }
    if (snap && snap.decodedCacheCount > snap.decodedCacheMax) {
      warnings.push("decoded-cache-above-max");
    }

    return {
      formFactor: this.options.deviceClass,
      tierId: this.tierId,
      renderer: this.rendererId,
      assetIntent: this.rendererId === "poster" ? "poster" : "sequence",
      manifestVersion: this.manifest?.schemaVersion ?? null,
      sourceFps: snap?.sourceFps ?? null,
      outputFps: snap?.outputFps ?? null,
      frameCount: snap?.frameCount ?? 0,
      targetFrame: snap?.targetFrame ?? 0,
      displayedFrame: snap?.drawnFrame ?? null,
      nearestCachedFrame: snap?.nearestCachedFrame ?? null,
      scrollDirection: snap?.scrollDirection ?? 0,
      scrollVelocity: snap?.scrollVelocity ?? 0,
      jumpActive: snap?.jumpActive ?? false,
      settled: snap?.settled ?? true,
      decodedCacheCount: snap?.decodedCacheCount ?? 0,
      decodedCacheMax: snap?.decodedCacheMax ?? 6,
      cachedFrameIndexes: snap?.cachedFrameIndexes ?? [],
      prefetchAhead: snap?.prefetchAhead ?? 0,
      prefetchBehind: snap?.prefetchBehind ?? 0,
      activeFetches: snap?.activeFetches ?? 0,
      activeDecodes: snap?.activeDecodes ?? 0,
      pendingTarget: snap?.pendingTarget ?? null,
      framesRequested: snap?.framesRequested ?? 0,
      framesDecoded: snap?.framesDecoded ?? 0,
      framesDrawn: snap?.framesDrawn ?? 0,
      framesEvicted: snap?.framesEvicted ?? 0,
      obsoleteTargetsSkipped: snap?.obsoleteTargetsSkipped ?? 0,
      duplicateRequestsPrevented: snap?.duplicateRequestsPrevented ?? 0,
      decodeFailures: snap?.decodeFailures ?? 0,
      drawFailures: snap?.drawFailures ?? 0,
      targetToDisplayMs: snap?.targetToDisplayMs ?? null,
      estimatedDecodedMemoryMb: snap?.estimatedDecodedMemoryMb ?? 0,
      canvasCssWidth: cssW,
      canvasCssHeight: cssH,
      dprRequested: dprReq,
      dprApplied: cssW > 0 ? canvas.width / cssW : 1,
      fallbackReason: this.fallbackReason || this.lastPolicyReason,
      reducedMotion: this.reducedMotion,
      saveData: this.saveData,
      targetGeneration: snap?.targetGeneration ?? 0,
      prefetchExpanded: snap?.prefetchExpanded ?? false,
      invariantWarnings: warnings,
      rawScrollProgress: null,
      frameProgress: null,
      mediaViewReceivedProgress: null,
      lastEngineProgress: this.progress,
      progressEvents: snap?.progressEvents ?? 0,
      targetChanges: snap?.targetChanges ?? 0,
      schedulerGenerations: snap?.schedulerGenerations ?? 0,
      ensureRequested: snap?.ensureRequested ?? 0,
      fetchQueued: snap?.fetchQueued ?? 0,
      fetchStarted: snap?.fetchStarted ?? 0,
      fetchCompleted: snap?.fetchCompleted ?? 0,
      browserCacheHits: snap?.browserCacheHits ?? 0,
      fetchAborted: snap?.fetchAborted ?? 0,
      fetchFailed: snap?.fetchFailed ?? 0,
      decodeStarted: snap?.decodeStarted ?? 0,
      decodeCompleted: snap?.decodeCompleted ?? 0,
      decodeDiscardedStale: snap?.decodeDiscardedStale ?? 0,
      drawCalls: snap?.drawCalls ?? 0,
      distinctFramesDrawn: snap?.distinctFramesDrawn ?? 0,
      evictions: snap?.evictions ?? 0,
      dedupePrevented: snap?.dedupePrevented ?? 0,
      drawnFrame: snap?.drawnFrame ?? null,
      selectedCacheFrame: snap?.selectedCacheFrame ?? null,
      actualBitmapFrame: snap?.actualBitmapFrame ?? null,
      displayedBitmapId: snap?.displayedBitmapId ?? null,
      displayedSourceHashPrefix: snap?.displayedSourceHashPrefix ?? null,
      requestedFrameIndex: snap?.requestedFrameIndex ?? null,
      requestedFrameUrl: snap?.requestedFrameUrl ?? null,
      responseUrl: snap?.responseUrl ?? null,
      responseBytes: snap?.responseBytes ?? null,
      responseHashPrefix: snap?.responseHashPrefix ?? null,
      posterVisible: this.posterVisible,
      posterDisplay: this.posterVisible ? "block" : "none",
      posterOpacity: this.posterOpacity,
      posterZIndex: this.posterZIndex,
      canvasOpacity: this.canvasOpacity,
      canvasZIndex: this.canvasZIndex,
      hasPresentedFirstFrame: snap?.hasPresentedFirstFrame ?? this.firstFrame,
      firstSuccessfulDrawFrame: snap?.firstSuccessfulDrawFrame ?? null,
      bootstrapPhase: snap?.bootstrapPhase ?? "boot",
      firstFramePresented: snap?.firstFramePresented ?? this.firstFrame,
      hasInteracted: snap?.hasInteracted ?? false,
      prefetchPhase: snap?.prefetchPhase ?? "startup",
      policyTier: ct?.policyTier ?? null,
      overrideTier: ct?.override.parsed ?? ct?.override.requested ?? null,
      committedTier: this.tierId,
      policyReason: ct?.policyReason ?? this.lastPolicyReason,
      committedReason: ct?.committedReason ?? this.lastPolicyReason,
      overrideAccepted: ct?.overrideAccepted ?? false,
      overrideIgnoreReason: ct?.override.ignoreReason ?? null,
      viewportCssWidth: pi?.cssWidth ?? cssW,
      viewportCssHeight: pi?.cssHeight ?? cssH,
      viewportCssPixelArea: (pi?.cssWidth ?? cssW) * (pi?.cssHeight ?? cssH),
      canvasBackingWidth: pi?.canvasBackingWidth ?? canvas.width,
      canvasBackingHeight: pi?.canvasBackingHeight ?? canvas.height,
      canvasBackingPixelArea:
        (pi?.canvasBackingWidth ?? canvas.width) *
        (pi?.canvasBackingHeight ?? canvas.height),
      deviceMemoryGb: pi?.deviceMemoryGb ?? null,
      hardwareConcurrency: pi?.hardwareConcurrency ?? null,
      idleAnchorWarmingActive: snap?.idleAnchorWarmingActive ?? false,
      posterHintUrl: cold.posterHintUrl,
      posterRuntimeUrl: cold.posterRuntimeUrl,
      posterUrlMatch: cold.posterUrlMatch,
      frame0HintUrl: cold.frame0HintUrl,
      frame0RuntimeUrl: cold.frame0RuntimeUrl,
      frame0UrlMatch: cold.frame0UrlMatch,
      tierCommittedAt: cold.tierCommittedAt,
      manifestRequestStart: cold.manifestRequestStart,
      manifestRequestEnd: cold.manifestRequestEnd,
      posterRequestStart: cold.posterRequestStart,
      posterRequestEnd: cold.posterRequestEnd,
      frame0RequestStart: cold.frame0RequestStart,
      frame0RequestEnd: cold.frame0RequestEnd,
      frame0DecodeStart: cold.frame0DecodeStart,
      frame0DecodeEnd: cold.frame0DecodeEnd,
      firstCanvasDrawAt: cold.firstCanvasDrawAt,
      posterHiddenAt: cold.posterHiddenAt,
      firstInteractionAt: cold.firstInteractionAt,
      startupNetworkRequests: cold.startupNetworkRequests,
      startupDecodes: cold.startupDecodes,
      startupDedupePrevented: cold.startupDedupePrevented,
      targetLatencySamples: snap?.targetLatencySamples ?? [],
      coldRunwayEnabled: false,
      runwayTier: null,
      runwayPlannedRange: "",
      runwayRequestsStarted: 0,
      runwayRequestsCompleted: 0,
      runwaySkippedCached: 0,
      runwayPausedOrAbandoned: 0,
      runwayCompressedBytes: 0,
      runwayByteBudget: null,
      runwayPriorityPreemptions: 0,
      runwayStartedAt: null,
      runwayCompletedAt: null,
      runwayFailures: 0,
      runwayDedupePrevented: 0,
      runwayRunning: false,
      firstInteractionTargetLatencyMs: null,
      coldRunwayIgnoreReason: "removed-from-production-path",
      postReleaseLatencySamples: snap?.postReleaseLatencySamples ?? [],
      readinessGateEnabled: snap?.readinessGateEnabled ?? false,
      readinessTier: snap?.readinessTier ?? null,
      readinessTotalFrames: snap?.readinessTotalFrames ?? 0,
      readinessFramesCached: snap?.readinessFramesCached ?? 0,
      readinessFramesRequested: snap?.readinessFramesRequested ?? 0,
      readinessFramesCompleted: snap?.readinessFramesCompleted ?? 0,
      readinessFramesFailed: snap?.readinessFramesFailed ?? 0,
      readinessFramesInFlight: snap?.readinessFramesInFlight ?? 0,
      readinessFramesRemaining: snap?.readinessFramesRemaining ?? 0,
      readinessCompressedBytes: snap?.readinessCompressedBytes ?? 0,
      readinessEstimatedTierBytes: snap?.readinessEstimatedTierBytes ?? 0,
      readinessPercentage: snap?.readinessPercentage ?? 0,
      readinessGateStartAt: snap?.readinessGateStartAt ?? null,
      readinessFirstCanvasDrawAt: snap?.readinessFirstCanvasDrawAt ?? null,
      readinessFullReadyAt: snap?.readinessFullReadyAt ?? null,
      readinessLoaderReleaseAt: snap?.readinessLoaderReleaseAt ?? null,
      readinessLoaderVisibleMs: snap?.readinessLoaderVisibleMs ?? null,
      readinessReleaseReason: snap?.readinessReleaseReason ?? "disabled",
      readinessTimelineCoverage: snap?.readinessTimelineCoverage ?? 0,
      readinessDedupePrevented: snap?.readinessDedupePrevented ?? 0,
      readinessRunning: snap?.readinessRunning ?? false,
      readinessGateIgnoreReason: readReadinessGateFlag().ignoreReason,
      readinessTarget: snap?.readinessTarget ?? readReadinessTarget().target,
      readinessTargetIgnoreReason:
        snap?.readinessTargetIgnoreReason ??
        readReadinessTarget().ignoreReason,
      readinessCompletedBytePercentage:
        snap?.readinessCompletedBytePercentage ?? 0,
      readinessOpeningNeighbourhoodComplete:
        snap?.readinessOpeningNeighbourhoodComplete ?? false,
      readinessThresholdReachedAt: snap?.readinessThresholdReachedAt ?? null,
      readinessLoaderFadeStartAt: snap?.readinessLoaderFadeStartAt ?? null,
      readinessFramesRemainingAtRelease:
        snap?.readinessFramesRemainingAtRelease ?? null,
      readinessBytesRemainingAtRelease:
        snap?.readinessBytesRemainingAtRelease ?? null,
      readinessBackgroundCompletionsAfterRelease:
        snap?.readinessBackgroundCompletionsAfterRelease ?? 0,
      readinessPostReleasePriorityFetches:
        snap?.readinessPostReleasePriorityFetches ?? 0,
      readinessPostReleaseMissingFrameCacheHits:
        snap?.readinessPostReleaseMissingFrameCacheHits ?? 0,
      readinessPredTierKnown: snap?.readinessPredTierKnown ?? false,
      readinessPredFrame0Fetched: snap?.readinessPredFrame0Fetched ?? false,
      readinessPredFrame0Decoded: snap?.readinessPredFrame0Decoded ?? false,
      readinessPredFirstCanvasDraw: snap?.readinessPredFirstCanvasDraw ?? false,
      readinessPredNeighbourhood: snap?.readinessPredNeighbourhood ?? false,
      readinessPredAnchors: snap?.readinessPredAnchors ?? false,
      readinessPredCompletedUnique: snap?.readinessPredCompletedUnique ?? 0,
      readinessPredCompletedFramePct: snap?.readinessPredCompletedFramePct ?? 0,
      readinessPredCompletedBytePct: snap?.readinessPredCompletedBytePct ?? 0,
      readinessPredCriticalFailures: snap?.readinessPredCriticalFailures ?? 0,
      readinessPredMinVisibleMet: snap?.readinessPredMinVisibleMet ?? false,
      readinessPredGateActive: snap?.readinessPredGateActive ?? false,
      readinessPredFadeRequested: snap?.readinessPredFadeRequested ?? false,
      readinessPredThresholdRequested:
        snap?.readinessPredThresholdRequested ?? false,
      readinessPredTimeoutFired: snap?.readinessPredTimeoutFired ?? false,
      readinessPredBlockingReason: snap?.readinessPredBlockingReason ?? null,
      ...getScrollLockTelemetry(),
    };
  }
}

export type { DeviceClass };
