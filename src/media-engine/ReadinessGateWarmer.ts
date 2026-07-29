import {
  READINESS_GATE_BY_TIER,
  READINESS_MIN_VISIBLE_MS,
  buildAnchorIndexes,
  buildReadinessFetchOrder,
  evaluateThresholdPredicate,
  readReadinessTarget,
  thresholdReleaseReason,
  uniqueFramesRemaining,
  type ReadinessReleaseReason,
  type ReadinessTargetPct,
  type ThresholdPredicateResult,
} from "./MediaReadinessGate";
import type { SequenceLoader } from "./SequenceLoader";
import type { TierId } from "./types";

export type ReadinessProgressCb = (pct: number) => void;
export type ReadinessReleaseCb = (reason: ReadinessReleaseReason) => void;

/**
 * Full compressed-sequence readiness warmer — debug experiment only.
 * Fetches all frames via SequenceLoader (same URLs); never decodes.
 */
export class ReadinessGateWarmer {
  enabled = false;
  tierId: TierId | null = null;
  totalFrames = 0;
  estimatedTierBytes = 0;
  framesAlreadyCached = 0;
  framesRequested = 0;
  /** Unique cached compressed frame indexes. */
  framesCompleted = 0;
  framesFailed = 0;
  framesInFlight = 0;
  compressedBytesCompleted = 0;
  duplicatePrevented = 0;
  gateStartAt: number | null = null;
  firstCanvasDrawAt: number | null = null;
  fullReadyAt: number | null = null;
  thresholdReachedAt: number | null = null;
  loaderFadeStartAt: number | null = null;
  loaderReleaseAt: number | null = null;
  releaseReason: ReadinessReleaseReason = "disabled";
  running = false;
  configuredTarget: ReadinessTargetPct | null = null;
  targetIgnoreReason: string | null = null;
  openingNeighbourhoodComplete = false;
  framesRemainingAtRelease: number | null = null;
  bytesRemainingAtRelease: number | null = null;
  backgroundCompletionsAfterRelease = 0;
  postReleasePriorityFetches = 0;
  postReleaseMissingFrameCacheHits = 0;
  criticalFailure = false;
  lastPredicate: ThresholdPredicateResult | null = null;

  private disposed = false;
  /** Single-winner gate — set synchronously before any await in release. */
  private releaseClaimed = false;
  private timeoutFired = false;
  private loaderVisibleSince: number | null = null;
  private onProgress: ReadinessProgressCb | null = null;
  private onRelease: ReadinessReleaseCb | null = null;
  private neighbourhoodEnd = 8;
  private anchorStride = 18;
  private releaseTargetPct: ReadinessTargetPct | null = null;
  private minVisibleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeLoader: SequenceLoader | null = null;

  configure(opts: {
    enabled: boolean;
    tierId: TierId;
    frameCount: number;
    estimatedTierBytes: number;
  }) {
    this.enabled = opts.enabled;
    this.tierId = opts.tierId;
    this.totalFrames = opts.frameCount;
    this.estimatedTierBytes = opts.estimatedTierBytes;
    const cfg = READINESS_GATE_BY_TIER[opts.tierId];
    this.neighbourhoodEnd = cfg.neighbourhood;
    this.anchorStride = cfg.anchorStride;

    const tr = readReadinessTarget();
    this.configuredTarget = tr.target;
    this.targetIgnoreReason = tr.ignoreReason;
    this.releaseTargetPct = opts.enabled ? tr.target : null;
  }

  setCallbacks(opts: {
    onProgress?: ReadinessProgressCb;
    onRelease?: ReadinessReleaseCb;
  }) {
    this.onProgress = opts.onProgress ?? null;
    this.onRelease = opts.onRelease ?? null;
  }

  markLoaderVisible() {
    if (this.loaderVisibleSince == null) {
      this.loaderVisibleSince = performance.now();
    }
  }

  markFirstCanvasDraw() {
    if (this.firstCanvasDrawAt == null) {
      this.firstCanvasDrawAt = performance.now();
      if (this.activeLoader && this.running && !this.releaseClaimed) {
        void this.reevaluateThreshold(this.activeLoader);
      }
    }
  }

  notePostReleasePriorityFetch() {
    if (this.releaseClaimed) this.postReleasePriorityFetches += 1;
  }

  notePostReleaseCacheHit() {
    if (this.releaseClaimed) this.postReleaseMissingFrameCacheHits += 1;
  }

  /**
   * After first canvas draw: warm compressed sequence; release on threshold/timeout.
   */
  async runAfterFirstDraw(
    loader: SequenceLoader,
    saveData: boolean,
  ): Promise<void> {
    if (!this.enabled || this.disposed || this.releaseClaimed) return;
    if (!this.tierId) return;

    this.running = true;
    this.activeLoader = loader;
    this.gateStartAt = performance.now();
    this.markLoaderVisible();

    if (saveData) {
      await this.commitRelease("save-data-bypass", loader);
      return;
    }

    const cfg = READINESS_GATE_BY_TIER[this.tierId];
    const order = buildReadinessFetchOrder(
      this.totalFrames,
      cfg.neighbourhood,
      cfg.anchorStride,
    );

    for (let i = 0; i < this.totalFrames; i++) {
      if (loader.hasBlob(i)) this.framesAlreadyCached += 1;
    }
    this.syncCompleted(loader);

    // Frame 0 must be present after first canvas draw
    if (!loader.hasBlob(0) || this.firstCanvasDrawAt == null) {
      this.criticalFailure = true;
    }

    // Re-evaluate immediately — session cache may already satisfy threshold
    await this.reevaluateThreshold(loader);
    if (this.releaseClaimed) {
      await this.continueAfterRelease(loader, order, cfg.maxConcurrency);
      return;
    }

    const deadline = this.gateStartAt + cfg.maxGateMs;
    const pending = order.filter((i) => !loader.hasBlob(i));

    try {
      await this.fetchPool(loader, pending, cfg.maxConcurrency, deadline, "gate");
    } catch {
      /* continue to release */
    }

    if (this.disposed) return;

    // Final threshold pass before timeout — closes races where prerequisites
    // landed on the last completion or via parallel scheduler fills.
    if (!this.releaseClaimed) {
      this.syncCompleted(loader);
      await this.reevaluateThreshold(loader);
    }

    if (!this.releaseClaimed) {
      this.timeoutFired = true;
      if (this.framesCompleted >= this.totalFrames) {
        this.fullReadyAt = performance.now();
        await this.commitRelease("full-ready", loader);
      } else if (this.criticalFailure) {
        await this.commitRelease("failure-fallback", loader);
      } else {
        await this.commitRelease("timeout-partial", loader);
      }
    }

    await this.continueAfterRelease(loader, order, cfg.maxConcurrency);
  }

  private async continueAfterRelease(
    loader: SequenceLoader,
    order: number[],
    maxConcurrency: number,
  ) {
    if (
      !this.disposed &&
      this.countCached(loader) < this.totalFrames &&
      this.releaseReason !== "save-data-bypass"
    ) {
      this.running = true;
      const remaining = order.filter((i) => !loader.hasBlob(i));
      void this.continueBackground(
        loader,
        remaining,
        Math.max(1, maxConcurrency - 1),
      );
    }
  }

  private async fetchPool(
    loader: SequenceLoader,
    pending: number[],
    concurrency: number,
    deadline: number,
    mode: "gate" | "background",
  ) {
    let cursor = 0;
    const workers: Promise<void>[] = [];

    const work = async () => {
      while (!this.disposed) {
        if (mode === "gate") {
          if (this.releaseClaimed) return;
          if (performance.now() >= deadline) return;
        } else if (performance.now() >= deadline) {
          return;
        }

        const idx = cursor++;
        if (idx >= pending.length) return;
        const frame = pending[idx]!;

        if (loader.hasBlob(frame)) {
          this.duplicatePrevented += 1;
          if (mode === "background" && this.releaseClaimed) {
            this.postReleaseMissingFrameCacheHits += 1;
          }
          this.syncCompleted(loader);
          if (mode === "gate") await this.reevaluateThreshold(loader);
          continue;
        }

        this.framesRequested += 1;
        this.framesInFlight = loader.activeCount;
        try {
          const result = await loader.ensureFetched(frame, false);
          this.framesInFlight = loader.activeCount;
          if (result.aborted) {
            // Do not drop the index — retry later; still re-evaluate in case
            // parallel scheduler fills satisfied the threshold.
            if (!loader.hasBlob(frame)) pending.push(frame);
            this.syncCompleted(loader);
            if (mode === "gate") await this.reevaluateThreshold(loader);
            continue;
          }
          if (!result.blob) {
            this.framesFailed += 1;
            if (frame === 0) this.criticalFailure = true;
            this.syncCompleted(loader);
            if (mode === "gate") await this.reevaluateThreshold(loader);
            continue;
          }
          if (result.fromSessionCache) {
            this.duplicatePrevented += 1;
            if (mode === "background" && this.releaseClaimed) {
              this.postReleaseMissingFrameCacheHits += 1;
            }
          } else {
            this.compressedBytesCompleted +=
              result.responseBytes || result.blob.size;
          }
          const before = this.framesCompleted;
          this.syncCompleted(loader);
          if (
            mode === "background" &&
            this.releaseClaimed &&
            this.framesCompleted > before
          ) {
            this.backgroundCompletionsAfterRelease +=
              this.framesCompleted - before;
          }
          if (mode === "gate") await this.reevaluateThreshold(loader);
        } catch {
          this.framesFailed += 1;
          this.syncCompleted(loader);
          if (mode === "gate") await this.reevaluateThreshold(loader);
        }
      }
    };

    const n = Math.max(1, concurrency);
    for (let i = 0; i < n; i++) workers.push(work());
    await Promise.all(workers);
  }

  private async continueBackground(
    loader: SequenceLoader,
    remaining: number[],
    concurrency: number,
  ) {
    if (!remaining.length || this.disposed) {
      this.running = false;
      return;
    }
    await this.fetchPool(
      loader,
      remaining,
      concurrency,
      performance.now() + 120_000,
      "background",
    );
    this.running = false;
    if (this.countCached(loader) >= this.totalFrames) {
      this.fullReadyAt = performance.now();
    }
  }

  private syncCompleted(loader: SequenceLoader) {
    this.framesCompleted = Math.min(
      this.totalFrames,
      this.countCached(loader),
    );
    this.framesInFlight = loader.activeCount;
    this.refreshNeighbourhood(loader);
    this.emitProgress();
  }

  private refreshNeighbourhood(loader: SequenceLoader) {
    let ok = true;
    for (let i = 0; i <= this.neighbourhoodEnd && i < this.totalFrames; i++) {
      if (!loader.hasBlob(i)) {
        ok = false;
        break;
      }
    }
    this.openingNeighbourhoodComplete = ok;
  }

  /** 100% = every planned anchor index is present in the compressed cache. */
  anchorCoverage(loader: SequenceLoader | null): number {
    if (!loader || this.totalFrames <= 0) return 0;
    const anchors = buildAnchorIndexes(this.totalFrames, this.anchorStride);
    if (!anchors.length) return 0;
    let hit = 0;
    for (const i of anchors) {
      if (loader.hasBlob(i)) hit += 1;
    }
    return hit / anchors.length;
  }

  /** Bucket coverage retained for overlay compatibility. */
  cachedTimelineCoverage(loader: SequenceLoader | null): number {
    return this.anchorCoverage(loader);
  }

  private buildPredicate(loader: SequenceLoader): ThresholdPredicateResult {
    const since =
      this.loaderVisibleSince ?? this.gateStartAt ?? performance.now();
    const minVisibleMet =
      performance.now() - since >= READINESS_MIN_VISIBLE_MS;
    return evaluateThresholdPredicate({
      tierKnown: this.tierId != null,
      frame0Fetched: loader.hasBlob(0),
      frame0Decoded: this.firstCanvasDrawAt != null,
      firstCanvasDraw: this.firstCanvasDrawAt != null,
      openingNeighbourhoodComplete: this.openingNeighbourhoodComplete,
      anchorsComplete: this.anchorCoverage(loader) >= 1,
      completedUniqueFrames: this.framesCompleted,
      totalFrames: this.totalFrames,
      completedBytePct: this.completedBytePercentage * 100,
      criticalFailureCount: this.criticalFailure ? 1 : 0,
      minVisibleMet,
      gateActive: this.enabled && this.running && !this.disposed,
      fadeRequested: this.loaderFadeStartAt != null,
      thresholdReleaseRequested: this.releaseClaimed,
      timeoutFired: this.timeoutFired,
      targetPct: this.releaseTargetPct,
    });
  }

  /**
   * Re-evaluate threshold whenever any required condition may have changed.
   * Schedules a one-shot retry when only min-visible is blocking.
   */
  private async reevaluateThreshold(loader: SequenceLoader): Promise<void> {
    if (this.releaseClaimed || this.disposed) return;
    if (this.releaseTargetPct == null) return;

    this.syncCompleted(loader);
    const pred = this.buildPredicate(loader);
    this.lastPredicate = pred;

    if (!pred.eligible) {
      if (pred.blockingReason === "min-visible") {
        this.scheduleMinVisibleRecheck(loader);
      }
      return;
    }

    this.clearMinVisibleTimer();
    if (this.thresholdReachedAt == null) {
      this.thresholdReachedAt = performance.now();
    }
    if (this.framesCompleted >= this.totalFrames) {
      this.fullReadyAt = performance.now();
      await this.commitRelease("full-ready", loader);
    } else {
      await this.commitRelease(
        thresholdReleaseReason(this.releaseTargetPct),
        loader,
      );
    }
  }

  private scheduleMinVisibleRecheck(loader: SequenceLoader) {
    if (this.minVisibleTimer != null || this.releaseClaimed) return;
    const since =
      this.loaderVisibleSince ?? this.gateStartAt ?? performance.now();
    const wait = Math.max(0, READINESS_MIN_VISIBLE_MS - (performance.now() - since));
    this.minVisibleTimer = setTimeout(() => {
      this.minVisibleTimer = null;
      if (!this.releaseClaimed && !this.disposed) {
        void this.reevaluateThreshold(loader);
      }
    }, wait + 1);
  }

  private clearMinVisibleTimer() {
    if (this.minVisibleTimer != null) {
      clearTimeout(this.minVisibleTimer);
      this.minVisibleTimer = null;
    }
  }

  private countCached(loader: SequenceLoader) {
    let n = 0;
    for (let i = 0; i < this.totalFrames; i++) {
      if (loader.hasBlob(i)) n += 1;
    }
    return n;
  }

  private emitProgress() {
    // Real completion % — do not fake 100% on early release
    const pct =
      this.totalFrames > 0
        ? Math.min(1, this.framesCompleted / this.totalFrames)
        : 0;
    this.onProgress?.(pct);
  }

  /**
   * Single-winner release: claim synchronously, then await min-visible / fade.
   * Timeout cannot overwrite an earlier threshold claim.
   */
  private async commitRelease(
    reason: ReadinessReleaseReason,
    loader: SequenceLoader | null,
  ) {
    if (this.releaseClaimed) return;
    this.releaseClaimed = true;
    this.clearMinVisibleTimer();
    this.releaseReason = reason;
    if (
      reason.startsWith("threshold-ready") &&
      this.thresholdReachedAt == null
    ) {
      this.thresholdReachedAt = performance.now();
    }

    if (loader) this.syncCompleted(loader);
    this.framesRemainingAtRelease = uniqueFramesRemaining(
      this.totalFrames,
      this.framesCompleted,
    );
    this.bytesRemainingAtRelease = Math.max(
      0,
      this.estimatedTierBytes - this.compressedBytesCompleted,
    );

    const since =
      this.loaderVisibleSince ?? this.gateStartAt ?? performance.now();
    const elapsed = performance.now() - since;
    if (elapsed < READINESS_MIN_VISIBLE_MS) {
      await sleep(READINESS_MIN_VISIBLE_MS - elapsed);
    }

    this.loaderFadeStartAt = performance.now();
    this.loaderReleaseAt = this.loaderFadeStartAt;
    if (reason === "full-ready" || reason === "save-data-bypass") {
      this.running = false;
    }
    this.emitProgress();
    this.onRelease?.(reason);
  }

  async forceRelease(reason: ReadinessReleaseReason = "failure-fallback") {
    await this.commitRelease(reason, this.activeLoader);
  }

  dispose() {
    this.disposed = true;
    this.clearMinVisibleTimer();
  }

  get readinessPercentage() {
    if (this.totalFrames <= 0) return 0;
    return Math.min(1, this.framesCompleted / this.totalFrames);
  }

  get completedBytePercentage() {
    if (this.estimatedTierBytes <= 0) return 0;
    return Math.min(
      1,
      this.compressedBytesCompleted / this.estimatedTierBytes,
    );
  }

  get framesRemainingLive() {
    return uniqueFramesRemaining(this.totalFrames, this.framesCompleted);
  }

  get loaderVisibleDurationMs() {
    if (this.loaderReleaseAt == null || this.loaderVisibleSince == null) {
      return null;
    }
    return this.loaderReleaseAt - this.loaderVisibleSince;
  }

  /** @deprecated use releaseClaimed path — kept for call-site compatibility */
  get released() {
    return this.releaseClaimed;
  }

  snapshot(loader: SequenceLoader | null) {
    if (loader) {
      this.framesCompleted = Math.min(
        this.totalFrames,
        this.countCached(loader),
      );
      this.framesInFlight = loader.activeCount;
      this.refreshNeighbourhood(loader);
      if (!this.releaseClaimed && this.releaseTargetPct != null) {
        this.lastPredicate = this.buildPredicate(loader);
      }
    }
    const remainingLive = uniqueFramesRemaining(
      this.totalFrames,
      this.framesCompleted,
    );
    const pred = this.lastPredicate;
    return {
      readinessGateEnabled: this.enabled,
      readinessTier: this.tierId,
      readinessTotalFrames: this.totalFrames,
      readinessFramesCached: this.framesCompleted,
      readinessFramesRequested: this.framesRequested,
      readinessFramesCompleted: this.framesCompleted,
      readinessFramesFailed: this.framesFailed,
      readinessFramesInFlight: this.framesInFlight,
      readinessFramesRemaining: remainingLive,
      readinessCompressedBytes: this.compressedBytesCompleted,
      readinessEstimatedTierBytes: this.estimatedTierBytes,
      readinessPercentage: this.readinessPercentage,
      readinessGateStartAt: this.gateStartAt,
      readinessFirstCanvasDrawAt: this.firstCanvasDrawAt,
      readinessFullReadyAt: this.fullReadyAt,
      readinessLoaderReleaseAt: this.loaderReleaseAt,
      readinessLoaderVisibleMs: this.loaderVisibleDurationMs,
      readinessReleaseReason: this.releaseReason,
      readinessTimelineCoverage: this.cachedTimelineCoverage(loader),
      readinessDedupePrevented: this.duplicatePrevented,
      readinessRunning: this.running,
      readinessAlreadyCachedAtStart: this.framesAlreadyCached,
      readinessTarget: this.configuredTarget,
      readinessTargetIgnoreReason: this.targetIgnoreReason,
      readinessCompletedBytePercentage: this.completedBytePercentage,
      readinessOpeningNeighbourhoodComplete: this.openingNeighbourhoodComplete,
      readinessThresholdReachedAt: this.thresholdReachedAt,
      readinessLoaderFadeStartAt: this.loaderFadeStartAt,
      readinessFramesRemainingAtRelease: this.framesRemainingAtRelease,
      readinessBytesRemainingAtRelease: this.bytesRemainingAtRelease,
      readinessBackgroundCompletionsAfterRelease:
        this.backgroundCompletionsAfterRelease,
      readinessPostReleasePriorityFetches: this.postReleasePriorityFetches,
      readinessPostReleaseMissingFrameCacheHits:
        this.postReleaseMissingFrameCacheHits,
      readinessPredTierKnown: pred?.tierKnown ?? this.tierId != null,
      readinessPredFrame0Fetched: pred?.frame0Fetched ?? false,
      readinessPredFrame0Decoded: pred?.frame0Decoded ?? false,
      readinessPredFirstCanvasDraw: pred?.firstCanvasDraw ?? false,
      readinessPredNeighbourhood: pred?.openingNeighbourhoodComplete ?? false,
      readinessPredAnchors: pred?.anchorsComplete ?? false,
      readinessPredCompletedUnique: pred?.completedUniqueFrames ?? this.framesCompleted,
      readinessPredCompletedFramePct: pred?.completedFramePct ?? this.readinessPercentage * 100,
      readinessPredCompletedBytePct: pred?.completedBytePct ?? this.completedBytePercentage * 100,
      readinessPredCriticalFailures: pred?.criticalFailureCount ?? (this.criticalFailure ? 1 : 0),
      readinessPredMinVisibleMet: pred?.minVisibleMet ?? false,
      readinessPredGateActive: pred?.gateActive ?? false,
      readinessPredFadeRequested: pred?.fadeRequested ?? this.loaderFadeStartAt != null,
      readinessPredThresholdRequested: pred?.thresholdReleaseRequested ?? this.releaseClaimed,
      readinessPredTimeoutFired: pred?.timeoutFired ?? this.timeoutFired,
      readinessPredBlockingReason: pred?.blockingReason ?? null,
    };
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}
